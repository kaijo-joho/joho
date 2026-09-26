#!/usr/bin/env python3
"""Read one student's B5/A4 duplex PDF locally and validate its F/B association."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

import cv2
from pypdf import PdfReader

from add_header import detect_paper
from pdf_support import generate
from read_scan import read_image, parse_payload


def pair_pages(pages):
    """Never carry a candidate across an invalid or incomplete QR pair."""
    issues, identities = [], []
    for page in pages:
        try:
            identities.append(parse_payload(page.get('qrPayload', '')))
        except ValueError:
            identities.append(None)
    if len(pages) > 2:
        issues.append('unexpected_page_count')
    if any(identity is None for identity in identities):
        issues.append('unreadable_qr')
    fronts = [i for i, identity in enumerate(identities) if identity and identity['side'] == 'F']
    backs = [i for i, identity in enumerate(identities) if identity and identity['side'] == 'B']
    for positions, side in [(fronts, 'front'), (backs, 'back')]:
        if not positions:
            issues.append('missing_' + side)
        elif len(positions) > 1:
            issues.append('duplicate_' + side)
    if len(fronts) == len(backs) == 1:
        f, b = identities[fronts[0]], identities[backs[0]]
        if any(f[key] != b[key] for key in ['subject', 'year', 'worksheetId']):
            issues.append('worksheet_mismatch')
    pair_valid = len(pages) == 2 and not issues
    reversed_pages = pair_valid and fronts[0] > backs[0]
    assignments = []
    if pair_valid:
        front_index = fronts[0]
        front = pages[front_index]
        rows = front.get('rows', {})
        candidate = front.get('candidate')
        readable = set(rows) == {'class', 'tens', 'ones'} and all(row.get('status') == 'ok' for row in rows.values())
        if not readable or candidate is None:
            issues.append('unreadable_student')
        else:
            assignments = [
                {'page': i + 1, 'side': identity['side'], 'candidate': dict(candidate),
                 'source': 'front-omr' if i == front_index else 'paired-front', 'sourcePage': front_index + 1}
                for i, identity in enumerate(identities)
            ]
    return {'status': 'review' if issues else 'ok', 'pairValid': pair_valid,
            'reversedPages': reversed_pages, 'warnings': ['reversed_pages'] if reversed_pages else [],
            'issues': issues, 'studentAssignments': assignments,
            'requiresRosterMatch': True, 'pages': pages}


def read_pdf(path, renderer='pdftoppm', config=None):
    reader = PdfReader(path)
    if reader.is_encrypted:
        raise ValueError('Encrypted PDFs are not supported')
    if len(reader.pages) not in [1, 2]:
        raise ValueError('Use one student per PDF, with one or two pages; multi-student batches cannot be paired safely')
    templates, pages = {}, []
    with tempfile.TemporaryDirectory(prefix='ws-duplex-read-') as tmp:
        for index, page in enumerate(reader.pages):
            paper = detect_paper(page)
            prefix = str(Path(tmp) / 'page')
            subprocess.run([renderer, '-f', str(index + 1), '-l', str(index + 1), '-singlefile', '-r', '200', '-gray', '-png', str(path), prefix], check=True, capture_output=True)
            gray = cv2.imread(prefix + '.png', cv2.IMREAD_GRAYSCALE)
            matches = []
            for side in ['F', 'B']:
                key = (paper, side)
                if key not in templates:
                    templates[key] = generate({'pageSize': paper, 'side': side, 'year': 2026, 'worksheetId': 'WS05'}, config)['coordinates']
                try:
                    # Identity is discovered from QR, then compared across this PDF only.
                    matches.append(read_image(gray, templates[key], strict_identity=False))
                except ValueError:
                    pass
            pages.append(matches[0] if len(matches) == 1 else {'error': 'unreadable_or_ambiguous_page'})
    return pair_pages(pages)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--pdftoppm', default='pdftoppm')
    parser.add_argument('--config')
    args = parser.parse_args()
    print(json.dumps(read_pdf(args.pdf, args.pdftoppm, args.config), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
