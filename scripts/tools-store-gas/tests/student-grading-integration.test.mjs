// 実01/10/32/33の結合。Googleサービスと同期済み原本だけをfakeへ置換する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture, DUE } from './student-grading-fixture.mjs';
import { FakeSheet } from './store-fixture.mjs';

test('実RPC outer UserLock busyのstring到着proof→締切後同一再送→collector→submitted', () => {
  const f = fixture(), account = f.accounts[0], book = f.bookFor(), T = f.T, C = T.constants;
  for (const [name, rows] of [[C.SHEET, C.DRAFT_ROWS], [C.HISTORY, C.HISTORY_ROWS]]) {
    const sheet = new FakeSheet(name, rows, C.HEADERS.length, true);
    sheet.getRange(1, 1, 1, C.HEADERS.length).setValues([[...C.HEADERS]]); sheet.protectRange(1, 1, 1, C.HEADERS.length);
    book.sheets[name] = sheet;
  }
  const values = {
    TOOLS_STORE_ENABLED: 'true', TOOLS_STORE_BINDING_KEY: 'synthetic-integration-binding-key-only',
    TOOLS_STORE_ALLOWED_ORIGINS: '["https://school.example"]', TOOLS_STORE_ALLOWED_DOMAINS: '["example.test"]',
    TOOLS_STORE_TEACHER_OWNERS: '["teacher@example.test"]', TOOLS_STUDENT_GRADING_ENABLED: 'true',
    TOOLS_STUDENT_GRADING_SIGNING_KEY: f.config.studentGrading.signingKey, TOOLS_STUDENT_GRADING_KEY_ID: 'synthetic-v1',
    TOOLS_STUDENT_GRADING_CENTRAL_ID: f.config.studentGrading.centralSpreadsheetId, TOOLS_GRADING_COLLECTOR_ENABLED: 'true'
  };
  for (const [key, value] of Object.entries(values)) f.properties.setProperty(key, value);
  let busy = true, held = false;
  f.ctx.PropertiesService = { getScriptProperties: () => f.properties };
  f.ctx.Session = { getActiveUser: () => ({ getEmail: () => account }), getEffectiveUser: () => ({ getEmail: () => account }) };
  f.ctx.SpreadsheetApp.openById = id => { const target = f.books.get(id); assert.ok(target); return target; };
  f.ctx.SpreadsheetApp.flush = () => {};
  f.ctx.LockService = { getUserLock: () => ({ tryLock: () => { if (busy || held) return false; held = true; return true; }, releaseLock: () => { held = false; } }) };
  f.ctx.ToolsGradingPackages = { create: () => f.packageService };
  f.ctx.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [f.deps.now()])); } static now() { return f.deps.now(); } };
  for (const file of ['01_tools_store_config.js', '10_tools_store_api.js']) vm.runInContext(readFileSync(new URL('../store/' + file, import.meta.url), 'utf8'), f.ctx);
  f.setNow(DUE);
  const config = f.ctx.toolsStoreConfig_(), binding = T.issueBinding({ account, actorKey: T.actorKey(account), spreadsheetId: book.id,
    generation: 'a'.repeat(32), tool: 'python', origin: 'https://school.example' }, config, f.deps.now());
  const input = f.submission();
  const first = f.ctx.toolsStoreRpc('submit', input, binding, 'https://school.example');
  assert.equal(first.ok, false); assert.equal(first.error.code, 'busy'); assert.equal(typeof first.error.intakeTicket, 'string');
  assert.equal(JSON.parse(first.error.intakeTicket).payload.receivedAt, DUE);
  assert.equal(f.rows('Python提出受付'), 0); assert.equal(f.rows('Python提出結果'), 0); assert.equal(held, false);
  busy = false; f.setNow('2026-10-15T01:10:00.000Z');
  const second = f.ctx.toolsStoreRpc('submit', { ...input, intakeTicket: first.error.intakeTicket }, binding, 'https://school.example');
  assert.equal(second.ok, true, JSON.stringify(second)); assert.equal(second.value.receipt.state, 'pending'); assert.equal(second.value.receipt.receivedAt, DUE);
  assert.equal(second.value.receipt.late, false); assert.equal(second.value.provisional.score, 1); assert.equal(held, false);
  const collected = f.collector.run(); assert.equal(collected.students[0].completed, 1);
  const third = f.ctx.toolsStoreRpc('getSubmission', { tool: 'python', requestId: input.requestId }, binding, 'https://school.example');
  assert.equal(third.ok, true, JSON.stringify(third)); assert.equal(third.value.receipt.state, 'submitted'); assert.equal(third.value.receipt.receivedAt, DUE);
  assert.equal(third.value.bestScore, 1); assert.equal(third.value.history.length, 1);
  assert.equal(f.centralRows('Python提出受付'), 1); assert.equal(f.centralRows('Python提出結果'), 1); assert.equal(f.rows('Python提出完了'), 1);
});
