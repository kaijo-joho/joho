#!/usr/bin/env python3
"""Decode rendered PDFs and synthetic distorted/rotated/filled scans."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdf_support import generate
from read_scan import read_image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdftoppm", default="pdftoppm")
    parser.add_argument("--samples", type=Path, default=Path("output/pdf/worksheet-scan-header"))
    parser.add_argument("--worksheets", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = []
    paths = [args.samples / "b5.pdf", args.samples / "a4.pdf"]
    if args.worksheets:
        paths += sorted(args.worksheets.glob("dr*-*.pdf"))
    with tempfile.TemporaryDirectory(prefix="ws-scan-qa-") as tmp:
        for pdf in paths:
            sample = pdf.stem in ["b5", "a4"]
            paper = pdf.stem if sample else pdf.stem.split("-")[1]
            reader = PdfReader(pdf)
            assert len(reader.pages) == 2, str(pdf)
            for index, page in enumerate(reader.pages):
                options = {"pageSize": paper, "worksheetId": "WS05" if sample else pdf.stem.split("-")[0], "title": "音のデジタル表現", "year": 2026, "side": "F" if index % 2 == 0 else "B"}
                c = generate(options)["coordinates"]
                assert abs(float(page.mediabox.width) * 25.4 / 72 - c["page"]["widthMm"]) < .3
                assert abs(float(page.mediabox.height) * 25.4 / 72 - c["page"]["heightMm"]) < .3
                prefix = str(Path(tmp) / "render")
                subprocess.run([args.pdftoppm, "-f", str(index + 1), "-l", str(index + 1), "-singlefile", "-r", "200", "-gray", "-png", str(pdf), prefix], check=True, capture_output=True)
                gray = cv2.imread(prefix + ".png", cv2.IMREAD_GRAYSCALE)
                result = read_image(gray, c)
                assert result["candidate"] is None
                assert all(row["status"] == "blank" for row in result["rows"].values())
                assert len(result['rows']) == (3 if index == 0 else 0)
                report.append({"pdf": pdf.name, "page": index + 1, "qr": result["qrPayload"], "omr": "30 blank circles" if index == 0 else "no student fields"})
                if sample and index == 0:
                    height, width = gray.shape
                    def center(mark):
                        return tuple(round(mark["center"]["normalized"][axis] * size) for axis, size in [("x", width), ("y", height)])
                    filled = gray.copy()
                    for row, digit in [("class", 3), ("tens", 2), ("ones", 7)]:
                        mark = c["omr"][row][digit]
                        cv2.circle(filled, center(mark), round(mark["radiusMm"] / c["page"]["widthMm"] * width * .85), 0, -1)
                    original = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
                    target = np.float32([[45, 18], [width - 38, 39], [width - 11, height - 45], [20, height - 14]])
                    distorted = cv2.warpPerspective(filled, cv2.getPerspectiveTransform(original, target), (width, height), borderValue=255)
                    distorted = cv2.GaussianBlur(distorted, (3, 3), .6)
                    for rotation in range(4):
                        scan = np.ascontiguousarray(np.rot90(distorted, rotation))
                        decoded = read_image(scan, c)
                        assert decoded["candidate"] == {"class": 3, "number": 27}, decoded
                    double = filled.copy()
                    cv2.circle(double, center(c["omr"]["class"][4]), round(c["omr"]["class"][4]["radiusMm"] / c["page"]["widthMm"] * width * .85), 0, -1)
                    assert read_image(double, c)["rows"]["class"]["status"] == "ambiguous"
                    report.append({"paper": paper, "synthetic": "3 class / 27 number; perspective + blur + four rotations; multiple-mark rejection"})
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"Verified {len(paths)} PDFs, {len(report)} results")


if __name__ == "__main__":
    main()
