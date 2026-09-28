import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scan_core import classify_ink_steps, classify_row, ink_thresholds, load_config, measure_omr
from make_scan_cases import scene_image, ink


class AdaptiveOmrTests(unittest.TestCase):
    def setUp(self):
        self.config = load_config()

    def samples(self, marks, background=250):
        samples = [np.full(100, background, dtype=float) for _ in range(10)]
        for digit, darkness, coverage in marks:
            samples[digit][:round(coverage * 100)] = background * darkness
        return classify_ink_steps(samples, [background] * 10, self.config)

    def test_all_digits_and_pencil_densities_need_two_stable_steps(self):
        for digit in range(10):
            for density in (.1, .6, .68, .74, .8, .84):
                for background in (185, 250):
                    with self.subTest(digit=digit, density=density, background=background):
                        row = self.samples([(digit, density, 1)], background)
                        self.assertEqual((row['status'], row['digit']), ('OK', digit))
                        search = row['thresholdSearch']
                        self.assertEqual(search['stableSteps'], 2)
                        self.assertEqual([r['digit'] for r in search['trials'][-2:]], [digit, digit])
                        self.assertEqual(row['confidence'], min(r['confidence'] for r in search['trials'][-2:]))

    def test_faint_and_erased_second_mark_veto_even_an_early_strong_winner(self):
        for density in (.1, .75, .86, .89):
            with self.subTest(density=density):
                row = self.samples([(3, .2, 1), (7, density, .35)])
                self.assertEqual(row['status'], 'REVIEW')
                self.assertIsNone(row['digit'])
                self.assertIn('secondary_faint_or_erased_mark', row['issues'])
                self.assertFalse(row['thresholdSearch']['accepted'])

    def test_only_last_threshold_is_not_stable_enough(self):
        row = self.samples([(9, .86, 1)])
        self.assertEqual((row['status'], row['digit'], row['candidateDigit']), ('REVIEW', None, 9))
        self.assertIn('unstable_ink_threshold', row['issues'])
        self.assertEqual(row['thresholdSearch']['stableSteps'], 1)
        self.assertLess(row['confidence'], .5)

    def test_partial_marks_do_not_become_full_by_relaxing_darkness(self):
        for coverage in (.05, .25, .54):
            row = self.samples([(4, .2, coverage)])
            self.assertEqual(row['status'], 'REVIEW')
            self.assertIsNone(row['digit'])

    def test_blank_and_too_faint_are_not_guessed(self):
        blank = self.samples([])
        self.assertIn('blank', blank['issues'])
        self.assertIsNone(blank['candidateDigit'])
        self.assertEqual(len(blank['thresholdSearch']['trials']), 1)
        faint = self.samples([(9, .89, 1)])
        self.assertEqual(faint['status'], 'REVIEW')
        self.assertIsNone(faint['digit'])
        self.assertEqual(faint['candidateDigit'], 9)
        self.assertNotIn('secondary_faint_or_erased_mark', faint['issues'])
        tied = self.samples([(2, .89, 1), (9, .89, 1)])
        self.assertIsNone(tied['candidateDigit'])

    def test_two_full_marks_never_resolve_to_the_darker_mark(self):
        for first, second in [(.2, .2), (.2, .8), (.75, .84)]:
            row = self.samples([(0, first, 1), (9, second, 1)])
            self.assertEqual(row['status'], 'REVIEW')
            self.assertIsNone(row['digit'])

    def test_original_classification_does_not_highlight_zero_for_faint_nine(self):
        row = classify_row([0.] * 10, [0.] * 9 + [.98], self.config)
        self.assertEqual(row['candidateDigit'], 9)
        self.assertIsNone(row['digit'])

    def test_coordinate_measurement_both_papers_and_sides(self):
        for paper in ('b5', 'a4'):
            for side in ('F', 'B'):
                with self.subTest(paper=paper, side=side):
                    image, c = scene_image({'pageSize': paper, 'side': side, 'worksheetId': 'WS05', 'year': 2026})
                    for name, digit, gray in [('class', 4, 70), ('tens', 0, 190), ('ones', 9, 213)]:
                        ink(image, c, name, digit, gray)
                    rows = measure_omr(image, c, self.config)
                    self.assertEqual([r['digit'] for r in rows.values()], [4, 0, 9])
                    self.assertGreater(len(rows['ones']['thresholdSearch']['trials']), len(rows['class']['thresholdSearch']['trials']))
                    for row in rows.values():
                        fraction = row['thresholdSearch']['selectedInkFraction']
                        for measurement in row['measurements']:
                            self.assertAlmostEqual(measurement['inkThresholdGray'], measurement['backgroundGray'] * fraction, places=2)

    def test_search_configuration_is_bounded_and_requires_stability(self):
        self.assertEqual(ink_thresholds(self.config), [.65, .675, .7, .725, .75, .775, .8, .825, .85, .875])
        bad = [{'maxInkFraction': .91}, {'maxInkFraction': .6}, {'inkFractionStep': .0001},
               {'minStableInkSteps': 1}, {'minStableInkSteps': 11}, {'minStableInkSteps': 2.5},
               {'minStableInkSteps': True}, {'inkFractionStep': 0}, {'maxInkFraction': float('nan')}]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'config.json'
            for override in bad:
                with self.subTest(override=override):
                    path.write_text(json.dumps(override))
                    with self.assertRaises(ValueError):
                        load_config(path)
            path.write_text(json.dumps({'minStableInkSteps': 3}))
            self.assertEqual(load_config(path)['minStableInkSteps'], 3)


if __name__ == '__main__':
    unittest.main()
