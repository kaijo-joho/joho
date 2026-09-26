"""Conservative, local-only vision core. Geometry comes exclusively from JSON."""
import hashlib
import json
from pathlib import Path
import re

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
DEFAULT_COORDINATES = ROOT.parents[1] / 'templates/worksheets/scan-header'
MARKER_KEYS = ('topLeft', 'topRight', 'bottomRight', 'bottomLeft')
ROWS = ('class', 'tens', 'ones')


def load_config(path=None):
    config = json.loads((ROOT / 'reader-config.json').read_text())
    if path:
        overrides = json.loads(Path(path).read_text())
        if not isinstance(overrides, dict):
            raise ValueError('Reader configuration must be a JSON object')
        if set(overrides) - set(config):
            raise ValueError('Unknown reader configuration keys')
        config.update(overrides)
    if config['schemaVersion'] != 'worksheet-scan-reader-config/1':
        raise ValueError('Unsupported reader configuration version')
    for key, value in config.items():
        if key != 'schemaVersion' and (type(value) not in (int, float) or not np.isfinite(value) or value <= 0):
            raise ValueError('Invalid positive numeric setting: ' + key)
    if not 100 <= config['pdfDpi'] <= 600 or not 0 < config['markerCornerFraction'] < .4 or not .00001 <= config['minMarkerAreaFraction'] < .002:
        raise ValueError('Unsupported DPI or marker search area')
    for key in ('minMarkerFill', 'maxMarkerSizeError', 'strongInkFraction', 'weakInkFraction', 'minFillRatio', 'maxOtherRatio', 'minWinnerMargin', 'blankMaxRatio', 'maxOtherWeakRatio'):
        if not 0 < config[key] < 1:
            raise ValueError('Expected a fraction: ' + key)
    if not config['blankMaxRatio'] < config['maxOtherRatio'] < config['minFillRatio']:
        raise ValueError('Expected blank < secondary mark < filled mark thresholds')
    if config['strongInkFraction'] >= config['weakInkFraction']:
        raise ValueError('Strong ink threshold must be below weak ink threshold')
    return config


def parse_payload(payload):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,20}\|[0-9]{4}\|[A-Za-z0-9_-]{1,20}\|[FB]', payload):
        raise ValueError('Invalid worksheet QR payload')
    subject, year, worksheet_id, side = payload.split('|')
    return {'subject': subject, 'year': int(year), 'worksheetId': worksheet_id, 'side': side, 'payload': payload}


def validate_coordinates(c):
    """Reject incompatible/stale schemas instead of silently sampling body text."""
    if not isinstance(c, dict) or c.get('schemaVersion') != 'worksheet-scan-header/2' or c.get('origin') != 'top-left' or c.get('units') != 'mm':
        raise ValueError('Expected worksheet-scan-header/2 top-left mm coordinates')
    paper = c['pageSize']
    sizes = {'b5': (182, 257), 'a4': (210, 297)}
    if paper not in sizes or tuple(c['page'][k] for k in ('widthMm', 'heightMm')) != sizes[paper]:
        raise ValueError('Unsupported paper geometry')
    if not .5 <= c['scale'] <= 2 or not 100 <= c['dpi'] <= 600:
        raise ValueError('Invalid scale/DPI')
    w, h = sizes[paper]
    if any(abs(c['raster'][k] - mm / 25.4 * c['dpi']) > 1 for k, mm in [('width', w), ('height', h)]):
        raise ValueError('Raster size and DPI disagree')
    def point(p):
        if not all(np.isfinite(p[k]) and 0 < p[k] < limit for k, limit in [('x', w), ('y', h)]):
            raise ValueError('Coordinate outside paper')
    def rect(r):
        point(r)
        if r['width'] <= 0 or r['height'] <= 0:
            raise ValueError('Invalid rectangle')
        point({'x': r['x'] + r['width'], 'y': r['y'] + r['height']})
    for key in MARKER_KEYS:
        rect(c['markers'][key]['mm'])
        point(c['markers'][key]['center']['mm'])
    rect(c['qr']['region']['mm'])
    if c['qr']['quietZoneModules'] != 4:
        raise ValueError('Expected four-module QR quiet zone')
    side = c['identity']['side']
    if side not in ('F', 'B') or (side == 'B' and c['omr']):
        raise ValueError('Back coordinates must not contain OMR')
    if side == 'F':
        if set(c['omr']) != set(ROWS):
            raise ValueError('Missing OMR rows')
        for marks in c['omr'].values():
            if len(marks) != 10 or [m['digit'] for m in marks] != list(range(10)):
                raise ValueError('Expected digits 0 through 9 in each row')
            for m in marks:
                point(m['center']['mm'])
                if not 0 < m['sampleRadiusMm'] < m['radiusMm']:
                    raise ValueError('Sampling disk must be inside the printed ring')
                p, r = m['center']['mm'], m['radiusMm'] * 1.5
                rect({'x': p['x'] - r, 'y': p['y'] - r, 'width': r * 2, 'height': r * 2})
    return c


