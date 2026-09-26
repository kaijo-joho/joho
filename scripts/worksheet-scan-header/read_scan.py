#!/usr/bin/env python3
"""Reference OpenCV reader. Returns ambiguous/blank marks for human review.

This is a connection example, not a calibrated production grading system.
Four markers must be visible and near the image corners (page crops are expected).
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def find_markers(gray):
    height, width = gray.shape
    _, binary = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        x, y, w, h = cv2.boundingRect(contour)
        if area < width * height * .00002 or area > width * height * .002 or not .6 < w / h < 1.6 or area / (w * h) < .7:
            continue
        polygon = cv2.approxPolyDP(contour, .04 * cv2.arcLength(contour, True), True)
        if len(polygon) != 4 or not cv2.isContourConvex(polygon):
            continue
        # Diagonal intersection is projectively stable, unlike the centroid.
        points = polygon[:, 0, :].astype(float)
        p, q, r, s = points
        matrix = np.column_stack((r - p, -(s - q)))
        try:
            t = np.linalg.solve(matrix, q - p)[0]
        except np.linalg.LinAlgError:
            continue
        candidates.append(p + t * (r - p))
    result = []
    for corner in [(0, 0), (width, 0), (width, height), (0, height)]:
        nearby = [p for p in candidates if abs(p[0] - corner[0]) < width * .2 and abs(p[1] - corner[1]) < height * .2]
        if not nearby:
            raise ValueError("Four complete corner markers were not found")
        result.append(min(nearby, key=lambda p: ((p[0] - corner[0]) / width) ** 2 + ((p[1] - corner[1]) / height) ** 2))
    if len({tuple(p) for p in result}) != 4:
        raise ValueError("Ambiguous corner markers")
    return np.float32(result)


def read_image(gray, coordinates):
    source = find_markers(gray)
    width, height = coordinates["raster"]["width"], coordinates["raster"]["height"]
    mm_width, mm_height = coordinates["page"]["widthMm"], coordinates["page"]["heightMm"]
    def px(point):
        return [point["x"] / mm_width * width, point["y"] / mm_height * height]
    target = np.float32([px(coordinates["markers"][key]["center"]["mm"]) for key in ["topLeft", "topRight", "bottomRight", "bottomLeft"]])
    qr = coordinates["qr"]["region"]["mm"]
    x1, y1 = map(round, px(qr))
    x2, y2 = map(round, px({"x": qr["x"] + qr["width"], "y": qr["y"] + qr["height"]}))
    for turns in range(4):
        matrix = cv2.getPerspectiveTransform(np.roll(source, turns, axis=0), target)
        normalized = cv2.warpPerspective(gray, matrix, (width, height), borderValue=255)
        payload, points, _ = cv2.QRCodeDetector().detectAndDecode(normalized[y1:y2, x1:x2])
        if payload == coordinates["identity"]["payload"]:
            break
    else:
        raise ValueError("QR did not match the expected worksheet/year/side; do not identify the student")
    rows = {}
    for name, marks in coordinates["omr"].items():
        ratios = []
        for mark in marks:
            x, y = px(mark["center"]["mm"])
            rx = mark["sampleRadiusMm"] / mm_width * width
            ry = mark["sampleRadiusMm"] / mm_height * height
            xx1, yy1 = int(x - rx - 1), int(y - ry - 1)
            patch = normalized[yy1:int(y + ry + 2), xx1:int(x + rx + 2)]
            yy, xx = np.indices(patch.shape)
            mask = ((xx + xx1 - x) / rx) ** 2 + ((yy + yy1 - y) / ry) ** 2 <= 1
            ratios.append(float(np.mean(patch[mask] < 150)))
        ranked = sorted(range(10), key=lambda i: ratios[i], reverse=True)
        best, second = ranked[:2]
        status = "ok" if ratios[best] >= .55 and ratios[second] < .2 else ("blank" if ratios[best] < .15 else "ambiguous")
        rows[name] = {"status": status, "digit": best if status == "ok" else None, "blackRatios": [round(r, 4) for r in ratios]}
    valid = all(row["status"] == "ok" for row in rows.values())
    return {"qrPayload": payload, "orientationQuarterTurns": turns, "rows": rows, "candidate": {"class": rows["class"]["digit"], "number": rows["tens"]["digit"] * 10 + rows["ones"]["digit"]} if valid else None, "requiresRosterMatch": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("coordinates", type=Path)
    args = parser.parse_args()
    gray = cv2.imread(str(args.image), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        parser.error("Cannot read the scan image")
    print(json.dumps(read_image(gray, json.loads(args.coordinates.read_text())), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
