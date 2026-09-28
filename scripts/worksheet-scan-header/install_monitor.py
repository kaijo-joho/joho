#!/usr/bin/env python3
"""Freeze a local reader release and install per-user macOS LaunchAgents."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import time

from cloud_intake import atomic_json

LABELS = {role: 'jp.kaijo.worksheet-' + role for role in ('poller', 'analyzer', 'cloud')}


def bootstrap_agent(domain, path):
    # bootout may return before launchd finishes removing a running job. In
    # that short interval bootstrap returns EIO (5), including during rollback.
    command = ['launchctl', 'bootstrap', domain, str(path)]
    for attempt in range(11):
        result = subprocess.run(command, capture_output=True)
        if result.returncode == 0:
            return
        if result.returncode != 5 or attempt == 10:
            result.check_returncode()
        time.sleep(1)


def launch_agent(role, runtime, release, python, renderer):
    script = release / 'scripts/worksheet-scan-header/monitor.py'
    args = [str(python), '-u', str(script), role, '--queue', str(runtime / 'queue'),
            '--monitor-settings', str(runtime / 'monitor-settings.json')]
    if role == 'poller':
        args += ['--settings', str(runtime / 'drive-inbox-settings.json'),
                 '--credentials-file', str(runtime / 'drive-read-oauth.json')]
    elif role == 'cloud':
        args += ['--settings', str(runtime / 'cloud-sync-settings.json'),
                 '--credentials-file', str(runtime / 'drive-manage-oauth.json')]
    else:
        args += ['--pdftoppm', str(renderer)]
    return {'Label': LABELS[role], 'ProgramArguments': args, 'WorkingDirectory': str(runtime),
            'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30,
            'ProcessType': 'Background', 'LowPriorityBackgroundIO': True, 'Umask': 0o077,
            'EnvironmentVariables': {'PYTHONUNBUFFERED': '1', 'OPENBLAS_NUM_THREADS': '1',
                                     'OMP_NUM_THREADS': '1', 'VECLIB_MAXIMUM_THREADS': '1',
                                     'PATH': str(renderer.parent) + ':/usr/bin:/bin:/usr/sbin:/sbin'},
            'StandardOutPath': str(runtime / 'queue/monitor' / (role + '-launch.log')),
            'StandardErrorPath': str(runtime / 'queue/monitor' / (role + '-launch.log'))}


def install(runtime, python, renderer, source_root, revision, *, activate=False, with_cloud=False):
    """Stage everything before touching agents; retain plists for rollback."""
    os.umask(0o077)
    runtime, source_root = Path(runtime).expanduser().resolve(), Path(source_root).resolve()
    # Preserve the venv executable path: resolving its symlink bypasses the venv.
    python, renderer = Path(python).expanduser().absolute(), Path(renderer).expanduser().absolute()
    if any((p / '.git').exists() for p in (runtime, *runtime.parents)):
        raise ValueError('Runtime must be outside Git')
    for file in (python, renderer, runtime / 'drive-inbox-settings.json', runtime / 'drive-read-oauth.json'):
        if not file.is_file():
            raise ValueError('Required local runtime file is missing')
    if with_cloud:
        for name in ('cloud-sync-settings.json', 'drive-manage-oauth.json'):
            if not (runtime / name).is_file():
                raise ValueError('Cloud sync settings and explicit manage credentials are required')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    release = runtime / 'releases' / stamp
    scripts = release / 'scripts/worksheet-scan-header'
    coordinates = release / 'templates/worksheets/scan-header'
    scripts.mkdir(parents=True)
    coordinates.mkdir(parents=True)
    source = source_root / 'scripts/worksheet-scan-header'
    for path in [*source.glob('*.py'), source / 'reader-config.json', *source.glob('*settings.example.json')]:
        shutil.copy2(path, scripts / path.name)
    for path in (source_root / 'templates/worksheets/scan-header').glob('*.json'):
        shutil.copy2(path, coordinates / path.name)
    files = {str(p.relative_to(release)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in release.rglob('*') if p.is_file()}
    atomic_json(release / 'release.json', {'sourceRevision': revision, 'files': files, 'createdAt': stamp})
    settings = runtime / 'monitor-settings.json'
    if not settings.exists():
        shutil.copy2(source / 'monitor-settings.example.json', settings)
    # Import/load preflight uses the exact venv and frozen geometry, no network.
    subprocess.run([str(python), '-c',
                    'from monitor import configuration; from scan_core import load_catalog, load_config; '
                    'import sys; configuration(sys.argv[1]); load_catalog(); load_config()', str(settings)],
                   cwd=scripts, check=True, timeout=30)
    if with_cloud:
        subprocess.run([str(python), '-c', 'from cloud_sync import configuration; import sys; configuration(sys.argv[1])',
                        str(runtime / 'cloud-sync-settings.json')], cwd=scripts, check=True, timeout=30)
    (runtime / 'queue/monitor').mkdir(parents=True, exist_ok=True)
    agent_dir = Path.home() / 'Library/LaunchAgents'
    agent_dir.mkdir(parents=True, exist_ok=True)
    backup = runtime / 'service-backups' / stamp
    backup.mkdir(parents=True)
    domain = 'gui/' + str(os.getuid())
    targets = {role: agent_dir / (label + '.plist') for role, label in LABELS.items()
               if role != 'cloud' or with_cloud}
    prior, was_loaded = {}, {}
    for role, path in targets.items():
        prior[role] = path.read_bytes() if path.exists() else None
        if prior[role] is not None:
            (backup / path.name).write_bytes(prior[role])
        was_loaded[role] = subprocess.run(['launchctl', 'print', domain + '/' + LABELS[role]],
                                         capture_output=True).returncode == 0
    atomic_json(backup / 'previous-state.json', {'loaded': was_loaded, 'present': {k: v is not None for k, v in prior.items()}})
    if not activate and any(was_loaded.values()):
        raise ValueError('Active agents require --activate to update consistently')
    try:
        for role, path in targets.items():
            if activate and was_loaded[role]:
                subprocess.run(['launchctl', 'bootout', domain + '/' + LABELS[role]], check=True)
            path.write_bytes(plistlib.dumps(launch_agent(role, runtime, release, python, renderer)))
            os.chmod(path, 0o600)
            subprocess.run(['plutil', '-lint', str(path)], check=True, capture_output=True)
        if activate:
            for path in targets.values():
                bootstrap_agent(domain, path)
    except Exception as install_error:
        rollback_errors = []
        for role, path in targets.items():
            if activate:
                subprocess.run(['launchctl', 'bootout', domain + '/' + LABELS[role]], capture_output=True)
            if prior[role] is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(prior[role])
                if activate and was_loaded[role]:
                    try:
                        bootstrap_agent(domain, path)
                    except subprocess.CalledProcessError:
                        rollback_errors.append(role)
        if rollback_errors:
            raise RuntimeError('Agent rollback needs attention: ' + ', '.join(rollback_errors)) from install_error
        raise
    result = {'release': str(release), 'backup': str(backup), 'sourceRevision': revision,
              'activated': activate, 'agents': {k: str(v) for k, v in targets.items()},
              'startup': 'user_login', 'archiveEnabled': with_cloud}
    atomic_json(runtime / 'monitor-installation.json', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--python', type=Path, required=True)
    parser.add_argument('--pdftoppm', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--revision', required=True)
    parser.add_argument('--activate', action='store_true')
    parser.add_argument('--with-cloud', action='store_true', help='Enable authorized upload, GSS acknowledgement and archiving')
    args = parser.parse_args()
    print(json.dumps(install(args.runtime, args.python, args.pdftoppm, args.source_root,
                             args.revision, activate=args.activate, with_cloud=args.with_cloud), ensure_ascii=False, indent=2))
