// 最新版は4固定行の二重化ブロック。履歴本文は初回・間隔・競合解決時だけ追記する。
// 教員限定の構成変更はdistへ集約するため、ここではシート/行/保護を追加しない。
var ToolsStoreRepository = (function () {
  'use strict';
  function create(book, dependencies) {
    var dep = dependencies || {}, T = ToolsStoreContract, C = T.constants;
    var sheet = book.getSheetByName(C.SHEET), historySheet = book.getSheetByName(C.HISTORY);
    function assertion(condition, code) { T.assert(condition, code || 'storage_corrupt'); }
    function uuid() { return dep.uuid ? dep.uuid() : Utilities.getUuid().replace(/-/g, '').toLowerCase(); }
    function now() { return dep.now ? dep.now() : Date.now(); }
    function flush() { if (dep.flush) dep.flush(); else SpreadsheetApp.flush(); }
    function keyOf(q) { return 'k:' + T.hash(T.canonical([q.questionId, q.version])); }
    function historyKey(key, revision) { return 'h:' + T.hash(key + '/' + revision); }
    function pack(meta) {
      var text = T.canonical(meta);
      var value = 'j:' + T.canonical({ body: meta, digest: T.hash(text) });
      assertion(value.length < C.CHUNK, 'metadata_too_large'); return value;
    }
    function unpack(value) {
      if (typeof value !== 'string' || value.slice(0, 2) !== 'j:') return null;
      try {
        var parsed = JSON.parse(value.slice(2));
        return parsed && parsed.body && T.hash(T.canonical(parsed.body)) === parsed.digest ? parsed.body : null;
      } catch (ignored) { return null; }
    }
    function parts(text) {
      var result = [], cursor = 0;
      for (var i = 0; i < C.PARTS; i++) {
        var end = Math.min(cursor + C.CHUNK, text.length);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(end))) end--;
        result.push(cursor < end ? 'j:' + text.slice(cursor, end) : ''); cursor = end;
      }
      assertion(cursor === text.length, 'payload_too_large'); return result;
    }
    function join(values) {
      var text = '', ended = false;
      for (var i = 0; i < values.length; i++) {
        if (values[i] === '') { ended = true; continue; }
        assertion(!ended && typeof values[i] === 'string' && values[i].slice(0, 2) === 'j:'); text += values[i].slice(2);
      }
      return text;
    }
    function metadata(draft) {
      var value = {};
      ['questionId', 'version', 'setId', 'title', 'folder', 'revision', 'seq', 'updatedAt', 'codeHash', 'stdinHash', 'clientId', 'requestId', 'requestHash'].forEach(function (name) { value[name] = draft[name]; });
      return value;
    }
    function dataRecord(draft, key, kind) {
      return { schemaVersion: C.SCHEMA_VERSION, kind: kind || 'data', key: key,
        draft: metadata(draft), codeLength: draft.code.length, stdinLength: draft.stdin.length };
    }
    function dataRow(record, draft) { return [record.key, record.kind, pack(record), 'j:' + draft.folder].concat(parts(draft.code), parts(draft.stdin)); }
    function decodeData(values, key, expectedKind, metaOnly) {
      var record = unpack(values[2]);
      if (!record || record.schemaVersion !== C.SCHEMA_VERSION || record.kind !== expectedKind || values[0] !== key || values[1] !== expectedKind || record.key !== key) return null;
      var d = record.draft;
      if (!d || values[3] !== 'j:' + d.folder) return null;
      if (!d || !/^[a-f0-9]{32}$/.test(d.revision) || !Number.isSafeInteger(d.seq) || d.seq < 1 || !/^[a-f0-9]{64}$/.test(d.codeHash) || !/^[a-f0-9]{64}$/.test(d.stdinHash) || !/^[a-f0-9]{32}$/.test(d.requestId) || !/^[a-f0-9]{64}$/.test(d.requestHash)) return null;
      if (!Number.isSafeInteger(record.codeLength) || record.codeLength < 0 || record.codeLength > C.MAX_TEXT || !Number.isSafeInteger(record.stdinLength) || record.stdinLength < 0 || record.stdinLength > C.MAX_TEXT) return null;
      if (expectedKind === 'data' && keyOf(d) !== key || expectedKind === 'checkpoint' && historyKey(keyOf(d), d.revision) !== key) return null;
      var result = { record: record, hash: T.hash(T.canonical(record)), draft: Object.assign({}, d) };
      if (!metaOnly) {
        try { result.draft.code = join(values.slice(4, 9)); result.draft.stdin = join(values.slice(9, 14)); }
        catch (ignored) { return null; }
        if (result.draft.code.length !== record.codeLength || result.draft.stdin.length !== record.stdinLength || T.hash(result.draft.code) !== d.codeHash || T.hash(result.draft.stdin) !== d.stdinHash) return null;
      }
      return result;
    }
    function blockFrom(values, key, metaOnly) {
      var candidates = [];
      for (var slot = 0; slot < 2; slot++) {
        var commit = unpack(values[slot][2]);
        if (!commit || values[slot][0] !== key || values[slot][1] !== 'commit' || commit.kind !== 'commit' || commit.key !== key || commit.schemaVersion !== C.SCHEMA_VERSION || (commit.bank !== 0 && commit.bank !== 1) || !Array.isArray(commit.receipts) || commit.receipts.length > C.RECENT || !Array.isArray(commit.history) || commit.history.length > 32) continue;
        var data = decodeData(values[2 + commit.bank], key, 'data', metaOnly);
        if (!data || values[slot][3] !== 'j:' + data.draft.folder || commit.dataHash !== data.hash || commit.seq !== data.draft.seq || commit.revision !== data.draft.revision) continue;
        candidates.push({ slot: slot, commit: commit, data: data });
      }
      candidates.sort(function (a, b) { return b.commit.seq - a.commit.seq; });
      if (candidates.length > 1 && candidates[0].commit.seq === candidates[1].commit.seq) assertion(T.canonical(candidates[0].commit) === T.canonical(candidates[1].commit));
      return { current: candidates[0] || null, values: values };
    }
    function readBlock(row, key) { var result = blockFrom(sheet.getRange(row, 1, C.BLOCK, C.HEADERS.length).getValues(), key, false); result.row = row; return result; }
    function findBlock(key, allocate) {
      var hits = sheet.getRange(2, 1, C.DRAFT_ROWS - 1, 1).createTextFinder(key).matchEntireCell(true).useRegularExpression(false).findAll();
      var blocks = {};
      hits.forEach(function (range) { blocks[2 + Math.floor((range.getRow() - 2) / C.BLOCK) * C.BLOCK] = true; });
      var rows = Object.keys(blocks).map(Number);
      assertion(rows.length <= 1);
      if (rows.length) return readBlock(rows[0], key);
      if (!allocate) return null;
      var keys = sheet.getRange(2, 1, C.DRAFT_ROWS - 1, 1).getValues();
      for (var i = 0; i < keys.length; i += C.BLOCK) {
        if (!keys.slice(i, i + C.BLOCK).every(function (r) { return r[0] === ''; })) continue;
        var empty = readBlock(2 + i, key);
        assertion(empty.values.every(function (r) { return r.every(function (v) { return v === ''; }); }));
        return empty;
      }
      T.fail('storage_full', '保存先の構成更新が必要です。先生へ連絡してください。');
    }
    function verifyWrite(target, row, values, check) {
      var error;
      if (dep.recheck) dep.recheck();
      try { target.getRange(row, 1, 1, C.HEADERS.length).setNumberFormat('@').setValues([values]); flush(); }
      catch (caught) { error = caught; }
      if (dep.recheck) dep.recheck();
      try { if (check(target.getRange(row, 1, 1, C.HEADERS.length).getValues()[0])) return; }
      catch (ignored) { /* 読み戻しできない場合も未保存とは断定しない。 */ }
      if (error && error.toolsStoreCode) throw error;
      T.fail('storage_write_uncertain', '保存結果を確認できません。同じ要求を再照会してください。');
    }
    function checkpoint(key, draft, previous) {
      var existing = previous.find(function (entry) { return entry.revision === draft.revision; });
      if (existing) {
        var known = decodeData(historySheet.getRange(existing.row, 1, 1, C.HEADERS.length).getValues()[0], historyKey(key, draft.revision), 'checkpoint', false);
        assertion(known && T.canonical(metadata(known.draft)) === T.canonical(metadata(draft)));
        return existing;
      }
      var hkey = historyKey(key, draft.revision), last = historySheet.getLastRow();
      var start = Math.max(2, last - 15);
      if (last >= 2) {
        var tail = historySheet.getRange(start, 1, last - start + 1, C.HEADERS.length).getValues();
        for (var i = 0; i < tail.length; i++) {
          if (tail[i][0] !== hkey) continue;
          var found = decodeData(tail[i], hkey, 'checkpoint', false);
          if (found && T.canonical(metadata(found.draft)) === T.canonical(metadata(draft))) return Object.assign({ row: start + i }, metadata(draft));
        }
      }
      var row = last + 1;
      assertion(row <= C.HISTORY_ROWS, 'history_full');
      var record = dataRecord(draft, hkey, 'checkpoint');
      verifyWrite(historySheet, row, dataRow(record, draft), function (values) {
        var saved = decodeData(values, hkey, 'checkpoint', false);
        return saved && T.canonical(saved.draft) === T.canonical(draft);
      });
      return Object.assign({ row: row }, metadata(draft));
    }
    function getDraft(q) {
      var key = keyOf(q), block = findBlock(key, false);
      if (!block) return { draft: null, history: [] };
      assertion(block.current, 'storage_incomplete');
      var c = block.current;
      if (!q.revision || q.revision === c.data.draft.revision) return { draft: c.data.draft, history: c.commit.history.slice().reverse() };
      assertion(/^[a-f0-9]{32}$/.test(q.revision), 'invalid_request');
      var hkey = historyKey(key, q.revision), entry = c.commit.history.find(function (r) { return r.revision === q.revision; });
      var rows = entry ? [entry.row] : historySheet.getRange(2, 1, C.HISTORY_ROWS - 1, 1).createTextFinder(hkey).matchEntireCell(true).useRegularExpression(false).findAll().map(function (r) { return r.getRow(); });
      var drafts = rows.map(function (row) { return decodeData(historySheet.getRange(row, 1, 1, C.HEADERS.length).getValues()[0], hkey, 'checkpoint', false); }).filter(Boolean);
      assertion(drafts.length > 0, 'revision_not_found');
      assertion(drafts.every(function (d) { return T.canonical(d.draft) === T.canonical(drafts[0].draft); }));
      return { draft: drafts[0].draft, history: c.commit.history.slice().reverse() };
    }
    function listDrafts() {
      var rows = sheet.getRange(2, 1, C.DRAFT_ROWS - 1, 4).getValues(), result = [];
      for (var i = 0; i < rows.length; i += C.BLOCK) {
        var group = rows.slice(i, i + C.BLOCK), keys = group.map(function (r) { return r[0]; }).filter(Boolean);
        if (!keys.length) continue;
        assertion(keys.every(function (key) { return key === keys[0]; }));
        var block = blockFrom(group, keys[0], true);
        assertion(block.current, 'storage_incomplete'); result.push(metadata(block.current.data.draft));
      }
      return { drafts: result };
    }
    function receiptResult(receipt, duplicate) {
      return { state: 'saved', draft: Object.assign({}, receipt), receipt: { requestId: receipt.requestId, requestHash: receipt.requestHash }, duplicate: !!duplicate };
    }
    function lookupSave(input) {
      // 最新固定ブロックだけを検索。履歴全文の全走査は行わない。
      var matches = sheet.getRange(2, 3, C.DRAFT_ROWS - 1, 1).createTextFinder(input.requestId).matchEntireCell(false).useRegularExpression(false).findAll();
      var seen = {}, receipts = [];
      matches.forEach(function (range) {
        var row = 2 + Math.floor((range.getRow() - 2) / C.BLOCK) * C.BLOCK;
        if (seen[row]) return; seen[row] = true;
        var values = sheet.getRange(row, 1, C.BLOCK, 4).getValues();
        var key = values.map(function (r) { return r[0]; }).find(Boolean);
        var block = blockFrom(values, key, true);
        if (!block.current) return;
        block.current.commit.receipts.forEach(function (r) { if (r.requestId === input.requestId) receipts.push(r); });
      });
      assertion(receipts.length <= 1);
      return receipts.length ? receiptResult(receipts[0], true) : { state: 'missing' };
    }
    function saveDraft(input) {
      var requestHash = T.hash(T.canonical(input));
      var known = lookupSave(input);
      if (known.state === 'saved') {
        assertion(known.draft.questionId === input.questionId && known.draft.version === input.version && known.draft.requestHash === requestHash, 'request_reused');
        return known;
      }
      var key = keyOf(input), block = findBlock(key, true), current = block.current;
      if (current) {
        var prior = current.commit.receipts.find(function (r) { return r.requestId === input.requestId; });
        if (prior) { assertion(prior.requestHash === requestHash, 'request_reused'); return receiptResult(prior, true); }
      }
      if (!current && block.values.some(function (r) { return r.some(function (v) { return v !== ''; }); })) {
        // commitが1つも書かれていない初回の途中データは安全に再準備できる。
        // 既存commitがあるのに本文が読めない場合は、破損を新規保存として扱わない。
        var noCommit = block.values.slice(0, 2).every(function (r) { return r.every(function (v) { return v === ''; }); });
        var incompleteRows = block.values.slice(2).filter(function (r) { return r.some(function (v) { return v !== ''; }); });
        assertion(noCommit && incompleteRows.length === 1 && incompleteRows[0][0] === key && (incompleteRows[0][1] === '' || incompleteRows[0][1] === 'data'), 'storage_incomplete');
      }
      if (input.expectedRevision !== (current ? current.data.draft.revision : null)) return { state: 'conflict', draft: current ? current.data.draft : null };
      var seq = current ? current.data.draft.seq + 1 : 1;
      assertion(Number.isSafeInteger(seq) && seq <= 1000000000, 'storage_full');
      var draft = { questionId: input.questionId, version: input.version, setId: input.setId, title: input.title, folder: input.folder,
        code: input.code, stdin: input.stdin, revision: uuid(), seq: seq, updatedAt: new Date(now()).toISOString(),
        codeHash: T.hash(input.code), stdinHash: T.hash(input.stdin), clientId: input.clientId, requestId: input.requestId, requestHash: requestHash };
      var bank = current ? 1 - current.commit.bank : 0, slot = current ? 1 - current.slot : 0;
      var prepared = decodeData(block.values[2 + bank], key, 'data', false);
      if (prepared && prepared.draft.seq === seq && prepared.draft.requestId === input.requestId && prepared.draft.requestHash === requestHash) draft = prepared.draft;
      var history = current ? current.commit.history.slice() : [], checkpointAt = current ? current.commit.checkpointAt : 0, savedCheckpoint;
      if (!current) {
        savedCheckpoint = checkpoint(key, draft, history); history.push(savedCheckpoint); checkpointAt = now();
      } else if (input.preserveRevision || current.data.draft.clientId !== input.clientId || now() - checkpointAt >= C.CHECKPOINT_MS) {
        assertion(!input.preserveRevision || input.preserveRevision === current.data.draft.revision, 'invalid_request');
        savedCheckpoint = checkpoint(key, current.data.draft, history);
        if (!history.some(function (r) { return r.revision === savedCheckpoint.revision; })) history.push(savedCheckpoint);
        checkpointAt = now();
      }
      history = history.slice(-32);
      var record = dataRecord(draft, key, 'data');
      verifyWrite(sheet, block.row + 2 + bank, dataRow(record, draft), function (values) {
        var saved = decodeData(values, key, 'data', false);
        return saved && T.canonical(saved.draft) === T.canonical(draft);
      });
      var receipts = (current ? current.commit.receipts : []).concat([metadata(draft)]).slice(-C.RECENT);
      var commit = { schemaVersion: C.SCHEMA_VERSION, kind: 'commit', key: key, bank: bank, revision: draft.revision, seq: draft.seq,
        dataHash: T.hash(T.canonical(record)), checkpointAt: checkpointAt, history: history, receipts: receipts };
      var row = [key, 'commit', pack(commit), 'j:' + draft.folder];
      while (row.length < C.HEADERS.length) row.push('');
      verifyWrite(sheet, block.row + slot, row, function (values) { var saved = unpack(values[2]); return values[0] === key && values[1] === 'commit' && values[3] === 'j:' + draft.folder && saved && T.canonical(saved) === T.canonical(commit); });
      var confirmed = readBlock(block.row, key);
      assertion(confirmed.current && confirmed.current.commit.revision === draft.revision, 'storage_write_uncertain');
      var result = { state: 'saved', draft: confirmed.current.data.draft, receipt: { requestId: input.requestId, requestHash: requestHash } };
      if (savedCheckpoint) result.checkpoint = savedCheckpoint;
      return result;
    }
    return Object.freeze({ listDrafts: listDrafts, getDraft: getDraft, saveDraft: saveDraft, lookupSave: lookupSave });
  }
  return Object.freeze({ create: create });
}());
