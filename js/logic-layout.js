// 論理回路グラフの純粋な自動配置。描画や編集状態には触れない。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LogicLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_X = 110;
  const MIN_Y = 84;
  const INPUT_ORDER = Object.freeze(['A', 'B', 'C', 'D']);

  function fail(message) { throw new Error(message); }
  function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function average(values, fallback) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
  }
  function spread(count, top, bottom) {
    if (count === 1) return [(top + bottom) / 2];
    const gap = Math.min(104, (bottom - top) / (count - 1));
    const start = (top + bottom - gap * (count - 1)) / 2;
    return Array.from({ length: count }, (_, index) => start + gap * index);
  }

  function arrange(graph, { width = 900, height = 520 } = {}) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 * 45 || height < 2 * 42) {
      fail('配置できる回路の大きさが不正です。');
    }
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : null;
    const wires = Array.isArray(graph?.wires) ? graph.wires : null;
    if (!nodes || !wires) fail('回路データが不正です。');
    const nodeMap = new Map();
    nodes.forEach(node => {
      if (!node || typeof node.id !== 'string' || !node.id) fail('部品IDが不正です。');
      if (nodeMap.has(node.id)) fail('部品IDが重複しています。');
      nodeMap.set(node.id, node);
    });
    const incoming = new Map(nodes.map(node => [node.id, []]));
    const outgoing = new Map(nodes.map(node => [node.id, []]));
    wires.forEach(wire => {
      const from = nodeMap.get(wire?.from);
      const to = nodeMap.get(wire?.to);
      if (!from || !to) fail('存在しない部品につながる配線があります。');
      if (from.type === 'output' || to.type === 'input') fail('配線の向きが不正です。');
      incoming.get(to.id).push(from);
      outgoing.get(from.id).push(to);
    });

    const visiting = new Set();
    const visited = new Set();
    function visit(node) {
      if (visiting.has(node.id)) fail('循環する回路は自動配置できません。');
      if (visited.has(node.id)) return;
      visiting.add(node.id);
      (outgoing.get(node.id) || []).forEach(visit);
      visiting.delete(node.id);
      visited.add(node.id);
    }
    nodes.forEach(visit);

    const inputs = nodes.filter(node => node.type === 'input').sort((left, right) => {
      const leftOrder = INPUT_ORDER.indexOf(left.name);
      const rightOrder = INPUT_ORDER.indexOf(right.name);
      return (leftOrder < 0 ? INPUT_ORDER.length : leftOrder) - (rightOrder < 0 ? INPUT_ORDER.length : rightOrder)
        || String(left.name || left.id).localeCompare(String(right.name || right.id));
    });
    const outputs = nodes.filter(node => node.type === 'output');
    const gates = nodes.filter(node => node.type !== 'input' && node.type !== 'output');
    const gateSet = new Set(gates.map(node => node.id));
    const depth = new Map();
    const calculating = new Set();
    function gateDepth(node) {
      if (depth.has(node.id)) return depth.get(node.id);
      if (calculating.has(node.id)) fail('循環する回路は自動配置できません。');
      calculating.add(node.id);
      const predecessors = incoming.get(node.id).filter(parent => gateSet.has(parent.id));
      const value = predecessors.length ? Math.max(...predecessors.map(gateDepth)) + 1 : 1;
      calculating.delete(node.id);
      depth.set(node.id, value);
      return value;
    }
    gates.forEach(gateDepth);
    const levels = new Map();
    gates.forEach(gate => {
      const level = depth.get(gate.id);
      if (!levels.has(level)) levels.set(level, []);
      levels.get(level).push(gate);
    });
    const maxDepth = gates.length ? Math.max(...depth.values()) : 0;
    const left = 45;
    const right = width - 45;
    const top = 42;
    const bottom = height - 42;
    if ((right - left) / (maxDepth + 1) < MIN_X) fail('回路が横に長すぎるため重ならずに配置できません。');
    const maxPerColumn = Math.floor((bottom - top) / MIN_Y) + 1;
    const columns = [inputs, ...Array.from({ length: maxDepth }, (_, index) => levels.get(index + 1) || []), outputs];
    if (columns.some(column => column.length > maxPerColumn)) fail('同じ段の部品が多すぎるため重ならずに配置できません。');

    const originalY = new Map(nodes.map((node, index) => [node.id, finite(node.y, top + index * MIN_Y)]));
    const inputRank = new Map(inputs.map((node, index) => [node.id, { index, count: inputs.length }]));
    const gateRank = new Map();
    function normalizedRank(rank) {
      return rank.count <= 1 ? 0.5 : rank.index / (rank.count - 1);
    }
    for (let level = 1; level <= maxDepth; level += 1) {
      const column = levels.get(level) || [];
      column.sort((leftNode, rightNode) => {
        const parentRanks = node => incoming.get(node.id)
          .map(parent => gateRank.get(parent.id) || inputRank.get(parent.id))
          .filter(Boolean)
          .map(normalizedRank);
        const leftParents = parentRanks(leftNode);
        const rightParents = parentRanks(rightNode);
        if (Boolean(leftParents.length) !== Boolean(rightParents.length)) return leftParents.length ? -1 : 1;
        if (leftParents.length && rightParents.length) {
          const difference = average(leftParents, 0.5) - average(rightParents, 0.5);
          if (difference) return difference;
        }
        return originalY.get(leftNode.id) - originalY.get(rightNode.id) || leftNode.id.localeCompare(rightNode.id);
      });
      column.forEach((node, index) => gateRank.set(node.id, { index, count: column.length }));
    }

    const positions = new Map();
    function positionColumn(column, x) {
      spread(column.length, top, bottom).forEach((y, index) => positions.set(column[index].id, { id: column[index].id, x, y }));
    }
    positionColumn(inputs, left);
    for (let level = 1; level <= maxDepth; level += 1) {
      positionColumn(levels.get(level) || [], left + (right - left) * level / (maxDepth + 1));
    }
    positionColumn(outputs, right);
    return nodes.map(node => positions.get(node.id) || { id: node.id, x: left, y: (top + bottom) / 2 });
  }

  return Object.freeze({ arrange });
});
