// 個人と教員中央で同じ不変提出行を使う。共有・保護・本人確認は呼出側が行う。
// ここではシート/行を増設しない。非公開採点基準やsnapshotは保存しない。
var ToolsSchoolTrialRepository = (function () {
  'use strict';
  var headers = ['recordKey', 'recordState', 'metaJson'];
  for (var i = 1; i <= 70; i++) headers.push('payload' + ('0' + i).slice(-2));
  var C = Object.freeze({ HEADERS: Object.freeze(headers), ROWS: 2049, CENTRAL_ROWS: 8193,
    MAX_BYTES: 2097152, CHUNK: 32000, PARTS: 70, SHEET: 'Python試用提出', CENTRAL: '試用提出' });
  function fail(code) { var error = new Error('試用提出の保存結果を確認できません。'); error.toolsTrialCode = code; throw error; }
  function assertion(condition, code) { if (!condition) fail(code || 'storage_corrupt'); }
  function create(book, dependencies) {
    var dep = dependencies || {}, T = typeof ToolsStoreContract === 'undefined' ? null : ToolsStoreContract;
    var canonical = dep.canonical || T && T.canonical;
    var hash = dep.hash || T && T.hash;
    var byteLength = dep.byteLength || function (text) { return Utilities.newBlob(text).getBytes().length; };
    var sheetName = dep.sheetName || C.SHEET, rows = dep.rows === undefined ? C.ROWS : dep.rows;
    assertion(typeof canonical === 'function' && typeof hash === 'function' && typeof dep.verifyReceipt === 'function', 'configuration_required');
    assertion(Number.isSafeInteger(rows) && rows >= 2, 'configuration_required');
    var sheet = book.getSheetByName(sheetName);
    function recheck() { if (dep.recheck) dep.recheck(); }
    function flush() { if (dep.flush) dep.flush(); else SpreadsheetApp.flush(); }
    function object(value) { return value && Object.prototype.toString.call(value) === '[object Object]'; }
    function encoded(value) { return 'j:' + value; }
    function keyOf(actorKey, requestId) {
      assertion(typeof actorKey === 'string' && /^[a-f0-9]{64}$/.test(actorKey) && typeof requestId === 'string' && /^[a-f0-9]{32}$/.test(requestId), 'invalid_request');
      return actorKey + '/' + requestId;
    }
    function text(value, code) {
      var result;
      try { result = canonical(value); assertion(typeof result === 'string'); JSON.parse(result); }
      catch (ignored) { fail(code || 'storage_corrupt'); }
      return result;
    }
    function clean(value, code) { return JSON.parse(text(value, code)); }
    function signed(receipt, key, code) {
      var valid = false;
      assertion(object(receipt) && typeof receipt.actorKey === 'string' && /^[a-f0-9]{64}$/.test(receipt.actorKey) &&
        typeof receipt.requestId === 'string' && /^[a-f0-9]{32}$/.test(receipt.requestId) &&
        typeof receipt.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(receipt.payloadHash), code);
      assertion(receipt.actorKey + '/' + receipt.requestId === key, code);
      try { valid = dep.verifyReceipt(receipt) === true; } catch (ignored) { /* 検証不能も採用しない。 */ }
      assertion(valid, code);
    }
    function layout() {
      assertion(sheet && sheet.getMaxRows() >= rows && sheet.getMaxColumns() >= C.HEADERS.length && sheet.getLastRow() <= rows, 'schema_mismatch');
      var range = sheet.getRange(1, 1, 1, C.HEADERS.length);
      assertion(text(range.getValues()[0]) === text(C.HEADERS) && range.getFormulas()[0].every(function (v) { return v === ''; }), 'schema_mismatch');
      return Math.max(1, sheet.getLastRow());
    }
    function valuesAt(row, width) {
      var range = sheet.getRange(row, 1, 1, width || C.HEADERS.length);
      assertion(range.getFormulas()[0].every(function (v) { return v === ''; }));
      return range.getValues()[0];
    }
    function index() {
      var last = layout(), map = Object.create(null);
      if (last >= 2) {
        var range = sheet.getRange(2, 1, last - 1, 1), keys = range.getValues(), formulas = range.getFormulas();
        for (var n = 0; n < keys.length; n++) {
          var key = keys[n][0];
          assertion(formulas[n][0] === '' && typeof key === 'string' && /^j:[a-f0-9]{64}\/[a-f0-9]{32}$/.test(key));
          assertion(map[key] === undefined);
          map[key] = n + 2;
        }
      }
      return { last: last, map: map };
    }
    function metadata(values, key) {
      assertion(values[0] === encoded(key) && (values[1] === 'j:pending' || values[1] === 'j:committed'));
      assertion(typeof values[2] === 'string' && values[2].slice(0, 2) === 'j:' && values[2].length <= C.CHUNK + 2);
      var meta;
      try { meta = JSON.parse(values[2].slice(2)); } catch (ignored) { fail('storage_corrupt'); }
      assertion(object(meta) && Object.keys(meta).sort().join(',') === 'receipt,rowHash,schema' && meta.schema === 1 && typeof meta.rowHash === 'string' && /^[a-f0-9]{64}$/.test(meta.rowHash));
      signed(meta.receipt, key);
      return { state: values[1].slice(2), meta: meta };
    }
    function split(body) {
      var result = [], cursor = 0;
      for (var n = 0; n < C.PARTS; n++) {
        var end = Math.min(cursor + C.CHUNK, body.length);
        if (end < body.length && /[\uD800-\uDBFF]/.test(body.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(body.charAt(end))) end--;
        result.push(encoded(body.slice(cursor, end))); cursor = end;
      }
      assertion(cursor === body.length, 'payload_too_large');
      return result;
    }
    function join(parts) {
      var body = '', ended = false, previous = '';
      parts.forEach(function (part) {
        assertion(typeof part === 'string' && part.slice(0, 2) === 'j:' && part.length <= C.CHUNK + 2);
        part = part.slice(2);
        if (!part) { ended = true; return; }
        assertion(!ended && !(/[\uD800-\uDBFF]/.test(previous) && /^[\uDC00-\uDFFF]/.test(part)));
        body += part; previous = part.charAt(part.length - 1);
      });
      assertion(byteLength(body) <= C.MAX_BYTES);
      return body;
    }
    function decode(values, key, requireCommitted) {
      var info = metadata(values, key);
      if (requireCommitted) assertion(info.state === 'committed', 'storage_incomplete');
      var record;
      try { record = JSON.parse(join(values.slice(3))); } catch (ignored) { fail('storage_corrupt'); }
      assertion(object(record) && Object.keys(record).sort().join(',') === 'input,receipt' && object(record.input) && object(record.receipt));
      assertion(text(record.receipt) === text(info.meta.receipt) && hash(text(record.input)) === record.receipt.payloadHash &&
        record.input.requestId === record.receipt.requestId && hash(text(record)) === info.meta.rowHash);
      return record;
    }
    function prepared(input, receipt) {
      assertion(object(input) && object(receipt), 'invalid_request');
      var key = keyOf(receipt.actorKey, receipt.requestId);
      signed(receipt, key, 'receipt_invalid');
      var immutable = clean(input, 'invalid_request');
      assertion(immutable.requestId === receipt.requestId && hash(text(immutable)) === receipt.payloadHash, 'receipt_invalid');
      var record = { input: immutable, receipt: clean(receipt, 'receipt_invalid') }, body = text(record, 'invalid_request');
      assertion(byteLength(body) <= C.MAX_BYTES, 'payload_too_large');
      var meta = { schema: 1, receipt: record.receipt, rowHash: hash(body) }, packed = encoded(text(meta));
      assertion(packed.length <= C.CHUNK + 2, 'metadata_too_large');
      return { key: key, record: record, values: [encoded(key), 'j:pending', packed].concat(split(body)) };
    }
    function verifyWrite(row, startColumn, values, expected, state) {
      var writeError;
      recheck();
      try { sheet.getRange(row, startColumn, 1, values.length).setNumberFormat('@').setValues([values]); flush(); }
      catch (caught) { writeError = caught; }
      recheck();
      try {
        var got = valuesAt(row), record = decode(got, expected.key, state === 'committed');
        if (got[1] === encoded(state) && text(record) === text(expected.record)) return;
      } catch (ignored) { /* 読戻し不能を未保存と断定しない。再照会/同じ要求で回復する。 */ }
      if (writeError && writeError.toolsTrialCode) throw writeError;
      fail('storage_write_uncertain');
    }
    function append(input, receipt) {
      recheck();
      var expected = prepared(input, receipt), found = index(), row = found.map[encoded(expected.key)];
      if (row !== undefined) {
        var info = metadata(valuesAt(row, 3), expected.key);
        assertion(info.meta.receipt.payloadHash === expected.record.receipt.payloadHash, 'request_reused');
        if (info.state === 'committed') {
          var known = decode(valuesAt(row), expected.key, true);
          assertion(text(known.input) === text(expected.record.input), 'request_reused');
          recheck(); return known.receipt;
        }
        // 有効な署名付きmetaと同じ本文だけを再準備する。元の受付時刻/署名を維持する。
        expected = prepared(expected.record.input, info.meta.receipt);
        assertion(info.meta.rowHash === hash(text(expected.record)));
      } else {
        row = found.last + 1;
        assertion(row <= rows, 'storage_full');
      }
      verifyWrite(row, 1, expected.values, expected, 'pending');
      verifyWrite(row, 2, ['j:committed'], expected, 'committed');
      recheck(); return clean(expected.record.receipt);
    }
    function read(actorKey, requestId) {
      recheck();
      var key = keyOf(actorKey, requestId), found = index(), row = found.map[encoded(key)];
      var result = row === undefined ? null : decode(valuesAt(row), key, true);
      recheck(); return result;
    }
    function summaries(actorKey) {
      recheck();
      if (actorKey !== undefined) assertion(typeof actorKey === 'string' && /^[a-f0-9]{64}$/.test(actorKey), 'invalid_request');
      var found = index(), result = [];
      if (found.last >= 2) {
        var range = sheet.getRange(2, 1, found.last - 1, 3), values = range.getValues(), formulas = range.getFormulas();
        for (var n = 0; n < values.length; n++) {
          assertion(formulas[n].every(function (v) { return v === ''; }));
          var key = values[n][0].slice(2), info = metadata(values[n], key);
          // 一覧はHMAC検証した確定受付だけ。回収時はreadで本文/行hashも再検証する。
          if (info.state === 'committed' && (actorKey === undefined || info.meta.receipt.actorKey === actorKey)) result.push(info.meta.receipt);
        }
      }
      recheck(); return result;
    }
    return Object.freeze({ append: append, lookup: read, read: read, summaries: summaries });
  }
  return Object.freeze({ constants: C, create: create });
}());
