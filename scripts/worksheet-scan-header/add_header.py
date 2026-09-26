#!/usr/bin/env python3
"""Overlay scan headers on blank reserved areas, writing a NEW PDF only."""
import argparse
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.units import mm
from pdf_support import generate, register_fonts, pdf_bytes


def detect_paper(page):
    if page.rotation % 360 or float(page.get("/UserUnit", 1)) != 1:
        raise ValueError("Rotated/UserUnit pages must first be exported as upright portrait pages")
    if list(page.cropbox) != list(page.mediabox) or float(page.mediabox.left) != 0 or float(page.mediabox.bottom) != 0:
        raise ValueError("Nonstandard CropBox/MediaBox origin; export an upright full-page PDF first")
    width, height = float(page.mediabox.width) / mm, float(page.mediabox.height) / mm
    for name, w, h in [("b5", 182, 257), ("a4", 210, 297)]:
        if abs(width - w) <= 0.5 and abs(height - h) <= 0.5:
            return name
    raise ValueError(f"Unsupported page {width:.2f} x {height:.2f} mm (JIS B5/A4 portrait only)")


def check_clearance(source, page_number, coordinates, renderer):
    """Raster preflight includes text, vectors and scans; no white-out on top."""
    with tempfile.TemporaryDirectory(prefix="ws-header-check-") as tmp:
        prefix = str(Path(tmp) / "page")
        subprocess.run([renderer, "-f", str(page_number), "-l", str(page_number), "-singlefile", "-r", "150", "-gray", "-png", str(source), prefix], check=True, capture_output=True)
        image = Image.open(prefix + ".png").convert("L")
        width, height = coordinates["page"]["widthMm"], coordinates["page"]["heightMm"]
        regions = {"header": coordinates["header"]["mm"], **{name: value["exclusion"]["mm"] for name, value in coordinates["markers"].items()}}
        for name, r in regions.items():
            # Round outward so a line on the boundary is not lost.
            import math
            bounds = (math.floor(r["x"] / width * image.width), math.floor(r["y"] / height * image.height), math.ceil((r["x"] + r["width"]) / width * image.width), math.ceil((r["y"] + r["height"]) / height * image.height))
            crop = image.crop(bounds)
            if sum(crop.histogram()[:225]) > 2:
                raise ValueError(f"Page {page_number}: ink in reserved {name} area. Reflow the source document; this tool does not erase or shrink its body.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--title", required=True)
    parser.add_argument("--worksheet-id", required=True)
    parser.add_argument("--subject", default="INFO1")
    parser.add_argument("--year", type=int, help="Academic year; defaults to current JST academic year")
    parser.add_argument("--front-payload", "--qr-payload", dest="front_payload")
    parser.add_argument("--back-payload")
    parser.add_argument("--first-side", choices=["F", "B"], default="F")
    parser.add_argument("--config")
    parser.add_argument("--font")
    parser.add_argument("--bold-font")
    parser.add_argument("--pdftoppm", default=shutil.which("pdftoppm"))
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve() or args.output.exists():
        parser.error("Output must be a new file, separate from the original")
    sidecar = args.output.with_suffix(".coordinates.json")
    if sidecar.exists():
        parser.error("Coordinate sidecar already exists; choose a new output name")
    if not args.pdftoppm:
        parser.error("pdftoppm is required to verify reserved areas; pass --pdftoppm PATH")
    register_fonts(args.font, args.bold_font)
    reader = PdfReader(args.input)
    if reader.is_encrypted:
        parser.error("Encrypted PDFs are not supported")
    if reader.get_fields() or reader.trailer["/Root"].get("/Perms"):
        parser.error("Interactive/signed PDFs require a separate export before overlay")
    if len(reader.pages) not in [1, 2]:
        parser.error("Use a one- or two-page worksheet; split batches to keep F/B identifiers unique")
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    coordinates = []
    for i, page in enumerate(writer.pages):
        paper = detect_paper(page)
        side = args.first_side if i % 2 == 0 else ("B" if args.first_side == "F" else "F")
        options = {"pageSize": paper, "title": args.title, "worksheetId": args.worksheet_id, "subject": args.subject, "side": side}
        if args.year is not None:
            options["year"] = args.year
        payload = args.front_payload if side == "F" else args.back_payload
        if not payload and side == "B" and args.front_payload:
            payload = args.front_payload.rsplit("|", 1)[0] + "|B"
        if payload:
            options["qrPayload"] = payload
        model = generate(options, args.config)
        check_clearance(args.input, i + 1, model["coordinates"], args.pdftoppm)
        page.merge_page(PdfReader(io.BytesIO(pdf_bytes(model))).pages[0])
        coordinates.append(model["coordinates"])
    # No output is created until all pages pass validation. Source is read-only.
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("xb") as stream:
        writer.write(stream)
    with sidecar.open("x") as stream:
        stream.write(json.dumps(coordinates, ensure_ascii=False, indent=2) + "\n")
    print(args.output)


if __name__ == "__main__":
    main()
