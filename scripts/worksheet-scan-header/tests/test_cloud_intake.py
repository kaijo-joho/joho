"""No network: real PDF pairing, durable uploads, watcher and Drive API contracts."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud_intake import CloudQueue, configuration
from drive_transport import DriveTransport, file_description
from test_scan_intake import pdf, pair, fake_reader

ROOT = Path(__file__).resolve().parents[1]
CONFIG = {'schemaVersion': 'worksheet-cloud-settings/1', 'stationId': 'mini',
          'artifactFolderId': 'private-artifact-folder', 'receiptFolderId': 'private-receipt-folder'}


class FakeDrive:
    def __init__(self):
        self.objects, self.order, self.reservations = {}, [], 0
        self.fail_before = self.fail_after = None
        self.calls = 0

    def check_folder(self, folder):
        pass

    def reserve_ids(self, count):
        self.reservations += 1
        return ['fake-drive-id-' + str(i) for i in range(count)]

    def upload(self, description, root, folder, receipt, role):
        self.calls += 1
        if self.fail_before == role:
            self.fail_before = None
            raise ConnectionError('Simulated disconnect before upload')
        data = (Path(root) / description['path']).read_bytes()
        if hashlib.sha256(data).hexdigest() != description['sha256']:
            raise ValueError('Local artifact changed')
        previous = self.objects.get(description['fileId'])
        if previous:
            if previous[0] != data:
                raise ValueError('Remote artifact changed')
        else:
            self.objects[description['fileId']] = (data, folder, role)
            self.order.append(role)
        if self.fail_after == role:
            self.fail_after = None
            raise ConnectionError('Simulated lost success response')
        return description['fileId']


class CloudQueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='worksheet-cloud-test-')
        self.root = Path(self.tmp.name).resolve()
        self.queue = CloudQueue(self.root / 'private-queue')
        self.fake = patch('scan_intake.scan_file', side_effect=fake_reader)
        self.fake.start()

    def tearDown(self):
        self.fake.stop()
        self.tmp.cleanup()

    def prepare(self, labels=None):
        path = pdf(self.root / ('input-' + str(len(list(self.root.glob('input-*')))) + '.pdf'), labels or pair())
        return path, self.queue.prepare(path, 'mini')

    def test_no_roster_required_b5_a4_reverse_and_immutable_source(self):
        path, state = self.prepare(pair() + pair('408', paper='a4', reverse=True))
        items = state['manifest']['items']
        self.assertEqual([i['studentIdentifier'] for i in items], ['307', '408'])
        self.assertTrue(items[1]['reversedPages'])
        self.assertEqual([i['sourcePages'] for i in items], [[1, 2], [3, 4]])
        self.assertEqual(path.read_bytes(), (self.queue.root / state['originalPath']).read_bytes())
        self.assertNotIn(str(self.root), json.dumps(state['manifest']))
        self.assertNotIn('studentKey', json.dumps(state['manifest']))
        self.assertFalse(state['manifest']['gradingEnabled'])

    def test_exact_duplicate_retains_receipt_and_first_reception(self):
        path, state = self.prepare()
        again = self.queue.prepare(path, 'another-station', received_at='2028-01-01T00:00:00Z')
        self.assertEqual(again, state)
        self.assertEqual(len(self.queue.states()), 1)

    def test_lost_boundary_quarantines_whole_batch(self):
        _, state = self.prepare(pair() + pair('408')[:1])
        self.assertEqual(state['manifest']['pairingIntegrity'], 'uncertain')
        self.assertTrue(all(i['studentIdentifier'] is None for i in state['manifest']['items']))

    def test_uncertain_omr_keeps_other_pair_and_never_guesses(self):
        _, state = self.prepare(pair('?') + pair('408'))
        self.assertEqual([i['studentIdentifier'] for i in state['manifest']['items']], [None, '408'])

    def test_resume_after_interrupted_analysis(self):
        source = pdf(self.root / 'crash.pdf', pair())
        with patch('cloud_intake.scan_stack', side_effect=RuntimeError('interrupted')):
            with self.assertRaises(RuntimeError):
                self.queue.prepare(source, 'mini')
        pending = self.queue.states()[0]
        self.assertEqual(pending['status'], 'received')
        done = self.queue.prepare(source, 'mini')
        self.assertEqual(done['receiptId'], pending['receiptId'])
        self.assertEqual(done['receivedAt'], pending['receivedAt'])
        self.assertEqual(done['status'], 'prepared')

    def test_corrupt_original_is_retained_and_can_be_uploaded(self):
        source = self.root / 'corrupt.pdf'
        source.write_bytes(b'broken pdf')
        state = self.queue.prepare(source, 'mini')
        self.assertEqual(state['manifest']['readingStatus'], 'ERROR')
        self.assertEqual(state['manifest']['items'], [])
        drive = FakeDrive()
        self.queue.upload(state['receiptId'], CONFIG, drive)
        self.assertEqual(drive.order, ['original', 'receipt'])

    def test_upload_is_immutable_and_receipt_is_last(self):
        _, state = self.prepare(pair() + pair('408'))
        drive = FakeDrive()
        done = self.queue.upload(state['receiptId'], CONFIG, drive)
        self.assertEqual(done['status'], 'uploaded')
        self.assertEqual(drive.order, ['original', 'sheet-1', 'sheet-2', 'receipt'])
        again = self.queue.upload(state['receiptId'], CONFIG, drive)
        self.assertEqual(drive.reservations, 1)
        self.assertEqual(again['uploadedAt'], done['uploadedAt'])
        self.assertEqual(len(drive.objects), 4)

    def test_retries_do_not_duplicate_after_lost_upload_response(self):
        for role in ('original', 'sheet-1', 'receipt'):
            with self.subTest(role=role):
                _, state = self.prepare(pair(worksheet='WS' + str(len(self.queue.states()) + 1)))
                drive = FakeDrive()
                drive.fail_after = role
                with self.assertRaises(ConnectionError):
                    self.queue.upload(state['receiptId'], CONFIG, drive)
                pending = json.loads(self.queue.state_path(state['receiptId']).read_text())
                self.assertEqual(pending['status'], 'uploading')
                self.assertTrue(all(f.get('fileId') for f in pending['files'].values()))
                done = self.queue.upload(state['receiptId'], CONFIG, drive)
                self.assertEqual(done['status'], 'uploaded')
                self.assertEqual(drive.reservations, 1)
                self.assertEqual(len(drive.objects), 3)

    def test_receipt_not_published_until_every_pdf_uploaded(self):
        _, state = self.prepare()
        drive = FakeDrive()
        drive.fail_before = 'sheet-1'
        with self.assertRaises(ConnectionError):
            self.queue.upload(state['receiptId'], CONFIG, drive)
        self.assertEqual(drive.order, ['original'])

    def test_destination_and_original_tampering_are_rejected(self):
        source, state = self.prepare()
        drive = FakeDrive()
        self.queue.upload(state['receiptId'], CONFIG, drive)
        with self.assertRaisesRegex(ValueError, 'Destination changed'):
            self.queue.upload(state['receiptId'], {**CONFIG, 'receiptFolderId': 'different-folder'}, drive)
        (self.queue.root / state['originalPath']).write_bytes(b'changed')
        with self.assertRaises(ValueError):
            self.queue.prepare(source, 'mini')
        with self.assertRaises(ValueError):
            self.queue.upload(state['receiptId'], CONFIG, drive)

    def test_watcher_waits_for_stability_and_reobserves_changed_file(self):
        inbox = self.root / 'inbox'
        inbox.mkdir()
        source = pdf(inbox / 'scanner.pdf', pair())
        (inbox / 'unfinished.pdf.partial').write_bytes(b'ignore')
        (inbox / 'symlink.pdf').symlink_to(source)
        self.assertEqual(self.queue.ready_files(inbox, 15, clock=lambda: 100), [])
        self.assertEqual(self.queue.ready_files(inbox, 15, clock=lambda: 114), [])
        self.assertEqual(self.queue.ready_files(inbox, 15, clock=lambda: 115), [source])
        self.queue.mark_prepared(source)
        self.assertEqual(self.queue.ready_files(inbox, 15, clock=lambda: 200), [])
        source.write_bytes(source.read_bytes() + b'\n')
        self.assertEqual(self.queue.ready_files(inbox, 15, clock=lambda: 300), [])
        self.assertEqual(self.queue.ready_files(inbox, 15, clock=lambda: 315), [source])

    def test_queue_cannot_be_inside_git_or_watched_inbox(self):
        repo = self.root / 'repo'
        (repo / '.git').mkdir(parents=True)
        with self.assertRaises(ValueError):
            CloudQueue(repo / 'private')
        with self.assertRaises(ValueError):
            self.queue.ready_files(self.root, 15)
        with self.assertRaises(ValueError):
            self.queue.ready_files(self.queue.root, 15)

    def test_generated_manifest_is_accepted_by_actual_gas_validator(self):
        for labels in (pair(), pair('408', paper='a4', reverse=True), pair() + pair('408')[:1], pair('?')):
            _, state = self.prepare(labels)
            drive = FakeDrive()
            done = self.queue.upload(state['receiptId'], CONFIG, drive)
            js = "const fs=require('fs'),vm=require('vm'); const c=vm.createContext({}); vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c); c.WorksheetReceipt.validate(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));"
            result = subprocess.run(['node', '-e', js, str(ROOT / 'gas/00_receipt_core.js'),
                str(self.queue.state_path(done['receiptId']).parent / 'receipt.json')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


class DriveAdapterTests(unittest.TestCase):
    def test_sdk_upload_lost_response_recovers_using_the_reserved_id(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            path = root / 'original.pdf'
            path.write_bytes(b'%PDF-fake-transport-fixture')
            description = {**file_description(path, root, 'application/pdf'), 'fileId': 'reserved-file-123'}
            remote = {'id': description['fileId'], 'mimeType': 'application/pdf', 'size': str(description['size']),
                      'md5Checksum': description['md5'], 'parents': ['folder-123456'],
                      'properties': {'worksheetReceipt': 'receipt', 'worksheetRole': 'original'}}
            missing = RuntimeError('404')
            missing.resp = SimpleNamespace(status=404)
            service, media_factory = Mock(), Mock()
            files = service.files.return_value
            files.get.return_value.execute.side_effect = [missing, remote]
            files.create.return_value.next_chunk.side_effect = TimeoutError('lost reply after remote commit')
            drive = DriveTransport(service, media_factory)
            with self.assertRaises(TimeoutError):
                drive.upload(description, root, 'folder-123456', 'receipt', 'original')
            self.assertEqual(drive.upload(description, root, 'folder-123456', 'receipt', 'original'), description['fileId'])
            self.assertEqual(files.create.call_count, 1)
            self.assertEqual(files.create.call_args.kwargs['body']['id'], description['fileId'])
            self.assertEqual(files.create.call_args.kwargs['body']['parents'], ['folder-123456'])
            self.assertTrue(media_factory.call_args.kwargs['resumable'])
            self.assertTrue(files.create.call_args.kwargs['supportsAllDrives'])

    def test_destination_check_rejects_broad_permissions_even_on_later_page(self):
        service = Mock()
        service.files.return_value.get.return_value.execute.return_value = {
            'id': 'folder-123456', 'mimeType': 'application/vnd.google-apps.folder',
            'capabilities': {'canAddChildren': True}}
        service.permissions.return_value.list.return_value.execute.side_effect = [
            {'permissions': [{'type': 'user'}], 'nextPageToken': 'next'},
            {'permissions': [{'type': 'domain'}]}]
        with self.assertRaisesRegex(ValueError, 'private scan folders'):
            DriveTransport(service, Mock()).check_folder('folder-123456')
        self.assertEqual(service.permissions.return_value.list.call_args.kwargs['pageToken'], 'next')
        service.files.return_value.create.assert_not_called()

    def test_remote_verification_rejects_wrong_content_parent_and_receipt(self):
        d = {'fileId': 'file-1234567', 'size': 8, 'md5': 'a' * 32, 'mimeType': 'application/pdf'}
        r = {'id': d['fileId'], 'size': '8', 'md5Checksum': d['md5'], 'mimeType': d['mimeType'],
             'parents': ['folder-123456'], 'properties': {'worksheetReceipt': 'receipt', 'worksheetRole': 'original'}}
        DriveTransport.verify(r, d, 'folder-123456', 'receipt', 'original')
        for changes in ({'size': '9'}, {'md5Checksum': 'b' * 32}, {'trashed': True},
                        {'parents': ['another-folder']}, {'properties': {}}, {'mimeType': 'text/html'}):
            with self.assertRaises(ValueError):
                DriveTransport.verify({**r, **changes}, d, 'folder-123456', 'receipt', 'original')

    def test_configuration_rejects_unknown_keys_and_shared_folder_ids(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            for value in ({**CONFIG, 'token': 'must-not-embed'}, {**CONFIG, 'artifactFolderId': CONFIG['receiptFolderId']},
                          {**CONFIG, 'artifactFolderId': "bad'query"}):
                path.write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    configuration(path)
            path.write_text(json.dumps(CONFIG))
            self.assertEqual(configuration(path), CONFIG)


class RealCloudReaderTests(unittest.TestCase):
    def test_real_b5_a4_reading_reaches_gas_matching_contract(self):
        from PIL import Image
        from make_scan_cases import filled, scene_image
        images = []
        for paper, digits, sides in [('b5', (3, 0, 7), ('F', 'B')), ('a4', (4, 0, 8), ('B', 'F'))]:
            for side in sides:
                pixels, coordinates = scene_image({'pageSize': paper, 'worksheetId': 'WS05', 'year': 2026, 'side': side})
                images.append(Image.fromarray(filled(pixels, coordinates, digits) if side == 'F' else pixels))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / 'class.pdf'
            images[0].save(source, 'PDF', save_all=True, append_images=images[1:], resolution=300)
            queue = CloudQueue(root / 'queue')
            prepared = queue.prepare(source, 'mini')
            self.assertEqual([i['studentIdentifier'] for i in prepared['manifest']['items']], ['307', '408'])
            done = queue.upload(prepared['receiptId'], CONFIG, FakeDrive())
            script = """const fs=require('fs'),vm=require('vm'); const c=vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
const m=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const a=c.WorksheetReceipt.match(m,[{subject:'INFO1',year:2026,worksheetId:'WS05',grade:1,enabled:true}],
[{studentKey:'fake-307',grade:1,classNumber:3,number:7},{studentKey:'fake-408',grade:1,classNumber:4,number:8}],2026);
if(a.map(x=>x.studentKey).join(',')!=='fake-307,fake-408'||a.some(x=>x.intakeStatus!=='OK'))process.exit(1);"""
            result = subprocess.run(['node', '-e', script, str(ROOT / 'gas/00_receipt_core.js'),
                str(queue.state_path(done['receiptId']).parent / 'receipt.json')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
