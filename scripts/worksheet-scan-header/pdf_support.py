"""Render the common generator's vector scene; never duplicate its geometry."""
import io
import json
import os
from pathlib import Path
import subprocess

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.units import mm

ROOT = Path(__file__).resolve().parent


def generate(options, config=None):
    command = [os.environ.get("NODE", "node"), str(ROOT / "generate.mjs"), "--options", json.dumps(options, ensure_ascii=False), "--format", "json"]
    if config:
        command += ["--config", str(config)]
    return json.loads(subprocess.check_output(command, text=True))


def register_fonts(font=None, bold_font=None):
    office = Path("/Applications/Microsoft Word.app/Contents/Resources/DFonts")
    regular = Path(font or os.environ.get("WS_HEADER_FONT", office / "YuGothM.ttc"))
    bold = Path(bold_font or os.environ.get("WS_HEADER_BOLD_FONT", office / "YuGothB.ttc"))
    if not regular.is_file() or not bold.is_file():
        raise ValueError("Specify embeddable Japanese TrueType fonts with --font / --bold-font or WS_HEADER_FONT / WS_HEADER_BOLD_FONT")
    pdfmetrics.registerFont(TTFont("WorksheetHeader", str(regular)))
    pdfmetrics.registerFont(TTFont("WorksheetHeaderBold", str(bold)))


def paint(pdf, model):
    """Top-left millimetres to PDF bottom-left points, with vector text/shapes."""
    height = model["coordinates"]["page"]["heightMm"]
    pdf.saveState()
    pdf.setStrokeColorRGB(0, 0, 0)
    pdf.setFillColorRGB(0, 0, 0)
    for shape in model["scene"]:
        kind = shape["type"]
        pdf.setLineWidth(shape.get("lineWidth", 0) * mm)
        if kind == "rect":
            fill = shape.get("fill")
            pdf.setFillColorRGB(*((1, 1, 1) if fill == "#fff" else (0, 0, 0)))
            pdf.rect(shape["x"] * mm, (height - shape["y"] - shape["height"]) * mm, shape["width"] * mm, shape["height"] * mm, stroke=bool(shape.get("stroke")), fill=bool(fill))
        elif kind == "circle":
            pdf.circle(shape["x"] * mm, (height - shape["y"]) * mm, shape["radius"] * mm, stroke=1, fill=0)
        elif kind == "line":
            pdf.line(shape["x1"] * mm, (height - shape["y1"]) * mm, shape["x2"] * mm, (height - shape["y2"]) * mm)
        elif kind == "text":
            pdf.setFillColorRGB(0, 0, 0)
            font = "WorksheetHeaderBold" if shape.get("bold") else "WorksheetHeader"
            size = shape["size"] * mm
            pdf.setFont(font, size)
            x, y = shape["x"] * mm, (height - shape["y"]) * mm
            if shape["anchor"] == "middle":
                pdf.drawCentredString(x, y, shape["text"])
            else:
                pdf.drawString(x, y, shape["text"])
    pdf.restoreState()


def pdf_bytes(model):
    stream = io.BytesIO()
    page = model["coordinates"]["page"]
    pdf = canvas.Canvas(stream, pagesize=(page["widthMm"] * mm, page["heightMm"] * mm), invariant=1)
    pdf.setTitle(model["coordinates"]["title"])
    paint(pdf, model)
    pdf.showPage()
    pdf.save()
    return stream.getvalue()
