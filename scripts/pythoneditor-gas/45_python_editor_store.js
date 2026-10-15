// GSSだけにテキスト保存。コードをDriveファイルや旧「提出ログ」に複製しない。
var PythonEditorStore = (function () {
  var NAMES = { snapshots: 'Python採用版', drafts: 'Python下書き履歴', requests: 'Python提出受付', results: 'Python提出結果' };
  var HEADERS = ['recordKey', 'groupKey', 'actorKey', 'questionId', 'version', 'requestId', 'seq', 'at', 'sha256', 'metaJson'];
  for (var i = 1; i <= 24; i++) HEADERS.push('text' + ('0' + i).slice(-2));
  var MAX_ROWS = 100000;
  function create(c, dependencies) {
    var dep = dependencies || {}, book = dep.book || SpreadsheetApp.openById(c.storageSpreadsheetId), tables = {};
    var hash = dep.hash || PythonEditor.hashText;
    function locked(fn) {
      var lock = dep.lock ? dep.lock() : LockService.getScriptLock();
      PythonEditor.assert(lock.tryLock(20000), 'busy');
      try { return fn(); } finally { lock.releaseLock(); }
    }
    function table(name) {
      if (tables[name]) return tables[name];
      var sheet = book.getSheetByName(NAMES[name]);
      PythonEditor.assert(sheet && sheet.getLastRow() >= 1 && sheet.getLastRow() <= MAX_ROWS && sheet.getLastColumn() === HEADERS.length, 'storage_not_ready');
      var header = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
      PythonEditor.assert(header.every(function (v, i) { return v === HEADERS[i]; }), 'storage_not_ready');
      tables[name] = sheet; return sheet;
    }
    function matches(name, column, value) {
      var t = table(name), size = t.getLastRow() - 1;
      if (!size) return [];
      PythonEditor.assert(size < MAX_ROWS, 'storage_full');
      return t.getRange(2, column, size, 1).createTextFinder(String(value)).matchEntireCell(true).useRegularExpression(false).findAll().map(function (cell) { return cell.getRow(); });
    }
    function decode(values, metaOnly) {
      var meta;
      try { meta = JSON.parse(values[9]); } catch (e) { PythonEditor.fail('storage_ambiguous'); }
      PythonEditor.assert(meta && values[0] === meta.recordKey && values[1] === meta.groupKey && values[2] === meta.actorKey &&
        values[3] === meta.questionId && values[4] === meta.version && values[5] === (meta.requestId || '') &&
        String(values[6]) === String(meta.seq || 0) && values[7] === meta.at && PythonEditor.HASH.test(values[8]), 'storage_ambiguous');
      if (metaOnly) return meta;
      var bodyText = '';
      values.slice(10).forEach(function (part) {
        PythonEditor.assert(part === '' || typeof part === 'string' && part.slice(0, 2) === 'j:', 'storage_ambiguous');
        bodyText += part ? part.slice(2) : '';
      });
      try { meta.body = JSON.parse(bodyText); } catch (e) { PythonEditor.fail('storage_ambiguous'); }
      PythonEditor.assert(hash(PythonEditor.canonical(meta)) === values[8], 'storage_ambiguous');
      return meta;
    }
    function read(name, row) { return decode(table(name).getRange(row, 1, 1, HEADERS.length).getValues()[0], false); }
    function readRows(name, rows) {
      var result = [], sorted = rows.slice().sort(function (a, b) { return a - b; });
      for (var i = 0; i < sorted.length;) {
        var end = i;
        while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1 && end - i < 199) end++;
        var values = table(name).getRange(sorted[i], 1, end - i + 1, HEADERS.length).getValues();
        values.forEach(function (row) { result.push(decode(row, false)); }); i = end + 1;
      }
      return result;
    }
    function find(name, key) {
      var rows = matches(name, 1, key);
      PythonEditor.assert(rows.length <= 1, 'storage_ambiguous');
      return rows.length ? read(name, rows[0]) : null;
    }
    function group(name, groupKey) {
      var rows = matches(name, 2, groupKey);
      PythonEditor.assert(rows.length <= 2000, 'storage_full');
      return readRows(name, rows);
    }
    function append(name, record) {
      var t = table(name), number = t.getLastRow() + 1;
      PythonEditor.assert(number <= MAX_ROWS, 'storage_full');
      var bodyText = PythonEditor.canonical(record.body), meta = Object.assign({}, record);
      delete meta.body;
      PythonEditor.assert(bodyText.length <= PythonEditor.LIMITS.payload && PythonEditor.canonical(meta).length < 40000, 'payload_too_large');
      var row = [record.recordKey, record.groupKey, record.actorKey, record.questionId, record.version, record.requestId || '',
        record.seq || 0, record.at, hash(PythonEditor.canonical(record)), PythonEditor.canonical(meta)];
      var cursor = 0;
      for (var i = 0; i < PythonEditor.LIMITS.parts; i++) {
        var end = Math.min(cursor + PythonEditor.LIMITS.chunk, bodyText.length);
        // UTF-16サロゲート対を別セルに分断せず、Sheetsとの往復で文字を欠損させない。
        if (end < bodyText.length && /[\uD800-\uDBFF]/.test(bodyText.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(bodyText.charAt(end))) end--;
        var part = bodyText.slice(cursor, end); cursor = end;
        // j:により、分割位置が「=」になってもSheetsの数式として評価されない。
        row.push(part ? 'j:' + part : '');
      }
      PythonEditor.assert(cursor === bodyText.length, 'payload_too_large');
      if (number > t.getMaxRows()) {
        var extra = Math.min(500, MAX_ROWS - t.getMaxRows());
        var cells = book.getSheets().reduce(function (n, s) { return n + s.getMaxRows() * s.getMaxColumns(); }, 0);
        PythonEditor.assert(extra > 0 && cells + extra * HEADERS.length <= 10000000, 'storage_full');
        t.insertRowsAfter(t.getMaxRows(), extra);
      }
      var range = t.getRange(number, 1, 1, HEADERS.length);
      try {
        range.setNumberFormat('@'); range.setValues([row]);
        if (dep.flush) dep.flush(); else SpreadsheetApp.flush();
        var saved = read(name, number);
        PythonEditor.assert(PythonEditor.canonical(saved) === PythonEditor.canonical(record), 'storage_write_failed');
        return saved;
      } catch (e) {
        // 書込後の応答消失を未保存と決めつけず、同じ不変行を照会する。
        var prior;
        try { prior = find(name, record.recordKey); } catch (ignored) { /* 不明なら元記録を残す */ }
        if (prior && PythonEditor.canonical(prior) === PythonEditor.canonical(record)) return prior;
        if (e.pythonEditorCode) throw e;
        PythonEditor.fail('storage_write_failed');
      }
    }
    function latestDraft(actorKey, q) {
      var rows = group('drafts', PythonEditor.draftGroup(actorKey, q)).sort(function (a, b) { return b.seq - a.seq; });
      PythonEditor.assert(rows.every(function (r, i) { return r.actorKey === actorKey && PythonEditor.key(r) === PythonEditor.key(q) && r.seq === rows.length - i; }), 'storage_ambiguous');
      return { draft: rows[0] || null, rows: rows };
    }
    function requestKey(actorKey, requestId) { return hash(actorKey + '/' + requestId); }
    return {
      findSnapshot: function (q) { return find('snapshots', PythonEditor.key(q)); },
      putSnapshots: function (records, recheck) {
        return locked(function () {
          recheck();
          // 全問の衝突を先に検査。失敗時は新しい版へ改める。既存版を更新しない。
          records.forEach(function (r) {
            var prior = find('snapshots', r.recordKey);
            PythonEditor.assert(!prior || prior.payloadHash === r.payloadHash, 'snapshot_conflict');
          });
          return records.map(function (r) { return find('snapshots', r.recordKey) || append('snapshots', r); });
        });
      },
      snapshots: function (setId, version) { return group('snapshots', version + '/' + setId); },
      draft: latestDraft,
      draftRevision: function (actorKey, q, revision) {
        var list = latestDraft(actorKey, q).rows;
        return list.find(function (r) { return r.revision === revision; }) || null;
      },
      listDrafts: function (actorKey) {
        var rows = matches('drafts', 3, actorKey), latest = {};
        // 一覧は本文を返さない。指定した問題を選んでから全文を取得する。
        rows.forEach(function (row) {
          var r = decode(table('drafts').getRange(row, 1, 1, 10).getValues()[0], true), key = PythonEditor.key(r);
          PythonEditor.assert(r.actorKey === actorKey, 'storage_ambiguous');
          if (!latest[key] || r.seq > latest[key].seq) latest[key] = r;
        });
        return Object.keys(latest).map(function (key) { return latest[key]; });
      },
      saveDraft: function (actorKey, input, at, recheck) {
        return locked(function () {
          recheck();
          var rk = requestKey(actorKey, input.requestId), payloadHash = hash(PythonEditor.canonical(input));
          var prior = find('drafts', rk), state = latestDraft(actorKey, input);
          if (prior) {
            PythonEditor.assert(prior.payloadHash === payloadHash, 'request_conflict');
            return { state: 'saved', draft: PythonEditor.publicDraft(prior), currentRevision: state.draft.revision };
          }
          if ((state.draft ? state.draft.revision : null) !== input.expectedRevision) return { state: 'conflict', draft: PythonEditor.publicDraft(state.draft) };
          var r = { recordKey: rk, groupKey: PythonEditor.draftGroup(actorKey, input), actorKey: actorKey,
            questionId: input.questionId, version: input.version, requestId: input.requestId, seq: state.rows.length + 1,
            revision: PythonEditor.uuid(), at: at, payloadHash: payloadHash, body: { code: input.code, stdin: input.stdin, parentRevision: input.expectedRevision } };
          var saved = append('drafts', r);
          return { state: 'saved', draft: PythonEditor.publicDraft(saved), currentRevision: saved.revision };
        });
      },
      findRequest: function (actorKey, requestId) { return find('requests', requestKey(actorKey, requestId)); },
      accept: function (actorKey, input, snapshot, policy, at, recheck) {
        return locked(function () {
          recheck();
          var rk = requestKey(actorKey, input.requestId), payloadHash = hash(PythonEditor.canonical(input)), prior = find('requests', rk);
          if (prior) { PythonEditor.assert(prior.payloadHash === payloadHash, 'request_conflict'); return prior; }
          var r = { recordKey: rk, groupKey: PythonEditor.gradeGroup(actorKey, policy, input.questionId), actorKey: actorKey,
            questionId: input.questionId, version: input.version, requestId: input.requestId, seq: table('requests').getLastRow(), at: at,
            policy: policy, snapshotHash: snapshot.payloadHash, payloadHash: payloadHash, body: input };
          return append('requests', r);
        });
      },
      requests: function (groupKey) { return group('requests', groupKey); },
      findResult: function (actorKey, requestId) { return find('results', requestKey(actorKey, requestId)); },
      finish: function (receipt, result, at, recheck) {
        return locked(function () {
          recheck();
          var request = find('requests', receipt.recordKey);
          PythonEditor.assert(request && PythonEditor.canonical(request) === PythonEditor.canonical(receipt), 'storage_ambiguous');
          var prior = find('results', receipt.recordKey);
          if (prior) {
            PythonEditor.assert(prior.payloadHash === receipt.payloadHash && prior.snapshotHash === receipt.snapshotHash, 'storage_ambiguous');
            return prior;
          }
          PythonEditor.assert(result && Number.isFinite(result.score) && result.score >= 0 && result.score <= 1 && Array.isArray(result.checks) && Array.isArray(result.diagnostics), 'grading_failed');
          // この一行が結果と再提出履歴の正本。別の最高点表への書込成功を提出完了の条件にしない。
          return append('results', { recordKey: receipt.recordKey, groupKey: receipt.groupKey, actorKey: receipt.actorKey,
            questionId: receipt.questionId, version: receipt.version, requestId: receipt.requestId, seq: receipt.seq, at: at,
            receivedAt: receipt.at, policy: receipt.policy, eligible: receipt.at <= receipt.policy.dueAt,
            snapshotHash: receipt.snapshotHash, payloadHash: receipt.payloadHash, body: result });
        });
      },
      results: function (groupKey) { return group('results', groupKey); },
      resultsForActor: function (actorKey) { return readRows('results', matches('results', 3, actorKey)); }
    };
  }
  return { create: create, names: NAMES, headers: HEADERS.slice() };
})();