def load_catalog(directory=DEFAULT_COORDINATES):
    catalog = []
    for name in ('b5', 'b5-back', 'a4', 'a4-back'):
        path = Path(directory) / (name + '.json')
        raw = path.read_bytes()
        c = validate_coordinates(json.loads(raw))
        expected = (name.split('-')[0], 'B' if name.endswith('-back') else 'F')
        if (c['pageSize'], c['identity']['side']) != expected:
            raise ValueError('Coordinate filename and paper/side disagree: ' + str(path))
        c['_source'] = {'file': str(path.resolve()), 'sha256': hashlib.sha256(raw).hexdigest()}
        catalog.append(c)
    for paper in ('b5', 'a4'):
        f, b = [c for c in catalog if c['pageSize'] == paper]
        if any(f[k] != b[k] for k in ('page', 'raster', 'dpi', 'scale', 'markers')):
            raise ValueError('Front/back page normalization must agree')
    return catalog


def px(c, point):
    return np.array([point['x'] / c['page']['widthMm'] * c['raster']['width'],
                     point['y'] / c['page']['heightMm'] * c['raster']['height']], dtype=float)


def rect_points(r):
    return np.float32([[r['x'], r['y']], [r['x'] + r['width'], r['y']],
                       [r['x'] + r['width'], r['y'] + r['height']], [r['x'], r['y'] + r['height']]])


def transform(points, matrix):
    return cv2.perspectiveTransform(np.float32(points).reshape(1, -1, 2), matrix)[0]


