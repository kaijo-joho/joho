#!/usr/bin/env python3
"""Verify GSS registration acknowledgements, then archive source inbox PDFs."""
import argparse
from contextlib import contextmanager
from datetime import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from zoneinfo import ZoneInfo

from drive_transport import DriveTransport, drive_id
from submission_ledger import json_text


def configuration(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    return validate_settings(data)


def validate_settings(data):
    expected = {'schemaVersion', 'sourceFolderId', 'artifactFolderId', 'receiptFolderId',
                'processedRootId', 'reviewRootId', 'expectedAccount', 'stationId',
                'ledgerId', 'subject', 'timezone', 'archiveStartHour',
                'archiveEndHour', 'maxJobsPerCycle'}
    if set(data) != expected or data['schemaVersion'] != 'worksheet-drive-sync/1':
        raise ValueError('Expected worksheet-drive-sync/1 settings with exactly the documented fields')
    for key in ('sourceFolderId', 'artifactFolderId', 'receiptFolderId',
                'processedRootId', 'reviewRootId', 'ledgerId'):
        drive_id(data[key])
    if len({data[k] for k in ('sourceFolderId', 'artifactFolderId', 'receiptFolderId',
                              'processedRootId', 'reviewRootId')}) != 5:
        raise ValueError('Source, artifact, receipt, processed, and review folders must be distinct')
    if (not isinstance(data['expectedAccount'], str)
            or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', data['expectedAccount'])):
        raise ValueError('An explicit expectedAccount is required')
    if not isinstance(data['subject'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,20}', data['subject']):
        raise ValueError('subject must match the safe worksheet QR token pattern')
    if not isinstance(data['stationId'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', data['stationId']):
        raise ValueError('Invalid stationId')
    ZoneInfo(data['timezone'])
    for key in ('archiveStartHour', 'archiveEndHour'):
        if type(data[key]) is not int or not 0 <= data[key] <= 23:
            raise ValueError('Invalid archive window')
    if data['archiveStartHour'] == data['archiveEndHour']:
        raise ValueError('Archive window cannot cover the full day')
    if type(data['maxJobsPerCycle']) is not int or not 1 <= data['maxJobsPerCycle'] <= 100:
        raise ValueError('maxJobsPerCycle must be between 1 and 100')
    return data


def in_archive_window(config, now):
    hour = datetime.fromtimestamp(now, ZoneInfo(config['timezone'])).hour
    start, end = config['archiveStartHour'], config['archiveEndHour']
    return start <= hour < end if start < end else (hour >= start or hour < end)


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


def content_key(item):
    return [str(item['size']), item['md5Checksum']]


def validate_source(item, folder_id):
    drive_id(item.get('id'))
    if (item.get('trashed') or item.get('mimeType') != 'application/pdf'
            or item.get('parents') != [folder_id]
            or item.get('capabilities', {}).get('canDownload') is not True
            or not re.fullmatch(r'[a-f0-9]{32}', str(item.get('md5Checksum', '')))):
        raise ValueError('Source must be an unchanged downloadable PDF directly inside the inbox')
    try:
        size = int(item.get('size', 0))
    except (TypeError, ValueError):
        size = 0
    if not 0 < size <= 500 * 1024 * 1024 or not re.fullmatch(r'[0-9]+', str(item.get('version', ''))):
        raise ValueError('Source size or version is invalid')
    for key in ('createdTime', 'modifiedTime'):
        value = item.get(key)
        if not isinstance(value, str) or not re.fullmatch(r'.*(?:Z|[+-][0-9]{2}:[0-9]{2})$', value):
            raise ValueError('Source timestamp is invalid')


def local_file_description(path, root, mime_type):
    path, root = Path(path).resolve(), Path(root).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('Receipt marker must be a regular file inside the queue')
    data = path.read_bytes()
    return {'path': str(path.relative_to(root)), 'size': len(data),
            'md5': hashlib.md5(data).hexdigest(), 'sha256': hashlib.sha256(data).hexdigest(),
            'mimeType': mime_type}


@contextmanager
def archive_lock(root):
    with (root / 'drive-archive.lock').open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


class AckPending(Exception):
    """The receipt exists but the GAS registration marker is not committed yet."""


class UploadPending(Exception):
    """The mapped receipt has not completed its Drive upload yet."""


class CloudSync:
    def __init__(self, queue, config, drive, *, source=None, clock=time.time):
        self.queue, self.config, self.source, self.drive, self.clock = queue, config, source, drive, clock
        self.inbox_path = queue.root / 'drive-inbox.json'
        self.journal_path = queue.root / 'drive-archive.json'

    def _validate_environment(self):
        validate_settings(self.config)
        service = self.drive.service
        user = service.about().get(fields='user(emailAddress)').execute()['user']
        if user.get('emailAddress', '').casefold() != self.config['expectedAccount'].casefold():
            raise ValueError('OAuth account does not match expectedAccount')
        source = self._drive_get(self.config['sourceFolderId'])
        if (not source or source.get('trashed')
                or source.get('mimeType') != 'application/vnd.google-apps.folder'
                or source.get('capabilities', {}).get('canListChildren') is not True):
            raise ValueError('Source folder cannot be listed by the expected account')
        for key in ('artifactFolderId', 'receiptFolderId', 'processedRootId', 'reviewRootId'):
            self.drive.check_folder(self.config[key])
        for key in ('processedRootId', 'reviewRootId'):
            folder = self._drive_get(self.config[key])
            if not folder or folder.get('parents') != [self.config['sourceFolderId']]:
                raise ValueError('Archive roots must be direct children of the source folder')

    def _journal(self):
        if self.journal_path.exists():
            data = json.loads(self.journal_path.read_text(encoding='utf-8'))
            if data.get('schemaVersion') != 'worksheet-drive-archive-state/1':
                raise ValueError('Archive journal schema mismatch')
            return data
        return {'schemaVersion': 'worksheet-drive-archive-state/1', 'binding': {
            k: self.config[k] for k in ('sourceFolderId', 'artifactFolderId', 'receiptFolderId',
                                       'processedRootId', 'reviewRootId', 'ledgerId', 'stationId',
                                       'expectedAccount', 'subject')},
            'folders': {}, 'files': {}}

    def _save(self, journal):
        expected = {k: self.config[k] for k in ('sourceFolderId', 'artifactFolderId', 'receiptFolderId',
                                                'processedRootId', 'reviewRootId', 'ledgerId', 'stationId',
                                                'expectedAccount', 'subject')}
        if journal.get('binding') != expected:
            raise ValueError('Archive settings changed; use a separate queue')
        atomic_json(self.journal_path, journal)

    def _drive_get(self, file_id):
        try:
            return self.drive.service.files().get(fileId=drive_id(file_id), supportsAllDrives=True,
                fields='id,name,mimeType,size,md5Checksum,parents,trashed,properties,capabilities(canListChildren)').execute(num_retries=3)
        except Exception as error:
            if getattr(getattr(error, 'resp', None), 'status', None) == 404:
                return None
            raise

    def _create_folder(self, folder_id, parent_id, name):
        self.drive.service.files().create(body={'id': folder_id, 'name': name,
            'mimeType': 'application/vnd.google-apps.folder', 'parents': [parent_id]},
            supportsAllDrives=True, ignoreDefaultVisibility=True, fields='id').execute(num_retries=3)

    def _move(self, file_id, old_parent, new_parent):
        self.drive.service.files().update(fileId=drive_id(file_id), addParents=drive_id(new_parent),
            removeParents=drive_id(old_parent), supportsAllDrives=True, fields='id,parents').execute(num_retries=3)

    def _mapping(self):
        if not self.inbox_path.is_file():
            return {}
        journal = json.loads(self.inbox_path.read_text(encoding='utf-8'))
        if journal.get('schemaVersion') != 'worksheet-drive-inbox-state/1':
            raise ValueError('Drive inbox journal schema mismatch')
        binding = journal.get('binding', {})
        if binding.get('sourceFolderId') != self.config['sourceFolderId'] or binding.get('expectedAccount', '').casefold() != self.config['expectedAccount'].casefold():
            raise ValueError('Drive inbox account/folder does not match archive settings')
        if binding.get('stationId') != self.config['stationId']:
            raise ValueError('Drive inbox station does not match archive settings')
        return journal.get('files', {})

    def _registration(self, receipt_id, mapping):
        state_path = self.queue.state_path(receipt_id)
        if not state_path.is_file():
            raise ValueError('Local upload state is missing')
        state = json.loads(state_path.read_text(encoding='utf-8'))
        if state.get('receiptId') != receipt_id:
            raise ValueError('Receipt upload state does not match the inbox mapping')
        if state.get('status') != 'uploaded':
            raise UploadPending('Receipt upload is not complete')
        if state.get('stationId') != self.config['stationId']:
            raise ValueError('Uploaded station does not match pinned settings')
        if mapping.get('originalSha256') != state.get('originalSha256'):
            raise ValueError('Inbox original SHA-256 does not match uploaded state')
        destination = state.get('destination', {})
        if (destination.get('artifactFolderId') != self.config['artifactFolderId']
                or destination.get('receiptFolderId') != self.config['receiptFolderId']):
            raise ValueError('Uploaded destinations do not match pinned settings')
        receipt_path = state_path.parent / 'receipt.json'
        if not receipt_path.is_file() or not isinstance(state.get('receiptFileId'), str):
            raise ValueError('Local receipt marker is missing')
        manifest = json.loads(receipt_path.read_text(encoding='utf-8'))
        if (manifest.get('receiptId') != receipt_id
                or manifest.get('originalSha256') != state.get('originalSha256')):
            raise ValueError('Local receipt marker does not match the queue state')
        original = manifest.get('original')
        local_original = state.get('files', {}).get('original', {})
        if (not isinstance(original, dict) or not isinstance(local_original, dict)
                or original.get('fileId') != local_original.get('fileId')
                or original.get('sha256') != state.get('originalSha256')
                or original.get('size') != local_original.get('size')
                or original.get('md5') != local_original.get('md5')
                or original.get('sha256') != local_original.get('sha256')):
            raise ValueError('Receipt original descriptor does not match the uploaded artifact')
        mapped_source = mapping.get('source', {})
        if (str(original['size']) != str(mapped_source.get('size'))
                or original['md5'] != mapped_source.get('md5Checksum')):
            raise ValueError('Uploaded original bytes do not match the inbox source')
        original_description = {key: original[key] for key in ('fileId', 'size', 'md5', 'sha256', 'mimeType')}
        original_remote = self.drive.get(original['fileId'])
        DriveTransport.verify(original_remote, original_description,
                              self.config['artifactFolderId'], receipt_id, 'original')
        for item in manifest.get('items', []):
            artifact = item.get('pdf') if isinstance(item, dict) else None
            if artifact is None:
                continue
            description = {key: artifact[key] for key in ('fileId', 'size', 'md5', 'sha256', 'mimeType')}
            remote_artifact = self.drive.get(artifact['fileId'])
            DriveTransport.verify(remote_artifact, description, self.config['artifactFolderId'],
                                  receipt_id, 'sheet-' + str(item['sheetIndex']))
        receipt_description = local_file_description(receipt_path, self.queue.root, 'application/json')
        receipt_description['fileId'] = state['receiptFileId']
        receipt_folder = destination.get('receiptFolderId')
        remote = self.drive.get(state['receiptFileId'])
        if remote is None:
            raise AckPending('Receipt marker is not yet visible on Drive')
        DriveTransport.verify(remote, receipt_description, receipt_folder, receipt_id, 'receipt')
        # Drive exposes MD5, not SHA-256. DriveTransport verifies the remote bytes by
        # MD5; this separately pins the exact local receipt bytes in the archive journal.
        receipt_sha = receipt_description['sha256']
        if mapping.get('receiptId') != receipt_id:
            raise ValueError('Inbox mapping receipt ID mismatch')
        props = remote.get('properties', {})
        if props.get('worksheetImport') != 'registered':
            raise AckPending('GSS registration acknowledgement is pending')
        if props.get('worksheetLedger') != self.config['ledgerId']:
            raise ValueError('GSS registration acknowledgement belongs to another ledger')
        archive_status = props.get('worksheetArchiveStatus')
        if archive_status not in ('OK', 'REVIEW', 'ERROR'):
            raise ValueError('GSS archive acknowledgement is invalid')
        return state, manifest, receipt_sha, archive_status

    def _route(self, manifest, archive_status):
        items = manifest.get('items')
        if not isinstance(items, list) or not items:
            return 'reviewRootId', ['混在・識別未確定'], 'REVIEW'
        keys = set()
        for item in items:
            worksheet = item.get('worksheet') if isinstance(item, dict) else None
            if not isinstance(worksheet, dict) or set(('subject', 'year', 'worksheetId')) - set(worksheet):
                return 'reviewRootId', ['混在・識別未確定'], 'REVIEW'
            subject, year, worksheet_id = worksheet['subject'], worksheet['year'], worksheet['worksheetId']
            if subject != self.config['subject'] or not re.fullmatch(r'[0-9]{4}', str(year)) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(worksheet_id)):
                return 'reviewRootId', ['混在・識別未確定'], 'REVIEW'
            keys.add((subject, str(year), worksheet_id))
        if len(keys) != 1:
            return 'reviewRootId', ['混在・識別未確定'], 'REVIEW'
        subject, year, worksheet_id = next(iter(keys))
        clean = (archive_status == 'OK' and manifest.get('readingStatus') == 'OK'
                 and manifest.get('pairingIntegrity') == 'consistent'
                 and all(i.get('pairValid') is True for i in items))
        status = 'OK' if clean else ('ERROR' if archive_status == 'ERROR' or manifest.get('readingStatus') == 'ERROR' else 'REVIEW')
        root = 'processedRootId' if clean else 'reviewRootId'
        return root, [year, worksheet_id], status

    def _folder(self, journal, root_id, segments, full_path):
        parent = self.config[root_id]
        for index, name in enumerate(segments):
            key = root_id + '/' + '/'.join(segments[:index + 1])
            record = journal['folders'].get(key)
            if not record:
                folder_id = self.drive.reserve_ids(1)[0]
                record = {'id': folder_id, 'parentId': parent, 'name': name, 'status': 'reserved'}
                journal['folders'][key] = record
                self._save(journal)
            elif record['parentId'] != parent or record['name'] != name:
                raise ValueError('Archive folder journal conflicts with the requested route')
            remote = self._drive_get(record['id'])
            if remote is None:
                self._create_folder(record['id'], parent, name)
                remote = self._drive_get(record['id'])
            if (not remote or remote.get('id') != record['id'] or remote.get('trashed')
                    or remote.get('mimeType') != 'application/vnd.google-apps.folder'
                    or remote.get('parents') != [parent] or remote.get('name') != name):
                raise ValueError('Archive folder verification failed')
            record['status'] = 'ready'
            self._save(journal)
            parent = record['id']
        self.drive.check_folder(parent)
        return parent

    def _archive_file(self, file_id, entry, mapping, journal):
        source_meta = mapping.get('source')
        if not isinstance(source_meta, dict) or source_meta.get('id') != file_id:
            raise ValueError('Source metadata mapping is missing')
        expected = entry.get('source') or source_meta
        validate_source(expected, self.config['sourceFolderId'])
        if content_key(expected) != content_key(source_meta):
            raise ValueError('Source mapping content changed')
        target_parent = entry['targetParentId']
        before = self.source.metadata(file_id) if self.source else self.drive.get(file_id)
        if before.get('id') != file_id or before.get('trashed'):
            raise ValueError('Source file is missing or trashed')
        if (str(before.get('size')) != str(expected.get('size'))
                or before.get('md5Checksum') != expected.get('md5Checksum')):
            raise ValueError('Source bytes changed after intake')
        parents = before.get('parents', [])
        if parents == [target_parent]:
            return 'moved'
        if parents != [self.config['sourceFolderId']]:
            raise ValueError('Source parent changed before archive')
        try:
            self._move(file_id, self.config['sourceFolderId'], target_parent)
        except Exception:
            # Drive can complete a move while its response is lost. Confirm by ID and
            # target parent before deciding whether a retry is safe.
            after = self.source.metadata(file_id) if self.source else self.drive.get(file_id)
            if after.get('id') == file_id and after.get('parents') == [target_parent]:
                if str(after.get('size')) == str(expected['size']) and after.get('md5Checksum') == expected['md5Checksum']:
                    return 'moved'
            raise
        after = self.source.metadata(file_id) if self.source else self.drive.get(file_id)
        if (after.get('id') != file_id or after.get('parents') != [target_parent]
                or str(after.get('size')) != str(expected['size'])
                or after.get('md5Checksum') != expected['md5Checksum']):
            raise ValueError('Moved source verification failed')
        return 'moved'

    @staticmethod
    def _rotate(values, cursor):
        values = sorted(values)
        if cursor not in values:
            return values
        index = values.index(cursor) + 1
        return values[index:] + values[:index]

    def _process_mapping(self, file_id, mapping, journal, may_archive):
        prior = journal['files'].get(file_id, {})
        try:
            validate_source(mapping.get('source', {}), self.config['sourceFolderId'])
            local_date = datetime.fromtimestamp(self.clock(), ZoneInfo(self.config['timezone'])).date().isoformat()
            if (not may_archive and prior.get('status') == 'REGISTERED_READY'
                    and prior.get('ackVerifiedLocalDate') == local_date):
                return {'fileId': file_id, 'receiptId': mapping['receiptId'],
                        'status': 'REGISTERED_READY', 'archiveStatus': prior['archiveStatus']}
            state, manifest, receipt_sha, ack = self._registration(mapping['receiptId'], mapping)
            root_key, segments, routed = self._route(manifest, ack)
            root_id = self.config[root_key]
            receipt_description = local_file_description(
                self.queue.state_path(mapping['receiptId']).parent / 'receipt.json',
                self.queue.root, 'application/json')
            plan_pin = {'receiptId': mapping['receiptId'], 'receiptFileId': state['receiptFileId'],
                        'receiptMd5': receipt_description['md5'], 'receiptSha256': receipt_sha,
                        'source': {key: mapping['source'][key] for key in ('id', 'size', 'md5Checksum', 'parents')},
                        'targetRootId': root_id, 'route': segments,
                        'registrationStatus': ack, 'archiveStatus': routed}
            if prior.get('planPin') is not None and prior['planPin'] != plan_pin:
                raise ValueError('Previously journaled receipt, source, or route changed')
            prior.update(planPin=plan_pin, receiptId=mapping['receiptId'],
                         receiptFileId=state['receiptFileId'], receiptMd5=receipt_description['md5'],
                         receiptSha256=receipt_sha, source=mapping['source'], route=segments,
                         registrationStatus=ack, archiveStatus=routed)
            if not may_archive:
                prior['ackVerifiedLocalDate'] = local_date
                if prior.get('status') not in ('moving', 'moved'):
                    prior['status'] = 'REGISTERED_READY'
                journal['files'][file_id] = prior
                self._save(journal)
                return {'fileId': file_id, 'receiptId': mapping['receiptId'],
                        'status': 'REGISTERED_READY', 'archiveStatus': routed}
            target = self._folder(journal, root_key, segments, [root_key] + segments)
            if prior.get('targetParentId') and prior['targetParentId'] != target:
                raise ValueError('Previously journaled destination folder changed')
            prior.update(targetParentId=target, status='moving')
            journal['files'][file_id] = prior
            self._save(journal)
            result = self._archive_file(file_id, prior, mapping, journal)
            prior['status'] = result
            prior['archivedAt'] = datetime.now(ZoneInfo('UTC')).isoformat()
            self._save(journal)
            return {'fileId': file_id, 'receiptId': mapping['receiptId'], 'status': result,
                    'archiveStatus': routed, 'route': segments}
        except AckPending:
            return {'fileId': file_id, 'receiptId': mapping.get('receiptId'), 'status': 'WAITING_ACK'}
        except UploadPending:
            return {'fileId': file_id, 'receiptId': mapping.get('receiptId'), 'status': 'WAITING_UPLOAD'}
        except Exception as error:
            return {'fileId': file_id, 'receiptId': mapping.get('receiptId'),
                    'status': 'ERROR', 'reason': type(error).__name__}

    def run_once(self, *, force=False, max_jobs=None):
        limit = self.config['maxJobsPerCycle'] if max_jobs is None else max_jobs
        if type(limit) is not int or not 1 <= limit <= self.config['maxJobsPerCycle']:
            raise ValueError('max_jobs must be within maxJobsPerCycle')
        with archive_lock(self.queue.root):
            self._validate_environment()
            journal = self._journal()
            self._save(journal)
            mappings = self._mapping()
            reports, uploads, examined = [], [], 0
            may_archive = force or in_archive_window(self.config, self.clock())
            upload_ids = [s['receiptId'] for s in self.queue.states()
                          if s.get('status') in ('prepared', 'uploading')]
            archive_ids = [file_id for file_id, mapping in mappings.items()
                           if mapping.get('receiptId') is not None
                           and journal['files'].get(file_id, {}).get('status') != 'moved']
            upload_ids = self._rotate(upload_ids, journal.get('uploadCursor'))
            archive_ids = self._rotate(archive_ids, journal.get('archiveCursor'))
            up_index = ar_index = 0
            phase = journal.get('nextPhase', 'upload')
            while examined < limit and (up_index < len(upload_ids) or ar_index < len(archive_ids)):
                if up_index < len(upload_ids) and (phase == 'upload' or ar_index >= len(archive_ids)):
                    receipt_id = upload_ids[up_index]
                    up_index += 1
                    journal['uploadCursor'] = receipt_id
                    try:
                        uploaded = self.queue.upload(receipt_id, self.config, self.drive)
                        uploads.append({'receiptId': receipt_id, 'status': uploaded['status']})
                    except Exception as error:
                        uploads.append({'receiptId': receipt_id, 'status': 'ERROR',
                                        'reason': type(error).__name__})
                    phase = 'archive'
                elif ar_index < len(archive_ids):
                    file_id = archive_ids[ar_index]
                    ar_index += 1
                    journal['archiveCursor'] = file_id
                    reports.append(self._process_mapping(file_id, mappings[file_id], journal, may_archive))
                    phase = 'upload'
                else:
                    phase = 'archive'
                journal['nextPhase'] = phase
                self._save(journal)
                examined += 1
            return {'status': 'completed' if may_archive else 'upload_and_ack_check', 'examined': examined,
                    'moved': sum(r['status'] == 'moved' for r in reports),
                    'pending': sum(r['status'] in ('REGISTERED_READY', 'WAITING_ACK', 'WAITING_UPLOAD') for r in reports),
                    'errors': sum(r['status'] == 'ERROR' for r in reports)
                              + sum(r['status'] == 'ERROR' for r in uploads),
                    'uploads': uploads, 'items': reports}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', required=True, type=Path)
    parser.add_argument('--credentials-file', required=True, type=Path)
    parser.add_argument('--queue', required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--once', action='store_true', help='Always upload and check ACK; move originals only in the configured night window')
    mode.add_argument('--archive-now', action='store_true', help='Run one bounded archive cycle now')
    parser.add_argument('--max-jobs', type=int)
    args = parser.parse_args()
    try:
        config = configuration(args.settings)
        from cloud_intake import CloudQueue
        drive = DriveTransport.from_credentials_file(args.credentials_file)
        sync = CloudSync(CloudQueue(args.queue), config, drive)
        result = sync.run_once(force=args.archive_now, max_jobs=args.max_jobs)
        print(json_text(result))
        return 1 if result.get('errors') else 0
    except Exception as error:
        print('ERROR ' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
