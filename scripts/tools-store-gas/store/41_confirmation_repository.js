// 学習用journalの分割保存。正式得点は保存・生成しない。構成変更は教員/distだけが行う。
var ToolsConfirmationRepository = (function () {
  'use strict';
  function create(book, dependencies) {
    var dep = dependencies || {}, T = ToolsStoreContract, C = T.constants.CONFIRMATION;
    var data = book.getSheetByName(C.SHEET), receipts = book.getSheetByName(C.RECEIPTS);
    function need(value, code, message) { T.assert(value, code || 'confirmation_corrupt', message); }
    function now() { return dep.now ? dep.now() : Date.now(); }
    function uuid() { return dep.uuid ? dep.uuid() : Utilities.getUuid().replace(/-/g, '').toLowerCase(); }
    function empty() { return { schema: 1, trials: [], responses: {} }; }
    function pack(body) { var value = 'j:' + T.canonical({ body: body, digest: T.hash(T.canonical(body)) }); need(value.length < 45000, 'confirmation_metadata_large'); return value; }
    function unpack(value) {
      if (typeof value !== 'string' || value.slice(0, 2) !== 'j:') return null;
      try { var obj = JSON.parse(value.slice(2)); return obj && obj.body && obj.digest === T.hash(T.canonical(obj.body)) ? obj.body : null; } catch (_) { return null; }
    }
    function write(sheet, row, column, values) {
      var caught;
      if (dep.recheck) dep.recheck();
      try { sheet.getRange(row, column, values.length, values[0].length).setNumberFormat('@').setValues(values); if (dep.flush) dep.flush(); else SpreadsheetApp.flush(); }
      catch (error) { caught = error; }
      if (dep.recheck) dep.recheck();
      try { if (T.canonical(sheet.getRange(row, column, values.length, values[0].length).getValues()) === T.canonical(values)) return; } catch (_) {}
      if (caught && caught.toolsStoreCode) throw caught;
      T.fail('storage_write_uncertain', '確認記録の保存結果を確認できません。同じ送信番号で照会してください。');
    }
    function metaRow(slot) { return 4 + slot * C.BLOCK; }
    function uploadKey(m) { return 'u:' + m.requestId + ':' + m.revision + ':' + m.fingerprint + ':' + m.createdAt; }
    function slotMeta(slot) {
      var row = data.getRange(metaRow(slot), 1, 1, 4).getValues()[0], m = unpack(row[2]);
      if (row.every(function (v) { return v === ''; })) return null;
      need(m && m.schema === 1 && m.slot === slot && row[0] === uploadKey(m) && row[1] === 'upload' &&
        /^[a-f0-9]{32}$/.test(m.requestId) && /^[a-f0-9]{32}$/.test(m.revision) && /^[a-f0-9]{64}$/.test(m.fingerprint) &&
        /^[a-f0-9]{64}$/.test(m.journalHash) && Number.isSafeInteger(m.byteLength) && m.byteLength > 0 && m.byteLength <= C.MAX_BYTES &&
        Number.isSafeInteger(m.chunkCount) && m.chunkCount >= 1 && m.chunkCount <= C.PARTS && Number.isSafeInteger(m.createdAt));
      return m;
    }
    function pointers() {
      var rows = data.getRange(2, 1, 2, 4).getValues(), valid = [];
      rows.forEach(function (row, i) {
        var p = unpack(row[2]);
        if (!p || row[0] !== 'journal' || row[1] !== 'commit' || p.schema !== 1 || !Number.isSafeInteger(p.seq) || p.seq < 1 ||
            !Number.isSafeInteger(p.slot) || p.slot < 0 || p.slot >= C.SLOTS) return;
        var m;
        try { m = slotMeta(p.slot); } catch (_) { return; }
        if (m && m.requestId === p.requestId && m.revision === p.revision && T.hash(T.canonical(m)) === p.metaHash) valid.push({ row: 2 + i, pointer: p, meta: m });
      });
      valid.sort(function (a, b) { return b.pointer.seq - a.pointer.seq; });
      if (valid.length > 1 && valid[0].pointer.seq === valid[1].pointer.seq) need(T.canonical(valid[0].pointer) === T.canonical(valid[1].pointer));
      need(valid.length || rows.every(function (row) { return row[2] === ''; }), 'confirmation_corrupt');
      return valid;
    }
    function receiptKey(id, fingerprint) { return 'r:' + id + ':' + fingerprint; }
    function findReceipt(id) {
      var found = receipts.getRange(2, 1, C.RECEIPT_ROWS - 1, 1).createTextFinder('^r:' + id + ':').matchEntireCell(false).useRegularExpression(true).findAll();
      need(found.length <= 1);
      if (!found.length) return null;
      var row = found[0].getRow(), values = receipts.getRange(row, 1, 1, 4).getValues()[0];
      var match = /^r:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(values[0]);
      need(match && match[1] === id);
      var record = unpack(values[2]);
      need(values[2] === '' || record && record.requestId === id && record.fingerprint === match[2]);
      return { row: row, fingerprint: match[2], record: record };
    }
    function updateReceipt(known, record) { write(receipts, known.row, 3, [[pack(record)]]); known.record = record; return known; }
    function newReceipt(input, fingerprint) {
      var values = receipts.getRange(2, 1, C.RECEIPT_ROWS - 1, 1).getValues(), index = values.findIndex(function (row) { return row[0] === ''; });
      need(index >= 0, 'confirmation_receipts_full', '確認記録の受付一覧が満杯です。元の記録を保持し、教員に連絡してください。');
      var row = 2 + index, existing = receipts.getRange(row, 1, 1, 4).getValues()[0];
      need(existing.every(function (v) { return v === ''; }));
      // 同一セルにIDとfingerprintを固定してから、復旧可能な詳細を置く。
      write(receipts, row, 1, [[receiptKey(input.requestId, fingerprint)]]);
      return { row: row, fingerprint: fingerprint, record: null };
    }
    function rawManifest(m) { return { revision: m.revision, journalHash: m.journalHash, byteLength: m.byteLength, chunkCount: m.chunkCount, chunkSize: C.CHUNK }; }
    function leases(slot) {
      var raw = data.getRange(metaRow(slot), 4).getValues()[0][0], state = raw === '' ? { leases: [] } : unpack(raw);
      need(state && Array.isArray(state.leases) && state.leases.length <= 16);
      return state.leases.filter(function (l) { need(l && /^[a-f0-9]{32}$/.test(l.id) && Number.isSafeInteger(l.until)); return l.until > now(); });
    }
    function setLeases(slot, values) { write(data, metaRow(slot), 4, [[pack({ leases: values })]]); }
    function pin(m) {
      var active = leases(m.slot); need(active.length < 16, 'confirmation_read_busy', '確認記録をほかの画面で読んでいます。少し待って再試行してください。');
      var readId = uuid(); active.push({ id: readId, until: now() + C.READ_MS }); setLeases(m.slot, active);
      return Object.assign(rawManifest(m), { readId: readId });
    }
    function metaByRevision(revision) {
      for (var i = 0; i < C.SLOTS; i++) { var m = slotMeta(i); if (m && m.revision === revision) return m; }
      T.fail('confirmation_revision_unavailable', '確認記録の読取期間が終了しました。内容を混ぜず、最新の記録を再取得してください。');
    }
    function saved(m) { return { state: 'saved', requestId: m.requestId, revision: m.revision, journalHash: m.journalHash }; }
    function recoverCurrent(current) {
      if (!current) return;
      var m = current.meta, known = findReceipt(m.requestId);
      need(known && known.fingerprint === m.fingerprint);
      if (!known.record || known.record.state !== 'saved') updateReceipt(known, { schema: 1, requestId: m.requestId, fingerprint: m.fingerprint, expectedRevision: m.expectedRevision, state: 'saved', result: saved(m) });
    }
    function returnRecord(known) {
      if (known.record && known.record.state === 'saved') return known.record.result;
      if (known.record && known.record.state === 'conflict') return Object.assign({ state: 'conflict' }, pin(metaByRevision(known.record.revision)));
      return { state: 'pending', requestId: known.record ? known.record.requestId : undefined };
    }
    function currentManifest() {
      var current = pointers()[0]; recoverCurrent(current);
      if (!current) { var journal = empty(); return { journal: journal, revision: null, journalHash: T.hash(T.canonical(journal)), byteLength: ToolsConfirmationContract.byteLength(T.canonical(journal)), chunkCount: 0, chunkSize: C.CHUNK }; }
      return pin(current.meta);
    }
    function chunks(m, includeText) {
      var values = data.getRange(metaRow(m.slot) + 1, 1, m.chunkCount, includeText ? 4 : 3).getValues(), received = [], texts = [];
      values.forEach(function (row, i) {
        if (typeof row[0] !== 'string' || row[0].slice(0, m.requestId.length + 1 + String(i).length + 1) !== m.requestId + ':' + i + ':') return;
        var meta = unpack(row[2]);
        if (!(row[1] === 'chunk' && meta && meta.requestId === m.requestId && meta.index === i && /^[a-f0-9]{64}$/.test(meta.chunkHash) && row[0] === m.requestId + ':' + i + ':' + meta.chunkHash)) return;
        if (includeText) { if (!(typeof row[3] === 'string' && row[3].slice(0, 2) === 'j:' && T.hash(row[3].slice(2)) === meta.chunkHash)) return; texts[i] = row[3].slice(2); }
        received.push(i);
      });
      return { received: received, texts: texts };
    }
    function conflict(known, current) {
      need(current, 'confirmation_conflict');
      updateReceipt(known, { schema: 1, requestId: known.record.requestId, fingerprint: known.fingerprint, expectedRevision: known.record.input.expectedRevision, state: 'conflict', revision: current.meta.revision });
      return Object.assign({ state: 'conflict' }, pin(current.meta));
    }
    function begin(input) {
      var fingerprint = T.hash(T.canonical(input)), all = pointers(), current = all[0]; recoverCurrent(current);
      var known = findReceipt(input.requestId);
      if (known) {
        need(known.fingerprint === fingerprint, 'request_reused', '同じ送信番号で確認記録を変更することはできません。');
        if (known.record && ['saved', 'conflict'].indexOf(known.record.state) >= 0) return returnRecord(known);
      } else known = newReceipt(input, fingerprint);
      if (!known.record) updateReceipt(known, { schema: 1, requestId: input.requestId, fingerprint: fingerprint, state: 'pending', input: input });
      if ((current ? current.meta.revision : null) !== input.expectedRevision) return conflict(known, current);
      if (known.record.slot !== undefined) {
        var previousSlot = slotMeta(known.record.slot);
        if (previousSlot && previousSlot.requestId !== input.requestId) {
          // 未commitの古い一時バンクが期限後に再利用されても、不変の受付記録から同IDで準備し直せる。
          delete known.record.slot; updateReceipt(known, known.record);
        }
      }
      if (known.record.slot === undefined) {
        // metadata行の途中失敗でも、最初の1セルに残した不変の識別子から同じ準備を完了する。
        for (var r = 0; r < C.SLOTS; r++) {
          var header = data.getRange(metaRow(r), 1).getValues()[0][0];
          var match = typeof header === 'string' && /^u:([a-f0-9]{32}):([a-f0-9]{32}):([a-f0-9]{64}):([0-9]+)$/.exec(header);
          if (!match || match[1] !== input.requestId) continue;
          need(match[3] === fingerprint, 'request_reused');
          var recovered = Object.assign({ schema: 1, slot: r, revision: match[2], fingerprint: fingerprint, createdAt: Number(match[4]) }, input);
          write(data, metaRow(r), 1, [[uploadKey(recovered), 'upload', pack(recovered), pack({ leases: [] })]]);
          known.record.slot = r; updateReceipt(known, known.record); break;
        }
      }
      if (known.record.slot !== undefined) {
        var resumed = slotMeta(known.record.slot);
        need(resumed && resumed.requestId === input.requestId && resumed.fingerprint === fingerprint, 'confirmation_upload_expired', '確認記録の送信準備期間が終了しました。元の記録を保持して再接続してください。');
        return { state: 'uploading', requestId: input.requestId, received: chunks(resumed, false).received };
      }
      var used = all.map(function (p) { return p.meta.slot; }), slot = -1;
      for (var i = 0; i < C.SLOTS; i++) {
        if (used.indexOf(i) >= 0) continue;
        var previous = slotMeta(i);
        if (!previous) { slot = i; break; }
        if (leases(i).length) continue;
        var receipt = findReceipt(previous.requestId);
        if (receipt && receipt.record && receipt.record.state === 'pending' && previous.createdAt + C.UPLOAD_MS > now()) continue;
        slot = i; break;
      }
      need(slot >= 0, 'confirmation_banks_busy', '確認記録を別の端末で読み書きしています。元の記録を保持して少し待ってください。');
      var meta = Object.assign({ schema: 1, slot: slot, revision: uuid(), fingerprint: fingerprint, createdAt: now() }, input);
      write(data, metaRow(slot), 1, [[uploadKey(meta), 'upload', pack(meta), pack({ leases: [] })]]);
      known.record.slot = slot; updateReceipt(known, known.record);
      return { state: 'uploading', requestId: input.requestId, received: [] };
    }
    function upload(known, expected) {
      need(known && known.record && known.record.state === 'pending' && known.record.slot !== undefined, 'confirmation_upload_missing');
      if (expected !== undefined) need(known.record.input.expectedRevision === expected, 'request_reused');
      var m = slotMeta(known.record.slot);
      need(m && m.requestId === known.record.requestId && m.fingerprint === known.fingerprint, 'confirmation_upload_expired'); return m;
    }
    function put(input) {
      var known = findReceipt(input.requestId), m = upload(known);
      need(input.index < m.chunkCount, 'invalid_request');
      var row = metaRow(m.slot) + 1 + input.index, values = data.getRange(row, 1, 1, 4).getValues()[0], chunkHash = T.hash(input.text);
      var prefix = m.requestId + ':' + input.index + ':', key = prefix + chunkHash;
      if (typeof values[0] === 'string' && values[0].slice(0, prefix.length) === prefix)
        need(values[0] === key, 'confirmation_chunk_conflict', '同じ送信番号・分割番号で本文を変えることはできません。');
      var complete = [key, 'chunk', pack({ requestId: m.requestId, index: input.index, chunkHash: chunkHash }), 'j:' + input.text];
      if (T.canonical(values) !== T.canonical(complete)) write(data, row, 1, [complete]);
      return { state: 'uploading', requestId: input.requestId, index: input.index, chunkHash: chunkHash };
    }
    function commit(input) {
      var current = pointers()[0]; recoverCurrent(current);
      var known = findReceipt(input.requestId);
      if (known && known.record && ['saved', 'conflict'].indexOf(known.record.state) >= 0) {
        need(known.record.expectedRevision === input.expectedRevision, 'request_reused'); return returnRecord(known);
      }
      var m = upload(known, input.expectedRevision), parts = chunks(m, true);
      need(parts.received.length === m.chunkCount, 'confirmation_upload_incomplete', '確認記録の送信が完了していません。同じ送信番号で続きを送信してください。');
      var body = parts.texts.join('');
      need(ToolsConfirmationContract.byteLength(body) === m.byteLength && T.hash(body) === m.journalHash, 'confirmation_hash_mismatch');
      var journal; try { journal = JSON.parse(body); } catch (_) { T.fail('journal_invalid'); }
      var normalized = ToolsConfirmationContract.validate(journal);
      need(T.canonical(normalized) === body, 'journal_invalid', '確認記録の正規形式が一致しません。');
      if ((current ? current.meta.revision : null) !== input.expectedRevision) return conflict(known, current);
      var pointer = { schema: 1, seq: current ? current.pointer.seq + 1 : 1, slot: m.slot,
        requestId: m.requestId, revision: m.revision, metaHash: T.hash(T.canonical(m)) };
      var row = current && current.row === 2 ? 3 : 2;
      write(data, row, 1, [['journal', 'commit', pack(pointer), '']]);
      var accepted = pointers()[0]; need(accepted && accepted.meta.revision === m.revision, 'storage_write_uncertain');
      updateReceipt(known, { schema: 1, requestId: m.requestId, fingerprint: m.fingerprint, expectedRevision: m.expectedRevision, state: 'saved', result: saved(m) });
      return saved(m);
    }
    function lookup(input) {
      recoverCurrent(pointers()[0]); var known = findReceipt(input.requestId);
      return known ? returnRecord(known) : { state: 'missing', requestId: input.requestId };
    }
    function readChunk(input) {
      var m = metaByRevision(input.revision), active = leases(m.slot), lease = active.find(function (l) { return l.id === input.readId; });
      need(lease, 'confirmation_read_expired', '確認記録の読取期間が終了しました。最新の記録を再取得してください。');
      need(input.index < m.chunkCount, 'invalid_request');
      lease.until = now() + C.READ_MS; setLeases(m.slot, active);
      var row = data.getRange(metaRow(m.slot) + 1 + input.index, 1, 1, 4).getValues()[0], meta = unpack(row[2]);
      need(meta && row[0] === m.requestId + ':' + input.index + ':' + meta.chunkHash && row[1] === 'chunk' && meta.index === input.index &&
        typeof row[3] === 'string' && row[3].slice(0, 2) === 'j:' && T.hash(row[3].slice(2)) === meta.chunkHash);
      return { revision: m.revision, index: input.index, text: row[3].slice(2), chunkHash: meta.chunkHash };
    }
    function release(input) {
      var m = metaByRevision(input.revision); setLeases(m.slot, leases(m.slot).filter(function (l) { return l.id !== input.readId; }));
      return { state: 'released', revision: input.revision };
    }
    return { getConfirmationJournal: currentManifest, getConfirmationJournalChunk: readChunk, releaseConfirmationRead: release,
      beginConfirmationSave: begin, putConfirmationChunk: put, saveConfirmationJournal: commit, lookupConfirmationSave: lookup };
  }
  return Object.freeze({ create: create });
})();
