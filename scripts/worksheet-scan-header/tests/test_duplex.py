import copy
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdf_support import generate, register_fonts, pdf_bytes
from read_duplex import pair_pages, read_pdf


def front_result(payload='INFO1|2026|WS05|F'):
    return {'qrPayload': payload, 'candidate': {'class': 3, 'number': 27},
            'rows': {row: {'status': 'ok'} for row in ['class', 'tens', 'ones']}}


class DuplexTests(unittest.TestCase):
    def setUp(self):
        self.front = front_result()
        self.back = {'qrPayload': 'INFO1|2026|WS05|B', 'candidate': None, 'rows': {}}

    def test_matching_pair_inherits_from_front_only(self):
        result = pair_pages([self.front, self.back])
        self.assertEqual(result['status'], 'ok')
        self.assertTrue(result['pairValid'])
        self.assertEqual(result['studentAssignments'][1], {'page': 2, 'side': 'B', 'candidate': {'class': 3, 'number': 27}, 'source': 'paired-front', 'sourcePage': 1})
        self.assertTrue(result['requiresRosterMatch'])

    def test_reversed_pair_is_reported_and_uses_actual_front(self):
        result = pair_pages([self.back, self.front])
        self.assertTrue(result['reversedPages'])
        self.assertEqual(result['warnings'], ['reversed_pages'])
        self.assertEqual(result['studentAssignments'][0]['sourcePage'], 2)

    def test_missing_or_duplicate_sides_never_inherit(self):
        for pages, issue in [([self.front], 'missing_back'), ([self.back], 'missing_front'), ([self.front, self.front], 'duplicate_front'), ([self.back, self.back], 'duplicate_back')]:
            with self.subTest(issue=issue):
                result = pair_pages(pages)
                self.assertIn(issue, result['issues'])
                self.assertFalse(result['pairValid'])
                self.assertEqual(result['studentAssignments'], [])

    def test_different_id_year_or_subject_never_inherits(self):
        for payload in ['INFO1|2026|WS32|B', 'INFO1|2025|WS05|B', 'INFO2|2026|WS05|B']:
            result = pair_pages([self.front, {**self.back, 'qrPayload': payload}])
            self.assertIn('worksheet_mismatch', result['issues'])
            self.assertEqual(result['studentAssignments'], [])

    def test_invalid_qr_or_uncertain_front_never_inherits(self):
        for broken in [{}, {'qrPayload': 'INFO1|2026|WS05|X'}]:
            result = pair_pages([self.front, broken])
            self.assertIn('unreadable_qr', result['issues'])
            self.assertEqual(result['studentAssignments'], [])
        uncertain = copy.deepcopy(self.front)
        uncertain['rows']['class']['status'] = 'ambiguous'
        result = pair_pages([uncertain, self.back])
        self.assertIn('unreadable_student', result['issues'])
        self.assertEqual(result['studentAssignments'], [])

    def test_multiple_student_batch_is_rejected(self):
        result = pair_pages([self.front, self.back, self.front, self.back])
        self.assertIn('unexpected_page_count', result['issues'])
        self.assertEqual(result['studentAssignments'], [])

    def test_real_pdf_qr_discovery_both_papers_and_reversed_order(self):
        register_fonts()
        renderer = os.environ.get('PDFTOPPM', 'pdftoppm')
        with tempfile.TemporaryDirectory() as tmp:
            for paper in ['b5', 'a4']:
                for order in [('F', 'B'), ('B', 'F')]:
                    writer = PdfWriter()
                    for side in order:
                        model = generate({'pageSize': paper, 'worksheetId': 'WS32', 'year': 2026, 'side': side})
                        c = model['coordinates']
                        page = writer.add_page(PdfReader(io.BytesIO(pdf_bytes(model))).pages[0])
                        if side == 'F':
                            ink = io.BytesIO()
                            pdf = canvas.Canvas(ink, pagesize=(c['page']['widthMm'] * mm, c['page']['heightMm'] * mm))
                            for row, digit in [('class', 3), ('tens', 2), ('ones', 7)]:
                                mark = c['omr'][row][digit]
                                point = mark['center']['mm']
                                pdf.circle(point['x'] * mm, (c['page']['heightMm'] - point['y']) * mm, mark['radiusMm'] * .85 * mm, stroke=0, fill=1)
                            pdf.showPage()
                            pdf.save()
                            page.merge_page(PdfReader(io.BytesIO(ink.getvalue())).pages[0])
                    path = Path(tmp) / (paper + ''.join(order) + '.pdf')
                    writer.write(path)
                    result = read_pdf(path, renderer)
                    self.assertEqual(result['status'], 'ok', result)
                    self.assertEqual(result['reversedPages'], order[0] == 'B')
                    self.assertEqual([p['identity']['worksheetId'] for p in result['pages']], ['WS32', 'WS32'])
                    self.assertEqual([a['candidate'] for a in result['studentAssignments']], [{'class': 3, 'number': 27}] * 2)


if __name__ == '__main__':
    unittest.main()
