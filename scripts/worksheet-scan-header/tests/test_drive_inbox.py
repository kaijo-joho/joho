"""Offline Drive receive/retry tests; PDFs flow through the existing queue."""
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud_intake import CloudQueue
from drive_inbox import DriveSource, InboxWorker, configuration, main
from scan_intake import MAX_BATCH_BYTES
from test_cloud_intake import FakeDrive, CONFIG as UPLOAD_CONFIG
from test_scan_intake import pdf, pair, fake_reader

CONFIG = {'schemaVersion': 'worksheet-drive-inbox/1', 'sourceFolderId': 'source-folder-1234',
          'expectedAccount': 'teacher@example.edu', 'stationId': 'studio-drive'}


def metadata(data, file_id='source-pdf-12345'):
    return {'id': file_id, 'mimeType': 'application/pdf', 'size': str(len(data)),
            'md5Checksum': hashlib.md5(data).hexdigest(), 'parents': [CONFIG['sourceFolderId']],
            'trashed': False, 'version': '1', 'createdTime': '2026-09-28T00:00:00Z',
            'modifiedTime': '2026-09-28T00:00:00Z', 'capabilities': {'canDownload': True}}


class MemorySource:
    def __init__(self, path):
        self.data = path.read_bytes()
        self.items = [metadata(self.data)]
        self.checks = self.downloads = 0
        self.failure = None

    def check(self, config):
        self.checks += 1

    def files(self, folder_id):
        yield from copy.deepcopy(self.items)

    def download(self, item, folder_id, target):
        self.downloads += 1
        if self.failure:
            target.write_bytes(b'incomplete')
            raise self.failure
        target.write_bytes(self.data)


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.queue = CloudQueue(self.root / 'queue')
        self.source = MemorySource(pdf(self.root / 'source.pdf', pair() + pair('408', paper='a4', reverse=True)))
        self.worker = InboxWorker(self.queue, self.source, CONFIG)
        self.fake = patch('scan_intake.scan_file', side_effect=fake_reader)
        self.fake.start()

    def tearDown(self):
        self.fake.stop()
        self.tmp.cleanup()

    def pull(self, **kwargs):
        return self.worker.pull(clock=lambda: 2000000000, **kwargs)

    def test_receive_b5_a4_and_pass_to_existing_upload_pipeline(self):
        result = self.pull()
        self.assertEqual(result[0]['readingStatus'], 'OK')
        state = self.queue.states()[0]
        self.assertEqual([i['studentIdentifier'] for i in state['manifest']['items']], ['307', '408'])
        self.assertEqual(state['receivedAt'], '2026-09-28T00:00:00+00:00')
        self.assertFalse(state['manifest']['gradingEnabled'])
        drive = FakeDrive()
        done = self.queue.upload(state['receiptId'], UPLOAD_CONFIG, drive)
        self.assertEqual(done['status'], 'uploaded')
        self.assertEqual(drive.order, ['original', 'sheet-1', 'sheet-2', 'receipt'])
        journal = json.loads(self.worker.path.read_text())
        self.assertEqual(journal['files'][self.source.items[0]['id']]['receiptId'], state['receiptId'])
        self.assertFalse(list(self.queue.root.glob('drive-download-*')))

    def test_repeated_poll_and_restart_do_not_download_again(self):
        self.pull()
        self.worker = InboxWorker(self.queue, self.source, CONFIG)
        self.assertEqual(self.pull(), [])
        self.assertEqual(self.source.downloads, 1)
        self.assertEqual(len(self.queue.states()), 1)

    def test_outputs_cannot_be_uploaded_back_to_the_source_inbox(self):
        receipt = self.pull()[0]['receiptId']
        drive = FakeDrive()
        for field in ('artifactFolderId', 'receiptFolderId'):
            with self.assertRaisesRegex(ValueError, 're-ingestion'):
                self.queue.upload(receipt, {**UPLOAD_CONFIG, field: CONFIG['sourceFolderId']}, drive)
        self.assertEqual(drive.reservations, 0)

    def test_different_drive_ids_with_identical_bytes_share_one_receipt(self):
        self.source.items.append({**self.source.items[0], 'id': 'another-source-123'})
        result = self.pull()
        self.assertEqual(result[0]['receiptId'], result[1]['receiptId'])
        self.assertEqual(len(self.queue.states()), 1)
        self.assertEqual(len(json.loads(self.worker.path.read_text())['files']), 2)

    def test_lost_journal_commit_recovers_same_receipt(self):
        from drive_inbox import atomic_json
        def fail_commit(path, value):
            if Path(path) == self.worker.path and value['files']:
                raise OSError('disk issue')
            atomic_json(path, value)
        with patch('drive_inbox.atomic_json', side_effect=fail_commit):
            self.assertEqual(self.pull()[0]['status'], 'ERROR')
        first = self.queue.states()[0]['receiptId']
        self.assertEqual(self.pull()[0]['receiptId'], first)
        self.assertEqual(len(self.queue.states()), 1)

    def test_interrupted_download_retries_and_preserves_no_partial_job(self):
        self.source.failure = ConnectionError('private token must not leak')
        reports = self.pull()
        self.assertEqual(reports[0]['errorType'], 'ConnectionError')
        self.assertNotIn('private token', json.dumps(reports))
        self.assertEqual(self.queue.states(), [])
        self.assertFalse(list(self.queue.root.glob('drive-download-*')))
        self.source.failure = None
        self.assertEqual(self.pull()[0]['readingStatus'], 'OK')

    def test_replaced_source_is_review_and_original_is_preserved(self):
        self.pull()
        original = self.queue.root / self.queue.states()[0]['originalPath']
        before = original.read_bytes()
        self.source.items[0]['md5Checksum'] = 'a' * 32
        self.assertEqual(self.pull()[0]['reason'], 'SOURCE_CHANGED')
        self.assertEqual(original.read_bytes(), before)
        self.assertEqual(self.source.downloads, 1)

    def test_metadata_only_change_does_not_create_another_receipt(self):
        self.pull()
        self.source.items[0]['version'] = '2'
        self.assertEqual(self.pull(), [])
        self.assertEqual(self.source.downloads, 1)

    def test_recent_file_waits_and_limit_continues_next_poll(self):
        self.source.items[0]['modifiedTime'] = '2033-05-18T03:33:20Z'  # clock = 2000000000
        self.assertEqual(self.pull()[0]['status'], 'WAITING')
        self.source.items[0]['modifiedTime'] = '2026-09-28T00:00:00Z'
        self.source.items.append({**self.source.items[0], 'id': 'second-file-12345'})
        self.assertEqual(self.pull(limit=1)[-1]['reason'], 'BATCH_LIMIT')
        self.assertEqual(self.pull(limit=1)[0]['fileId'], 'second-file-12345')

    def test_wrong_folder_mime_shortcut_permission_and_size_never_download(self):
        base = self.source.items[0]
        for change in ({'parents': ['unrelated-folder']}, {'trashed': True},
                       {'mimeType': 'application/vnd.google-apps.shortcut'},
                       {'capabilities': {'canDownload': False}}, {'size': str(MAX_BATCH_BYTES + 1)},
                       {'md5Checksum': None}, {'version': ''}, {'createdTime': '2026-09-28'}):
            with self.subTest(change=change):
                self.source.items = [{**base, **change}]
                self.assertEqual(self.pull()[0]['status'], 'ERROR')
        self.assertEqual(self.source.downloads, 0)

    def test_source_binding_is_pinned(self):
        self.pull()
        for field, value in [('sourceFolderId', 'different-folder'), ('expectedAccount', 'other@example.edu'), ('stationId', 'other')]:
            with self.assertRaisesRegex(ValueError, 'changed'):
                InboxWorker(self.queue, self.source, {**CONFIG, field: value}).pull()

    def test_two_pollers_cannot_run_in_the_same_queue(self):
        with self.worker.locked():
            with self.assertRaises(BlockingIOError):
                self.pull()

    def test_malformed_pdf_is_retained_as_error_without_pupil_guess(self):
        self.source.data = b'%PDF-invalid'
        self.source.items = [metadata(self.source.data)]
        result = self.pull()
        self.assertEqual(result[0]['readingStatus'], 'ERROR')
        self.assertEqual(result[0]['items'], 0)
        self.assertEqual((self.queue.root / self.queue.states()[0]['originalPath']).read_bytes(), self.source.data)


