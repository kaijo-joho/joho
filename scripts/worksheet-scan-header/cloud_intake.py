#!/usr/bin/env python3
"""Scan-folder queue: local QR/OMR -> immutable Drive files -> GAS registration."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import uuid

from drive_transport import DriveTransport, drive_id, file_description, public_description
from scan_core import DEFAULT_COORDINATES, load_catalog, load_config
from scan_intake import MAX_BATCH_BYTES, MAX_BATCH_PAGES, scan_stack, snapshot
from submission_ledger import json_text, now_iso, timestamp

SCHEMA = 'worksheet-cloud-receipt/1'
MIMES = {'.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}


def atomic_json(path, data):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(json_text(data) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    os.replace(temporary, path)


def configuration(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    required = {'schemaVersion', 'stationId', 'artifactFolderId', 'receiptFolderId'}
    if set(data) != required or data['schemaVersion'] != 'worksheet-cloud-settings/1':
        raise ValueError('Expected worksheet-cloud-settings/1 with exactly the documented fields')
    if not isinstance(data['stationId'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', data['stationId']):
        raise ValueError('Invalid stationId')
    for field in ('artifactFolderId', 'receiptFolderId'):
        drive_id(data[field])
    if data['artifactFolderId'] == data['receiptFolderId']:
        raise ValueError('Use separate artifact and receipt folders')
    return data


def extract_items(stack, receipt_id):
    items = []
    for sheet in stack['sheets']:
        reading = sheet['reading']
        identities = [p.get('identity') for p in reading.get('pages', []) if p.get('identity')]
        keys = {(i['subject'], i['year'], i['worksheetId']) for i in identities}
        identity = dict(zip(('subject', 'year', 'worksheetId'), next(iter(keys)))) if len(keys) == 1 else None
        pair_valid = reading.get('pairing', {}).get('pairValid') is True and len(sheet['sourcePages']) == 2
        valid = stack['pairingIntegrity'] == 'consistent' and pair_valid and reading['status'] == 'OK'
        identifier = reading.get('studentIdentifier') if valid else None
        if not isinstance(identifier, str) or not re.fullmatch(r'[1-9][0-9]{2}', identifier) or identifier[1:] == '00':
            identifier = None
        items.append({'attemptId': receipt_id + ':' + str(sheet['sheetIndex']),
                      'sheetIndex': sheet['sheetIndex'], 'sourcePages': sheet['sourcePages'],
                      'readingStatus': reading['status'], 'confidence': reading.get('confidence', 0),
                      'worksheet': identity, 'studentIdentifier': identifier, 'pairValid': pair_valid,
                      'reversedPages': reading.get('pairing', {}).get('reversedPages', False),
                      'issues': reading.get('issues', []), 'pdf': None})
    return items


class CloudQueue:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        if any((p / '.git').exists() for p in (self.root, *self.root.parents)):
            raise ValueError('Queue must be outside Git and public web directories')
        self.root.mkdir(parents=True, mode=0o700, exist_ok=True)
        (self.root / 'jobs').mkdir(exist_ok=True)

    @contextmanager
    def locked(self, receipt_id=None):
        # Reception uses the queue lock briefly; analysis/upload serialize per job.
        path = self.state_path(receipt_id).parent / 'job.lock' if receipt_id else self.root / 'queue.lock'
        with path.open('a') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def state_path(self, receipt_id):
        if not re.fullmatch(r'ws-[a-f0-9]{64}', receipt_id):
            raise ValueError('Invalid receipt ID')
        return self.root / 'jobs' / receipt_id / 'state.json'

    def save(self, state):
        atomic_json(self.state_path(state['receiptId']), state)

    def states(self):
        return sorted([json.loads(p.read_text()) for p in (self.root / 'jobs').glob('ws-*/state.json')],
                      key=lambda s: (s['receivedAt'], s['receiptId']))

    def receive(self, source, station_id, *, received_at=None):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', station_id):
            raise ValueError('Invalid stationId')
        if Path(source).is_symlink():
            raise ValueError('Input symlinks are not accepted')
        reception = timestamp(received_at).isoformat() if received_at else None
        with self.locked():
            with tempfile.TemporaryDirectory(prefix='receiving-', dir=self.root) as tmp:
                original, sha = snapshot(source, Path(tmp), MAX_BATCH_BYTES)
                receipt_id = 'ws-' + sha
                state_path = self.state_path(receipt_id)
                if state_path.exists():
                    state = json.loads(state_path.read_text())
                    if file_description(self.root / state['originalPath'], self.root, MIMES[original.suffix])['sha256'] != sha:
                        raise ValueError('Stored original changed')
                else:
                    destination = state_path.parent
                    state = {'receiptId': receipt_id, 'receivedAt': reception or now_iso(), 'stationId': station_id,
                             'status': 'received', 'originalPath': str((destination / original.name).relative_to(self.root)),
                             'originalSha256': sha, 'destination': None, 'files': {}}
                    atomic_json(Path(tmp) / 'state.json', state)
                    # Both the original and initial journal appear as one directory rename.
                    Path(tmp).rename(destination)
            return state

    def prepare(self, source, station_id, *, received_at=None, **reader_options):
        state = self.receive(source, station_id, received_at=received_at)
        return self.analyze(state['receiptId'], **reader_options)

    def analyze(self, receipt_id, *, catalog=None, reader_config=None, renderer=None):
        catalog = catalog if catalog is not None else load_catalog()
        reader_config = reader_config if reader_config is not None else load_config()
        state_path = self.state_path(receipt_id)
        with self.locked(receipt_id):
            state = json.loads(state_path.read_text())
            if state['status'] != 'received':
                return state
            original = self.root / state['originalPath']
            sha = state['originalSha256']
            if file_description(original, self.root, MIMES[original.suffix])['sha256'] != sha:
                raise ValueError('Stored original changed')
            run = state_path.parent / ('run-' + uuid.uuid4().hex)
            stack = scan_stack(self.root / state['originalPath'], run, catalog=catalog,
                               config=reader_config, renderer=renderer)
            atomic_json(run / 'reader-config.json', reader_config)
            config_sha = hashlib.sha256(json_text(reader_config).encode()).hexdigest()
            geometry_sha = hashlib.sha256(json_text([{k: v for k, v in c.items() if k != '_source'} for c in catalog]).encode()).hexdigest()
            code_digest = hashlib.sha256()
            for name in ('scan_core.py', 'scan_poc.py', 'scan_intake.py', 'cloud_intake.py'):
                code_digest.update((Path(__file__).parent / name).read_bytes())
            state['manifest'] = {'schemaVersion': SCHEMA, 'receiptId': receipt_id,
                'receivedAt': state['receivedAt'], 'stationId': state['stationId'],
                'originalSha256': sha, 'original': None, 'pageCount': stack['pageCount'],
                'readingStatus': stack['status'], 'pairingIntegrity': stack['pairingIntegrity'],
                'issues': stack['issues'], 'items': extract_items(stack, receipt_id),
                'analysis': {'completedAt': now_iso(), 'configSha256': config_sha, 'coordinatesSha256': geometry_sha,
                             'readerSha256': code_digest.hexdigest()},
                'gradingEnabled': False, 'requiresStudentConfirmation': False}
            state['files']['original'] = file_description(self.root / state['originalPath'], self.root, MIMES[original.suffix])
            for sheet in stack['sheets']:
                if sheet.get('pdf'):
                    role = 'sheet-' + str(sheet['sheetIndex'])
                    state['files'][role] = file_description(sheet['pdf'], self.root, 'application/pdf')
            state.update(status='prepared', localReadingResult=str((run / 'stack-result.json').relative_to(self.root)))
            self.save(state)
            return state

    def upload(self, receipt_id, config, drive):
        with self.locked(receipt_id):
            state = json.loads(self.state_path(receipt_id).read_text())
            if state['status'] == 'received':
                raise ValueError('Analysis has not completed; prepare the same original again')
            destination = {k: config[k] for k in ('artifactFolderId', 'receiptFolderId')}
            inbox_journal = self.root / 'drive-inbox.json'
            if inbox_journal.exists():
                source_folder = json.loads(inbox_journal.read_text())['binding']['sourceFolderId']
                if source_folder in destination.values():
                    raise ValueError('Drive inbox must differ from both output folders to avoid re-ingestion')
            if state['destination'] is not None and state['destination'] != destination:
                raise ValueError('Destination changed for an existing receipt')
            for folder_id in destination.values():
                drive.check_folder(folder_id)
            if state['destination'] is None:
                # IDs are persisted BEFORE any file upload. A dropped response cannot duplicate files.
                roles = list(state['files'])
                ids = drive.reserve_ids(len(roles) + 1)
                for role, file_id in zip(roles, ids):
                    state['files'][role]['fileId'] = file_id
                state.update(destination=destination, receiptFileId=ids[-1], status='uploading')
                state['manifest']['original'] = public_description(state['files']['original'])
                for item in state['manifest']['items']:
                    role = 'sheet-' + str(item['sheetIndex'])
                    if role in state['files']:
                        item['pdf'] = public_description(state['files'][role])
                self.save(state)
            # Verify all files again on retry, including ones previously marked uploaded.
            for role, description in state['files'].items():
                drive.upload(description, self.root, config['artifactFolderId'], receipt_id, role)
            manifest_path = self.state_path(receipt_id).parent / 'receipt.json'
            atomic_json(manifest_path, state['manifest'])
            description = file_description(manifest_path, self.root, 'application/json')
            description['fileId'] = state['receiptFileId']
            # This final file is the publication marker. GAS ignores incomplete uploads.
            drive.upload(description, self.root, config['receiptFolderId'], receipt_id, 'receipt')
            state.update(status='uploaded', uploadedAt=state.get('uploadedAt') or now_iso())
            self.save(state)
            return state

    def ready_files(self, inbox, stable_seconds, clock=time.time):
        inbox = Path(inbox).expanduser().resolve()
        if not inbox.is_dir() or inbox == self.root or inbox.is_relative_to(self.root) or self.root.is_relative_to(inbox):
            raise ValueError('Inbox and queue must be separate, non-nested directories')
        if stable_seconds < 5:
            raise ValueError('Use a stability interval of at least 5 seconds')
        observed_path = self.root / 'observed.json'
        with self.locked():
            old = json.loads(observed_path.read_text()) if observed_path.exists() else {}
            observed, ready = {}, []
            now = clock()
            for path in sorted(inbox.iterdir()):
                if path.is_symlink() or not path.is_file() or path.name.startswith('.') or path.suffix.lower() not in MIMES:
                    continue
                stat = path.stat()
                signature = [stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns]
                key = str(path)
                prior = old.get(key, {})
                since = prior.get('since', now) if prior.get('signature') == signature else now
                observed[key] = {'signature': signature, 'since': since, 'prepared': prior.get('prepared', False) if prior.get('signature') == signature else False}
                if not observed[key]['prepared'] and now - since >= stable_seconds:
                    ready.append(path)
            atomic_json(observed_path, observed)
            return ready

    def mark_prepared(self, path):
        path = Path(path).resolve()
        with self.locked():
            file = self.root / 'observed.json'
            observed = json.loads(file.read_text())
            stat = path.stat()
            record = observed.get(str(path))
            if record and record['signature'] == [stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns]:
                record['prepared'] = True
                atomic_json(file, observed)


def summary(state):
    return {'receiptId': state['receiptId'], 'status': state['status'],
            'readingStatus': state.get('manifest', {}).get('readingStatus'),
            'items': len(state.get('manifest', {}).get('items', [])),
            'cloudRegistration': 'not_verified', 'gradingEnabled': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--queue', required=True, type=Path)
    commands = parser.add_subparsers(dest='command', required=True)
    prepare = commands.add_parser('prepare', help='Read one completed scan locally; no network')
    prepare.add_argument('input', type=Path)
    prepare.add_argument('--station-id', required=True)
    prepare.add_argument('--received-at')
    for p in [prepare]:
        p.add_argument('--coordinates-dir', type=Path, default=DEFAULT_COORDINATES)
        p.add_argument('--reader-config', type=Path)
        p.add_argument('--pdftoppm')
    send = commands.add_parser('send', help='Upload prepared jobs to the configured private Drive folders')
    send.add_argument('--settings', required=True, type=Path)
    send.add_argument('--credentials-file', required=True, type=Path)
    send.add_argument('--receipt-id')
    watch = commands.add_parser('watch', help='Watch completed files; local only unless --upload is supplied')
    watch.add_argument('--inbox', required=True, type=Path)
    watch.add_argument('--station-id', required=True)
    watch.add_argument('--once', action='store_true')
    watch.add_argument('--stable-seconds', type=int, default=15)
    watch.add_argument('--upload', action='store_true')
    watch.add_argument('--settings', type=Path)
    watch.add_argument('--credentials-file', type=Path)
    watch.add_argument('--coordinates-dir', type=Path, default=DEFAULT_COORDINATES)
    watch.add_argument('--reader-config', type=Path)
    watch.add_argument('--pdftoppm')
    commands.add_parser('status')
    args = parser.parse_args()
    try:
        queue = CloudQueue(args.queue)
        if args.command == 'prepare':
            state = queue.prepare(args.input, args.station_id, received_at=args.received_at,
                catalog=load_catalog(args.coordinates_dir), reader_config=load_config(args.reader_config), renderer=args.pdftoppm)
            print(json_text(summary(state)))
            return 1 if state['manifest']['readingStatus'] == 'ERROR' else 2 if state['manifest']['readingStatus'] == 'REVIEW' else 0
        if args.command == 'status':
            print(json_text([summary(s) for s in queue.states()]))
            return 0
        sending = args.command == 'send' or args.upload
        if sending and (not args.settings or not args.credentials_file):
            raise ValueError('Upload requires explicit settings and credentials-file')
        config = configuration(args.settings) if sending else None
        if config and args.command == 'watch' and config['stationId'] != args.station_id:
            raise ValueError('stationId does not match settings')
        drive = DriveTransport.from_credentials_file(args.credentials_file) if sending else None
        catalog = load_catalog(args.coordinates_dir) if args.command == 'watch' else None
        reader_config = load_config(args.reader_config) if args.command == 'watch' else None
        while True:
            failed = False
            if args.command == 'watch':
                for path in queue.ready_files(args.inbox, args.stable_seconds):
                    try:
                        state = queue.prepare(path, args.station_id, catalog=catalog, reader_config=reader_config, renderer=args.pdftoppm)
                        queue.mark_prepared(path)
                        print(json_text(summary(state)), flush=True)
                    except Exception as error:
                        failed = True
                        print('PREPARE_FAILED ' + type(error).__name__, file=sys.stderr, flush=True)
            if sending:
                states = queue.states()
                selected = getattr(args, 'receipt_id', None)
                if selected and not any(s['receiptId'] == selected for s in states):
                    raise ValueError('Unknown receipt ID')
                for state in states:
                    if (selected and selected != state['receiptId']) or (not selected and state['status'] == 'uploaded') or state['status'] == 'received':
                        continue
                    try:
                        print(json_text(summary(queue.upload(state['receiptId'], config, drive))), flush=True)
                    except Exception as error:
                        failed = True
                        print('UPLOAD_PENDING ' + state['receiptId'] + ' ' + type(error).__name__, file=sys.stderr, flush=True)
            if args.command == 'send' or args.once:
                return 1 if failed else 0
            time.sleep(5 if not failed else 30)
    except KeyboardInterrupt:
        return 130
    except Exception as error:
        # SDK errors may contain tokens, URLs or private Drive names. Do not dump them.
        print('ERROR ' + type(error).__name__ + (': ' + str(error) if isinstance(error, (ValueError, ImportError)) else ''), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
