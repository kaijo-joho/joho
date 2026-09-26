#!/usr/bin/env python3
"""Compatibility image API. Prefer scan_poc.py for the local reading CLI."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np


from scan_core import MARKER_KEYS, analyze_image, detect_markers, load_config, parse_payload, validate_coordinates


def find_markers(gray):
    markers = detect_markers(gray, load_config())
    if markers['status'] != 'OK':
        raise ValueError(', '.join(markers['issues']))
    return np.float32([markers['selected'][key]['centerPx'] for key in MARKER_KEYS])


def legacy_page(result):
    if result.get('normalization', {}).get('status') != 'OK' or not result.get('identity'):
        raise ValueError('Untrusted marker/QR normalization; do not identify the student')
    rows = {name: {**row, 'status': 'ok' if row['status'] == 'OK' else 'blank' if 'blank' in row['issues'] else 'ambiguous'}
            for name, row in result['rows'].items()}
    return {**result, 'rows': rows}


def read_image(gray, coordinates, strict_identity=True):
    result, _ = analyze_image(gray, [validate_coordinates(coordinates)])
    if strict_identity and result.get('qrPayload') != coordinates['identity']['payload']:
        raise ValueError('QR did not match the expected worksheet/year/side')
    return legacy_page(result)


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
