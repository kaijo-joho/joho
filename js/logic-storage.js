// 論理回路エディタのローカル保存。DOMや編集時の選択状態は扱わない。
(function (root, factory) {
  const core = typeof module === 'object' && module.exports
    ? require('./logic-core.js')
    : root && root.LogicCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LogicStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  const STORAGE_KEY = 'joho.logic-circuits.v1';
  const VERSION = 1;
  const MAX_RECORDS = 30;
  const MAX_NODES = 200;
  const MAX_WIRES = 500;
  const MAX_DOCUMENT_LENGTH = 1024 * 1024;
  const MAX_ID_LENGTH = 120;
  const INPUT_NAMES = Object.freeze(['A', 'B', 'C', 'D']);
  const INPUT_SET = new Set(INPUT_NAMES);
  const GATE_INPUTS = Object.freeze({ AND: 2, OR: 2, NOT: 1, output: 1 });
  const TYPES = new Set(['input', 'output', 'AND', 'OR', 'NOT']);
  const SUBSCRIPTS = Object.freeze(['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']);

  function fail(message) { throw new Error(message); }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function text(value, label, max = MAX_ID_LENGTH) {
    if (typeof value !== 'string' || value.length < 1 || value.length > max) fail(`${label}が不正です。`);
    if (value === '__proto__' || value === 'prototype' || value === 'constructor') fail(`${label}が不正です。`);
    return value;
  }
  function outputName(index, count) {
    if (Core && typeof Core.outputName === 'function') return Core.outputName(index, count);
    if (count === 1) return 'F';
    return `F${String(index + 1).split('').map(digit => SUBSCRIPTS[Number(digit)]).join('')}`;
  }
  function requiredInputs(node) { return GATE_INPUTS[node.type] || 0; }

  function normalizeSnapshot(snapshot) {
    if (!plainObject(snapshot) || !plainObject(snapshot.graph)) fail('保存する回路データが不正です。');
    const sourceNodes = snapshot.graph.nodes;
    const sourceWires = snapshot.graph.wires;
    if (!Array.isArray(sourceNodes) || !Array.isArray(sourceWires)
      || sourceNodes.length > MAX_NODES || sourceWires.length > MAX_WIRES) fail('回路データが大きすぎるか不正です。');
    if (!Array.isArray(snapshot.inputNames) || !plainObject(snapshot.inputValues)) fail('入力データが不正です。');

    const ids = new Set();
    const nodes = sourceNodes.map(source => {
      if (!plainObject(source) || !TYPES.has(source.type)) fail('部品の種類が不正です。');
      const id = text(source.id, '部品ID');
      if (ids.has(id)) fail('部品IDが重複しています。');
      ids.add(id);
      if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || source.x < 0 || source.x > 900 || source.y < 0 || source.y > 520) {
        fail('部品の位置が不正です。');
      }
      const node = { id, type: source.type, x: source.x, y: source.y };
      if (source.type === 'input') {
        if (!INPUT_SET.has(source.name)) fail('入力名が不正です。');
        node.name = source.name;
      }
      return node;
    });

    const inputNodes = nodes.filter(node => node.type === 'input');
    const inputSet = new Set();
    inputNodes.forEach(node => {
      if (inputSet.has(node.name)) fail('入力名が重複しています。');
      inputSet.add(node.name);
    });
    if (snapshot.inputNames.length > INPUT_NAMES.length) fail('入力名が不正です。');
    const suppliedNames = new Set();
    snapshot.inputNames.forEach(name => {
      if (!INPUT_SET.has(name) || suppliedNames.has(name)) fail('入力名が不正です。');
      suppliedNames.add(name);
    });
    if (suppliedNames.size !== inputSet.size || Array.from(inputSet).some(name => !suppliedNames.has(name))) {
      fail('入力一覧と入力部品が一致していません。');
    }
    const inputNames = INPUT_NAMES.filter(name => inputSet.has(name));
    const inputValues = Object.create(null);
    const valueKeys = Object.keys(snapshot.inputValues);
    if (valueKeys.length > INPUT_NAMES.length) fail('入力値が不正です。');
    if (valueKeys.some(name => !inputSet.has(name)) || inputNames.some(name => !own(snapshot.inputValues, name))) {
      fail('入力値と入力部品が一致していません。');
    }
    inputNames.forEach(name => {
      const value = snapshot.inputValues[name];
      if (value !== 0 && value !== 1) fail('入力値は0または1で指定してください。');
      inputValues[name] = value;
    });

    const outputs = nodes.filter(node => node.type === 'output');
    if (outputs.length < 1) fail('出力を1つ以上配置してください。');
    outputs.forEach((node, index) => { node.name = outputName(index, outputs.length); });
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const wireIds = new Set();
    const targetPorts = new Set();
    const wires = sourceWires.map(source => {
      if (!plainObject(source)) fail('配線が不正です。');
      const id = text(source.id, '配線ID');
      if (wireIds.has(id)) fail('配線IDが重複しています。');
      wireIds.add(id);
      const from = text(source.from, '配線の接続元ID');
      const to = text(source.to, '配線の接続先ID');
      const fromNode = nodeMap.get(from);
      const toNode = nodeMap.get(to);
      if (!fromNode || !toNode || fromNode.type === 'output' || toNode.type === 'input') fail('配線の接続先または向きが不正です。');
      if (!Number.isInteger(source.port) || source.port < 0 || source.port >= requiredInputs(toNode)) fail('配線の入力端子が不正です。');
      const portKey = `${to}:${source.port}`;
      if (targetPorts.has(portKey)) fail('同じ入力端子に複数の配線があります。');
      targetPorts.add(portKey);
      return { id, from, to, port: source.port };
    });

    const outgoing = new Map();
    wires.forEach(wire => {
      if (!outgoing.has(wire.from)) outgoing.set(wire.from, []);
      outgoing.get(wire.from).push(wire.to);
    });
    const visiting = new Set();
    const visited = new Set();
    function visit(id) {
      if (visiting.has(id)) fail('循環する回路は保存できません。');
      if (visited.has(id)) return;
      visiting.add(id);
      (outgoing.get(id) || []).forEach(visit);
      visiting.delete(id);
      visited.add(id);
    }
    nodes.forEach(node => visit(node.id));
    return { graph: { nodes, wires }, inputNames, inputValues };
  }

  function normalizeName(name) {
    if (typeof name !== 'string') fail('保存名を入力してください。');
    const normalized = name.trim();
    if (!normalized || normalized.length > 60) fail('保存名は1〜60文字で入力してください。');
    return normalized;
  }
  function normalizeRecord(record) {
    if (!plainObject(record)) fail('保存済み回路データが不正です。');
    const id = text(record.id, '保存ID');
    const name = normalizeName(record.name);
    if (typeof record.updatedAt !== 'string' || Number.isNaN(Date.parse(record.updatedAt)) || new Date(record.updatedAt).toISOString() !== record.updatedAt) fail('保存日時が不正です。');
    return { id, name, snapshot: normalizeSnapshot(record.snapshot), updatedAt: record.updatedAt };
  }
  function cloneRecord(record) {
    return normalizeRecord(record);
  }

  class Store {
    constructor(storage) {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
        fail('ローカル保存を利用できません。');
      }
      this.storage = storage;
      this.serial = 0;
    }

    read() {
      let raw;
      try { raw = this.storage.getItem(STORAGE_KEY); } catch (error) { fail('ローカル保存を読み取れません。'); }
      if (raw == null) return { version: VERSION, records: [] };
      if (typeof raw !== 'string' || raw.length > MAX_DOCUMENT_LENGTH) fail('保存済み回路データが大きすぎるか不正です。');
      let document;
      try { document = JSON.parse(raw); } catch (error) { fail('保存済み回路データが壊れています。'); }
      if (!plainObject(document) || document.version !== VERSION || !Array.isArray(document.records) || document.records.length > MAX_RECORDS) {
        fail('保存済み回路データの形式またはバージョンに対応していません。');
      }
      const records = document.records.map(normalizeRecord);
      if (new Set(records.map(record => record.id)).size !== records.length || new Set(records.map(record => record.name)).size !== records.length) {
        fail('保存済み回路データに重複があります。');
      }
      return { version: VERSION, records };
    }

    write(document) {
      let raw;
      try { raw = JSON.stringify(document); } catch (error) { fail('ローカル保存に失敗しました。'); }
      if (raw.length > MAX_DOCUMENT_LENGTH) fail('保存する回路データが大きすぎます。');
      try { this.storage.setItem(STORAGE_KEY, raw); } catch (error) { fail('ローカル保存に失敗しました。'); }
    }

    list() { return this.read().records.map(cloneRecord); }
    get(id) {
      text(id, '保存ID');
      const record = this.read().records.find(candidate => candidate.id === id);
      return record ? cloneRecord(record) : null;
    }
    newId(records) {
      let id;
      do { id = `circuit-${Date.now().toString(36)}-${++this.serial}-${Math.random().toString(36).slice(2, 8)}`; } while (records.some(record => record.id === id));
      return id;
    }
    save({ id, name, snapshot } = {}) {
      const document = this.read();
      const normalizedName = normalizeName(name);
      const normalizedSnapshot = normalizeSnapshot(snapshot);
      if (id != null) text(id, '保存ID');
      const existing = id == null ? null : document.records.find(record => record.id === id);
      if (id != null && !existing) fail('更新する保存済み回路が見つかりません。');
      const nextId = existing ? existing.id : this.newId(document.records);
      if (document.records.some(record => record.name === normalizedName && record.id !== nextId)) fail('同じ名前の保存済み回路があります。');
      if (!existing && document.records.length >= MAX_RECORDS) fail('保存できる回路は30件までです。不要な回路を削除してください。');
      const record = { id: nextId, name: normalizedName, snapshot: normalizedSnapshot, updatedAt: new Date().toISOString() };
      const records = existing
        ? document.records.map(candidate => candidate.id === nextId ? record : candidate)
        : [...document.records, record];
      this.write({ version: VERSION, records });
      return cloneRecord(record);
    }
    remove(id) {
      text(id, '保存ID');
      const document = this.read();
      const records = document.records.filter(record => record.id !== id);
      if (records.length === document.records.length) return false;
      this.write({ version: VERSION, records });
      return true;
    }
  }

  return Object.freeze({ STORAGE_KEY, normalizeSnapshot, Store });
});
