"""Boundary loss, retries, ownership corrections and real QR/OMR integration."""
import copy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scan_core import load_catalog, load_config
from scan_intake import ingest, scan_stack
from scan_poc import associate_pages
from submission_ledger import Ledger, load_settings, validate_settings
from make_scan_cases import filled, scene_image

ROOT = Path(__file__).resolve().parents[1]


def settings():
    return load_settings(ROOT / 'intake-settings.example.json')


def pdf(path, labels, tag=''):
    writer = PdfWriter()
    for label in labels:
        page = writer.add_blank_page(515.9055, 728.5039)
        page[NameObject('/FixtureLabel')] = TextStringObject(label)
    writer.add_metadata({'/FixtureTag': tag})
    with Path(path).open('xb') as stream:
        writer.write(stream)
    return Path(path)


def fake_reader(path, output, **kwargs):
    """Deterministic page evidence; the stack still parses/splits real PDFs."""
    pages = []
    for item in PdfReader(path).pages:
        label = str(item['/FixtureLabel'])
        side, number, worksheet, paper = label.split(':')
        page = {'status': 'OK', 'confidence': .9, 'issues': [], 'pageSize': paper,
                'studentIdentifier': number if side == 'F' and number != '?' else None}
        if side == '?':
            page.update(status='REVIEW', identity=None, issues=['qr_unreadable'])
        else:
            page['identity'] = {'subject': 'INFO1', 'year': 2026, 'worksheetId': worksheet, 'side': side}
        if side == 'F' and number == '?':
            page.update(status='REVIEW', issues=['ambiguous_omr'])
        pages.append(page)
    pairing = associate_pages(pages)
    result = {**pairing, 'pairing': pairing, 'pages': pages}
    Path(output).mkdir()
    (Path(output) / 'result.json').write_text(json.dumps(result))
    return result


