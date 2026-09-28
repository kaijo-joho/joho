#!/usr/bin/env python3
"""Read a ScanSnap Drive inbox into the existing local QR/OMR queue.

The source account/folder are pinned. This module never writes to Drive.
"""
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

from cloud_intake import CloudQueue, atomic_json, summary
from drive_transport import DriveTransport, drive_id
from scan_core import DEFAULT_COORDINATES, load_catalog, load_config
from scan_intake import MAX_BATCH_BYTES
from submission_ledger import json_text, now_iso, timestamp

FIELDS = 'id,mimeType,size,md5Checksum,parents,trashed,version,createdTime,modifiedTime,capabilities(canDownload)'


def configuration(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if (set(data) != {'schemaVersion', 'sourceFolderId', 'expectedAccount', 'stationId'}
            or data['schemaVersion'] != 'worksheet-drive-inbox/1'):
        raise ValueError('Expected worksheet-drive-inbox/1 with the documented fields')
    drive_id(data['sourceFolderId'])
    if not isinstance(data['expectedAccount'], str) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', data['expectedAccount']):
        raise ValueError('An explicit expectedAccount is required')
    if not isinstance(data['stationId'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', data['stationId']):
        raise ValueError('Invalid stationId')
    return data


def validate_source(item, folder_id):
    drive_id(item.get('id'))
    if (item.get('trashed') or item.get('mimeType') != 'application/pdf'
            or item.get('parents') != [folder_id]
            or item.get('capabilities', {}).get('canDownload') is not True):
        raise ValueError('Source must be a downloadable PDF directly inside the inbox')
    if not re.fullmatch(r'[a-f0-9]{32}', str(item.get('md5Checksum', ''))):
        raise ValueError('Source requires a content checksum')
    if not 0 < int(item.get('size', 0)) <= MAX_BATCH_BYTES:
        raise ValueError('Source exceeds the input size limit or is empty')
    if not re.fullmatch(r'[0-9]+', str(item.get('version', ''))):
        raise ValueError('Source requires a Drive version')
    for field in ('createdTime', 'modifiedTime'):
        timestamp(item.get(field))


def content_key(item):
    # Renaming/sharing a file can change its version without changing its bytes.
    return [str(item['size']), item['md5Checksum']]


class BoundedWriter:
    def __init__(self, stream, limit):
        self.stream, self.limit = stream, limit

    def write(self, data):
        if self.stream.tell() + len(data) > self.limit:
            raise ValueError('Download exceeded the declared file size')
        return self.stream.write(data)


class DriveSource:
    def __init__(self, service, download_factory=None):
        self.service, self.download_factory = service, download_factory

    def check(self, config):
        user = self.service.about().get(fields='user(emailAddress)').execute()['user']
        if user.get('emailAddress', '').casefold() != config['expectedAccount'].casefold():
            raise ValueError('OAuth account does not match expectedAccount')
        folder = self.service.files().get(fileId=drive_id(config['sourceFolderId']),
            supportsAllDrives=True, fields='id,mimeType,trashed,capabilities(canListChildren)').execute()
        if (folder.get('trashed') or folder.get('mimeType') != 'application/vnd.google-apps.folder'
                or folder.get('capabilities', {}).get('canListChildren') is not True):
            raise ValueError('Source folder cannot be listed by the expected account')

    def files(self, folder_id):
        folder_id = drive_id(folder_id)
        token, seen_tokens = None, set()
        while True:
            args = {'q': "'" + folder_id + "' in parents and trashed = false and mimeType = 'application/pdf'",
                    'spaces': 'drive', 'pageSize': 100, 'supportsAllDrives': True,
                    'includeItemsFromAllDrives': True, 'orderBy': 'createdTime',
                    'fields': 'nextPageToken,incompleteSearch,files(' + FIELDS + ')'}
            if token:
                args['pageToken'] = token
            page = self.service.files().list(**args).execute(num_retries=3)
            if page.get('incompleteSearch'):
                raise ValueError('Drive returned an incomplete inbox search')
            yield from page.get('files', [])
            token = page.get('nextPageToken')
            if not token:
                break
            if token in seen_tokens:
                raise ValueError('Drive returned a repeated page token')
            seen_tokens.add(token)

    def metadata(self, file_id):
        return self.service.files().get(fileId=drive_id(file_id), supportsAllDrives=True,
                                       fields=FIELDS).execute(num_retries=3)

    def download(self, item, folder_id, target):
        validate_source(item, folder_id)
        before = self.metadata(item['id'])
        validate_source(before, folder_id)
        if before != item:
            raise ValueError('Source metadata changed before download; retry next poll')
        factory = self.download_factory
        if factory is None:
            from googleapiclient.http import MediaIoBaseDownload
            factory = MediaIoBaseDownload
        request = self.service.files().get_media(fileId=item['id'], supportsAllDrives=True)
        with Path(target).open('xb') as stream:
            downloader = factory(BoundedWriter(stream, int(item['size'])), request, chunksize=4 * 1024 * 1024)
            done = False
            while not done:
                _, done = downloader.next_chunk(num_retries=3)
            stream.flush()
            os.fsync(stream.fileno())
        after = self.metadata(item['id'])
        validate_source(after, folder_id)
        if after != before:
            raise ValueError('Source metadata changed during download; retry next poll')
        with Path(target).open('rb') as stream:
            checksum = hashlib.file_digest(stream, 'md5').hexdigest()
        if Path(target).stat().st_size != int(item['size']) or checksum != item['md5Checksum']:
            raise ValueError('Downloaded bytes do not match Drive metadata')


class InboxWorker:
    def __init__(self, queue, source, config):
        self.queue, self.source, self.config = queue, source, config
        self.path = queue.root / 'drive-inbox.json'

    @contextmanager
    def locked(self):
        # Separate from CloudQueue's prepare/upload lock; only one inbox poller.
        with (self.queue.root / 'drive-inbox.lock').open('a') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def pull(self, *, limit=20, stable_seconds=15, clock=time.time, defer_analysis=False,
             before_download=None, **reader_options):
        if not 1 <= limit <= 100 or stable_seconds < 5:
            raise ValueError('Use limit 1..100 and stable-seconds >= 5')
        with self.locked():
            binding = {k: self.config[k] for k in ('sourceFolderId', 'expectedAccount', 'stationId')}
            journal = json.loads(self.path.read_text()) if self.path.exists() else {
                'schemaVersion': 'worksheet-drive-inbox-state/1', 'binding': binding, 'files': {}}
            if journal.get('schemaVersion') != 'worksheet-drive-inbox-state/1' or journal.get('binding') != binding:
                raise ValueError('Inbox account/folder/station changed; use a separate queue')
            self.source.check(self.config)
            atomic_json(self.path, journal)
            reports, prepared, seen = [], 0, set()
            for item in self.source.files(binding['sourceFolderId']):
                file_id = item.get('id')
                drive_id(file_id)
                if file_id in seen:
                    continue
                seen.add(file_id)
                old = journal['files'].get(file_id, {})
                try:
                    validate_source(item, binding['sourceFolderId'])
                    if old.get('receiptId'):
                        if old['contentKey'] != content_key(item):
                            reports.append({'fileId': file_id, 'status': 'REVIEW', 'reason': 'SOURCE_CHANGED',
                                            'receiptId': old['receiptId']})
                        # Never reinterpret a previously received file after replacement.
                        continue
                    if clock() - timestamp(item['modifiedTime']).timestamp() < stable_seconds:
                        reports.append({'fileId': file_id, 'status': 'WAITING', 'reason': 'RECENTLY_MODIFIED'})
                        continue
                    if prepared >= limit:
                        reports.append({'status': 'PENDING', 'reason': 'BATCH_LIMIT'})
                        break
                    with tempfile.TemporaryDirectory(prefix='drive-download-', dir=self.queue.root) as tmp:
                        path = Path(tmp) / 'source.pdf'
                        if before_download:
                            before_download()
                        self.source.download(item, binding['sourceFolderId'], path)
                        if defer_analysis:
                            state = self.queue.receive(path, binding['stationId'], received_at=item['createdTime'])
                        else:
                            state = self.queue.prepare(path, binding['stationId'], received_at=item['createdTime'], **reader_options)
                    journal['files'][file_id] = {'contentKey': content_key(item), 'source': item,
                        'receiptId': state['receiptId'], 'originalSha256': state['originalSha256'], 'importedAt': now_iso()}
                    # A crash before this commit repeats reception, whose SHA-256 ID is idempotent.
                    atomic_json(self.path, journal)
                    prepared += 1
                    reports.append({'fileId': file_id, **summary(state)})
                except Exception as error:
                    # Do not leak SDK messages, private names, tokens, or pupil data.
                    reports.append({'fileId': file_id, 'status': 'ERROR', 'reason': 'RETRY_PENDING',
                                    'errorType': type(error).__name__})
            return reports


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('--credentials-file', type=Path, required=True)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('inspect', help='Read account/folder and PDF metadata only; no downloads')
    for name in ('pull', 'watch'):
        sub = commands.add_parser(name, help='Download and read PDFs locally; never upload to Drive')
        sub.add_argument('--queue', required=True, type=Path)
        sub.add_argument('--limit', type=int, default=20)
        sub.add_argument('--stable-seconds', type=int, default=15)
        sub.add_argument('--coordinates-dir', type=Path, default=DEFAULT_COORDINATES)
        sub.add_argument('--reader-config', type=Path)
        sub.add_argument('--pdftoppm')
        if name == 'watch':
            sub.add_argument('--interval', type=int, default=30)
    args = parser.parse_args()
    try:
        config = configuration(args.settings)
        source = DriveSource(DriveTransport.from_credentials_file(args.credentials_file).service)
        if args.command == 'inspect':
            source.check(config)
            count = 0
            for item in source.files(config['sourceFolderId']):
                print(json_text({k: item.get(k) for k in ('id', 'mimeType', 'size', 'createdTime', 'modifiedTime')}))
                count += 1
            print(json_text({'sourceFolderId': config['sourceFolderId'], 'pdfCount': count, 'downloaded': False}))
            return 0
        if args.command == 'watch' and args.interval < 5:
            raise ValueError('Polling interval must be >= 5 seconds')
        worker = InboxWorker(CloudQueue(args.queue), source, config)
        options = {'catalog': load_catalog(args.coordinates_dir), 'reader_config': load_config(args.reader_config),
                   'renderer': args.pdftoppm, 'limit': args.limit, 'stable_seconds': args.stable_seconds}
        while True:
            try:
                reports = worker.pull(**options)
                print(json_text(reports), flush=True)
                code = 1 if any(r.get('status') == 'ERROR' or r.get('readingStatus') == 'ERROR' for r in reports) else (
                    2 if any(r.get('status') == 'REVIEW' or r.get('readingStatus') == 'REVIEW' for r in reports) else 0)
            except Exception as error:
                print(json_text({'status': 'ERROR', 'reason': 'POLL_FAILED', 'errorType': type(error).__name__}), flush=True)
                code = 1
            if args.command == 'pull':
                return code
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 130
    except Exception as error:
        print('ERROR ' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
