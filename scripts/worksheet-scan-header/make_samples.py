#!/usr/bin/env python3
"""Produce two editable SVGs, coordinate JSONs and three print PDFs."""
import argparse
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from pdf_support import generate, register_fonts, pdf_bytes, paint
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
    models = []
    for paper in ["b5", "a4"]:
        model = generate({"pageSize": paper, "title": "音のデジタル表現", "subject": "INFO1", "year": 2026, "worksheetId": "WS05", "side": "F"}, args.config)
        models.append(model)
        (args.templates / f"{paper}.svg").write_text(model["svg"] + "\n")
        (args.templates / f"{paper}.json").write_text(json.dumps(model["coordinates"], ensure_ascii=False, indent=2) + "\n")
        (args.pdf_dir / f"{paper}.pdf").write_bytes(pdf_bytes(model))
    pdf = canvas.Canvas(str(args.pdf_dir / "comparison.pdf"), pagesize=(420 * mm, 297 * mm), invariant=1)
    pdf.setTitle("B5 / A4 header comparison (90% preview)")
    for model, x in zip(models, [12, 190]):
        c = model["coordinates"]
        pdf.setFont("WorksheetHeaderBold", 11)
        pdf.drawString(x * mm, 282 * mm, f'{c["pageSize"].upper()} / scale {c["scale"]} / 比較表示90%')
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