def pair(number='307', worksheet='WS05', paper='b5', reverse=False):
    labels = [f'F:{number}:{worksheet}:{paper}', f'B:-:{worksheet}:{paper}']
    return labels[::-1] if reverse else labels


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ws-intake-test-')
        self.root = Path(self.tmp.name)
        self.ledger = Ledger(self.root / 'store')
        self.settings = settings()
        self.counter = 0
        self.reader = patch('scan_intake.scan_file', side_effect=fake_reader)
        self.reader.start()

    def tearDown(self):
        self.reader.stop()
        self.ledger.close()
        self.tmp.cleanup()

    def take(self, labels=None, **kwargs):
        self.counter += 1
        source = pdf(self.root / f'{self.counter}.pdf', labels or pair(), str(self.counter))
        result = ingest(self.ledger, source, kwargs.pop('settings', self.settings), **kwargs)
        return source, result

    def test_b5_a4_and_reversed_pairs_preserve_original_order(self):
        _, result = self.take(pair() + pair('408', paper='a4', reverse=True))
        self.assertEqual(result['status'], 'OK')
        self.assertEqual([a['assignment']['studentIdentifier'] for a in result['attempts']], ['307', '408'])
        self.assertEqual([a['sourcePages'] for a in result['attempts']], [[1, 2], [3, 4]])
        self.assertTrue(result['attempts'][1]['reversedPages'])
        for a in result['attempts']:
            self.assertEqual(len(PdfReader(self.ledger.root / a['pdf']).pages), 2)

    def test_batch_with_lost_boundary_never_slides_or_assigns_later_pages(self):
        for labels in (pair() + pair('408')[:1],
                       pair()[:1] + pair('408') + pair('327') + pair()[-1:],
                       pair() + ['?:-:WS05:b5', 'B:-:WS05:b5'] + pair('327'),
                       pair() + ['F:408:WS05:b5', 'B:-:WS32:b5']):
            with self.subTest(labels=labels):
                _, result = self.take(labels)
                self.assertEqual(result['status'], 'REVIEW')
                self.assertEqual(result['pairingIntegrity'], 'uncertain')
                self.assertTrue(all(a['assignment'] is None for a in result['attempts']))
        self.assertEqual(self.ledger.report(self.settings)['groups'], [])
        self.assertTrue(self.ledger.report(self.settings)['reviewQueue'])

    def test_uncertain_omr_does_not_block_other_intact_sheets(self):
        _, result = self.take(pair('?') + pair('408'))
        self.assertEqual(result['pairingIntegrity'], 'consistent')
        self.assertIsNone(result['attempts'][0]['assignment'])
        self.assertEqual(result['attempts'][1]['assignment']['studentIdentifier'], '408')

    def test_unregistered_grade_worksheet_and_student_are_not_guessed(self):
        for labels in (pair(worksheet='UNKNOWN'), pair('399')):
            _, result = self.take(labels)
            self.assertIsNone(result['attempts'][0]['assignment'])
            self.assertEqual(result['status'], 'REVIEW')
        raw = copy.deepcopy(self.settings['raw'])
        raw['worksheets'][0]['eligibleStudentKeys'] = ['demo-student-408']
        _, result = self.take(settings=validate_settings(raw))
        self.assertIn('student_not_assigned', result['attempts'][0]['flags'])

    def test_same_file_from_another_scanner_is_not_another_submission(self):
        source, first = self.take(scanner_id='scanner-1', received_at='2026-09-26T12:00:00+09:00')
        other_path = self.root / 'renamed.pdf'
        other_path.write_bytes(source.read_bytes())
        again = ingest(self.ledger, other_path, self.settings, scanner_id='scanner-2')
        self.assertTrue(again['duplicateFile'])
        self.assertEqual(again['receivedAt'], first['receivedAt'])
        self.assertEqual(first['batchId'], again['batchId'])
        report = self.ledger.report(self.settings)
        self.assertEqual(report['groups'][0]['submissionCount'], 1)
        self.assertEqual(report['events'][-1]['action'], 'duplicate_file_received')
        self.assertEqual((self.ledger.root / first['original']).read_bytes(), source.read_bytes())

    def test_rescans_are_candidates_and_manual_selection_survives_later_arrival(self):
        _, first = self.take()
        _, second = self.take()
        report = self.ledger.report(self.settings)
        self.assertEqual(report['groups'][0]['submissionCount'], 2)
        self.assertIsNone(report['groups'][0]['selectedAttemptId'])
        self.assertIn('duplicate_submission', report['groups'][0]['flags'])
        first_id = first['attempts'][0]['attemptId']
        with self.ledger.locked():
            self.ledger.select(first_id, 'teacher', 'Compared name and both sides')
        self.take()
        report = self.ledger.report(self.settings)
        self.assertEqual(report['groups'][0]['selectedAttemptId'], first_id)
        self.assertEqual(report['groups'][0]['submissionCount'], 3)
        self.assertEqual(report['groups'][0]['selectionMode'], 'manual')
        self.assertEqual(second['attempts'][0]['readingStatus'], 'OK')
        self.assertFalse(report['gradingEnabled'])
        self.assertFalse(report['requiresStudentConfirmation'])

    def test_failed_new_scan_does_not_remove_previous_success(self):
        _, first = self.take()
        self.take(pair('?'))
        report = self.ledger.report(self.settings)
        self.assertEqual(report['groups'][0]['selectedAttemptId'], first['attempts'][0]['attemptId'])
        self.assertEqual(report['groups'][0]['submissionCount'], 1)

    def test_reanalysis_retains_attempt_ids_and_receipt_time(self):
        source, first = self.take()
        second = ingest(self.ledger, source, self.settings, retry=True)
        self.assertEqual(first['attempts'][0]['attemptId'], second['attempts'][0]['attemptId'])
        self.assertEqual(first['receivedAt'], second['receivedAt'])
        self.assertNotEqual(first['resultFile'], second['resultFile'])
        self.assertTrue((self.ledger.root / first['resultFile']).exists())
        self.assertEqual(len(self.ledger.report(self.settings)['attempts']), 1)

    def test_failed_reanalysis_does_not_leave_stale_associations(self):
        source, first = self.take(pair() + pair('408'))
        self.ledger.select(first['attempts'][0]['attemptId'], 'teacher', 'Checked')
        result = ingest(self.ledger, source, self.settings, retry=True, max_pages=2)
        self.assertEqual(result['status'], 'ERROR')
        report = self.ledger.report(self.settings)
        self.assertEqual(report['groups'], [])
        self.assertEqual(len(report['orphanSelections']), 1)
        self.assertTrue(all('analysis_incomplete' in a['flags'] for a in report['attempts']))

    def test_reanalysis_cannot_transfer_selection_to_a_new_roster_owner(self):
        source, result = self.take()
        self.ledger.select(result['attempts'][0]['attemptId'], 'teacher', 'Checked')
        raw = copy.deepcopy(self.settings['raw'])
        raw['roster'][0]['studentKey'] = 'different-owner'
        updated = validate_settings(raw)
        ingest(self.ledger, source, updated, retry=True)
        report = self.ledger.report(updated)
        self.assertEqual(len(report['orphanSelections']), 1)
        self.assertNotEqual(report['groups'][0]['selectionMode'], 'manual')

    def test_mistake_is_tracked_per_incident_and_can_be_cancelled(self):
        _, wrong = self.take(pair('408'))
        _, fixed = self.take(pair('307'))
        wrong_id, fixed_id = wrong['attempts'][0]['attemptId'], fixed['attempts'][0]['attemptId']
        case = self.ledger.open_case(wrong_id, 'teacher', 'Name confirms wrong bubbles')
        self.assertEqual(self.ledger.report(self.settings)['caseCounts']['unresolved'], 1)
        with self.assertRaises(ValueError):
            self.ledger.open_case(wrong_id, 'teacher', 'Duplicate case')
        with self.assertRaises(ValueError):
            self.ledger.resolve_case(case, wrong_id, 'teacher', 'Same original')
        self.ledger.resolve_case(case, fixed_id, 'teacher', 'Compared original with rescan')
        report = self.ledger.report(self.settings)
        self.assertEqual(report['caseCounts'], {'knownMistakes': 1, 'resolved': 1, 'unresolved': 0, 'cancelled': 0})
        self.assertEqual([g['assignment']['studentIdentifier'] for g in report['groups']], ['307'])
        with self.assertRaises(ValueError):
            self.ledger.exclude(wrong_id, 'teacher', 'Bypass case', restore=True)
        self.ledger.cancel_case(case, 'teacher', 'Original determination withdrawn')
        self.assertEqual(self.ledger.report(self.settings)['caseCounts']['knownMistakes'], 0)
        self.assertIsNone(self.ledger.attempt(wrong_id)['excluded'])

    def test_wrong_worksheet_or_reused_replacement_cannot_resolve_case(self):
        _, wrong = self.take(pair('408'))
        _, other = self.take(pair('307', worksheet='WS32'))
        _, fixed = self.take(pair('307'))
        case = self.ledger.open_case(wrong['attempts'][0]['attemptId'], 'teacher', 'Wrong number')
        with self.assertRaises(ValueError):
            self.ledger.resolve_case(case, other['attempts'][0]['attemptId'], 'teacher', 'Wrong assignment')
        self.ledger.resolve_case(case, fixed['attempts'][0]['attemptId'], 'teacher', 'Confirmed')
        _, wrong2 = self.take(pair('408'))
        case2 = self.ledger.open_case(wrong2['attempts'][0]['attemptId'], 'teacher', 'Another incident')
        with self.assertRaises(ValueError):
            self.ledger.resolve_case(case2, fixed['attempts'][0]['attemptId'], 'teacher', 'Already used')

    def test_exclusion_and_restore_do_not_rewrite_vision_evidence(self):
        _, result = self.take()
        attempt_id = result['attempts'][0]['attemptId']
        self.ledger.exclude(attempt_id, 'teacher', 'Not this pupil')
        self.assertEqual(self.ledger.report(self.settings)['groups'], [])
        self.assertEqual(self.ledger.attempt(attempt_id)['data']['readingStatus'], 'OK')
        self.ledger.exclude(attempt_id, 'teacher', 'Undo exclusion', restore=True)
        self.assertEqual(len(self.ledger.report(self.settings)['groups']), 1)

    def test_sparse_history_uses_closed_eligible_assignments_and_never_rejects(self):
        raw = copy.deepcopy(self.settings['raw'])
        raw['worksheets'] = [{**raw['worksheets'][0], 'worksheetId': f'WS0{i}', 'dueAt': '2026-09-01T00:00:00+09:00'} for i in range(1, 6)]
        catalog = validate_settings(raw)
        self.take(settings=catalog, received_at='2026-09-02T12:00:00+09:00')
        group = self.ledger.report(catalog, '2026-09-10T00:00:00+09:00')['groups'][0]
        self.assertIn('sparse_submission_history', group['flags'])
        self.assertEqual(group['receiptState'], 'RECEIVED')
        self.assertIsNotNone(group['selectedAttemptId'])
        self.assertEqual(group['historyEvidence']['receivedAssignments'], 1)
        self.assertNotIn('sparse_submission_history', self.ledger.report(catalog, '2026-08-01T00:00:00+09:00')['groups'][0]['flags'])
        raw['worksheets'][0]['eligibleStudentKeys'] = ['demo-student-408']
        self.assertNotIn('sparse_submission_history', self.ledger.report(validate_settings(raw), '2026-09-10T00:00:00+09:00')['groups'][0]['flags'])

    def test_corrupt_file_is_retained_without_a_submission(self):
        path = self.root / 'bad.pdf'
        path.write_bytes(b'%PDF-corrupt')
        result = ingest(self.ledger, path, self.settings)
        self.assertEqual(result['status'], 'ERROR')
        self.assertEqual((self.ledger.root / result['original']).read_bytes(), path.read_bytes())
        self.assertEqual(self.ledger.report(self.settings)['groups'], [])

    def test_modified_stored_original_is_detected(self):
        source, result = self.take()
        (self.ledger.root / result['original']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            ingest(self.ledger, source, self.settings, retry=True)
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            ingest(self.ledger, source, self.settings)

    def test_isolated_image_is_not_a_complete_duplex_submission(self):
        image = self.root / 'front.png'
        Image.new('RGB', (300, 400), 'white').save(image)
        with patch('scan_intake.scan_file', return_value={'status': 'OK', 'confidence': .9, 'studentIdentifier': '307',
                'pages': [{'identity': {'subject': 'INFO1', 'year': 2026, 'worksheetId': 'WS05', 'side': 'F'}}]}):
            result = ingest(self.ledger, image, self.settings)
        self.assertEqual(result['status'], 'REVIEW')
        self.assertIsNone(result['attempts'][0]['assignment'])
        self.assertIn('incomplete_duplex_input', result['attempts'][0]['flags'])

    def test_encrypted_pdf_is_preserved_but_not_assigned(self):
        path = self.root / 'encrypted.pdf'
        writer = PdfWriter()
        writer.add_blank_page(515.9, 728.5)
        writer.encrypt('test-only')
        with path.open('wb') as stream:
            writer.write(stream)
        result = ingest(self.ledger, path, self.settings)
        self.assertEqual(result['status'], 'ERROR')
        report = self.ledger.report(self.settings)
        self.assertEqual(report['groups'], [])
        self.assertEqual(report['reviewQueue'][0]['kind'], 'batch')

    def test_changed_roster_flags_old_owner_without_reassigning(self):
        self.take()
        raw = copy.deepcopy(self.settings['raw'])
        raw['roster'][0]['studentKey'] = 'another-person'
        group = self.ledger.report(validate_settings(raw))['groups'][0]
        self.assertIn('roster_changed', group['flags'])
        self.assertEqual(group['assignment']['studentKey'], 'demo-student-307')

    def test_bad_actor_rolls_back_a_selection(self):
        _, result = self.take()
        with self.assertRaises(ValueError):
            self.ledger.select(result['attempts'][0]['attemptId'], '', 'A note')
        self.assertEqual(self.ledger.db.execute('SELECT count(*) FROM selections').fetchone()[0], 0)

    def test_resolved_case_reappears_if_replacement_is_excluded(self):
        _, wrong = self.take(pair('408'))
        _, fixed = self.take()
        case = self.ledger.open_case(wrong['attempts'][0]['attemptId'], 'teacher', 'Confirmed number mistake')
        self.ledger.resolve_case(case, fixed['attempts'][0]['attemptId'], 'teacher', 'Compared both scans')
        self.ledger.exclude(fixed['attempts'][0]['attemptId'], 'teacher', 'Requires another look')
        report = self.ledger.report(self.settings)
        self.assertIn('resolved_replacement_unavailable', report['cases'][0]['flags'])
        self.assertTrue(any(x.get('caseId') == case for x in report['reviewQueue']))

    def test_incomplete_ingest_can_resume_from_same_input(self):
        source = pdf(self.root / 'interrupted.pdf', pair())
        with patch('scan_intake.scan_stack', side_effect=RuntimeError('interrupted')):
            with self.assertRaises(RuntimeError):
                ingest(self.ledger, source, self.settings)
        self.assertEqual(self.ledger.db.execute('SELECT count(*) FROM batches').fetchone()[0], 1)
        result = ingest(self.ledger, source, self.settings)
        self.assertEqual(result['status'], 'OK')
        self.assertEqual(self.ledger.db.execute('SELECT count(*) FROM batches').fetchone()[0], 1)

    def test_parallel_import_of_same_bytes_creates_one_attempt(self):
        source = pdf(self.root / 'concurrent.pdf', pair())
        def work(scanner):
            store = Ledger(self.ledger.root)
            try:
                return ingest(store, source, self.settings, scanner_id=scanner)
            finally:
                store.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(work, ['one', 'two']))
        self.assertEqual(sum(r['duplicateFile'] for r in results), 1)
        self.assertEqual(len(self.ledger.report(self.settings)['attempts']), 1)

    def test_limits_and_overwrite_protection(self):
        source = pdf(self.root / 'limit.pdf', pair() + pair('408'))
        with self.assertRaises(ValueError):
            ingest(self.ledger, source, self.settings, max_bytes=1)
        result = scan_stack(source, self.root / 'limited', max_pages=2)
        self.assertEqual(result['status'], 'ERROR')
        self.assertEqual(result['sheets'], [])
        with self.assertRaises(FileExistsError):
            scan_stack(source, self.root / 'limited')