def detect_markers(gray, config):
    h, w = gray.shape
    ratio = min(1., 2200 / max(h, w))
    small = cv2.resize(gray, (round(w * ratio), round(h * ratio)), interpolation=cv2.INTER_AREA) if ratio < 1 else gray
    threshold, _ = cv2.threshold(small, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    binary = np.uint8(small < min(180, max(60, threshold + 1))) * 255
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        x, y, bw, bh = cv2.boundingRect(contour)
        # The real square is about 0.00025 of page area; tiny solid glyphs
        # can otherwise look square after JPEG compression / rasterization.
        if not small.size * config['minMarkerAreaFraction'] < area < small.size * .002 or not .55 < bw / bh < 1.8:
            continue
        if x <= 1 or y <= 1 or x + bw >= small.shape[1] - 1 or y + bh >= small.shape[0] - 1:
            continue  # A clipped square is not a complete marker.
        poly = cv2.approxPolyDP(contour, .035 * cv2.arcLength(contour, True), True)
        if len(poly) != 4 or not cv2.isContourConvex(poly):
            continue
        mask = np.zeros((bh, bw), np.uint8)
        cv2.fillConvexPoly(mask, poly[:, 0] - [x, y], 255)
        fill = float(np.mean(binary[y:y + bh, x:x + bw][mask > 0] > 0))
        if fill < config['minMarkerFill']:
            continue  # QR finder patterns contain white holes.
        points = poly[:, 0, :].astype(float) / ratio
        p, q, r, s = points
        try:
            t = np.linalg.solve(np.column_stack((r - p, -(s - q))), q - p)[0]
        except np.linalg.LinAlgError:
            continue
        center = p + t * (r - p)
        candidates.append({'centerPx': center.tolist(), 'polygonPx': points.tolist(), 'fillRatio': round(fill, 4)})
    selected, counts = [], []
    for corner in ((0, 0), (w, 0), (w, h), (0, h)):
        nearby = [c for c in candidates if abs(c['centerPx'][0] - corner[0]) < w * config['markerCornerFraction'] and abs(c['centerPx'][1] - corner[1]) < h * config['markerCornerFraction']]
        counts.append(len(nearby))
        selected.append(nearby[0] if len(nearby) == 1 else None)
    issues = []
    if 0 in counts:
        issues.append('missing_corner_marker')
    if any(n > 1 for n in counts):
        issues.append('ambiguous_corner_markers')
    complete = not issues
    if complete:
        centers = np.float32([c['centerPx'] for c in selected])
        if not cv2.isContourConvex(centers) or cv2.contourArea(centers) / gray.size < .45:
            issues.append('invalid_marker_geometry')
    return {'status': 'REVIEW' if issues else 'OK', 'confidence': 0. if issues else round(min(c['fillRatio'] for c in selected), 4),
            'issues': issues, 'candidateCounts': counts, 'candidates': candidates,
            'selected': {k: c for k, c in zip(MARKER_KEYS, selected) if c}}


def classify_row(ratios, weak_ratios, config):
    order = sorted(range(10), key=lambda d: ratios[d], reverse=True)
    best, second = order[:2]
    high, runner = ratios[best], ratios[second]
    margin = high - runner
    other_weak = max(v for d, v in enumerate(weak_ratios) if d != best)
    issues = []
    if high < config['blankMaxRatio'] and max(weak_ratios) < config['blankMaxRatio']:
        issues.append('blank')
    elif high < config['minFillRatio']:
        issues.append('faint_or_partial_mark')
    if runner >= config['maxOtherRatio']:
        issues.append('multiple_marks')
    if margin < config['minWinnerMargin']:
        issues.append('small_winner_margin')
    if other_weak >= config['maxOtherWeakRatio']:
        issues.append('secondary_faint_or_erased_mark')
    # Evidence score, not probability. Rejected rows are capped below 0.5.
    score = min(high, max(0., 1 - runner), margin, max(0., 1 - other_weak))
    if issues:
        score = min(.49, score)
    return {'status': 'REVIEW' if issues else 'OK', 'confidence': round(score, 4),
            'digit': None if issues else best, 'candidateDigit': best if max(weak_ratios) >= config['blankMaxRatio'] else None,
            'blackRatios': [round(v, 4) for v in ratios], 'weakInkRatios': [round(v, 4) for v in weak_ratios],
            'winnerRatio': round(high, 4), 'runnerUpRatio': round(runner, 4), 'margin': round(margin, 4), 'issues': issues}


def measure_omr(gray, c, config):
    rows = {}
    for name in ROWS:
        ratios, weak_ratios, measurements = [], [], []
        for mark in c['omr'][name]:
            center = px(c, mark['center']['mm'])
            factor = np.array([c['raster']['width'] / c['page']['widthMm'], c['raster']['height'] / c['page']['heightMm']])
            radius = mark['sampleRadiusMm'] * factor
            bounds = mark['radiusMm'] * 1.5 * factor
            x, y = np.floor(center - bounds).astype(int)
            x2, y2 = np.ceil(center + bounds + 1).astype(int)
            patch = gray[y:y2, x:x2]
            yy, xx = np.indices(patch.shape)
            mask = ((xx + x - center[0]) / radius[0]) ** 2 + ((yy + y - center[1]) / radius[1]) ** 2 <= 1
            if not np.any(mask):
                raise ValueError('OMR measurement disk contains no pixels')
            background = float(np.percentile(patch, 90))
            strong = background * config['strongInkFraction']
            weak = background * config['weakInkFraction']
            ratios.append(float(np.mean(patch[mask] < strong)))
            weak_ratios.append(float(np.mean(patch[mask] < weak)))
            measurements.append({'digit': mark['digit'], 'centerPx': center.round(3).tolist(), 'sampleRadiusPx': radius.round(3).tolist(),
                                 'samplePixels': int(np.sum(mask)), 'backgroundGray': round(background, 2), 'inkThresholdGray': round(strong, 2)})
        rows[name] = {**classify_row(ratios, weak_ratios, config), 'measurements': measurements}
    return rows


def _qr_match(gray, c, matrix, source, turns, config, detector):
    width, height = c['raster']['width'], c['raster']['height']
    normalized = cv2.warpPerspective(gray, matrix, (width, height), borderValue=255)
    r = c['qr']['region']['mm']
    pad = 3 * c['scale']
    lo = np.maximum(0, np.floor(px(c, {'x': r['x'] - pad, 'y': r['y'] - pad})).astype(int))
    hi = np.minimum([width, height], np.ceil(px(c, {'x': r['x'] + r['width'] + pad, 'y': r['y'] + r['height'] + pad})).astype(int))
    crop = normalized[lo[1]:hi[1], lo[0]:hi[0]]
    payload, points, straight = detector.detectAndDecode(crop)
    try:
        identity = parse_payload(payload)
    except ValueError:
        return None
    if identity['side'] != c['identity']['side'] or points is None or straight is None:
        return None
    modules = straight.shape[0]
    if modules not in (21, 25, 29, 33) or straight.shape[1] != modules:
        return None
    actual = points[0] + lo
    # Use decoded module count, not the sample JSON's particular QR version.
    quiet = r['width'] * c['qr']['quietZoneModules'] / (modules + 2 * c['qr']['quietZoneModules'])
    expected_mm = rect_points({'x': r['x'] + quiet, 'y': r['y'] + quiet, 'width': r['width'] - 2 * quiet, 'height': r['height'] - 2 * quiet})
    mm_per_px = np.array([c['page']['widthMm'] / width, c['page']['heightMm'] / height])
    errors = np.linalg.norm(actual * mm_per_px - expected_mm, axis=1)
    alignment = float(np.max(errors))
    source_qr = transform(actual, np.linalg.inv(matrix))
    pixels_per_module = float(min(np.linalg.norm(source_qr[(i + 1) % 4] - source_qr[i]) for i in range(4)) / modules)
    marker_errors = []
    for key, candidate in zip(MARKER_KEYS, np.roll(np.array(source, dtype=object), turns)):
        polygon_mm = transform(candidate['polygonPx'], matrix) * mm_per_px
        box = c['markers'][key]['mm']
        sides = [np.linalg.norm(polygon_mm[(i + 1) % 4] - polygon_mm[i]) for i in range(4)]
        marker_errors.append(max(abs(s / box['width'] - 1) for s in sides))
    qr_score = max(0., 1 - alignment / (2 * config['maxQrAlignmentErrorMm']))
    return {'coordinates': c, 'normalized': normalized, 'matrix': matrix, 'identity': identity, 'turns': turns,
            'alignment': alignment, 'markerSizeError': max(marker_errors), 'qrPoints': actual,
            'pixelsPerModule': pixels_per_module, 'modules': modules, 'confidence': qr_score}


def analyze_image(gray, catalog, config=None, paper='auto'):
    """Return JSON-safe result plus private arrays used only to draw diagnostics."""
    config = config or load_config()
    result = {'status': 'REVIEW', 'confidence': 0., 'issues': [], 'identity': None, 'qrPayload': None,
              'rows': {}, 'studentIdentifier': None, 'candidate': None, 'requiresRosterMatch': True}
    artifacts = {'input': gray}
    markers = detect_markers(gray, config)
    result['markers'] = markers
    if markers['status'] != 'OK':
        result['issues'] = markers['issues']
        return result, artifacts
    source = [markers['selected'][key] for key in MARKER_KEYS]
    points = np.float32([m['centerPx'] for m in source])
    matches = []
    detector = cv2.QRCodeDetector()
    for c in catalog:
        if paper != 'auto' and c['pageSize'] != paper:
            continue
        target = np.float32([px(c, c['markers'][key]['center']['mm']) for key in MARKER_KEYS])
        for turns in range(4):
            matrix = cv2.getPerspectiveTransform(np.roll(points, turns, axis=0), target)
            found = _qr_match(gray, c, matrix, source, turns, config, detector)
            if found:
                matches.append(found)
    if not matches:
        result['issues'] = ['qr_unreadable_or_invalid']
        result['qr'] = {'status': 'REVIEW', 'confidence': 0.}
        return result, artifacts
    matches.sort(key=lambda m: m['alignment'])
    best = matches[0]
    c = best['coordinates']
    artifacts.update(best)
    result.update({'identity': best['identity'], 'qrPayload': best['identity']['payload'], 'pageSize': c['pageSize'],
                   'scale': c['scale'], 'dpi': c['dpi'], 'raster': c['raster'], 'coordinateSource': c.get('_source'),
                   'orientationQuarterTurns': best['turns'], 'studentIdentitySource': c['studentIdentitySource']})
    gap = matches[1]['alignment'] - best['alignment'] if len(matches) > 1 else None
    issues = []
    if best['alignment'] > config['maxQrAlignmentErrorMm']:
        issues.append('qr_layout_mismatch')
    if gap is not None and gap < config['minLayoutErrorGapMm']:
        issues.append('ambiguous_paper_or_orientation')
    if len({m['identity']['payload'] for m in matches}) != 1:
        issues.append('conflicting_qr_payloads')
    if best['markerSizeError'] > config['maxMarkerSizeError']:
        issues.append('marker_size_mismatch')
    if best['pixelsPerModule'] < config['minSourcePixelsPerModule']:
        issues.append('insufficient_source_resolution')
    result['normalization'] = {'status': 'REVIEW' if issues else 'OK', 'confidence': round(best['confidence'], 4) if not issues else 0.,
        'homography': best['matrix'].tolist(), 'maxMarkerSizeError': round(best['markerSizeError'], 4),
        'layoutErrorGapMm': None if gap is None else round(gap, 4),
        'candidates': [{'pageSize': m['coordinates']['pageSize'], 'side': m['identity']['side'], 'orientationQuarterTurns': m['turns'], 'maxQrCornerErrorMm': round(m['alignment'], 4)} for m in matches]}
    result['qr'] = {'status': 'REVIEW' if issues else 'OK', 'confidence': round(best['confidence'], 4) if not issues else 0.,
        'regionMm': c['qr']['region']['mm'], 'polygonPx': best['qrPoints'].round(3).tolist(),
        'modules': best['modules'], 'sourcePixelsPerModule': round(best['pixelsPerModule'], 3), 'maxCornerErrorMm': round(best['alignment'], 4)}
    if best['identity']['side'] == 'F':
        rows = measure_omr(best['normalized'], c, config)
        inverse = np.linalg.inv(best['matrix'])
        min_radius = float('inf')
        for name in ROWS:
            for mark in c['omr'][name]:
                p = mark['center']['mm']
                r = mark['sampleRadiusMm']
                points_mm = [p, {'x': p['x'] + r, 'y': p['y']}, {'x': p['x'], 'y': p['y'] + r}]
                original = transform([px(c, point) for point in points_mm], inverse)
                min_radius = min(min_radius, np.linalg.norm(original[1] - original[0]), np.linalg.norm(original[2] - original[0]))
        result['normalization']['minSourceSampleRadiusPixels'] = round(float(min_radius), 3)
        if min_radius < config['minSourceSampleRadiusPixels'] and 'insufficient_source_resolution' not in issues:
            issues.append('insufficient_source_resolution')
        for name, row in rows.items():
            if issues:
                row.update(status='REVIEW', digit=None, confidence=0.)
                row['issues'].append('untrusted_normalization')
            if row['status'] != 'OK':
                result['issues'].append('omr_' + name + '_review')
        result['rows'] = rows
        if not issues and all(row['status'] == 'OK' for row in rows.values()):
            digits = [rows[name]['digit'] for name in ROWS]
            result['studentIdentifier'] = ''.join(map(str, digits))
            result['candidate'] = {'class': digits[0], 'number': digits[1] * 10 + digits[2]}
        result['confidence'] = round(min(best['confidence'], *(row['confidence'] for row in rows.values())), 4)
    else:
        result['confidence'] = round(best['confidence'], 4)
    result['issues'] = issues + result['issues']
    result['status'] = 'REVIEW' if result['issues'] else 'OK'
    if issues:
        result['normalization'].update(status='REVIEW', confidence=0.)
        result['confidence'] = 0.
    return result, artifacts


def draw_debug(result, artifacts, directory, page_number):
    """BGR colors: cyan regions, green accepted, orange tentative, red issues."""
    directory = Path(directory)
    prefix = f'page-{page_number:02d}'
    original = cv2.cvtColor(artifacts['input'], cv2.COLOR_GRAY2BGR)
    for candidate in result.get('markers', {}).get('candidates', []):
        cv2.polylines(original, [np.int32(candidate['polygonPx'])], True, (0, 165, 255), 2)
    for key, marker in result.get('markers', {}).get('selected', {}).items():
        polygon = np.int32(marker['polygonPx'])
        cv2.polylines(original, [polygon], True, (0, 150, 0), 3)
        cv2.putText(original, key, tuple(polygon.min(axis=0)), cv2.FONT_HERSHEY_SIMPLEX, .65, (0, 100, 0), 2)
    cv2.putText(original, result['status'] + ' ' + ', '.join(result['issues']), (15, 35), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 0, 200), 2)
    files = {'markers': directory / (prefix + '-markers.png')}
    if not cv2.imwrite(str(files['markers']), original):
        raise OSError('Cannot write marker debug image')
    if 'normalized' in artifacts:
        c = artifacts['coordinates']
        canvas = cv2.cvtColor(artifacts['normalized'], cv2.COLOR_GRAY2BGR)
        for key in MARKER_KEYS:
            polygon = np.int32([px(c, {'x': x, 'y': y}) for x, y in rect_points(c['markers'][key]['mm'])])
            cv2.polylines(canvas, [polygon], True, (0, 150, 0), 2)
        qr_polygon = np.int32([px(c, {'x': x, 'y': y}) for x, y in rect_points(c['qr']['region']['mm'])])
        cv2.polylines(canvas, [qr_polygon], True, (200, 150, 0), 2)
        cv2.polylines(canvas, [np.int32(artifacts['qrPoints'])], True, (220, 0, 180), 2)
        for name, row in result['rows'].items():
            for mark, measurement in zip(c['omr'][name], row['measurements']):
                digit = mark['digit']
                accepted = digit == row['digit']
                tentative = row['digit'] is None and digit == row['candidateDigit']
                color = (0, 160, 0) if accepted else (0, 120, 255) if tentative else (200, 150, 0)
                center = tuple(np.rint(measurement['centerPx']).astype(int))
                radius = tuple(np.rint(measurement['sampleRadiusPx']).astype(int))
                cv2.ellipse(canvas, center, radius, 0, 0, 360, color, 3 if accepted or tentative else 1)
                cv2.putText(canvas, f"{digit}:{row['blackRatios'][digit]:.2f}", (center[0] - 22, center[1] + radius[1] + 14), cv2.FONT_HERSHEY_SIMPLEX, .4, color, 1)
        caption = f"{result['status']}  student={result['studentIdentifier'] or '-'}  confidence={result['confidence']:.3f}  | green=accepted, orange=review candidate"
        cv2.putText(canvas, caption, (15, 28), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 0, 0), 1, cv2.LINE_AA)
        files['normalized'] = directory / (prefix + '-normalized.png')
        if not cv2.imwrite(str(files['normalized']), canvas):
            raise OSError('Cannot write normalized debug image')
        bottom_mm = c['header']['mm']['y'] + c['header']['mm']['height'] + 7
        crop_bottom = min(canvas.shape[0], round(bottom_mm / c['page']['heightMm'] * canvas.shape[0]))
        files['header'] = directory / (prefix + '-header.png')
        if not cv2.imwrite(str(files['header']), canvas[:crop_bottom]):
            raise OSError('Cannot write header debug image')
    return {key: str(path.resolve()) for key, path in files.items()}
