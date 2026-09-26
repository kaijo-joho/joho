import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scan_core import analyze_image, classify_row, load_catalog, load_config, validate_coordinates
from scan_batch import compare_expected, read_manifest
from scan_poc import associate_pages, scan_file
from make_scan_cases import filled, scene_image


def page(side='F', **changes):
    value = {'status': 'OK', 'confidence': .9, 'identity': {'subject': 'INFO1', 'year': 2026, 'worksheetId': 'WS05', 'side': side},
             'pageSize': 'b5', 'studentIdentifier': '307' if side == 'F' else None}
    value.update(changes)
    return value


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.config = load_config()

    def row(self, first, second=0, weak_second=None):
        ratios = [0.] * 10
        ratios[3], ratios[4] = first, second
        weak = ratios.copy()
        weak[4] = second if weak_second is None else weak_second
        return classify_row(ratios, weak, self.config)

    def test_threshold_boundaries_fail_closed(self):
        for fill, second, expected in ((.549, 0, 'REVIEW'), (.55, 0, 'OK'), (.9, .179, 'OK'), (.9, .18, 'REVIEW'), (.55, .16, 'REVIEW'), (0, 0, 'REVIEW'), (.9, .9, 'REVIEW')):
            with self.subTest(fill=fill, second=second):
                result = self.row(fill, second)
                self.assertEqual(result['status'], expected)
                if expected == 'REVIEW':
                    self.assertIsNone(result['digit'])
                    self.assertLess(result['confidence'], .5)

    def test_faint_secondary_ink_blocks_acceptance(self):
        result = self.row(.95, .03, .35)
        self.assertEqual(result['status'], 'REVIEW')
        self.assertIn('secondary_faint_or_erased_mark', result['issues'])

    def test_valid_pair_and_reverse_inherit_front(self):
        for pages, source in (([page(), page('B')], 1), ([page('B'), page()], 2)):
            result = associate_pages(pages)
            self.assertEqual(result['status'], 'OK')
            self.assertEqual(result['studentIdentifier'], '307')
            self.assertEqual([a['sourcePage'] for a in result['studentAssignments']], [source, source])
            self.assertEqual(result['reversedPages'], source == 2)

    def test_missing_duplicate_mixed_and_uncertain_never_inherit(self):
        bad_identity = {**page('B')['identity'], 'worksheetId': 'WS32'}
        for pages in ([page()], [page('B')], [page(), page()], [page('B'), page('B')],
                      [page(), page('B', identity=bad_identity)], [page(), page('B', pageSize='a4')],
                      [page(status='REVIEW', studentIdentifier=None), page('B')], [page(), page('B', status='REVIEW')]):
            result = associate_pages(pages)
            self.assertEqual(result['status'], 'REVIEW')
            self.assertIsNone(result['studentIdentifier'])
            self.assertEqual(result['studentAssignments'], [])

    def test_single_front_and_single_back(self):
        self.assertEqual(associate_pages([page()], False)['studentIdentifier'], '307')
        self.assertEqual(associate_pages([page('B')], False)['status'], 'REVIEW')

    def test_coordinate_schema_and_back_contract(self):
        catalog = load_catalog()
        self.assertEqual(len(catalog), 4)
        with self.assertRaises(ValueError):
            validate_coordinates([])
        for key, value in [('schemaVersion', 'worksheet-scan-header/1'), ('omr', catalog[0]['omr'])]:
            broken = copy.deepcopy(catalog[1])
            broken[key] = value
            with self.assertRaises(ValueError):
                validate_coordinates(broken)

    def test_wrong_paper_cannot_be_forced_into_an_accepted_student(self):
        catalog = load_catalog()
        for actual, wrong in [('b5', 'a4'), ('a4', 'b5')]:
            image, c = scene_image({'pageSize': actual, 'worksheetId': 'WS05', 'year': 2026, 'side': 'F'})
            result, _ = analyze_image(filled(image, c), catalog, paper=wrong)
            self.assertEqual(result['status'], 'REVIEW')
            self.assertIsNone(result['studentIdentifier'])
            self.assertIn('qr_layout_mismatch', result['issues'])

    def test_equal_geometry_candidates_are_reviewed(self):
        image, c = scene_image({'pageSize': 'b5', 'worksheetId': 'WS05', 'year': 2026, 'side': 'F'})
        result, _ = analyze_image(filled(image, c), [c, copy.deepcopy(c)])
        self.assertEqual(result['status'], 'REVIEW')
        self.assertIsNone(result['studentIdentifier'])
        self.assertIn('ambiguous_paper_or_orientation', result['issues'])

    def test_config_typos_and_nonsense_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'config.json'
            for config in ([], None, {'minFillRaito': .5}, {'minFillRatio': -1}, {'minFillRatio': .1}, {'pdfDpi': 50000}, {'weakInkFraction': .2}, {'minFillRatio': True}):
                path.write_text(json.dumps(config))
                with self.assertRaises(ValueError):
                    load_config(path)

    def test_input_errors_leave_json_and_do_not_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'output'
            result = scan_file(Path(tmp) / 'missing.png', output)
            self.assertEqual(result['status'], 'ERROR')
            self.assertIsNone(result['studentIdentifier'])
            self.assertEqual(json.loads((output / 'result.json').read_text())['status'], 'ERROR')
            with self.assertRaises(FileExistsError):
                scan_file(Path(tmp) / 'missing.png', output)

    def test_validation_counts_wrong_acceptance(self):
        result = {'status': 'OK', 'studentIdentifier': '327', 'pages': [{'pageSize': 'b5'}]}
        for expected in ({'status': 'REVIEW'}, {'status': 'OK', 'studentIdentifier': '328'}, {'status': 'OK', 'pageSize': 'a4'}):
            check = compare_expected(result, expected)
            self.assertFalse(check['passed'])
            self.assertTrue(check['falseAcceptance'])

    def test_manifest_requires_real_expectations(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'manifest.json'
            for expected in ({}, {'status': 'ok'}, {'studentIdentifier': 307}, {'unknown': True}):
                path.write_text(json.dumps({'schemaVersion': 'worksheet-scan-cases/1', 'cases': [{'input': 'image.png', 'expected': expected}]}))
                with self.assertRaises(ValueError):
                    read_manifest(path)


if __name__ == '__main__':
    unittest.main()
