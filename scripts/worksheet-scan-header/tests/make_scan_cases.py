#!/usr/bin/env python3
"""Create labeled, synthetic-only scans from the existing sample PDFs/scene."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scan_core import DEFAULT_COORDINATES, ROOT, load_catalog, px
from scan_poc import load_pages
from scan_core import load_config


def ink(gray, c, name, digit, value=0):
    mark = c['omr'][name][digit]
    center = tuple(np.rint(px(c, mark['center']['mm'])).astype(int))
    radius = round(mark['radiusMm'] / c['page']['widthMm'] * gray.shape[1] * .85)
    cv2.circle(gray, center, radius, value, -1, cv2.LINE_AA)


def filled(gray, c, digits=(3, 2, 7)):
    result = gray.copy()
    for name, digit in zip(('class', 'tens', 'ones'), digits):
        ink(result, c, name, digit)
    return result


def clear_region(gray, c, rect):
    lo = np.floor(px(c, rect)).astype(int)
    hi = np.ceil(px(c, {'x': rect['x'] + rect['width'], 'y': rect['y'] + rect['height']})).astype(int)
    gray[max(0, lo[1] - 2):hi[1] + 2, max(0, lo[0] - 2):hi[0] + 2] = 255


def scene_image(options):
    # This tests real generator QR paths; it deliberately omits human text.
    command = ['node', str(ROOT / 'generate.mjs'), '--options', json.dumps(options), '--format', 'json']
    model = json.loads(subprocess.check_output(command))
    c = model['coordinates']
    image = np.full((c['raster']['height'], c['raster']['width']), 255, np.uint8)
    for shape in model['scene']:
        if shape['type'] == 'rect' and shape.get('fill'):
            lo = np.rint(px(c, shape)).astype(int)
            hi = np.rint(px(c, {'x': shape['x'] + shape['width'], 'y': shape['y'] + shape['height']})).astype(int)
            image[lo[1]:hi[1], lo[0]:hi[0]] = 255 if shape['fill'] == '#fff' else 0
        elif shape['type'] == 'circle':
            cv2.circle(image, tuple(np.rint(px(c, shape)).astype(int)), round(shape['radius'] / c['page']['widthMm'] * image.shape[1]),
                       0, max(1, round(shape['lineWidth'] / c['page']['widthMm'] * image.shape[1])), cv2.LINE_AA)
    return image, c


def make_cases(directory, renderer):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    cases = []
    catalog = load_catalog()
    arrays = {}
    def save(name, image, status, student=None, paper=None, reverse=None):
        path = directory / name
        if name.endswith('.pdf'):
            images = [Image.fromarray(a) for a in image]
            images[0].save(path, 'PDF', save_all=True, append_images=images[1:], resolution=300, quality=95)
        else:
            cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, 65] if path.suffix == '.jpg' else [])
        expected = {'status': status, 'studentIdentifier': student}
        if paper:
            expected['pageSize'] = paper
        if reverse is not None:
            expected['reversedPages'] = reverse
        cases.append({'input': name, 'expected': expected})
    for paper in ('b5', 'a4'):
        c, back_c = [c for c in catalog if c['pageSize'] == paper]
        pages = load_pages(ROOT.parents[1] / f'output/pdf/worksheet-scan-header/{paper}.pdf', load_config(), renderer)
        blank, back = [a for a, _ in pages]
        front = filled(blank, c)
        arrays[paper] = (front, back)
        save(paper + '-filled.png', front, 'OK', '327', paper)
        save(paper + '-jpeg.jpg', front, 'OK', '327', paper)
        save(paper + '-blank.png', blank, 'REVIEW', paper=paper)
        save(paper + '-back.png', back, 'REVIEW', paper=paper)
        save(paper + '-leading-zero.png', filled(blank, c, (3, 0, 7)), 'OK', '307', paper)
        double = front.copy()
        ink(double, c, 'class', 4)
        save(paper + '-double.png', double, 'REVIEW', paper=paper)
        faint = front.copy()
        ink(faint, c, 'tens', 2, 200)
        save(paper + '-faint.png', faint, 'REVIEW', paper=paper)
        erased = front.copy()
        ink(erased, c, 'ones', 6, 205)
        save(paper + '-erased.png', erased, 'REVIEW', paper=paper)
        missing = front.copy()
        clear_region(missing, c, c['markers']['bottomLeft']['exclusion']['mm'])
        save(paper + '-missing-marker.png', missing, 'REVIEW')
        extra = front.copy()
        rect = {'x': 12 * c['scale'], 'y': 5 * c['scale'], 'width': 3.5 * c['scale'], 'height': 3.5 * c['scale']}
        lo, hi = np.rint(px(c, rect)).astype(int), np.rint(px(c, {'x': rect['x'] + rect['width'], 'y': rect['y'] + rect['height']})).astype(int)
        extra[lo[1]:hi[1], lo[0]:hi[0]] = 0
        save(paper + '-extra-marker.png', extra, 'REVIEW')
        noqr = front.copy()
        clear_region(noqr, c, c['qr']['region']['mm'])
        save(paper + '-no-qr.png', noqr, 'REVIEW')
        for turns in (1, 2, 3):
            save(f'{paper}-rotate-{turns * 90}.png', np.ascontiguousarray(np.rot90(front, turns)), 'OK', '327', paper)
        h, w = front.shape
        source = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
        target = np.float32([[70, 30], [w - 45, 55], [w - 25, h - 60], [25, h - 20]])
        distorted = cv2.warpPerspective(front, cv2.getPerspectiveTransform(source, target), (w, h), borderValue=255)
        distorted = cv2.GaussianBlur(distorted, (3, 3), .65)
        shadow = np.linspace(.75, 1, w)[None, :]
        distorted = np.clip(distorted * shadow, 0, 255).astype(np.uint8)
        save(paper + '-perspective-shadow.png', distorted, 'OK', '327', paper)
        save(paper + '-low-resolution.png', cv2.resize(front, (round(w * .2), round(h * .2)), interpolation=cv2.INTER_AREA), 'REVIEW')
        save(paper + '-duplex.pdf', [front, back], 'OK', '327', paper, False)
        save(paper + '-reversed.pdf', [back, front], 'OK', '327', paper, True)
        save(paper + '-missing-back.pdf', [front], 'REVIEW', paper=paper)
        save(paper + '-duplicate-front.pdf', [front, front], 'REVIEW', paper=paper)
        save(paper + '-uncertain-duplex.pdf', [double, back], 'REVIEW', paper=paper)
    save('mixed-paper.pdf', [arrays['b5'][0], arrays['a4'][1]], 'REVIEW', paper='b5')
    for length in (1, 7, 14, 20):
        image, c = scene_image({'pageSize': 'b5', 'subject': 'a' * length, 'worksheetId': 'b' * length, 'year': 2026, 'side': 'F'})
        save(f"qr-version-{c['qr']['version']}.png", filled(image, c), 'OK', '327', 'b5')
    other_back, _ = scene_image({'pageSize': 'b5', 'worksheetId': 'WS32', 'year': 2026, 'side': 'B'})
    save('mixed-worksheet.pdf', [arrays['b5'][0], other_back], 'REVIEW', paper='b5')
    (directory / 'corrupt.png').write_bytes(b'not an image')
    cases.append({'input': 'corrupt.png', 'expected': {'status': 'ERROR', 'studentIdentifier': None}})
    (directory / 'corrupt.pdf').write_bytes(b'%PDF-broken')
    cases.append({'input': 'corrupt.pdf', 'expected': {'status': 'ERROR', 'studentIdentifier': None}})
    manifest = {'schemaVersion': 'worksheet-scan-cases/1', 'source': 'synthetic dummy marks; no real student data', 'cases': cases}
    (directory / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--pdftoppm', default='pdftoppm')
    args = parser.parse_args()
    result = make_cases(args.output, args.pdftoppm)
    print(f"Created {len(result['cases'])} synthetic test cases: {args.output / 'manifest.json'}")


if __name__ == '__main__':
    main()
