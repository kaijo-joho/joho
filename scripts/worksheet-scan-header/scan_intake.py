#!/usr/bin/env python3
"""Local multi-person PDF intake and submission ledger. No network or grading."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import uuid

from pypdf import PdfReader, PdfWriter
from pypdf.errors import PyPdfError

from scan_core import DEFAULT_COORDINATES, load_catalog, load_config
from scan_poc import EXIT_CODES, scan_file
from submission_ledger import Ledger, attribute_sheet, json_text, load_settings, now_iso, text_field, timestamp

MAX_BATCH_PAGES = 200
MAX_BATCH_BYTES = 500 * 1024 * 1024


def write_json(path, value):
    path = Path(path)
    with path.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
        stream.flush()
        os.fsync(stream.fileno())


def scan_stack(path, output, *, catalog=None, config=None, paper='auto', renderer=None,
               max_pages=MAX_BATCH_PAGES, max_bytes=MAX_BATCH_BYTES):
    """Pair only adjacent acquisition pages. A lost boundary quarantines the job.

    A valid-looking A-front/B-back from an undetected multifeed is NOT detectable.
    This function requires duplex acquisition without deletion/reordering.
    """
    path, output = Path(path), Path(output)
    output.mkdir(parents=True, exist_ok=False)
    result = {'schemaVersion': 'worksheet-scan-stack/1', 'status': 'ERROR', 'issues': [], 'sheets': [],
              'pageCount': 0, 'pairingIntegrity': 'unknown', 'pairingPolicy': 'adjacent-duplex-no-deletion',
              'limitation': 'Identical back QR codes cannot detect different pupils mixed by undetected multifeed.'}
    try:
        if type(max_pages) is not int or not 2 <= max_pages <= 1000 or type(max_bytes) is not int or max_bytes < 1:
            raise ValueError('Invalid batch limits')
        if path.stat().st_size > max_bytes:
            raise ValueError('Input exceeds maxBatchBytes')
        catalog = catalog if catalog is not None else load_catalog()
        config = config if config is not None else load_config()
        if path.suffix.lower() != '.pdf':
            if path.suffix.lower() not in ('.png', '.jpg', '.jpeg'):
                raise ValueError('Input must be PDF, JPEG or PNG')
            reading = scan_file(path, output / 'sheet-0001-reading', catalog=catalog, config=config, paper=paper, renderer=renderer)
            result['sheets'].append({'sheetIndex': 1, 'sourcePages': [1], 'reading': reading,
                                     'readingResult': str(output / 'sheet-0001-reading/result.json')})
            result.update(pageCount=1, pairingIntegrity='uncertain', issues=['incomplete_duplex_input'],
                          status='ERROR' if reading['status'] == 'ERROR' else 'REVIEW')
        else:
            reader = PdfReader(path)
            if reader.is_encrypted:
                raise ValueError('Encrypted PDF is not supported')
            count = len(reader.pages)
            if not 1 <= count <= max_pages:
                raise ValueError('PDF must contain 1 to maxBatchPages pages')
            result['pageCount'] = count
            structural = count % 2 != 0
            if structural:
                result['issues'].append('odd_page_count')
            for first in range(0, count, 2):
                index = first // 2 + 1
                source_pages = list(range(first + 1, min(first + 2, count) + 1))
                part = output / f'sheet-{index:04d}.pdf'
                writer = PdfWriter()
                for page_number in source_pages:
                    writer.add_page(reader.pages[page_number - 1])
                with part.open('xb') as stream:
                    writer.write(stream)
                reading_dir = output / f'sheet-{index:04d}-reading'
                reading = scan_file(part, reading_dir, catalog=catalog, config=config, paper=paper, renderer=renderer)
                result['sheets'].append({'sheetIndex': index, 'sourcePages': source_pages, 'pdf': str(part),
                                         'readingResult': str(reading_dir / 'result.json'), 'reading': reading})
                # OMR uncertainty alone does not destroy the physical pair boundary.
                if reading.get('pairing', {}).get('pairValid') is not True:
                    structural = True
            if structural:
                result['issues'].append('batch_pairing_uncertain')
            result['pairingIntegrity'] = 'uncertain' if structural else 'consistent'
            statuses = [s['reading']['status'] for s in result['sheets']]
            result['status'] = 'ERROR' if 'ERROR' in statuses else 'REVIEW' if structural or 'REVIEW' in statuses else 'OK'
    except (ValueError, OSError, KeyError, TypeError, PyPdfError) as error:
        result.update(status='ERROR', pairingIntegrity='uncertain', error=str(error))
        result['issues'].append('input_or_split_error')
    write_json(output / 'stack-result.json', result)
    return result


def snapshot(source, directory, limit):
    """Bounded copy and digest; a changing input is not a completed scan job."""
    source = Path(source).resolve()
    if not source.is_file() or source.suffix.lower() not in ('.pdf', '.png', '.jpg', '.jpeg'):
        raise ValueError('Expected a PDF/JPEG/PNG file')
    before = source.stat()
    if before.st_size > limit:
        raise ValueError('Input exceeds maxBatchBytes')
    target = directory / ('original' + source.suffix.lower())
    digest, size = hashlib.sha256(), 0
    with source.open('rb') as incoming, target.open('xb') as outgoing:
        for block in iter(lambda: incoming.read(1024 * 1024), b''):
            size += len(block)
            if size > limit:
                raise ValueError('Input exceeds maxBatchBytes')
            digest.update(block)
            outgoing.write(block)
        outgoing.flush()
        os.fsync(outgoing.fileno())
    after = source.stat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        raise ValueError('Input changed during copying; retry after saving has finished')
    return target, digest.hexdigest()


def relative_files(item, root):
    for key in ('pdf', 'readingResult'):
        if item.get(key):
            item[key] = str(Path(item[key]).relative_to(root))
    return item


def ingest(ledger, source, settings, *, scanner_id='local', actor='local-cli', received_at=None,
           retry=False, catalog=None, config=None, paper='auto', renderer=None,
           max_pages=MAX_BATCH_PAGES, max_bytes=MAX_BATCH_BYTES):
    text_field(scanner_id, 'scanner ID', 64)
    text_field(actor, 'actor')
    if type(max_pages) is not int or not 2 <= max_pages <= 1000 or type(max_bytes) is not int or max_bytes < 1:
        raise ValueError('Invalid batch limits')
    reception = timestamp(received_at).isoformat() if received_at else None
    # The CLI loads these before making durable ledger changes.
    config = config if config is not None else load_config()
    catalog = catalog if catalog is not None else load_catalog()
    with ledger.locked():
        with tempfile.TemporaryDirectory(prefix='receiving-', dir=ledger.root) as tmp:
            copy, sha = snapshot(source, Path(tmp), max_bytes)
            row = ledger.db.execute('SELECT * FROM batches WHERE sha256=?', (sha,)).fetchone()
            if row:
                batch = dict(row)
                if batch['result_path'] and not retry:
                    with (ledger.root / batch['original']).open('rb') as stream:
                        if hashlib.file_digest(stream, 'sha256').hexdigest() != sha:
                            raise ValueError('Stored original digest mismatch')
                    result = json.loads((ledger.root / batch['result_path']).read_text())
                    with ledger.db:
                        ledger.event('duplicate_file_received', actor, {'batchId': batch['id'], 'scannerId': scanner_id, 'sourceName': Path(source).name})
                    return {**result, 'duplicateFile': True}
            else:
                batch_id = 'batch-' + uuid.uuid4().hex[:16]
                destination = ledger.root / 'batches' / batch_id
                destination.mkdir(parents=True, mode=0o700)
                original = destination / copy.name
                copy.rename(original)
                batch = {'id': batch_id, 'sha256': sha, 'original': str(original.relative_to(ledger.root)),
                         'source_name': Path(source).name, 'scanner_id': scanner_id,
                         'received_at': reception or now_iso(), 'settings_json': json_text(settings['raw']), 'result_path': None}
                # A crash after this commit is recoverable by importing the same bytes.
                with ledger.db:
                    ledger.db.execute('''INSERT INTO batches(id,sha256,original,source_name,scanner_id,received_at,settings_json)
                        VALUES(:id,:sha256,:original,:source_name,:scanner_id,:received_at,:settings_json)''', batch)
                    ledger.event('file_received', actor, {'batchId': batch_id, 'sha256': sha, 'scannerId': scanner_id})
        original = ledger.root / batch['original']
        with original.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != batch['sha256']:
                raise ValueError('Stored original digest mismatch; do not analyze the modified original')
        run = ledger.root / 'batches' / batch['id'] / ('run-' + uuid.uuid4().hex[:16])
        stack = scan_stack(original, run, catalog=catalog, config=config, paper=paper, renderer=renderer,
                           max_pages=max_pages, max_bytes=max_bytes)
        write_json(run / 'settings.json', settings['raw'])
        write_json(run / 'reader-config.json', config)
        blocked = stack['issues'] if stack['pairingIntegrity'] != 'consistent' else []
        attempts = [relative_files(attribute_sheet(s, settings, blocked), ledger.root) for s in stack['sheets']]
        for item in attempts:
            item['attemptId'] = batch['id'] + ':' + str(item['sheetIndex'])
        status = 'ERROR' if stack['status'] == 'ERROR' else 'REVIEW' if any(a['intakeStatus'] != 'OK' for a in attempts) or stack['status'] == 'REVIEW' else 'OK'
        result = {'schemaVersion': 'worksheet-intake-result/1', 'batchId': batch['id'], 'sha256': batch['sha256'],
                  'original': batch['original'], 'receivedAt': batch['received_at'], 'scannerId': batch['scanner_id'],
                  'duplicateFile': False, 'status': status, 'issues': stack['issues'], 'error': stack.get('error'),
                  'pageCount': stack['pageCount'], 'pairingIntegrity': stack['pairingIntegrity'],
                  'attempts': attempts, 'settingsSha256': settings['sha256'],
                  'gradingEnabled': False, 'requiresStudentConfirmation': False,
                  'resultFile': str((run / 'intake-result.json').relative_to(ledger.root))}
        write_json(run / 'intake-result.json', result)
        ledger.record_result(batch['id'], result, result['resultFile'], actor)
        return result


def print_summary(result):
    if result['schemaVersion'] == 'worksheet-intake-result/1':
        print(f"{result['status']} {result['batchId']} pages={result['pageCount']} duplicateFile={result['duplicateFile']}")
        for item in result['attempts']:
            a = item['assignment']
            print(f"  {item['attemptId']} {item['intakeStatus']} student={a['studentIdentifier'] if a else '-'} pages={item['sourcePages']} flags={item['flags']}")
        if result['issues'] or result.get('error'):
            print(f"  issues={result['issues']} error={result.get('error')}")
    elif result['schemaVersion'] == 'worksheet-submission-report/1':
        print(f"生徒・課題への受領登録: {len(result['groups'])}件 / 確認項目: {len(result['reviewQueue'])}件 / 誤記: {result['caseCounts']}")
        for group in result['groups']:
            a = group['assignment']
            print(f"  {a['year']} 学年{a['grade']} {a['studentIdentifier']} {a['worksheetId']} scans={group['submissionCount']} selected={group['selectedAttemptId'] or '-'} flags={group['flags']}")
        for item in result['reviewQueue']:
            print('  REVIEW ' + json_text(item))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--store', required=True, type=Path, help='Private local directory OUTSIDE Git repositories and public web roots')
    parser.add_argument('--actor', default='local-cli', help='Audit label, NOT authentication')
    parser.add_argument('--json', action='store_true', help='JSON on stdout, concise summary on stderr')
    commands = parser.add_subparsers(dest='command', required=True)
    take = commands.add_parser('ingest', help='Import a completed scan file; identical bytes do not add submissions')
    take.add_argument('input', type=Path)
    take.add_argument('--settings', required=True, type=Path)
    take.add_argument('--scanner-id', default='local')
    take.add_argument('--received-at', help='Trusted original reception time with timezone, for delayed import')
    take.add_argument('--retry', action='store_true', help='Analyze the same original again; preserve attempts and audit history')
    take.add_argument('--coordinates-dir', type=Path, default=DEFAULT_COORDINATES)
    take.add_argument('--config', type=Path)
    take.add_argument('--paper', choices=['auto', 'b5', 'a4'], default='auto')
    take.add_argument('--pdftoppm')
    take.add_argument('--max-pages', type=int, default=MAX_BATCH_PAGES)
    take.add_argument('--max-bytes', type=int, default=MAX_BATCH_BYTES)
    report = commands.add_parser('report', help='Submission candidates, review flags and known-mistake counts')
    report.add_argument('--settings', required=True, type=Path)
    report.add_argument('--at', help='History evaluation time with timezone')
    report.add_argument('--output', type=Path, help='New private JSON file; never overwritten')
    for command in ('select', 'exclude', 'restore', 'mistake-open'):
        sub = commands.add_parser(command)
        sub.add_argument('attempt_id')
        sub.add_argument('--note', required=True)
    for command in ('mistake-resolve', 'mistake-cancel'):
        sub = commands.add_parser(command)
        sub.add_argument('case_id')
        sub.add_argument('--note', required=True)
        if command == 'mistake-resolve':
            sub.add_argument('--replacement', required=True)
    args = parser.parse_args()
    ledger = None
    try:
        text_field(args.actor, 'actor')
        settings = load_settings(args.settings) if args.command in ('ingest', 'report') else None
        config = load_config(args.config) if args.command == 'ingest' else None
        catalog = load_catalog(args.coordinates_dir) if args.command == 'ingest' else None
        ledger = Ledger(args.store)
        if args.command == 'ingest':
            result = ingest(ledger, args.input, settings, scanner_id=args.scanner_id, actor=args.actor,
                            received_at=args.received_at, retry=args.retry, catalog=catalog, config=config,
                            paper=args.paper, renderer=args.pdftoppm, max_pages=args.max_pages, max_bytes=args.max_bytes)
        else:
            with ledger.locked():
                if args.command == 'report':
                    result = ledger.report(settings, args.at)
                    if args.output:
                        target = args.output.expanduser().resolve()
                        if any((p / '.git').exists() for p in (target.parent, *target.parents)):
                            raise ValueError('Report output must be outside Git repositories')
                        write_json(target, result)
                else:
                    if args.command == 'select':
                        ledger.select(args.attempt_id, args.actor, args.note)
                    elif args.command in ('exclude', 'restore'):
                        ledger.exclude(args.attempt_id, args.actor, args.note, args.command == 'restore')
                    elif args.command == 'mistake-open':
                        case_id = ledger.open_case(args.attempt_id, args.actor, args.note)
                    elif args.command == 'mistake-resolve':
                        ledger.resolve_case(args.case_id, args.replacement, args.actor, args.note)
                    elif args.command == 'mistake-cancel':
                        ledger.cancel_case(args.case_id, args.actor, args.note)
                    result = {'schemaVersion': 'worksheet-ledger-action/1', 'action': args.command, 'status': 'OK'}
                    if args.command == 'mistake-open':
                        result['caseId'] = case_id
        if args.json:
            from contextlib import redirect_stdout
            with redirect_stdout(sys.stderr):
                print_summary(result)
            print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        else:
            print_summary(result)
            if result['schemaVersion'] == 'worksheet-ledger-action/1':
                print(json_text(result))
        return EXIT_CODES.get(result.get('status'), 0)
    except (ValueError, OSError, KeyError, TypeError, sqlite3.Error) as error:
        print(json_text({'status': 'ERROR', 'error': str(error)}), file=sys.stderr)
        return 1
    finally:
        if ledger:
            ledger.close()


if __name__ == '__main__':
    sys.exit(main())
