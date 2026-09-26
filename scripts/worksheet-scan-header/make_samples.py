#!/usr/bin/env python3
"""Produce front/back SVGs and coordinates, and three two-page print PDFs."""
import argparse
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from pdf_support import generate, register_fonts, paint
import json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--templates", type=Path, default=Path("templates/worksheets/scan-header"))
    parser.add_argument("--pdf-dir", type=Path, default=Path("output/pdf/worksheet-scan-header"))
    parser.add_argument("--font")
    parser.add_argument("--bold-font")
    parser.add_argument("--config")
    args = parser.parse_args()
    register_fonts(args.font, args.bold_font)
    args.templates.mkdir(parents=True, exist_ok=True)
    args.pdf_dir.mkdir(parents=True, exist_ok=True)
    models = {}
    for paper in ["b5", "a4"]:
        pdf = None
        for side in ['F', 'B']:
            model = generate({"pageSize": paper, "title": "音のデジタル表現", "subject": "INFO1", "year": 2026, "worksheetId": "WS05", "side": side}, args.config)
            models[(paper, side)] = model
            stem = paper if side == 'F' else paper + '-back'
            (args.templates / f"{stem}.svg").write_text(model["svg"] + "\n")
            (args.templates / f"{stem}.json").write_text(json.dumps(model["coordinates"], ensure_ascii=False, indent=2) + "\n")
            if pdf is None:
                c = model['coordinates']['page']
                pdf = canvas.Canvas(str(args.pdf_dir / f'{paper}.pdf'), pagesize=(c['widthMm'] * mm, c['heightMm'] * mm), invariant=1)
                pdf.setTitle('音のデジタル表現 - 表裏サンプル')
            paint(pdf, model)
            pdf.showPage()
        pdf.save()
    pdf = canvas.Canvas(str(args.pdf_dir / "comparison.pdf"), pagesize=(420 * mm, 297 * mm), invariant=1)
    pdf.setTitle("B5 / A4 header comparison (90% preview)")
    for side in ['F', 'B']:
        for paper, x in zip(['b5', 'a4'], [12, 190]):
            model = models[(paper, side)]
            c = model["coordinates"]
            pdf.setFont("WorksheetHeaderBold", 11)
            face = '表面' if side == 'F' else '裏面'
            pdf.drawString(x * mm, 282 * mm, f'{c["pageSize"].upper()} {face} / scale {c["scale"]} / 比較表示90%')
            pdf.saveState()
            pdf.translate(x * mm, (276 - c["page"]["heightMm"] * 0.9) * mm)
            pdf.scale(0.9, 0.9)
            pdf.setStrokeGray(0.7)
            pdf.setLineWidth(0.3)
            pdf.rect(0, 0, c["page"]["widthMm"] * mm, c["page"]["heightMm"] * mm)
            paint(pdf, model)
            pdf.restoreState()
        pdf.showPage()
    pdf.save()
    print(args.pdf_dir)


if __name__ == "__main__":
    main()