class SourceAdapterTests(unittest.TestCase):
    def test_account_mismatch_is_rejected_before_folder_access(self):
        service = Mock()
        service.about.return_value.get.return_value.execute.return_value = {'user': {'emailAddress': 'wrong@example.edu'}}
        with self.assertRaisesRegex(ValueError, 'account'):
            DriveSource(service).check(CONFIG)
        service.files.assert_not_called()

    def test_readonly_folder_is_allowed(self):
        service = Mock()
        service.about.return_value.get.return_value.execute.return_value = {'user': {'emailAddress': CONFIG['expectedAccount']}}
        service.files.return_value.get.return_value.execute.return_value = {
            'mimeType': 'application/vnd.google-apps.folder', 'capabilities': {'canListChildren': True, 'canAddChildren': False}}
        DriveSource(service).check(CONFIG)
        service.files.return_value.update.assert_not_called()

    def test_listing_is_folder_scoped_and_follows_empty_pages(self):
        service = Mock()
        service.files.return_value.list.return_value.execute.side_effect = [
            {'files': [], 'nextPageToken': 'second'}, {'files': [metadata(b'data')]}]
        items = list(DriveSource(service).files(CONFIG['sourceFolderId']))
        self.assertEqual(len(items), 1)
        args = service.files.return_value.list.call_args.kwargs
        self.assertEqual(args['pageToken'], 'second')
        self.assertIn("'source-folder-1234' in parents", args['q'])
        self.assertIn("mimeType = 'application/pdf'", args['q'])
        self.assertTrue(args['includeItemsFromAllDrives'])

    def test_incomplete_search_is_not_reported_as_empty_success(self):
        service = Mock()
        service.files.return_value.list.return_value.execute.return_value = {'files': [], 'incompleteSearch': True}
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            list(DriveSource(service).files(CONFIG['sourceFolderId']))

    def download(self, payload, before=None, after=None, remote=None):
        item = remote or metadata(b'%PDF-test')
        service = Mock()
        service.files.return_value.get.return_value.execute.side_effect = [before or item, after or item]
        def factory(stream, request, **kwargs):
            def chunk(**kwargs):
                stream.write(payload)
                return None, True
            return Mock(next_chunk=chunk)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'source.pdf'
            DriveSource(service, factory).download(item, CONFIG['sourceFolderId'], path)
            self.assertEqual(path.read_bytes(), payload)
        service.files.return_value.get_media.assert_called_once_with(fileId=item['id'], supportsAllDrives=True)
        service.files.return_value.update.assert_not_called()
        service.files.return_value.delete.assert_not_called()

    def test_download_checks_size_hash_and_metadata_before_and_after(self):
        self.download(b'%PDF-test')
        for payload in (b'short', b'%PDF-fake', b'%PDF-much-too-long'):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.download(payload)
        for field in ('before', 'after'):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.download(b'%PDF-test', **{field: {**metadata(b'%PDF-test'), 'version': '2'}})

    def test_settings_reject_extra_keys_and_query_injection(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'settings.json'
            path.write_text(json.dumps(CONFIG))
            self.assertEqual(configuration(path), CONFIG)
            for change in ({'sourceFolderId': "x' in parents"}, {'expectedAccount': ''}, {'token': 'private'}):
                path.write_text(json.dumps({**CONFIG, **change}))
                with self.assertRaises(ValueError):
                    configuration(path)

    def test_inspect_cli_reports_empty_folder_without_download_or_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'settings.json'
            path.write_text(json.dumps(CONFIG))
            source = Mock()
            source.files.return_value = iter([])
            output = io.StringIO()
            args = ['drive_inbox.py', '--settings', str(path), '--credentials-file', '/not-read/oauth.json', 'inspect']
            with patch.object(sys, 'argv', args), patch('drive_inbox.DriveSource', return_value=source), \
                    patch('drive_inbox.DriveTransport.from_credentials_file'), patch('sys.stdout', output):
                self.assertEqual(main(), 0)
            self.assertEqual(json.loads(output.getvalue())['pdfCount'], 0)
            source.download.assert_not_called()
            self.assertEqual(list(Path(tmp).iterdir()), [path])

    def test_cli_auth_failure_does_not_expose_sdk_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'settings.json'
            path.write_text(json.dumps(CONFIG))
            output = io.StringIO()
            args = ['drive_inbox.py', '--settings', str(path), '--credentials-file', '/not-read/oauth.json', 'inspect']
            with patch.object(sys, 'argv', args), patch('sys.stderr', output), \
                    patch('drive_inbox.DriveTransport.from_credentials_file', side_effect=RuntimeError('secret-token')):
                self.assertEqual(main(), 1)
            self.assertNotIn('secret-token', output.getvalue())


if __name__ == '__main__':
    unittest.main()
