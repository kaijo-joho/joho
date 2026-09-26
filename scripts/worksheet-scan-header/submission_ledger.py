"""Local submission history. Readability, attribution and review flags are separate."""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import uuid


def json_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError('Timestamp must be an ISO 8601 string with a timezone')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timestamp requires an explicit timezone')
    return parsed.astimezone(timezone.utc)


def text_field(value, label, limit=128):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError('Invalid ' + label)
    return value


def worksheet_key(identity):
    return (identity['subject'], identity['year'], identity['worksheetId'])


def group_key(assignment):
    return json_text([*worksheet_key(assignment), assignment['grade'], assignment['studentKey']])


def validate_settings(data):
    if not isinstance(data, dict) or data.get('schemaVersion') != 'worksheet-intake-settings/1':
        raise ValueError('Expected worksheet-intake-settings/1')
    if set(data) - {'schemaVersion', 'roster', 'worksheets', 'reviewRules'}:
        raise ValueError('Unknown intake settings key')
    if not isinstance(data.get('roster'), list) or not isinstance(data.get('worksheets'), list):
        raise ValueError('roster and worksheets must be arrays')
    if not data['roster'] or not data['worksheets']:
        raise ValueError('Provide a nonempty roster and worksheet catalog')
    roster, student_keys, worksheets = {}, set(), {}
    for person in data['roster']:
        if not isinstance(person, dict) or set(person) != {'year', 'grade', 'studentIdentifier', 'studentKey'}:
            raise ValueError('Roster requires year, grade, studentIdentifier, studentKey')
        if type(person['year']) is not int or not 2000 <= person['year'] <= 9999 or type(person['grade']) is not int or not 1 <= person['grade'] <= 12:
            raise ValueError('Invalid roster year/grade')
        if not isinstance(person['studentIdentifier'], str) or not re.fullmatch(r'[1-9][0-9]{2}', person['studentIdentifier']) or person['studentIdentifier'][1:] == '00':
            raise ValueError('Roster identifier must be class 1-9 plus number 01-99')
        text_field(person['studentKey'], 'studentKey')
        key = (person['year'], person['grade'], person['studentIdentifier'])
        student_key = (person['year'], person['studentKey'])
        if key in roster or student_key in student_keys:
            raise ValueError('Duplicate roster identity/studentKey')
        roster[key] = person
        student_keys.add(student_key)
    for worksheet in data['worksheets']:
        required = {'subject', 'year', 'worksheetId', 'grade', 'period', 'dueAt'}
        if not isinstance(worksheet, dict) or not required <= set(worksheet) or set(worksheet) - required - {'eligibleStudentKeys'}:
            raise ValueError('Invalid worksheet settings fields')
        if any(not isinstance(worksheet[k], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,20}', worksheet[k]) for k in ('subject', 'worksheetId')):
            raise ValueError('Invalid worksheet QR identity')
        if type(worksheet['year']) is not int or not 2000 <= worksheet['year'] <= 9999 or type(worksheet['grade']) is not int or not 1 <= worksheet['grade'] <= 12:
            raise ValueError('Invalid worksheet year/grade')
        text_field(worksheet['period'], 'period')
        if worksheet['dueAt'] is not None:
            timestamp(worksheet['dueAt'])
        eligible = worksheet.get('eligibleStudentKeys')
        available = {p['studentKey'] for p in roster.values() if (p['year'], p['grade']) == (worksheet['year'], worksheet['grade'])}
        if eligible is not None and (not isinstance(eligible, list) or any(not isinstance(k, str) for k in eligible) or len(eligible) != len(set(eligible)) or not set(eligible) <= available):
            raise ValueError('eligibleStudentKeys must be unique members of this year/grade')
        key = worksheet_key(worksheet)
        if key in worksheets:
            raise ValueError('QR identity must determine exactly one grade; use distinct worksheet IDs')
        worksheets[key] = worksheet
    rules = data.get('reviewRules', {})
    if not isinstance(rules, dict) or set(rules) - {'minClosedAssignments', 'maxSparseSubmissions'}:
        raise ValueError('Unknown review rule')
    rules = {'minClosedAssignments': 5, 'maxSparseSubmissions': 2, **rules}
    if any(type(v) is not int or v < 1 for v in rules.values()) or rules['maxSparseSubmissions'] >= rules['minClosedAssignments']:
        raise ValueError('Expected positive maxSparseSubmissions < minClosedAssignments')
    return {'raw': data, 'roster': roster, 'worksheets': worksheets, 'reviewRules': rules,
            'sha256': hashlib.sha256(json_text(data).encode()).hexdigest()}


def load_settings(path):
    return validate_settings(json.loads(Path(path).read_text(encoding='utf-8')))


def attribute_sheet(sheet, settings, batch_issues):
    """Never use a guessed OMR value or scan time to choose a pupil or grade."""
    reading = sheet['reading']
    identities = [p.get('identity') for p in reading.get('pages', []) if p.get('identity')]
    keys = {worksheet_key(i) for i in identities}
    identity = dict(zip(('subject', 'year', 'worksheetId'), next(iter(keys)))) if len(keys) == 1 else None
    worksheet = settings['worksheets'].get(worksheet_key(identity)) if identity else None
    flags = list(batch_issues)
    if not worksheet:
        flags.append('unregistered_or_ambiguous_worksheet')
    person = None
    identifier = reading.get('studentIdentifier')
    if worksheet and identifier:
        person = settings['roster'].get((worksheet['year'], worksheet['grade'], identifier))
        if person is None:
            flags.append('roster_not_found')
        elif worksheet.get('eligibleStudentKeys') is not None and person['studentKey'] not in worksheet['eligibleStudentKeys']:
            flags.append('student_not_assigned')
    assignment = None
    if reading['status'] == 'OK' and not flags and person:
        assignment = {**identity, 'grade': worksheet['grade'], 'studentKey': person['studentKey'], 'studentIdentifier': identifier}
    status = 'ERROR' if reading['status'] == 'ERROR' else 'OK' if assignment else 'REVIEW'
    return {'sheetIndex': sheet['sheetIndex'], 'sourcePages': sheet['sourcePages'], 'pdf': sheet.get('pdf'),
            'readingResult': sheet['readingResult'], 'readingStatus': reading['status'], 'intakeStatus': status,
            'confidence': reading.get('confidence', 0), 'worksheet': identity, 'assignment': assignment,
            'flags': flags, 'readingIssues': reading.get('issues', []),
            'reversedPages': reading.get('pairing', {}).get('reversedPages', False)}


class Ledger:
    """SQLite plus immutable originals/results, for one local host (not an SMB DB)."""
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        # Real scans must never accidentally enter a source repository or Pages.
        if any((p / '.git').exists() for p in (self.root, *self.root.parents)):
            raise ValueError('Store must be outside every Git repository and outside a public web directory')
        self.root.mkdir(parents=True, mode=0o700, exist_ok=True)
        self.db = sqlite3.connect(self.root / 'ledger.sqlite3', timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        if self.db.execute('PRAGMA user_version').fetchone()[0] not in (0, 1):
            self.db.close()
            raise ValueError('Unsupported ledger version')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS batches (
                id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, original TEXT NOT NULL,
                source_name TEXT NOT NULL, scanner_id TEXT NOT NULL, received_at TEXT NOT NULL,
                result_path TEXT, settings_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts (
                id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id),
                sheet_index INTEGER NOT NULL, received_at TEXT NOT NULL, data_json TEXT NOT NULL,
                excluded TEXT, UNIQUE(batch_id, sheet_index));
            CREATE TABLE IF NOT EXISTS selections (
                group_key TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id));
            CREATE TABLE IF NOT EXISTS cases (
                id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id),
                state TEXT NOT NULL CHECK(state IN ('open','resolved','cancelled')),
                replacement_id TEXT REFERENCES attempts(id));
            CREATE TABLE IF NOT EXISTS events (
                seq INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL,
                actor TEXT NOT NULL, details_json TEXT NOT NULL);
            PRAGMA user_version=1;
        ''')

    def close(self):
        self.db.close()

    @contextmanager
    def locked(self):
        # Serializes ingestion/decisions across 2-3 local processes, including files.
        with (self.root / 'ledger.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def event(self, action, actor, details):
        text_field(actor, 'actor')
        self.db.execute('INSERT INTO events(at,action,actor,details_json) VALUES(?,?,?,?)',
                        (now_iso(), action, actor, json_text(details)))

    def batch(self, batch_id):
        row = self.db.execute('SELECT * FROM batches WHERE id=?', (batch_id,)).fetchone()
        if row is None:
            raise ValueError('Unknown batch ID')
        return dict(row)

    def attempt(self, attempt_id):
        row = self.db.execute('SELECT * FROM attempts WHERE id=?', (attempt_id,)).fetchone()
        if row is None:
            raise ValueError('Unknown attempt ID')
        return {**dict(row), 'data': json.loads(row['data_json'])}

    def record_result(self, batch_id, result, relative_path, actor):
        batch = self.batch(batch_id)
        with self.db:
            updated_ids = {batch_id + ':' + str(item['sheetIndex']) for item in result['attempts']}
            for old in self.db.execute('SELECT id,data_json FROM attempts WHERE batch_id=?', (batch_id,)).fetchall():
                if old['id'] not in updated_ids:
                    data = json.loads(old['data_json'])
                    data.update(assignment=None, intakeStatus='REVIEW', flags=['analysis_incomplete'])
                    self.db.execute('UPDATE attempts SET data_json=? WHERE id=?', (json_text(data), old['id']))
            for item in result['attempts']:
                attempt_id = batch_id + ':' + str(item['sheetIndex'])
                self.db.execute('''INSERT INTO attempts(id,batch_id,sheet_index,received_at,data_json)
                    VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json''',
                    (attempt_id, batch_id, item['sheetIndex'], batch['received_at'], json_text(item)))
                item['attemptId'] = attempt_id
            self.db.execute('UPDATE batches SET result_path=? WHERE id=?', (relative_path, batch_id))
            self.event('analysis_completed', actor, {'batchId': batch_id, 'result': relative_path,
                                                     'settingsSha256': result['settingsSha256']})

    def select(self, attempt_id, actor, note):
        text_field(note, 'note', 2000)
        item = self.attempt(attempt_id)
        assignment = item['data'].get('assignment')
        if item['excluded'] or not assignment or item['data']['intakeStatus'] != 'OK':
            raise ValueError('Only an eligible, nonexcluded attempt can be selected')
        with self.db:
            self.db.execute('INSERT INTO selections VALUES(?,?) ON CONFLICT(group_key) DO UPDATE SET attempt_id=excluded.attempt_id',
                            (group_key(assignment), attempt_id))
            self.event('selection', actor, {'attemptId': attempt_id, 'note': note})

    def exclude(self, attempt_id, actor, note, restore=False):
        text_field(note, 'note', 2000)
        self.attempt(attempt_id)
        if restore and self.db.execute("SELECT 1 FROM cases WHERE attempt_id=? AND state!='cancelled'", (attempt_id,)).fetchone():
            raise ValueError('Cancel the mistake case before restoring this attempt')
        with self.db:
            self.db.execute('UPDATE attempts SET excluded=? WHERE id=?', (None if restore else 'manual', attempt_id))
            self.event('restore' if restore else 'exclude', actor, {'attemptId': attempt_id, 'note': note})

    def open_case(self, attempt_id, actor, note):
        text_field(note, 'note', 2000)
        item = self.attempt(attempt_id)
        if self.db.execute("SELECT 1 FROM cases WHERE attempt_id=? AND state!='cancelled'", (attempt_id,)).fetchone():
            raise ValueError('This attempt already has an active mistake case')
        if item['excluded']:
            raise ValueError('Restore the excluded attempt before opening a mistake case')
        case_id = 'case-' + uuid.uuid4().hex[:16]
        with self.db:
            self.db.execute("INSERT INTO cases VALUES(?,?,'open',NULL)", (case_id, attempt_id))
            self.db.execute('UPDATE attempts SET excluded=? WHERE id=?', (case_id, attempt_id))
            self.event('mistake_opened', actor, {'caseId': case_id, 'attemptId': attempt_id, 'note': note})
        return case_id

    def resolve_case(self, case_id, replacement_id, actor, note):
        text_field(note, 'note', 2000)
        case = self.db.execute('SELECT * FROM cases WHERE id=?', (case_id,)).fetchone()
        if case is None or case['state'] != 'open':
            raise ValueError('Expected an open mistake case')
        original, replacement = self.attempt(case['attempt_id']), self.attempt(replacement_id)
        if case['attempt_id'] == replacement_id or replacement['excluded'] or not replacement['data'].get('assignment'):
            raise ValueError('Replacement must be a different eligible attempt')
        if original['data'].get('worksheet') != replacement['data'].get('worksheet') or not original['data'].get('worksheet'):
            raise ValueError('Replacement must be for the same subject, year and worksheet')
        old_assignment = original['data'].get('assignment')
        if old_assignment and old_assignment['grade'] != replacement['data']['assignment']['grade']:
            raise ValueError('Replacement must belong to the same grade')
        if self.db.execute("SELECT 1 FROM cases WHERE replacement_id=? AND state='resolved'", (replacement_id,)).fetchone():
            raise ValueError('Replacement already resolves another case')
        with self.db:
            self.db.execute("UPDATE cases SET state='resolved',replacement_id=? WHERE id=?", (replacement_id, case_id))
            self.event('mistake_resolved', actor, {'caseId': case_id, 'replacementId': replacement_id, 'note': note})

    def cancel_case(self, case_id, actor, note):
        text_field(note, 'note', 2000)
        case = self.db.execute('SELECT * FROM cases WHERE id=?', (case_id,)).fetchone()
        if case is None or case['state'] == 'cancelled':
            raise ValueError('Expected an active mistake case')
        with self.db:
            self.db.execute("UPDATE cases SET state='cancelled' WHERE id=?", (case_id,))
            self.db.execute('UPDATE attempts SET excluded=NULL WHERE id=? AND excluded=?', (case['attempt_id'], case_id))
            self.event('mistake_cancelled', actor, {'caseId': case_id, 'note': note})

    def report(self, settings, at=None):
        at = timestamp(at) if at else datetime.now(timezone.utc)
        attempts = [self.attempt(r[0]) for r in self.db.execute('SELECT id FROM attempts ORDER BY received_at,id')]
        groups = {}
        for item in attempts:
            a = item['data'].get('assignment')
            if not item['excluded'] and a and item['data']['intakeStatus'] == 'OK':
                key = group_key(a)
                groups.setdefault(key, {'assignment': a, 'attempts': [], 'flags': []})['attempts'].append(item['id'])
        selections = dict(self.db.execute('SELECT group_key,attempt_id FROM selections'))
        for key, group in groups.items():
            group['receiptState'] = 'RECEIVED'
            selected = selections.get(key)
            if selected:
                group.update(selectedAttemptId=selected if selected in group['attempts'] else None, selectionMode='manual')
                if selected not in group['attempts']:
                    group['flags'].append('selected_attempt_unavailable')
            elif len(group['attempts']) == 1:
                group.update(selectedAttemptId=group['attempts'][0], selectionMode='automatic')
            else:
                group.update(selectedAttemptId=None, selectionMode='unresolved')
                group['flags'].append('duplicate_submission')
            group['submissionCount'] = len(group['attempts'])
        # Selections are bound to one exact PDF/owner, not silently transferred on retry.
        orphan_selections = [{'groupKey': k, 'attemptId': v} for k, v in selections.items() if k not in groups]
        rules = settings['reviewRules']
        received = {x['id']: timestamp(x['received_at']) for x in attempts}
        for group in groups.values():
            a = group['assignment']
            current = settings['worksheets'].get(worksheet_key(a))
            if current is None or current['grade'] != a['grade']:
                group['flags'].append('catalog_changed')
                continue
            roster_person = settings['roster'].get((a['year'], a['grade'], a['studentIdentifier']))
            if roster_person is None or roster_person['studentKey'] != a['studentKey']:
                group['flags'].append('roster_changed')
                continue
            if current.get('eligibleStudentKeys') is not None and a['studentKey'] not in current['eligibleStudentKeys']:
                group['flags'].append('eligibility_changed')
                continue
            closed = [w for w in settings['worksheets'].values()
                      if (w['subject'], w['year'], w['grade'], w['period']) == (a['subject'], a['year'], a['grade'], current['period'])
                      and w['dueAt'] is not None and timestamp(w['dueAt']) < at
                      and (w.get('eligibleStudentKeys') is None or a['studentKey'] in w['eligibleStudentKeys'])]
            closed_keys = {worksheet_key(w) for w in closed}
            submitted = {worksheet_key(g['assignment']) for g in groups.values()
                         if (g['assignment']['year'], g['assignment']['grade'], g['assignment']['studentKey']) == (a['year'], a['grade'], a['studentKey'])
                         and worksheet_key(g['assignment']) in closed_keys and any(received[i] <= at for i in g['attempts'])}
            if worksheet_key(a) in closed_keys and any(received[i] <= at for i in group['attempts']) and len(closed) >= rules['minClosedAssignments'] and 0 < len(submitted) <= rules['maxSparseSubmissions']:
                group['flags'].append('sparse_submission_history')
                group['historyEvidence'] = {'closedAssignments': len(closed), 'receivedAssignments': len(submitted), 'period': current['period']}
        cases = [dict(r) for r in self.db.execute('SELECT * FROM cases ORDER BY id')]
        for case in cases:
            if case['state'] == 'resolved':
                replacement = self.attempt(case['replacement_id'])
                if replacement['excluded'] or not replacement['data'].get('assignment'):
                    case['flags'] = ['resolved_replacement_unavailable']
        case_counts = {'knownMistakes': sum(c['state'] != 'cancelled' for c in cases),
                       'resolved': sum(c['state'] == 'resolved' for c in cases),
                       'unresolved': sum(c['state'] == 'open' for c in cases),
                       'cancelled': sum(c['state'] == 'cancelled' for c in cases)}
        batches = [dict(r) for r in self.db.execute('SELECT id,scanner_id,received_at,result_path FROM batches ORDER BY received_at,id')]
        queue = [{'kind': 'submission', 'assignment': g['assignment'], 'attemptIds': g['attempts'], 'reasons': g['flags']}
                 for g in groups.values() if g['flags']]
        queue.extend({'kind': 'unassigned_scan', 'attemptId': x['id'], 'reasons': [*x['data']['flags'], *x['data']['readingIssues']]}
                     for x in attempts if not x['excluded'] and not x['data'].get('assignment'))
        queue.extend({'kind': 'mistake_case', 'caseId': c['id'], 'reasons': ['unresolved_mistake'] if c['state'] == 'open' else c['flags']}
                     for c in cases if c['state'] == 'open' or c.get('flags'))
        queue.extend({'kind': 'selection', **selection, 'reasons': ['selected_attempt_unavailable']} for selection in orphan_selections)
        for batch in batches:
            if not batch['result_path']:
                queue.append({'kind': 'batch', 'batchId': batch['id'], 'reasons': ['analysis_interrupted']})
            else:
                result = json.loads((self.root / batch['result_path']).read_text())
                if not result['attempts'] and result['status'] != 'OK':
                    queue.append({'kind': 'batch', 'batchId': batch['id'], 'reasons': result['issues']})
        return {'schemaVersion': 'worksheet-submission-report/1', 'generatedAt': now_iso(), 'historyAsOf': at.isoformat(),
                'gradingEnabled': False, 'requiresStudentConfirmation': False,
                'groups': list(groups.values()), 'cases': cases, 'caseCounts': case_counts,
                'orphanSelections': orphan_selections,
                'reviewQueue': queue,
                'attempts': [{'attemptId': x['id'], 'batchId': x['batch_id'], 'receivedAt': x['received_at'],
                              'excluded': x['excluded'], **x['data']} for x in attempts],
                'batches': batches,
                'events': [{**dict(r), 'details': json.loads(r['details_json'])} for r in self.db.execute('SELECT * FROM events ORDER BY seq')]}
