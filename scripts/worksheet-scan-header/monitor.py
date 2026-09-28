#!/usr/bin/env python3
"""Independent, restartable Drive reception and serial local OMR services."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import shutil
import signal
import threading
import time
from zoneinfo import ZoneInfo

from cloud_intake import CloudQueue, atomic_json
from drive_inbox import DriveSource, InboxWorker, configuration as inbox_configuration
from drive_transport import DriveTransport
from scan_core import DEFAULT_COORDINATES, load_catalog, load_config
from scan_intake import MAX_BATCH_BYTES
from submission_ledger import now_iso

DEFAULT_SETTINGS = Path(__file__).with_name('monitor-settings.example.json')


def configuration(path):
    data = json.loads(Path(path).read_text())
    expected = set(json.loads(DEFAULT_SETTINGS.read_text()))
    if set(data) != expected or data['schemaVersion'] != 'worksheet-monitor/1':
        raise ValueError('Expected worksheet-monitor/1 settings')
    ZoneInfo(data['timezone'])
    periods = data['periods']
    if not isinstance(periods, list) or not periods or periods[0].get('startHour') != 0:
        raise ValueError('Periods must cover the day starting at midnight')
    previous = -1
    for period in periods:
        if (set(period) != {'startHour', 'intervalSeconds'}
                or type(period['startHour']) is not int or not previous < period['startHour'] < 24
                or type(period['intervalSeconds']) is not int or not 10 <= period['intervalSeconds'] <= 86400):
            raise ValueError('Invalid or unordered polling period')
        previous = period['startHour']
    bounds = {'burstIntervalSeconds': (10, 3600), 'burstDurationSeconds': (0, 86400),
              'maximumBackoffSeconds': (60, 86400), 'stableSeconds': (5, 3600),
              'downloadLimit': (1, 100), 'analysisCheckSeconds': (1, 300),
              'minimumFreeBytes': (MAX_BATCH_BYTES, 10**13)}
    for key, (low, high) in bounds.items():
        if type(data[key]) is not int or not low <= data[key] <= high:
            raise ValueError('Invalid monitor setting: ' + key)
    return data


def polling_delay(settings, now, burst_until=0, failures=0):
    """Never sleep past the next time band; an outage gets bounded backoff."""
    local = datetime.fromtimestamp(now, ZoneInfo(settings['timezone']))
    periods = settings['periods']
    current = next(p for p in reversed(periods) if p['startHour'] <= local.hour)
    delay = current['intervalSeconds']
    if now < burst_until:
        delay = min(delay, settings['burstIntervalSeconds'], max(1, burst_until - now))
    if failures:
        return min(settings['maximumBackoffSeconds'], max(delay, 30 * 2**min(failures - 1, 16)))
    later = [p['startHour'] for p in periods if p['startHour'] > local.hour]
    boundary = local.replace(hour=later[0], minute=0, second=0, microsecond=0) if later else (
        local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, min(delay, boundary.timestamp() - now))


def as_iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def archive_plan(state):
    """Local routing proposal only. It cannot authorize any Drive mutation."""
    manifest = state.get('manifest', {})
    items = manifest.get('items', [])
    identities = {tuple(i['worksheet'][k] for k in ('subject', 'year', 'worksheetId'))
                  for i in items if i.get('worksheet')}
    complete = bool(items) and all(i.get('worksheet') and i.get('pairValid') for i in items)
    clean = manifest.get('readingStatus') == 'OK' and manifest.get('pairingIntegrity') == 'consistent'
    single = complete and len(identities) == 1
    if single:
        subject, year, worksheet_id = next(iter(identities))
        path = ['処理済み' if clean else '要確認', str(year), worksheet_id]
    else:
        subject, path = None, ['要確認', '混在・識別未確定']
    return {'schemaVersion': 'worksheet-archive-plan/1', 'receiptId': state['receiptId'],
            'enabled': False, 'status': 'BLOCKED', 'originalFolderSegments': path,
            'subject': subject, 'mixedOrUncertain': not single,
            'items': [{'sheetIndex': i['sheetIndex'], 'worksheet': i.get('worksheet'),
                       'folderSegments': (['処理済み' if clean else '要確認', str(i['worksheet']['year']),
                                           i['worksheet']['worksheetId']] if i.get('worksheet') else None)} for i in items],
            'requiredBeforeMove': ['durable_original_and_results', 'verified_gss_registration',
                                   'authorized_drive_write_scope_and_destination'],
            'gssRegistration': 'not_verified'}


@contextmanager
def service_lock(root, role):
    with (root / (role + '.lock')).open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def logger_for(root, role):
    log = logging.getLogger('worksheet-monitor.' + role)
    log.setLevel(logging.INFO)
    handler = RotatingFileHandler(root / (role + '.log'), maxBytes=2 * 1024 * 1024, backupCount=3)
    handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
    log.addHandler(handler)
    return log


def check_space(queue, settings):
    # A download and its immutable snapshot may coexist temporarily.
    if shutil.disk_usage(queue.root).free < settings['minimumFreeBytes'] + 2 * MAX_BATCH_BYTES:
        raise OSError('Insufficient free storage')


def poll_once(worker, settings, previous, *, clock=time.time):
    status = {**previous, 'state': 'waiting', 'lastAttemptAt': as_iso(clock()), 'errorType': None}
    reports = []
    try:
        check_space(worker.queue, settings)
        reports = worker.pull(limit=settings['downloadLimit'], stable_seconds=settings['stableSeconds'],
                              defer_analysis=True, before_download=lambda: check_space(worker.queue, settings))
        failed = any(r['status'] == 'ERROR' for r in reports)
        status['lastSuccessfulListAt'] = as_iso(clock())
        if not failed:
            status['lastSuccessAt'] = as_iso(clock())
        status['failureCount'] = previous.get('failureCount', 0) + 1 if failed else 0
        # A waiting upload or remaining batch triggers the short follow-up too.
        if any(r['status'] in ('received', 'WAITING', 'PENDING') for r in reports):
            status['burstUntil'] = clock() + settings['burstDurationSeconds']
        status['counts'] = {s: sum(r['status'] == s for r in reports)
                            for s in ('received', 'prepared', 'WAITING', 'PENDING', 'REVIEW', 'ERROR')}
    except Exception as error:
        status.update(failureCount=previous.get('failureCount', 0) + 1, errorType=type(error).__name__)
    if status['failureCount']:
        status['state'] = 'retry_wait'
    delay = polling_delay(settings, clock(), status.get('burstUntil', 0), status['failureCount'])
    status.update(nextPollAt=as_iso(clock() + delay), delaySeconds=delay, updatedAt=as_iso(clock()))
    return status, reports


def analyze_once(queue, settings, root, *, clock=time.time, **reader_options):
    retry_path = root / 'analysis-retries.json'
    retries = json.loads(retry_path.read_text()) if retry_path.exists() else {}
    states = queue.states()
    # Recover a crash between the analysis commit and the optional routing plan.
    # Also populate plans for previously prepared jobs without re-reading them.
    for state in states:
        plan_path = queue.state_path(state['receiptId']).parent / 'archive-plan.json'
        if state['status'] != 'received' and not plan_path.exists():
            atomic_json(plan_path, archive_plan(state))
    pending = [s for s in states if s['status'] == 'received']
    eligible = [s for s in pending if retries.get(s['receiptId'], {}).get('retryAt', 0) <= clock()]
    status = {'state': 'idle' if not pending else 'retry_wait', 'pending': len(pending), 'updatedAt': as_iso(clock())}
    if not eligible:
        return status
    state = eligible[0]
    receipt_id = state['receiptId']
    status.update(state='analyzing', receiptId=receipt_id, startedAt=as_iso(clock()))
    atomic_json(root / 'analyzer-status.json', {**status, 'pid': os.getpid()})
    try:
        check_space(queue, settings)
        state = queue.analyze(receipt_id, **reader_options)
        atomic_json(queue.state_path(receipt_id).parent / 'archive-plan.json', archive_plan(state))
        retries.pop(receipt_id, None)
        status.update(state='completed', readingStatus=state['manifest']['readingStatus'],
                      completedAt=as_iso(clock()), pending=len(pending) - 1)
    except Exception as error:
        count = retries.get(receipt_id, {}).get('failures', 0) + 1
        retries[receipt_id] = {'failures': count, 'retryAt': clock() + min(
            settings['maximumBackoffSeconds'], 30 * 2**min(count - 1, 16))}
        status.update(state='retry_wait', errorType=type(error).__name__, retryAt=as_iso(retries[receipt_id]['retryAt']))
    atomic_json(retry_path, retries)
    status['updatedAt'] = as_iso(clock())
    return status


def cloud_once(worker, settings, previous, *, clock=time.time):
    status = {**previous, 'lastAttemptAt': as_iso(clock()), 'errorType': None}
    try:
        report = worker.run_once()
        failed = bool(report.get('errors'))
        status.update(report=report, failureCount=previous.get('failureCount', 0) + 1 if failed else 0)
        if not failed:
            status['lastSuccessAt'] = as_iso(clock())
    except Exception as error:
        status.update(failureCount=previous.get('failureCount', 0) + 1, errorType=type(error).__name__)
    delay = polling_delay(settings, clock(), failures=status['failureCount'])
    status.update(state='retry_wait' if status['failureCount'] else 'waiting', delaySeconds=delay,
                  nextPollAt=as_iso(clock() + delay), updatedAt=as_iso(clock()))
    return status


def run(args):
    os.umask(0o077)
    queue = CloudQueue(args.queue)
    root = queue.root / 'monitor'
    root.mkdir(mode=0o700, exist_ok=True)
    if args.role == 'status':
        result = {role: json.loads(path.read_text()) if path.exists() else None
                  for role in ('poller', 'analyzer', 'cloud')
                  for path in [root / (role + '-status.json')]}
        for value in result.values():
            if value:
                try:
                    os.kill(value.get('pid', 0), 0)
                    value['processExists'] = True
                except OSError:
                    value['processExists'] = False
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    settings = configuration(args.monitor_settings)
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    with service_lock(root, args.role):
        log = logger_for(root, args.role)
        path = root / (args.role + '-status.json')
        status = json.loads(path.read_text()) if path.exists() else {}
        log.info('started pid=%s', os.getpid())
        # Publish startup before loading dependencies so an initialization failure
        # cannot leave an old successful poll looking current.
        atomic_json(path, {**status, 'state': 'starting', 'pid': os.getpid(), 'updatedAt': now_iso()})
        worker = None
        if args.role == 'analyzer':
            import cv2
            cv2.setNumThreads(1)
            options = {'catalog': load_catalog(args.coordinates_dir), 'reader_config': load_config(args.reader_config),
                       'renderer': args.pdftoppm}
        while not stop.is_set():
            if args.role == 'poller':
                # Build failures (e.g. revoked/missing OAuth) get backoff as well.
                try:
                    if worker is None:
                        config = inbox_configuration(args.settings)
                        service = DriveTransport.from_credentials_file(args.credentials_file).service
                        worker = InboxWorker(queue, DriveSource(service), config)
                    status, reports = poll_once(worker, settings, status)
                except Exception as error:
                    failures = status.get('failureCount', 0) + 1
                    delay = polling_delay(settings, time.time(), failures=failures)
                    status = {**status, 'state': 'retry_wait', 'failureCount': failures,
                              'errorType': type(error).__name__, 'updatedAt': now_iso(),
                              'delaySeconds': delay, 'nextPollAt': as_iso(time.time() + delay)}
                    reports = []
                delay = status['delaySeconds']
                log.info('poll state=%s counts=%s error=%s next=%s', status['state'],
                         status.get('counts'), status.get('errorType'), status['nextPollAt'])
                if reports:
                    atomic_json(root / 'last-poll-reports.json', reports)
            elif args.role == 'cloud':
                try:
                    if worker is None:
                        from cloud_sync import CloudSync, configuration as sync_configuration
                        drive = DriveTransport.from_credentials_file(args.credentials_file)
                        worker = CloudSync(queue, sync_configuration(args.settings), drive=drive)
                    status = cloud_once(worker, settings, status)
                except Exception as error:
                    failures = status.get('failureCount', 0) + 1
                    delay = polling_delay(settings, time.time(), failures=failures)
                    status = {**status, 'state': 'retry_wait', 'failureCount': failures,
                              'errorType': type(error).__name__, 'updatedAt': now_iso(),
                              'delaySeconds': delay, 'nextPollAt': as_iso(time.time() + delay)}
                delay = status['delaySeconds']
                log.info('cloud state=%s error=%s next=%s', status['state'], status.get('errorType'), status['nextPollAt'])
            else:
                previous = status
                status = analyze_once(queue, settings, root, **options)
                if status['state'] in ('completed', 'retry_wait') and status.get('receiptId'):
                    log.info('analysis state=%s reading=%s error=%s', status['state'],
                             status.get('readingStatus'), status.get('errorType'))
                if status['state'] == 'completed':
                    status['lastCompletedAt'] = status['completedAt']
                    status['lastReadingStatus'] = status['readingStatus']
                else:
                    for key in ('lastCompletedAt', 'lastReadingStatus'):
                        if key in previous:
                            status[key] = previous[key]
                delay = 0 if status['state'] == 'completed' else settings['analysisCheckSeconds']
            atomic_json(path, {**status, 'pid': os.getpid()})
            if args.once:
                break
            # Wake periodically to notice clock jumps/resume without fixed long sleeps.
            deadline = time.time() + delay
            while not stop.is_set() and time.time() < deadline:
                stop.wait(min(5, max(0, deadline - time.time())))
        atomic_json(path, {**status, 'state': 'stopped', 'pid': os.getpid(), 'updatedAt': now_iso()})
        log.info('stopped')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('role', choices=['poller', 'analyzer', 'cloud', 'status'])
    parser.add_argument('--queue', type=Path, required=True)
    parser.add_argument('--monitor-settings', type=Path, default=DEFAULT_SETTINGS)
    parser.add_argument('--settings', type=Path)
    parser.add_argument('--credentials-file', type=Path)
    parser.add_argument('--coordinates-dir', type=Path, default=DEFAULT_COORDINATES)
    parser.add_argument('--reader-config', type=Path)
    parser.add_argument('--pdftoppm')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    if args.role in ('poller', 'cloud') and (not args.settings or not args.credentials_file):
        parser.error(args.role + ' requires --settings and --credentials-file')
    try:
        return run(args)
    except Exception as error:
        # No private SDK exception text or pupil information in launchd stderr.
        print(json.dumps({'status': 'ERROR', 'errorType': type(error).__name__}), flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
