import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStore } from './common-fixture.mjs';

function environment(values = {}) {
  const rendered = [];
  const HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: html => ({ html }),
    createTemplateFromFile(name) {
      const template = { name, evaluate() {
        const result = { boot: JSON.parse(template.bootJson), name, setTitle() { return this; }, setXFrameOptionsMode(value) { this.frameMode = value; return this; } };
        rendered.push(result); return result;
      } }; return template;
    }
  };
  return { ...loadStore({ HtmlService, PropertiesService: { getScriptProperties: () => ({ getProperty: name => values[name] ?? null }) } }), rendered };
}
test('未設定の新規保存GASは無効でRPCやiframe接続を開始しない', () => {
  const f = environment();
  assert.equal(f.context.toolsStoreConfig_().enabled, false);
  assert.equal(f.context.doGet({ parameter: {} }).html.includes('準備中'), true);
  const result = f.context.toolsStoreRpc('session', {}, 'not-a-binding', 'https://school.example');
  assert.equal(result.ok, false); assert.equal(result.error.code, 'disabled'); assert.equal(f.rendered.length, 0);
});
test('入口は許可originと64hex channel、正しいkindだけで橋を生成する', () => {
  const f = environment({ TOOLS_STORE_ENABLED: 'true', TOOLS_STORE_ALLOWED_ORIGINS: '["https://school.example"]' });
  const parameter = { kind: 'toolsstore', origin: 'https://school.example', channel: 'a'.repeat(64) };
  for (const change of [{ kind: 'other' }, { origin: 'https://wrong.example' }, { channel: 'bad' }]) assert.equal(!!f.context.doGet({ parameter: { ...parameter, ...change } }).html, true);
  const result = f.context.doGet({ parameter });
  assert.equal(result.name, '20_tools_store_bridge'); assert.equal(result.boot.origin, parameter.origin); assert.equal(result.boot.channel, parameter.channel);
  assert.equal(result.frameMode, 'ALLOWALL');
});
test('提案manifestはアクセスユーザー実行・学校domain・Sheetsと本人メールだけを要求する', () => {
  const manifest = JSON.parse(readFileSync(new URL('../store/appsscript.proposed.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.webapp, { executeAs: 'USER_ACCESSING', access: 'DOMAIN' });
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/userinfo.email']);
});
