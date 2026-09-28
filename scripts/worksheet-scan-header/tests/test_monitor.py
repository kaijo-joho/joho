"""Offline scheduling, concurrent reception, crash recovery and archive gates."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
from pathlib import Path
import plistlib
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch, Mock
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cloud_intake import CloudQueue
from drive_inbox import InboxWorker
from install_monitor import launch_agent
from monitor import (DEFAULT_SETTINGS, analyze_once, archive_plan, configuration, polling_delay,
                     poll_once, service_lock, cloud_once)
from test_drive_inbox import CONFIG, MemorySource
from test_scan_intake import pdf, pair, fake_reader


def epoch(value):
    return datetime.fromisoformat(value).replace(tzinfo=ZoneInfo('Asia/Tokyo')).timestamp()


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.settings = configuration(DEFAULT_SETTINGS)

    def test_time_bands_and_weekends_follow_the_same_local_schedule(self):
        for hour, expected in ((0, 1800), (6, 1800), (7, 60), (16, 60), (17, 300), (23, 300)):
            with self.subTest(hour=hour):
                self.assertEqual(polling_delay(self.settings, epoch(f'2026-09-27T{hour:02}:00:00')), expected)

    def test_boundary_is_not_overslept(self):
        for instant in ('2026-09-28T06:59:50', '2026-09-28T16:59:50', '2026-09-28T23:59:50'):
            self.assertEqual(polling_delay(self.settings, epoch(instant)), 10)

    def test_burst_expires_and_backoff_wins_over_burst(self):
        now = epoch('2026-09-28T03:00:00')
        self.assertEqual(polling_delay(self.settings, now, now + 600), 30)
        self.assertEqual(polling_delay(self.settings, now, now + 10), 10)
        self.assertEqual(polling_delay(self.settings, now, now), 1800)
        self.assertEqual(polling_delay(self.settings, now, now + 600, 20), 1800)

    def test_settings_reject_unknown_and_invalid_bands(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'settings.json'
            for change in ({'unexpected': True}, {'periods': []}, {'burstIntervalSeconds': 0},
                           {'periods': [{'startHour': 7, 'intervalSeconds': 60}]},
                           {'periods': [{'startHour': 0, 'intervalSeconds': 60}, {'startHour': 0, 'intervalSeconds': 60}]}):
                path.write_text(json.dumps({**self.settings, **change}))
                with self.assertRaises(ValueError):
                    configuration(path)


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.queue = CloudQueue(self.root / 'queue')
        self.monitor = self.queue.root / 'monitor'
        self.monitor.mkdir()
        self.source = MemorySource(pdf(self.root / 'scan.pdf', pair()))
        self.worker = InboxWorker(self.queue, self.source, CONFIG)
        self.settings = configuration(DEFAULT_SETTINGS)
        self.fake = patch('scan_intake.scan_file', side_effect=fake_reader)
        self.fake.start()
        self.space = patch('monitor.check_space')
        self.space.start()

    def tearDown(self):
        self.fake.stop()
        self.space.stop()
        self.tmp.cleanup()

    def receive(self):
        return self.worker.pull(defer_analysis=True, clock=lambda: 2000000000)

    def test_receive_is_durable_before_analysis_and_restart_does_not_redownload(self):
        reports = self.receive()
        self.assertEqual(reports[0]['status'], 'received')
        state = self.queue.states()[0]
        self.assertNotIn('manifest', state)
        self.assertTrue((self.queue.root / state['originalPath']).is_file())
        self.worker = InboxWorker(CloudQueue(self.queue.root), self.source, CONFIG)
        self.assertEqual(self.receive(), [])
        self.assertEqual(self.source.downloads, 1)
        done = analyze_once(self.queue, self.settings, self.monitor)
        self.assertEqual(done['state'], 'completed')
        self.assertEqual(done['readingStatus'], 'OK')
        with patch.object(self.queue, 'analyze', side_effect=AssertionError('must not reread')):
            self.assertEqual(analyze_once(self.queue, self.settings, self.monitor)['state'], 'idle')

    def test_new_reception_continues_while_analysis_is_blocked(self):
        self.receive()
        first = self.queue.states()[0]
        started, release = threading.Event(), threading.Event()
        from cloud_intake import scan_stack
        def slow(*args, **kwargs):
            started.set()
            self.assertTrue(release.wait(10))
            return scan_stack(*args, **kwargs)
        with ThreadPoolExecutor(max_workers=2) as pool, patch('cloud_intake.scan_stack', side_effect=slow):
            analysis = pool.submit(self.queue.analyze, first['receiptId'])
            self.assertTrue(started.wait(5))
            try:
                other = pdf(self.root / 'second.pdf', pair('408'))
                new = pool.submit(self.queue.receive, other, 'studio-drive').result(timeout=3)
                self.assertEqual(new['status'], 'received')
                self.assertNotEqual(new['receiptId'], first['receiptId'])
            finally:
                release.set()
            self.assertEqual(analysis.result(timeout=5)['status'], 'prepared')

    def test_concurrent_analysis_of_same_receipt_runs_once(self):
        self.receive()
        receipt = self.queue.states()[0]['receiptId']
        from cloud_intake import scan_stack
        with patch('cloud_intake.scan_stack', wraps=scan_stack) as scan, ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.queue.analyze, receipt) for _ in range(2)]
            self.assertEqual([f.result(timeout=10)['status'] for f in futures], ['prepared', 'prepared'])
            self.assertEqual(scan.call_count, 1)

    def test_analysis_failure_retries_without_blocking_later_jobs(self):
        self.receive()
        with patch.object(self.queue, 'analyze', side_effect=RuntimeError('private message')):
            failed = analyze_once(self.queue, self.settings, self.monitor, clock=lambda: 1000)
        self.assertEqual(failed['errorType'], 'RuntimeError')
        self.assertNotIn('private', json.dumps(failed))
        self.assertEqual(analyze_once(self.queue, self.settings, self.monitor, clock=lambda: 1001)['state'], 'retry_wait')
        next_file = pdf(self.root / 'second.pdf', pair('408'))
        second = self.queue.receive(next_file, 'studio-drive')
        done = analyze_once(self.queue, self.settings, self.monitor, clock=lambda: 1001)
        self.assertEqual(done['receiptId'], second['receiptId'])
        self.assertEqual(analyze_once(self.queue, self.settings, self.monitor, clock=lambda: 1031)['state'], 'completed')

    def test_corrupted_saved_original_never_becomes_ok(self):
        self.receive()
        state = self.queue.states()[0]
        (self.queue.root / state['originalPath']).write_bytes(b'changed')
        result = analyze_once(self.queue, self.settings, self.monitor)
        self.assertEqual(result['state'], 'retry_wait')
        self.assertEqual(self.queue.states()[0]['status'], 'received')

    def test_poller_retries_network_errors_and_records_no_exception_text(self):
        now = epoch('2026-09-28T10:00:00')
        with patch.object(self.worker, 'pull', side_effect=ConnectionError('private OAuth value')):
            status = {}
            for _ in range(8):
                status, _ = poll_once(self.worker, self.settings, status, clock=lambda: now)
        self.assertEqual(status['delaySeconds'], 1800)
        self.assertNotIn('private', json.dumps(status))
        with patch.object(self.worker, 'pull', return_value=[]):
            status, _ = poll_once(self.worker, self.settings, status, clock=lambda: now)
        self.assertEqual(status['failureCount'], 0)
        self.assertEqual(status['delaySeconds'], 60)

    def test_detected_submission_starts_burst_and_failed_downloads_backoff(self):
        now = epoch('2026-09-28T03:00:00')
        with patch.object(self.worker, 'pull', return_value=[{'status': 'received'}]):
            status, _ = poll_once(self.worker, self.settings, {}, clock=lambda: now)
        self.assertEqual(status['delaySeconds'], 30)
        with patch.object(self.worker, 'pull', return_value=[{'status': 'ERROR'}]):
            status, _ = poll_once(self.worker, self.settings, status, clock=lambda: now)
        self.assertEqual(status['state'], 'retry_wait')

    def test_low_disk_prevents_downloading(self):
        with patch('monitor.check_space', side_effect=OSError('disk')), patch.object(self.worker, 'pull') as pull:
            result, _ = poll_once(self.worker, self.settings, {})
        pull.assert_not_called()
        self.assertEqual(result['state'], 'retry_wait')

    def test_same_role_cannot_run_twice_but_roles_do_not_block_each_other(self):
        with service_lock(self.monitor, 'poller'), service_lock(self.monitor, 'analyzer'):
            with self.assertRaises(BlockingIOError):
                with service_lock(self.monitor, 'poller'):
                    self.fail('duplicate service')

    def test_archive_uses_worksheet_id_and_requires_gss_not_just_uploaded(self):
        state = self.queue.prepare(pdf(self.root / 'dr41.pdf', pair(worksheet='dr41')), 'studio-drive')
        plan = archive_plan({**state, 'status': 'uploaded'})
        self.assertEqual(plan['originalFolderSegments'], ['処理済み', '2026', 'dr41'])
        self.assertFalse(plan['enabled'])
        self.assertEqual(plan['status'], 'BLOCKED')
        self.assertIn('verified_gss_registration', plan['requiredBeforeMove'])

    def test_mixed_batch_original_is_held_and_items_have_separate_routes(self):
        source = pdf(self.root / 'mixed.pdf', pair(worksheet='dr41') + pair(worksheet='dr42'))
        state = self.queue.prepare(source, 'studio-drive')
        plan = archive_plan(state)
        self.assertEqual(plan['originalFolderSegments'], ['要確認', '混在・識別未確定'])
        self.assertEqual([i['folderSegments'][-1] for i in plan['items']], ['dr41', 'dr42'])

    def test_missing_archive_plan_recovers_without_changing_previous_analysis(self):
        state = self.queue.prepare(pdf(self.root / 'old.pdf', pair()), 'studio-drive')
        before = self.queue.state_path(state['receiptId']).read_bytes()
        with patch.object(self.queue, 'analyze', side_effect=AssertionError('must not reread')):
            analyze_once(self.queue, self.settings, self.monitor)
        self.assertEqual(self.queue.state_path(state['receiptId']).read_bytes(), before)
        self.assertTrue((self.queue.state_path(state['receiptId']).parent / 'archive-plan.json').is_file())

    def test_launch_agents_use_absolute_paths_without_shell_or_analyzer_credentials(self):
        for role in ('poller', 'analyzer', 'cloud'):
            value = launch_agent(role, Path('/private/runtime'), Path('/private/release'),
                                 Path('/private/venv/bin/python'), Path('/bin/pdftoppm'))
            self.assertEqual(plistlib.loads(plistlib.dumps(value)), value)
            self.assertTrue(value['KeepAlive'])
            self.assertEqual(value['ProcessType'], 'Background')
            self.assertEqual(value['Umask'], 0o077)
            self.assertEqual('--credentials-file' in value['ProgramArguments'], role != 'analyzer')
            if role == 'cloud':
                self.assertIn('/private/runtime/drive-manage-oauth.json', value['ProgramArguments'])

    def test_cloud_errors_backoff_and_do_not_log_private_sdk_text(self):
        worker = Mock()
        worker.run_once.side_effect = ConnectionError('private OAuth details')
        state = cloud_once(worker, self.settings, {}, clock=lambda: epoch('2026-09-28T10:00:00'))
        self.assertEqual(state['state'], 'retry_wait')
        self.assertNotIn('private', json.dumps(state))
        worker.run_once.side_effect = None
        worker.run_once.return_value = {'status': 'OK', 'errors': [], 'moved': 0}
        state = cloud_once(worker, self.settings, state, clock=lambda: epoch('2026-09-28T10:01:00'))
        self.assertEqual(state['state'], 'waiting')
        self.assertEqual(state['failureCount'], 0)


if __name__ == '__main__':
    unittest.main()
