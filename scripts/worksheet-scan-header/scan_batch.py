#!/usr/bin/env python3
"""Sequential local batch verification; one input file is one independent unit."""
import argparse
import json
from pathlib import Path
import sys

from scan_core import load_catalog, load_config
from scan_poc import add_reader_arguments, console_summary, scan_file


def compare_expected(result, expected):
    actual = {'status': result['status'], 'studentIdentifier': result['studentIdentifier'],
              'pageSize': result['pages'][0].get('pageSize') if result['pages'] else None,
              'reversedPages': result.get('pairing', {}).get('reversedPages', False)}
    mismatches = {key: {'expected': value, 'actual': actual[key]} for key, value in expected.items() if actual[key] != value}
    wrong_acceptance = result['status'] == 'OK' and bool(mismatches)
    return {'passed': not mismatches, 'mismatches': mismatches, 'falseAcceptance': wrong_acceptance}


def read_manifest(path):
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or data.get('schemaVersion') != 'worksheet-scan-cases/1' or not isinstance(data.get('cases'), list) or not data['cases']:
        raise ValueError('Expected worksheet-scan-cases/1 and a nonempty cases array')
    cases = []
    for case in data['cases']:
        expected = case['expected']
        if not isinstance(expected, dict) or not expected or set(expected) - {'status', 'studentIdentifier', 'pageSize', 'reversedPages'}:
            raise ValueError('Unsupported or empty expected result')
        if 'status' in expected and expected['status'] not in ('OK', 'REVIEW', 'ERROR'):
            raise ValueError('Invalid expected status')
        if 'studentIdentifier' in expected and expected['studentIdentifier'] is not None and (not isinstance(expected['studentIdentifier'], str) or len(expected['studentIdentifier']) != 3 or not expected['studentIdentifier'].isascii() or not expected['studentIdentifier'].isdigit()):
            raise ValueError('Student identifier must be three ASCII digits or null')
        if 'pageSize' in expected and expected['pageSize'] not in ('b5', 'a4', None):
            raise ValueError('Invalid expected page size')
        if 'reversedPages' in expected and type(expected['reversedPages']) is not bool:
            raise ValueError('reversedPages must be boolean')
        cases.append({'input': (path.parent / case['input']).resolve(), 'expected': expected})
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', nargs='*', type=Path, help='Files or directories (nonrecursive)')
    parser.add_argument('--manifest', type=Path, help='JSON with labeled test cases')
    parser.add_argument('--output', required=True, type=Path, help='New output directory')
    add_reader_arguments(parser)
    args = parser.parse_args()
    if bool(args.inputs) == bool(args.manifest):
        parser.error('Specify inputs OR --manifest')
    try:
        config, catalog = load_config(args.config), load_catalog(args.coordinates_dir)
        if args.manifest:
            cases = read_manifest(args.manifest)
        else:
            files = []
            for path in args.inputs:
                files.extend(sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in ('.pdf', '.png', '.jpg', '.jpeg')) if path.is_dir() else [path])
            cases = [{'input': p, 'expected': None} for p in dict.fromkeys(p.resolve() for p in files)]
        if not cases:
            parser.error('No supported input files')
        args.output.mkdir(parents=True, exist_ok=False)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    records = []
    for index, case in enumerate(cases, 1):
        destination = args.output / f'{index:04d}'
        result = scan_file(case['input'], destination, catalog=catalog, config=config, paper=args.paper, renderer=args.pdftoppm, single_page=args.single_page)
        print(console_summary(result))
        record = {'input': str(case['input']), 'status': result['status'], 'studentIdentifier': result['studentIdentifier'], 'resultFile': result['resultFile']}
        if case['expected'] is not None:
            record['validation'] = compare_expected(result, case['expected'])
        records.append(record)
    counts = {state: sum(r['status'] == state for r in records) for state in ('OK', 'REVIEW', 'ERROR')}
    labeled = [r['validation'] for r in records if 'validation' in r]
    report = {'schemaVersion': 'worksheet-scan-batch/1', 'counts': counts, 'files': records,
              'validation': {'labeled': len(labeled), 'passed': sum(v['passed'] for v in labeled),
                             'failed': sum(not v['passed'] for v in labeled), 'falseAcceptances': sum(v['falseAcceptance'] for v in labeled)} if labeled else None}
    report_path = args.output / 'batch-result.json'
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"Batch: {counts}; validation={report['validation']}; {report_path}")
    # A labeled negative test passes when REVIEW/ERROR was the expected result.
    if labeled:
        return 1 if any(not v['passed'] for v in labeled) else 0
    return 1 if counts['ERROR'] else 2 if counts['REVIEW'] else 0


if __name__ == '__main__':
    sys.exit(main())
