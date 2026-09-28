"""Offline tests for acknowledgement-gated Drive source archival."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

from cloud_sync import CloudSync, atomic_json


RID = 'ws-' + 'a' * 64
CONFIG = {'schemaVersion': 'worksheet-drive-sync/1', 'sourceFolderId': 'source-folder-001',
          'artifactFolderId': 'artifact-folder-001', 'receiptFolderId': 'receipts-folder-001',
          'processedRootId': 'processed-folder-01', 'reviewRootId': 'review-folder-001',
          'expectedAccount': 'staff@example.test', 'stationId': 'studio', 'ledgerId': 'ledger-folder-001',
          'subject': 'INFO1', 'timezone': 'Asia/Tokyo', 'archiveStartHour': 21,
          'archiveEndHour': 7, 'maxJobsPerCycle': 10}


class Request:
    def __init__(self, result):
        self.result = result

    def execute(self, **_kwargs):
        if isinstance(self.result, Exception):
            raise self.result
        return copy.deepcopy(self.result)


class Http404(Exception):
    def __init__(self):
        self.resp = type('Response', (), {'status': 404})()


class FakeFiles:
    def __init__(self, owner):
        self.owner = owner

    def get(self, fileId, **_kwargs):
        return Request(self.owner.get_errors.get(fileId, self.owner.items.get(fileId)))

    def create(self, body, **_kwargs):
        self.owner.last_create_args = _kwargs
        def create():
            if self.owner.create_error:
                raise OSError('create failed')
            self.owner.items[body['id']] = {**copy.deepcopy(body), 'size': '0', 'parents': body['parents'],
                'trashed': False}
            return {'id': body['id']}
        return RequestFactory(create)

    def update(self, fileId, addParents, removeParents, **_kwargs):
        def update():
            if self.owner.move_error:
                raise OSError('move failed')
            item = self.owner.items[fileId]
            item['parents'] = [addParents]
            if self.owner.lose_move_response:
                self.owner.lose_move_response = False
                raise OSError('response lost after move')
            return {'id': fileId, 'parents': item['parents']}
        return RequestFactory(update)


class RequestFactory:
    def __init__(self, fn):
        self.fn = fn

    def execute(self, **_kwargs):
        return self.fn()


class FakeService:
    def __init__(self, owner):
        self.owner = owner

    def files(self):
        return FakeFiles(self.owner)

    def about(self):
        return FakeAbout()


class FakeAbout:
    def get(self, **_kwargs):
        return Request({'user': {'emailAddress': CONFIG['expectedAccount']}})


class FakeDrive:
    def __init__(self):
        self.items = {
            CONFIG['sourceFolderId']: {'id': CONFIG['sourceFolderId'], 'name': 'inbox',
                'mimeType': 'application/vnd.google-apps.folder', 'parents': ['parent-folder-001'], 'trashed': False,
                'capabilities': {'canListChildren': True}},
            CONFIG['artifactFolderId']: {'id': CONFIG['artifactFolderId'], 'name': 'artifacts',
                'mimeType': 'application/vnd.google-apps.folder', 'parents': ['parent-folder-001'], 'trashed': False},
            CONFIG['receiptFolderId']: {'id': CONFIG['receiptFolderId'], 'name': 'receipts',
                'mimeType': 'application/vnd.google-apps.folder', 'parents': ['parent-folder-001'], 'trashed': False},
            CONFIG['processedRootId']: {'id': CONFIG['processedRootId'], 'name': 'processed',
                'mimeType': 'application/vnd.google-apps.folder', 'parents': [CONFIG['sourceFolderId']], 'trashed': False},
            CONFIG['reviewRootId']: {'id': CONFIG['reviewRootId'], 'name': 'review',
                'mimeType': 'application/vnd.google-apps.folder', 'parents': [CONFIG['sourceFolderId']], 'trashed': False}}
        self.service = FakeService(self)
        self.next_id = 0
        self.move_calls = 0
        self.get_errors = {}
        self.last_create_args = {}
        self.lose_move_response = False
        self.move_error = False
        self.create_error = False

    def get(self, file_id):
        return copy.deepcopy(self.items.get(file_id))

    def reserve_ids(self, count):
        result = []
        for _ in range(count):
            self.next_id += 1
            result.append('reserved-folder-%04d' % self.next_id)
        return result

    def check_folder(self, folder_id):
        item = self.items[folder_id]
        assert item['mimeType'] == 'application/vnd.google-apps.folder'


class FakeSource:
    def __init__(self, drive):
        self.drive = drive

    def metadata(self, file_id):
        return copy.deepcopy(self.drive.items[file_id])


class FakeQueue:
    def __init__(self, root):
        self.root = Path(root)
        (self.root / 'jobs').mkdir(parents=True, exist_ok=True)

    def state_path(self, receipt_id):
        return self.root / 'jobs' / receipt_id / 'state.json'

    def save(self, state):
        path = self.state_path(state['receiptId'])
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_json(path, state)

    def states(self):
        return [json.loads(p.read_text()) for p in sorted((self.root / 'jobs').glob('ws-*/state.json'))]

    def upload(self, receipt_id, _config, _drive):
        state = json.loads(self.state_path(receipt_id).read_text())
        state['status'] = 'uploaded'
        self.save(state)
        return state


class CloudSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.queue = FakeQueue(self.root / 'queue')
        self.drive = FakeDrive()
        self.sync = CloudSync(self.queue, CONFIG, self.drive, source=FakeSource(self.drive), clock=lambda: 1790600400)
        self._setup_receipt()

    def tearDown(self):
        self.temp.cleanup()

    def _setup_receipt(self, *, acknowledgement='OK', ledger=None, worksheets=None):
        receipt_dir = self.queue.state_path(RID).parent
        receipt_dir.mkdir(parents=True, exist_ok=True)
        items = worksheets or [{'subject': 'INFO1', 'year': '2026', 'worksheetId': 'dr41'}]
        manifest = {'schemaVersion': 'worksheet-cloud-receipt/1', 'receiptId': RID,
                    'originalSha256': 'b' * 64, 'readingStatus': 'OK', 'pairingIntegrity': 'consistent',
                    'original': {'fileId': 'original-file-0001', 'size': '15', 'md5': 'c' * 32,
                                 'sha256': 'b' * 64, 'mimeType': 'application/pdf'},
                    'items': [{'sheetIndex': i + 1, 'worksheet': item, 'pairValid': True}
                              for i, item in enumerate(items)]}
        receipt_path = receipt_dir / 'receipt.json'
        receipt_path.write_text(json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n')
        receipt_bytes = receipt_path.read_bytes()
        receipt_md5 = hashlib.md5(receipt_bytes).hexdigest()
        receipt_id = 'receipt-file-0001'
        receipt_folder = 'receipts-folder-001'
        props = {'worksheetReceipt': RID, 'worksheetRole': 'receipt', 'worksheetImport': 'registered',
                 'worksheetLedger': ledger or CONFIG['ledgerId'], 'worksheetArchiveStatus': acknowledgement}
        self.drive.items[receipt_id] = {'id': receipt_id, 'name': 'receipt.json', 'mimeType': 'application/json',
            'size': str(len(receipt_bytes)), 'md5Checksum': receipt_md5, 'parents': [receipt_folder],
            'trashed': False, 'properties': props}
        self.drive.items['original-file-0001'] = {'id': 'original-file-0001', 'name': 'original.pdf',
            'mimeType': 'application/pdf', 'size': '15', 'md5Checksum': 'c' * 32,
            'parents': [CONFIG['artifactFolderId']], 'trashed': False,
            'properties': {'worksheetReceipt': RID, 'worksheetRole': 'original'}}
        state = {'receiptId': RID, 'stationId': CONFIG['stationId'], 'status': 'prepared',
                 'originalSha256': manifest['originalSha256'],
                 'receiptFileId': receipt_id,
                 'destination': {'artifactFolderId': CONFIG['artifactFolderId'], 'receiptFolderId': receipt_folder},
                 'files': {'original': {'fileId': 'original-file-0001', 'size': '15', 'md5': 'c' * 32,
                                        'sha256': 'b' * 64, 'mimeType': 'application/pdf'}}}
        self.queue.save(state)
        source_id = 'source-pdf-file-001'
        source = {'id': source_id, 'mimeType': 'application/pdf', 'size': '15',
                  'md5Checksum': 'c' * 32, 'parents': [CONFIG['sourceFolderId']], 'trashed': False,
                  'version': '3', 'createdTime': '2026-09-28T10:00:00Z',
                  'modifiedTime': '2026-09-28T10:00:00Z', 'capabilities': {'canDownload': True}}
        self.drive.items[source_id] = {**source, 'name': 'scan.pdf'}
        atomic_json(self.queue.root / 'drive-inbox.json', {'schemaVersion': 'worksheet-drive-inbox-state/1',
            'binding': {'sourceFolderId': CONFIG['sourceFolderId'], 'expectedAccount': CONFIG['expectedAccount'],
                        'stationId': 'studio'},
            'files': {source_id: {'source': source, 'receiptId': RID, 'originalSha256': 'b' * 64,
                                  'contentKey': ['15', 'c' * 32]}}})
        self.source_id = source_id

    def run_now(self):
        return self.sync.run_once(force=True)

    def test_missing_ack_and_wrong_ledger_never_move_source(self):
        self.drive.items['receipt-file-0001']['properties']['worksheetImport'] = 'pending'
        pending = self.run_now()
        self.assertEqual(pending['pending'], 1)
        self.assertEqual(pending['items'][0]['status'], 'WAITING_ACK')
        self.assertEqual(self.drive.items[self.source_id]['parents'], [CONFIG['sourceFolderId']])
        self.drive.items['receipt-file-0001']['properties']['worksheetImport'] = 'registered'
        self.drive.items['receipt-file-0001']['properties']['worksheetLedger'] = 'another-ledger-001'
        self.assertEqual(self.run_now()['errors'], 1)
        self.assertEqual(self.drive.items[self.source_id]['parents'], [CONFIG['sourceFolderId']])

    def test_changed_source_is_held(self):
        self.drive.items[self.source_id]['md5Checksum'] = 'd' * 32
        result = self.run_now()
        self.assertEqual(result['errors'], 1)
        self.assertEqual(self.drive.items[self.source_id]['parents'], [CONFIG['sourceFolderId']])

    def test_lost_move_response_is_confirmed_by_target_parent(self):
        self.drive.lose_move_response = True
        result = self.run_now()
        self.assertEqual(result['moved'], 1)
        self.assertEqual(result['items'][0]['status'], 'moved')
        self.assertEqual(len(self.drive.items[self.source_id]['parents']), 1)
        self.assertNotEqual(self.drive.items[self.source_id]['parents'], [CONFIG['sourceFolderId']])

    def test_mixed_worksheet_batch_routes_to_unidentified_review_folder(self):
        self._setup_receipt(worksheets=[{'subject': 'INFO1', 'year': '2026', 'worksheetId': 'dr41'},
                                        {'subject': 'INFO1', 'year': '2026', 'worksheetId': 'dr42'}])
        result = self.run_now()
        self.assertEqual(result['items'][0]['route'], ['混在・識別未確定'])
        target = self.drive.items[self.source_id]['parents'][0]
        self.assertEqual(self.drive.items[target]['name'], '混在・識別未確定')
        self.assertEqual(self.drive.items[target]['parents'], [CONFIG['reviewRootId']])

    def test_ack_status_routes_identified_submission(self):
        self.assertEqual(self.run_now()['items'][0]['route'], ['2026', 'dr41'])
        target = self.drive.items[self.source_id]['parents'][0]
        year_folder = self.drive.items[target]['parents'][0]
        self.assertEqual(self.drive.items[year_folder]['name'], '2026')
        self.assertEqual(self.drive.items[year_folder]['parents'], [CONFIG['processedRootId']])
        for acknowledgement in ('REVIEW', 'ERROR'):
            self.drive.items[self.source_id]['parents'] = [CONFIG['sourceFolderId']]
            self.sync.journal_path.unlink()
            self._setup_receipt(acknowledgement=acknowledgement)
            result = self.run_now()
            self.assertEqual(result['items'][0]['route'], ['2026', 'dr41'])
            self.assertEqual(result['items'][0]['archiveStatus'], acknowledgement)
            target = self.drive.items[self.source_id]['parents'][0]
            year_folder = self.drive.items[target]['parents'][0]
            self.assertEqual(self.drive.items[year_folder]['name'], '2026')
            self.assertEqual(self.drive.items[year_folder]['parents'], [CONFIG['reviewRootId']])

    def test_outside_archive_window_uploads_and_checks_ack_without_moving(self):
        sync = CloudSync(self.queue, CONFIG, self.drive, source=FakeSource(self.drive),
                         clock=lambda: 1790550000)  # 2026-09-27 evening UTC: daytime JST
        result = sync.run_once()
        self.assertEqual(result['status'], 'upload_and_ack_check')
        self.assertEqual(result['items'][0]['status'], 'REGISTERED_READY')
        self.assertEqual(result['pending'], 1)
        self.assertEqual(self.drive.items[self.source_id]['parents'], [CONFIG['sourceFolderId']])

    def test_registered_ready_is_rechecked_before_night_move_and_plan_cannot_change(self):
        daytime = CloudSync(self.queue, CONFIG, self.drive, source=FakeSource(self.drive),
                            clock=lambda: 1790550000)
        ready = daytime.run_once()
        self.assertEqual(ready['items'][0]['status'], 'REGISTERED_READY')
        journal_before = json.loads(daytime.journal_path.read_text())
        self.assertEqual(journal_before['files'][self.source_id]['status'], 'REGISTERED_READY')
        self.drive.items['receipt-file-0001']['properties']['worksheetImport'] = 'missing'
        self.assertEqual(daytime.run_once()['items'][0]['status'], 'REGISTERED_READY')
        self.drive.items['receipt-file-0001']['properties']['worksheetImport'] = 'registered'
        self.drive.items['receipt-file-0001']['properties']['worksheetArchiveStatus'] = 'REVIEW'
        night = CloudSync(self.queue, CONFIG, self.drive, source=FakeSource(self.drive),
                          clock=lambda: 1790600400)
        result = night.run_once()
        self.assertEqual(result['items'][0]['status'], 'ERROR')
        self.assertEqual(self.drive.items[self.source_id]['parents'], [CONFIG['sourceFolderId']])
        journal_after = json.loads(night.journal_path.read_text())
        self.assertEqual(journal_after['files'][self.source_id]['planPin'],
                         journal_before['files'][self.source_id]['planPin'])

    def test_archive_folder_journal_keeps_distinct_worksheet_paths(self):
        journal = self.sync._journal()
        first = self.sync._folder(journal, 'processedRootId', ['2026', 'dr41'],
                                  ['processedRootId', '2026', 'dr41'])
        second = self.sync._folder(journal, 'processedRootId', ['2026', 'dr42'],
                                   ['processedRootId', '2026', 'dr42'])
        self.assertNotEqual(first, second)
        self.assertEqual(self.drive.items[self.drive.items[first]['parents'][0]]['name'], '2026')
        self.assertEqual(self.drive.items[self.drive.items[second]['parents'][0]]['name'], '2026')

    def test_missing_reserved_folder_id_404_is_treated_as_not_yet_created(self):
        folder_id = 'reserved-folder-0099'
        self.drive.get_errors[folder_id] = Http404()
        self.assertIsNone(self.sync._drive_get(folder_id))

    def test_upload_only_mapping_only_and_combined_limit_are_bounded(self):
        inbox_path = self.queue.root / 'drive-inbox.json'
        inbox = json.loads(inbox_path.read_text())
        inbox['files'] = {}
        atomic_json(inbox_path, inbox)
        upload_only = self.sync.run_once(max_jobs=1)
        self.assertEqual(upload_only['examined'], 1)
        self.assertEqual(upload_only['uploads'][0]['status'], 'uploaded')

        # Restore one archive candidate and make its queue job already uploaded.
        self._setup_receipt()
        state = json.loads(self.queue.state_path(RID).read_text())
        state['status'] = 'uploaded'
        self.queue.save(state)
        mapping_only = self.sync.run_once(force=True, max_jobs=1)
        self.assertLessEqual(mapping_only['examined'], 1)
        self.assertEqual(mapping_only['moved'], 1)

        # A fresh prepared receipt consumes one shared slot; the next cycle
        # resumes at the archive phase and remains bounded to one candidate.
        self.sync.journal_path.unlink()
        self.drive.items[self.source_id]['parents'] = [CONFIG['sourceFolderId']]
        self._setup_receipt()
        first = self.sync.run_once(force=True, max_jobs=1)
        self.assertEqual(first['examined'], 1)
        self.assertEqual(len(first['uploads']), 1)
        second = self.sync.run_once(force=True, max_jobs=1)
        self.assertEqual(second['examined'], 1)
        self.assertEqual(second['moved'], 1)

    def test_round_robin_advances_past_a_permanent_source_error(self):
        second_id = 'source-pdf-file-002'
        second_source = {'id': second_id, 'mimeType': 'application/pdf', 'size': '15',
                         'md5Checksum': 'c' * 32, 'parents': [CONFIG['sourceFolderId']], 'trashed': False,
                         'version': '3', 'createdTime': '2026-09-28T10:00:00Z',
                         'modifiedTime': '2026-09-28T10:00:00Z', 'capabilities': {'canDownload': True}}
        self.drive.items[second_id] = {**second_source, 'name': 'scan-2.pdf'}
        inbox_path = self.queue.root / 'drive-inbox.json'
        inbox = json.loads(inbox_path.read_text())
        broken = copy.deepcopy(inbox['files'][self.source_id])
        broken['source']['md5Checksum'] = 'd' * 32
        inbox['files'][self.source_id] = broken
        inbox['files'][second_id] = {'source': second_source, 'receiptId': RID,
                                     'originalSha256': 'b' * 64, 'contentKey': ['15', 'c' * 32]}
        atomic_json(inbox_path, inbox)
        self.sync.config['maxJobsPerCycle'] = 1
        self.sync.run_once(force=True, max_jobs=1)
        first = self.sync.run_once(force=True, max_jobs=1)
        self.assertEqual(first['items'][0]['status'], 'ERROR')
        second = self.sync.run_once(force=True, max_jobs=1)
        self.assertEqual(second['items'][0]['fileId'], second_id)
        self.assertEqual(second['items'][0]['status'], 'moved')

    def test_repeat_does_not_move_twice(self):
        self.assertEqual(self.run_now()['moved'], 1)
        self.drive.move_error = True
        second = self.run_now()
        self.assertEqual(second['moved'], 0)
        self.assertEqual(second['examined'], 0)

    def test_move_api_failure_keeps_source_in_original_folder(self):
        self.drive.move_error = True
        result = self.run_now()
        self.assertEqual(result['errors'], 1)
        self.assertEqual(self.drive.items[self.source_id]['parents'], [CONFIG['sourceFolderId']])


if __name__ == '__main__':
    unittest.main()