class SettingsTests(unittest.TestCase):
    def test_invalid_and_ambiguous_settings_fail_before_import(self):
        original = settings()['raw']
        values = []
        item = copy.deepcopy(original)
        item['roster'].append(copy.deepcopy(item['roster'][0]))
        values.append(item)
        item = copy.deepcopy(original)
        item['worksheets'].append({**item['worksheets'][0], 'grade': 2})
        values.append(item)
        item = copy.deepcopy(original)
        item['worksheets'][0]['dueAt'] = '2026-10-01T12:00:00'
        values.append(item)
        item = copy.deepcopy(original)
        item['roster'][0]['studentIdentifier'] = 307
        values.append(item)
        item = copy.deepcopy(original)
        item['reviewRules']['minClosedAssignments'] = True
        values.append(item)
        item = copy.deepcopy(original)
        item['worksheets'][0]['eligibleStudentKeys'] = ['unknown']
        values.append(item)
        for data in [None, {}, *values]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                validate_settings(data)

    def test_store_cannot_be_created_inside_a_repository(self):
        with self.assertRaises(ValueError):
            Ledger(ROOT / 'scan-results' / 'private-ledger')


class RealReaderIntegrationTests(unittest.TestCase):
    def test_four_page_pdf_with_real_b5_a4_qr_and_omr(self):
        images = []
        for paper, digits, sides in [('b5', (3, 0, 7), ('F', 'B')), ('a4', (4, 0, 8), ('B', 'F'))]:
            for side in sides:
                image, coords = scene_image({'pageSize': paper, 'worksheetId': 'WS05', 'year': 2026, 'side': side})
                images.append(Image.fromarray(filled(image, coords, digits) if side == 'F' else image))
        with tempfile.TemporaryDirectory(prefix='ws-intake-real-') as tmp:
            path = Path(tmp) / 'class.pdf'
            images[0].save(path, 'PDF', save_all=True, append_images=images[1:], resolution=300)
            store = Ledger(Path(tmp) / 'store')
            try:
                result = ingest(store, path, settings(), catalog=load_catalog(), config=load_config())
                self.assertEqual(result['status'], 'OK', result)
                self.assertEqual([a['assignment']['studentIdentifier'] for a in result['attempts']], ['307', '408'])
                self.assertEqual(result['attempts'][1]['sourcePages'], [3, 4])
                self.assertTrue(result['attempts'][1]['reversedPages'])
                for a in result['attempts']:
                    reading = json.loads((store.root / a['readingResult']).read_text())
                    self.assertEqual(len(reading['pages']), 2)
                    self.assertTrue(Path(reading['pages'][0]['debugImages']['markers']).is_file())
            finally:
                store.close()


if __name__ == '__main__':
    unittest.main()
