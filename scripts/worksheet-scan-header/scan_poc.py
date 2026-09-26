#!/usr/bin/env python3
"""Read one local PDF/JPEG/PNG; save result.json and annotated PNGs. No network."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageOps
from pypdf import PdfReader
from pypdf.errors import PyPdfError

from scan_core import DEFAULT_COORDINATES, analyze_image, draw_debug, load_catalog, load_config, parse_payload

RESULT_SCHEMA = 'worksheet-scan-result/1'
EXIT_CODES = {'OK': 0, 'REVIEW': 2, 'ERROR': 1}


def image_array(path, config):
    with Image.open(path) as source:
        if source.format not in ('JPEG', 'PNG') or getattr(source, 'n_frames', 1) != 1:
            raise ValueError('Only single-frame JPEG/PNG images are supported')
        if source.width * source.height > config['maxInputPixels']:
            raise ValueError('Image exceeds maxInputPixels')
        image = ImageOps.exif_transpose(source).convert('RGBA')
        white = Image.new('RGBA', image.size, 'white')
        white.alpha_composite(image)
        return np.array(white.convert('L'))


def load_pages(path, config, renderer):
    """Render at a bounded DPI. Scanned PDF MediaBox is metadata, not paper truth."""
    path = Path(path).resolve()
    if not path.is_file():
        raise ValueError('Input file does not exist')
    if path.stat().st_size > config['maxInputBytes']:
        raise ValueError('Input exceeds maxInputBytes')
    if path.suffix.lower() in ('.png', '.jpg', '.jpeg'):
        return [(image_array(path, config), {})]
    if path.suffix.lower() != '.pdf':
        raise ValueError('Input must be PDF, JPEG or PNG')
    reader = PdfReader(path)
    if reader.is_encrypted:
        raise ValueError('Encrypted PDF is not supported')
    if len(reader.pages) not in (1, 2):
        raise ValueError('Use one student per PDF, with one or two pages')
    renderer = renderer or shutil.which('pdftoppm')
    if not renderer:
        raise ValueError('pdftoppm is required for PDF input; use --pdftoppm PATH')
    pages = []
    with tempfile.TemporaryDirectory(prefix='ws-scan-poc-') as tmp:
        for index, page in enumerate(reader.pages):
            unit = float(page.get('/UserUnit', 1))
            width, height = float(page.mediabox.width) * unit, float(page.mediabox.height) * unit
            if not np.isfinite(width * height) or min(width, height) <= 0 or width * height * (config['pdfDpi'] / 72) ** 2 > config['maxInputPixels']:
                raise ValueError('PDF page exceeds maxInputPixels or has invalid geometry')
            prefix = str(Path(tmp) / 'page')
            completed = subprocess.run([str(renderer), '-f', str(index + 1), '-l', str(index + 1), '-singlefile', '-r', str(config['pdfDpi']), '-gray', '-png', str(path), prefix],
                                       capture_output=True, timeout=config['rendererTimeoutSeconds'])
            if completed.returncode:
                raise ValueError('PDF renderer failed: ' + completed.stderr.decode(errors='replace')[:400])
            pages.append((image_array(prefix + '.png', config), {'mediaBoxMm': [round(width * 25.4 / 72, 3), round(height * 25.4 / 72, 3)], 'pdfRotation': page.rotation, 'renderDpi': config['pdfDpi']}))
    return pages


def associate_pages(pages, require_duplex=True):
    """No cross-file pairing. Even an OK front cannot authorize a bad back."""
    issues, warnings, fronts, backs = [], [], [], []
    for index, page in enumerate(pages):
        identity = page.get('identity')
        if identity:
            (fronts if identity['side'] == 'F' else backs).append(index)
    if not require_duplex:
        if len(pages) != 1:
            raise ValueError('Single-page mode requires exactly one page')
        page = pages[0]
        identity = page.get('identity')
        if identity and identity['side'] == 'B':
            issues.append('missing_front')
        student = page.get('studentIdentifier') if page['status'] == 'OK' else None
        assignments = [{'page': 1, 'side': 'F', 'studentIdentifier': student, 'source': 'front-omr', 'sourcePage': 1, 'confidence': page['confidence']}] if student else []
        return {'status': 'REVIEW' if issues or page['status'] != 'OK' else 'OK', 'confidence': page['confidence'] if assignments else 0.,
                'mode': 'single-page', 'pairValid': None, 'issues': issues, 'warnings': [], 'reversedPages': False,
                'studentIdentifier': student, 'studentAssignments': assignments}
    if len(pages) != 2:
        issues.append('incomplete_duplex_pdf')
    for indexes, label in ((fronts, 'front'), (backs, 'back')):
        if not indexes:
            issues.append('missing_' + label)
        elif len(indexes) > 1:
            issues.append('duplicate_' + label)
    if len(fronts) + len(backs) != len(pages):
        issues.append('unreadable_qr')
    if len(fronts) == len(backs) == 1:
        f, b = pages[fronts[0]]['identity'], pages[backs[0]]['identity']
        if any(f[key] != b[key] for key in ('subject', 'year', 'worksheetId')):
            issues.append('worksheet_mismatch')
        if pages[fronts[0]].get('pageSize') != pages[backs[0]].get('pageSize'):
            issues.append('paper_mismatch')
    pair_valid = not issues
    reversed_pages = pair_valid and fronts[0] > backs[0]
    if reversed_pages:
        warnings.append('reversed_pages')
    if any(page['status'] != 'OK' for page in pages):
        issues.append('unreadable_page')
    student = pages[fronts[0]].get('studentIdentifier') if pair_valid else None
    if pair_valid and student is None:
        issues.append('unreadable_student')
    assignments = []
    if pair_valid and not issues:
        confidence = min(page['confidence'] for page in pages)
        assignments = [{'page': index + 1, 'side': page['identity']['side'], 'studentIdentifier': student,
                        'source': 'front-omr' if index == fronts[0] else 'paired-front', 'sourcePage': fronts[0] + 1,
                        'confidence': confidence} for index, page in enumerate(pages)]
    return {'status': 'REVIEW' if issues else 'OK', 'confidence': min((a['confidence'] for a in assignments), default=0.),
            'mode': 'duplex-pdf', 'pairValid': pair_valid, 'reversedPages': reversed_pages, 'issues': issues, 'warnings': warnings,
            'studentIdentifier': student if assignments else None, 'studentAssignments': assignments}


def scan_file(path, output=None, *, catalog=None, config=None, paper='auto', renderer=None, single_page=False, expected_payload=None):
    """Input errors become ERROR results; uncertain vision becomes REVIEW."""
    path = Path(path).resolve()
    directory = Path(output).resolve() if output is not None else None
    if directory:
        # Never overwrite the source, existing diagnostics or a previous run.
        directory.mkdir(parents=True, exist_ok=False)
    result = {'schemaVersion': RESULT_SCHEMA, 'input': {'path': str(path)}, 'status': 'ERROR', 'confidence': 0.,
              'issues': [], 'pages': [], 'studentIdentifier': None, 'studentAssignments': [], 'requiresRosterMatch': True,
              'confidenceMeaning': 'heuristic evidence score; not a calibrated probability',
              'software': {'opencv': cv2.__version__, 'numpy': np.__version__}}
    try:
        config = config or load_config()
        catalog = catalog if catalog is not None else load_catalog()
        if paper not in ('auto', 'b5', 'a4'):
            raise ValueError('paper must be auto, b5 or a4')
        if expected_payload is not None:
            parse_payload(expected_payload)
        result['configuration'] = config
        result['requestedPaper'] = paper
        if path.is_file() and path.stat().st_size <= config['maxInputBytes']:
            with path.open('rb') as stream:
                result['input']['sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
        input_pages = load_pages(path, config, renderer)
        if single_page and len(input_pages) != 1:
            raise ValueError('--single-page cannot bypass pairing for a two-page PDF')
        for index, (gray, metadata) in enumerate(input_pages):
            try:
                page, artifacts = analyze_image(gray, catalog, config, paper)
                if expected_payload and page.get('qrPayload') != expected_payload:
                    page.update(status='REVIEW', confidence=0., studentIdentifier=None, candidate=None)
                    page['issues'].append('unexpected_qr_identity')
                page.update(page=index + 1, inputRaster={'width': gray.shape[1], 'height': gray.shape[0]}, inputMetadata=metadata)
                if directory:
                    page['debugImages'] = draw_debug(page, artifacts, directory, index + 1)
            except (ValueError, cv2.error, np.linalg.LinAlgError) as error:
                page = {'page': index + 1, 'status': 'ERROR', 'confidence': 0., 'issues': ['page_processing_error'], 'error': str(error), 'rows': {}, 'studentIdentifier': None}
            result['pages'].append(page)
        pairing = associate_pages(result['pages'], require_duplex=path.suffix.lower() == '.pdf' and not single_page)
        result.update(status=pairing['status'], confidence=pairing['confidence'], issues=pairing['issues'],
                      studentIdentifier=pairing['studentIdentifier'], studentAssignments=pairing['studentAssignments'], pairing=pairing)
        for page in result['pages']:
            result['issues'].extend(f"page_{page['page']}:{issue}" for issue in page['issues'])
        if any(page['status'] == 'ERROR' for page in result['pages']):
            result.update(status='ERROR', confidence=0., studentIdentifier=None, studentAssignments=[])
    except (ValueError, OSError, KeyError, TypeError, PyPdfError, cv2.error, subprocess.SubprocessError, Image.DecompressionBombError) as error:
        result.update(status='ERROR', confidence=0., issues=['input_or_configuration_error'], error=str(error), studentIdentifier=None, studentAssignments=[])
    if directory:
        result['resultFile'] = str(directory / 'result.json')
        (directory / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    return result


def console_summary(result):
    lines = [f"{result['status']}  {Path(result['input']['path']).name}  student={result['studentIdentifier'] or '-'}  confidence={result['confidence']:.3f}"]
    for page in result['pages']:
        lines.append(f"  page {page['page']}: {page['status']}  {page.get('pageSize', '?')}  {page.get('qrPayload') or 'QR unreadable'}")
        for name, row in page.get('rows', {}).items():
            lines.append(f"    {name}: {row['status']} digit={row['digit']} confidence={row['confidence']:.3f} fill={row['winnerRatio']:.3f} second={row['runnerUpRatio']:.3f}")
    if result['issues']:
        lines.append('  reasons: ' + ', '.join(result['issues']))
    if result.get('error'):
        lines.append('  error: ' + result['error'])
    if result.get('pairing', {}).get('warnings'):
        lines.append('  warnings: ' + ', '.join(result['pairing']['warnings']))
    if result.get('resultFile'):
        lines.append('  JSON: ' + result['resultFile'])
    return '\n'.join(lines)


def add_reader_arguments(parser):
    parser.add_argument('--coordinates-dir', type=Path, default=DEFAULT_COORDINATES)
    parser.add_argument('--config', type=Path, help='Reader threshold overrides (not layout.json)')
    parser.add_argument('--paper', choices=['auto', 'b5', 'a4'], default='auto')
    parser.add_argument('--pdftoppm', help='Path to the local Poppler renderer')
    parser.add_argument('--single-page', action='store_true', help='Treat a one-page PDF as intentionally single-sided')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', required=True, type=Path, help='New directory for JSON and debug PNGs')
    parser.add_argument('--json', action='store_true', help='Print JSON to stdout and summary to stderr')
    add_reader_arguments(parser)
    args = parser.parse_args()
    try:
        # Configuration failures also leave a machine-readable ERROR result.
        config = load_config(args.config)
        catalog = load_catalog(args.coordinates_dir)
    except (OSError, ValueError, KeyError, TypeError) as error:
        if args.output.exists():
            parser.error('Output already exists; choose a new directory')
        args.output.mkdir(parents=True)
        result = {'schemaVersion': RESULT_SCHEMA, 'input': {'path': str(args.input.resolve())}, 'status': 'ERROR', 'confidence': 0.,
                  'issues': ['invalid_configuration'], 'error': str(error), 'pages': [], 'studentIdentifier': None, 'studentAssignments': []}
        (args.output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    else:
        try:
            result = scan_file(args.input, args.output, catalog=catalog, config=config, paper=args.paper, renderer=args.pdftoppm, single_page=args.single_page)
        except FileExistsError:
            parser.error('Output already exists; choose a new directory')
    print(console_summary(result), file=sys.stderr if args.json else sys.stdout)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return EXIT_CODES[result['status']]


if __name__ == '__main__':
    sys.exit(main())
