// サーバー専用。採用済み固定版・授業権限を圧縮して保持し、最後に単一pointerを切り替える。
// モジュールをRPCで返さない。ブラウザへの問題はPythonEditorMaster.publicQuestionで投影する。
var ToolsGradingPackages = (function () {
  'use strict';
  var PREFIX = 'TOOLS_GRADING_V1_', ACTIVE = PREFIX + 'ACTIVE', CHUNK = 7600, BUDGET = 450000, MAX_TEXT = 8000000;
  var ID = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/, HASH = /^[a-f0-9]{64}$/, GENERATION = /^[a-f0-9]{32}$/;
  function create(dependencies) {
    var dep = dependencies || {}, T = ToolsStoreContract, properties = dep.properties || PropertiesService.getScriptProperties();
    function fail(code) { T.fail(code, '採用版または授業権限を確認できません。教員へ連絡してください。'); }
    function assert(value, code) { if (!value) fail(code || 'packages_invalid'); }
    function hash(text) { return dep.hash ? dep.hash(text) : T.hash(text); }
    function now() { return dep.now ? dep.now() : Date.now(); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function only(value, fields) { assert(value && Object.prototype.toString.call(value) === '[object Object]' && Object.keys(value).every(function (k) { return fields.indexOf(k) >= 0; })); }
    function bytes(value) { return dep.byteLength ? dep.byteLength(value) : Utilities.newBlob(value).getBytes().length; }
    function compressed(text) {
      return dep.gzip ? dep.gzip(text) : Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, 'application/json')).getBytes());
    }
    function expanded(text) {
      return dep.gunzip ? dep.gunzip(text) : Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(text), 'application/gzip')).getDataAsString('UTF-8');
    }
    function pack(body) { return T.canonical({ body: body, digest: hash(T.canonical(body)) }); }
    function unpack(text) {
      try { var value = JSON.parse(text); assert(value && value.body && hash(T.canonical(value.body)) === value.digest); return value.body; }
      catch (ignored) { fail('packages_invalid'); }
    }
    function base(generation) { return PREFIX + 'G_' + generation + '_'; }
    function partKey(generation, i) { return base(generation) + 'P_' + ('000' + i).slice(-3); }
    function metadata(value) {
      only(value, ['schema', 'generation', 'issuedAt', 'expiresAt', 'payloadHash', 'manifestHash']);
      assert(value && value.schema === 1 && GENERATION.test(value.generation) && HASH.test(value.payloadHash) && HASH.test(value.manifestHash) && Number.isSafeInteger(value.issuedAt) && Number.isSafeInteger(value.expiresAt) && value.issuedAt < value.expiresAt && value.expiresAt - value.issuedAt <= 86400000);
      return clone(value);
    }
    function readHead(raw) { return raw ? metadata(unpack(raw)) : null; }
    function head() { return readHead(properties.getProperty(ACTIVE)); }
    function validateSnapshot(record) {
      assert(record && typeof record === 'object' && record.body && record.body.schema === 1 && record.body.question);
      var q = record.body.question;
      assert(typeof q.questionId === 'string' && typeof q.setId === 'string' && typeof q.version === 'string' && ID.test(q.questionId) && ID.test(q.setId) && ID.test(q.version) && record.questionId === q.questionId && record.version === q.version &&
        record.recordKey === q.version + '/' + q.questionId && record.groupKey === q.version + '/' + q.setId && record.actorKey === '' && record.requestId === '' && record.seq === 0 &&
        typeof record.at === 'string' && Number.isFinite(Date.parse(record.at)) && HASH.test(record.payloadHash) && record.payloadHash === hash(T.canonical(record.body)));
      assert(typeof q.prompt === 'string' && q.prompt.length <= 200000 && typeof q.templateCode === 'string' && q.templateCode.length <= 200000 && typeof q.setupCode === 'string' && q.setupCode.length <= 200000 &&
        typeof q.title === 'string' && q.title.length <= 300 && ['code', 'observation'].indexOf(q.kind) >= 0 && Array.isArray(record.body.ranges) && record.body.rules && typeof record.body.rules === 'object' && typeof record.body.graded === 'boolean');
      return clone(record);
    }
    function snapshotsByGroup(records) {
      assert(Array.isArray(records) && records.length <= 5000);
      var groups = Object.create(null), keys = Object.create(null);
      records.forEach(function (value) {
        var r = validateSnapshot(value), key = r.recordKey;
        assert(!keys[key]); keys[key] = true;
        (groups[r.groupKey] || (groups[r.groupKey] = [])).push(r);
      });
      Object.keys(groups).forEach(function (key) { groups[key].sort(function (a, b) { return a.questionId.localeCompare(b.questionId); }); });
      return groups;
    }
    function validateAssignments(values, groups) {
      assert(Array.isArray(values) && values.length <= 100);
      var seen = Object.create(null);
      return values.map(function (p) {
        only(p, ['assignmentId', 'year', 'grades', 'setId', 'version', 'startsAt', 'dueAt', 'closesAt', 'enabled', 'official']);
        assert(typeof p.assignmentId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(p.assignmentId) && typeof p.setId === 'string' && typeof p.version === 'string' && ID.test(p.setId) && ID.test(p.version) && Number.isInteger(p.year) && p.year >= 2026 && p.year <= 2200 &&
          Array.isArray(p.grades) && p.grades.length > 0 && p.grades.length <= 6 && p.grades.every(function (g, i) { return Number.isInteger(g) && g >= 1 && g <= 6 && p.grades.indexOf(g) === i; }) &&
          ['startsAt', 'dueAt', 'closesAt'].every(function (name) { return typeof p[name] === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p[name]) && Number.isFinite(Date.parse(p[name])) && new Date(p[name]).toISOString() === p[name]; }) &&
          p.startsAt <= p.dueAt && p.dueAt <= p.closesAt && typeof p.enabled === 'boolean' && typeof p.official === 'boolean' && (!p.official || p.enabled));
        var key = [p.year, p.assignmentId, p.version].join('/'); assert(!seen[key]); seen[key] = true;
        assert(groups[p.version + '/' + p.setId] && groups[p.version + '/' + p.setId].length, 'packages_snapshot_missing');
        return clone(p);
      }).sort(function (a, b) { return T.canonical(a).localeCompare(T.canonical(b)); });
    }
    function validateActors(values) {
      assert(values && Object.prototype.toString.call(values) === '[object Object]' && Object.keys(values).length <= 5000);
      var result = Object.create(null);
      Object.keys(values).sort().forEach(function (key) {
        var a = values[key]; only(a, ['grade', 'teacher']);
        assert(HASH.test(key) && typeof a.teacher === 'boolean' && (Number.isInteger(a.grade) && a.grade >= 1 && a.grade <= 6 || a.teacher && a.grade === null));
        result[key] = { grade: a.grade, teacher: a.teacher };
      }); return result;
    }
    function validateRegistry(values, actors) {
      assert(Array.isArray(values) && values.length <= 5000);
      var seen = Object.create(null), ids = Object.create(null);
      return values.map(function (entry) {
        only(entry, ['account', 'spreadsheetId']);
        var account = T.normalizeAccount(entry.account);
        assert(account === entry.account && typeof entry.spreadsheetId === 'string' && /^[A-Za-z0-9_-]{20,160}$/.test(entry.spreadsheetId) && actors[T.actorKey(account)] && !seen[account] && !ids[entry.spreadsheetId]);
        seen[account] = true; ids[entry.spreadsheetId] = true;
        return { account: account, spreadsheetId: entry.spreadsheetId };
      }).sort(function (a, b) { return a.account.localeCompare(b.account); });
    }
    function normalize(input, old) {
      only(input, ['snapshots', 'assignments', 'actors', 'registry']);
      var before = snapshotsByGroup(old ? old.snapshots : []), incoming = snapshotsByGroup(input.snapshots);
      Object.keys(incoming).forEach(function (key) {
        if (before[key]) {
          var signatures = function (records) { return T.canonical(records.map(function (r) { return [r.questionId, r.payloadHash]; })); };
          assert(signatures(before[key]) === signatures(incoming[key]), 'packages_conflict');
        } else before[key] = incoming[key];
      });
      var all = [];
      Object.keys(before).sort().forEach(function (key) { all = all.concat(before[key]); });
      assert(all.length <= 5000);
      snapshotsByGroup(all);
      var actors = validateActors(input.actors);
      return { schema: 1, snapshots: all, assignments: validateAssignments(input.assignments, before), actors: actors, registry: validateRegistry(input.registry, actors) };
    }
    function validateStored(data) {
      only(data, ['schema', 'snapshots', 'assignments', 'actors', 'registry']); assert(data.schema === 1);
      return normalize({ snapshots: data.snapshots, assignments: data.assignments, actors: data.actors, registry: data.registry }, null);
    }
    function readGeneration(all, meta, fresh) {
      assert(meta, 'packages_unavailable');
      if (fresh) assert(meta.issuedAt <= now() + 30000 && meta.expiresAt > now(), 'packages_expired');
      var raw = all[base(meta.generation) + 'MANIFEST'];
      assert(typeof raw === 'string' && hash(raw) === meta.manifestHash);
      var m = unpack(raw);
      only(m, ['schema', 'generation', 'issuedAt', 'expiresAt', 'payloadHash', 'compressedHash', 'compressedLength', 'parts', 'previousGeneration']);
      assert(m.schema === 1 && m.generation === meta.generation && m.payloadHash === meta.payloadHash && m.issuedAt === meta.issuedAt && m.expiresAt === meta.expiresAt &&
        (m.previousGeneration === null || GENERATION.test(m.previousGeneration) && m.previousGeneration !== meta.generation) && Number.isSafeInteger(m.parts) && m.parts >= 1 && m.parts <= 64 && Number.isSafeInteger(m.compressedLength) && m.compressedLength > 0 && m.compressedLength <= BUDGET && HASH.test(m.compressedHash));
      var text = '';
      for (var i = 0; i < m.parts; i++) { var part = all[partKey(meta.generation, i)]; assert(typeof part === 'string' && part.length > 0 && part.length <= CHUNK && /^[A-Za-z0-9+/=]+$/.test(part)); text += part; }
      assert(text.length === m.compressedLength && hash(text) === m.compressedHash);
      var json;
      try { json = expanded(text); } catch (ignored) { fail('packages_invalid'); }
      assert(typeof json === 'string' && json.length <= MAX_TEXT && hash(json) === meta.payloadHash);
      var data;
      try { data = JSON.parse(json); } catch (ignored) { fail('packages_invalid'); }
      return validateStored(data);
    }
    function open(options) {
      options = options || {};
      var all = properties.getProperties(), raw = all[ACTIVE], meta = readHead(raw);
      assert(meta, 'packages_unavailable');
      if (options.expectedGeneration !== undefined) assert(meta.generation === options.expectedGeneration, 'packages_stale');
      var data = readGeneration(all, meta, true);
      assert(properties.getProperty(ACTIVE) === raw, 'packages_stale');
      return { meta: clone(meta), assignments: clone(data.assignments), actors: clone(data.actors), registry: clone(data.registry),
        findSnapshot: function (q) { var row = data.snapshots.find(function (r) { return q && r.questionId === q.questionId && r.version === q.version; }); return row ? clone(row) : null; },
        snapshots: function (setId, version) { return data.snapshots.filter(function (r) { return r.body.question.setId === setId && r.version === version; }).map(clone); } };
    }
    function size(all) { return Object.keys(all).reduce(function (sum, key) { return sum + bytes(key) + bytes(String(all[key])); }, 0); }
    function collectGarbage(raw, all) {
      if (!raw) return;
      try {
        var active = readHead(raw), manifestRaw = all[base(active.generation) + 'MANIFEST'];
        assert(typeof manifestRaw === 'string' && hash(manifestRaw) === active.manifestHash);
        var manifest = unpack(manifestRaw), keep = [active.generation, manifest.previousGeneration];
        Object.keys(all).forEach(function (key) {
          var match = /^TOOLS_GRADING_V1_G_([a-f0-9]{32})_(?:MANIFEST|P_\d{3})$/.exec(key);
          if (!match || keep.indexOf(match[1]) >= 0) return;
          assert(properties.getProperty(ACTIVE) === raw, 'packages_stale');
          properties.deleteProperty(key);
        });
      } catch (ignored) { /* GC失敗は次回再試行。現行/直前世代は削除しない。容量計算は残存分も含める。 */ }
    }
    function publish(input, options) {
      options = options || {};
      var lock = dep.lock ? dep.lock() : LockService.getScriptLock();
      assert(lock.tryLock(5000), 'packages_busy');
      var staged = [], nextRaw = '', oldRaw;
      try {
        var all = properties.getProperties(); oldRaw = all[ACTIVE] || null;
        var current = readHead(oldRaw);
        if (Object.prototype.hasOwnProperty.call(options, 'expectedGeneration')) assert((current ? current.generation : null) === options.expectedGeneration, 'packages_stale');
        var old = current ? readGeneration(all, current, false) : null;
        collectGarbage(oldRaw, all); all = properties.getProperties();
        assert((all[ACTIVE] || null) === oldRaw, 'packages_stale');
        var data = normalize(input, old), json = T.canonical(data);
        assert(json.length <= MAX_TEXT, 'packages_capacity');
        var packed = compressed(json);
        assert(typeof packed === 'string' && packed.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(packed), 'packages_invalid');
        var issuedAt = now(), expiresAt = options.expiresAt === undefined ? issuedAt + 7200000 : options.expiresAt;
        assert(Number.isSafeInteger(expiresAt) && expiresAt > issuedAt && expiresAt - issuedAt <= 86400000, 'packages_invalid');
        var generation = dep.uuid ? dep.uuid() : Utilities.getUuid().replace(/-/g, '').toLowerCase();
        assert(GENERATION.test(generation) && !Object.keys(all).some(function (key) { return key.indexOf(base(generation)) === 0; }));
        var m = { schema: 1, generation: generation, issuedAt: issuedAt, expiresAt: expiresAt, payloadHash: hash(json), compressedHash: hash(packed), compressedLength: packed.length, parts: Math.ceil(packed.length / CHUNK), previousGeneration: current ? current.generation : null };
        assert(m.parts <= 64, 'packages_capacity');
        var manifest = pack(m), meta = { schema: 1, generation: generation, issuedAt: issuedAt, expiresAt: expiresAt, payloadHash: m.payloadHash, manifestHash: hash(manifest) };
        nextRaw = pack(meta);
        var newValues = {}; newValues[base(generation) + 'MANIFEST'] = manifest;
        for (var i = 0; i < m.parts; i++) newValues[partKey(generation, i)] = packed.slice(i * CHUNK, (i + 1) * CHUNK);
        Object.keys(newValues).forEach(function (key) { assert(bytes(newValues[key]) < 8000, 'packages_capacity'); });
        assert(bytes(nextRaw) < 8000, 'packages_capacity');
        var projected = Object.assign({}, all, newValues);
        assert(size(projected) <= BUDGET && size(Object.assign({}, projected, (function () { var v = {}; v[ACTIVE] = nextRaw; return v; }()))) <= BUDGET, 'packages_capacity');
        Object.keys(newValues).forEach(function (key) { staged.push(key); properties.setProperty(key, newValues[key]); });
        var check = readGeneration(properties.getProperties(), meta, true);
        assert(T.canonical(check) === json);
        if (options.beforeCommit) options.beforeCommit();
        assert((properties.getProperty(ACTIVE) || null) === oldRaw, 'packages_stale');
        properties.setProperty(ACTIVE, nextRaw);
        assert(properties.getProperty(ACTIVE) === nextRaw, 'packages_write_uncertain');
        var committedData = properties.getProperties(); readGeneration(committedData, meta, true);
        collectGarbage(nextRaw, committedData);
        return clone(meta);
      } catch (error) {
        var observed;
        try { observed = properties.getProperty(ACTIVE); } catch (ignored) { /* 成否不明なら新世代を削除しない。 */ }
        if (nextRaw && observed === nextRaw) {
          var committed = readHead(nextRaw), committedValues = properties.getProperties(); readGeneration(committedValues, committed, true); collectGarbage(nextRaw, committedValues); return clone(committed);
        }
        if ((observed || null) === oldRaw) staged.forEach(function (key) { try { properties.deleteProperty(key); } catch (ignored) { /* 現行は保持する。 */ } });
        if (error && error.toolsStoreCode) throw error;
        fail('packages_write_uncertain');
      } finally { lock.releaseLock(); }
    }
    return Object.freeze({ publish: publish, open: open, head: head });
  }
  return Object.freeze({ create: create, keys: Object.freeze({ prefix: PREFIX, active: ACTIVE }), limits: Object.freeze({ value: 8000, total: BUDGET, text: MAX_TEXT }) });
}());
