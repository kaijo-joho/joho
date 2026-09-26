import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
RENDERER = os.environ.get('PDFTOPPM', 'pdftoppm')


class OverlayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.source, self.output = self.folder / 'source.pdf', self.folder / 'result.pdf'

    def tearDown(self):
        self.temp.cleanup()

    def source_pdf(self, occupied=False, unsupported=False):
        pdf = canvas.Canvas(str(self.source))
        for width, height in ([(176, 250)] if unsupported else [(182, 257), (210, 297)]):
            pdf.setPageSize((width * mm, height * mm))
            pdf.setFont('Helvetica', 12)
            pdf.drawString(25 * mm, (height - 60) * mm, 'Original body: keep exactly here.')
            if occupied:
                # A raster black block ensures collision detection covers scans.
                image = Image.new('RGB', (30, 30), 'black')
                from reportlab.lib.utils import ImageReader
                pdf.drawImage(ImageReader(image), 30 * mm, (height - 20) * mm, 4 * mm, 4 * mm)
            pdf.showPage()
        pdf.save()

    def run_overlay(self, output=None):
        return subprocess.run([sys.executable, str(ROOT / 'add_header.py'), str(self.source), str(output or self.output), '--title', '音のデジタル表現', '--worksheet-id', 'WS05', '--year', '2026', '--pdftoppm', RENDERER], capture_output=True, text=True)

    def test_mixed_sizes_sides_and_unchanged_body(self):
        self.source_pdf()
        before = hashlib.sha256(self.source.read_bytes()).hexdigest()
        result = self.run_overlay()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), before)
        c = json.loads(self.output.with_suffix('.coordinates.json').read_text())
        self.assertEqual([p['pageSize'] for p in c], ['b5', 'a4'])
        self.assertEqual([p['identity']['payload'] for p in c], ['INFO1|2026|WS05|F', 'INFO1|2026|WS05|B'])
        for page in PdfReader(self.output).pages:
            self.assertIn('Original body: keep exactly here.', page.extract_text())
        for path in [self.source, self.output]:
            subprocess.run([RENDERER, '-f', '1', '-singlefile', '-r', '150', '-png', str(path), str(path.with_suffix(''))], check=True, capture_output=True)
        original, modified = [Image.open(p.with_suffix('.png')).convert('RGB') for p in [self.source, self.output]]
        # Compare body, excluding the header and peripheral calibration markers.
        crop = (150, 300, original.width - 150, original.height - 150)
        self.assertIsNone(ImageChops.difference(original.crop(crop), modified.crop(crop)).getbbox())

    def test_occupied_area_refuses_without_writing(self):
        self.source_pdf(occupied=True)
        self.assertNotEqual(self.run_overlay().returncode, 0)
        self.assertFalse(self.output.exists())

    def test_original_and_existing_outputs_cannot_be_overwritten(self):
        self.source_pdf()
        before = self.source.read_bytes()
        self.assertNotEqual(self.run_overlay(self.source).returncode, 0)
        self.assertEqual(self.source.read_bytes(), before)
        self.output.write_bytes(b'keep')
        self.assertNotEqual(self.run_overlay().returncode, 0)
        self.assertEqual(self.output.read_bytes(), b'keep')

    def test_iso_b5_is_not_mistaken_for_jis_b5(self):
        self.source_pdf(unsupported=True)
        self.assertNotEqual(self.run_overlay().returncode, 0)
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
