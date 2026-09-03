// 論理回路の構文解析・評価・グラフ変換を担うDOM非依存モジュール。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LogicCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GATE_SYMBOLS = Object.freeze({ AND: '-', OR: '_', XOR: '^' });
  const DISPLAY_GATE_SYMBOLS = Object.freeze({ AND: '∧', OR: '∨', XOR: '⊕' });
  const BINARY_BY_TOKEN = Object.freeze({ '-': 'AND', '_': 'OR', '^': 'XOR' });
  const REQUIRED_INPUTS = Object.freeze({ AND: 2, OR: 2, XOR: 2, NOT: 1 });
  const BASIC_GATES = Object.freeze(['AND', 'OR', 'NOT']);
  const BASIC_GATE_SET = new Set(BASIC_GATES);

  class LogicSyntaxError extends Error {
    constructor(message, position) {
      super(`${message}（${position + 1}文字目）`);
      this.name = 'LogicSyntaxError';
      this.position = position;
    }
  }

  function tokenize(source) {
    if (typeof source !== 'string') throw new TypeError('論理式は文字列で指定してください。');
    const tokens = [];
    for (let index = 0; index < source.length; index += 1) {
      const value = source[index];
      if (/\s/.test(value)) continue;
      if (/[A-Z]/.test(value)) tokens.push({ type: 'INPUT', value, position: index });
      else if (value === 'n') tokens.push({ type: 'NOT', value, position: index });
      else if (BINARY_BY_TOKEN[value]) tokens.push({ type: 'BINARY', value, position: index });
      else if (value === '(' || value === ')') tokens.push({ type: value, value, position: index });
      else throw new LogicSyntaxError(`使用できない記号「${value}」です`, index);
    }
    tokens.push({ type: 'EOF', value: '', position: source.length });
    return tokens;
  }

  function parse(source) {
    const tokens = tokenize(source);
    let cursor = 0;
    let serial = 0;
    const nextId = () => `ast-${++serial}`;
    const current = () => tokens[cursor];
    const take = () => tokens[cursor++];

    function parsePrimary() {
      const token = current();
      if (token.type === 'INPUT') {
        take();
        return { id: nextId(), type: 'input', name: token.value };
      }
      if (token.type === '(') {
        take();
        const expression = parseOr();
        if (current().type !== ')') throw new LogicSyntaxError('閉じ括弧「)」が必要です', current().position);
        take();
        return expression;
      }
      if (token.type === 'EOF') throw new LogicSyntaxError('式が途中で終わっています', token.position);
      throw new LogicSyntaxError(`入力または「(」が必要です`, token.position);
    }

    function parseUnary() {
      if (current().type !== 'NOT') return parsePrimary();
      take();
      return { id: nextId(), type: 'gate', gate: 'NOT', inputs: [parseUnary()] };
    }

    function parseBinary(nextParser, acceptedToken) {
      let left = nextParser();
      while (current().type === 'BINARY' && current().value === acceptedToken) {
        const operator = take();
        const right = nextParser();
        left = {
          id: nextId(),
          type: 'gate',
          gate: BINARY_BY_TOKEN[operator.value],
          inputs: [left, right]
        };
      }
      return left;
    }

    const parseAnd = () => parseBinary(parseUnary, '-');
    const parseXor = () => parseBinary(parseAnd, '^');
    function parseOr() { return parseBinary(parseXor, '_'); }

    if (current().type === 'EOF') throw new LogicSyntaxError('論理式が空です', 0);
    const ast = parseOr();
    if (current().type !== 'EOF') {
      throw new LogicSyntaxError(`「${current().value}」の前に演算子が必要です`, current().position);
    }
    return ast;
  }

  function assertAstNode(node) {
    if (!node || typeof node !== 'object') throw new TypeError('ASTノードが不正です。');
    if (node.type === 'input') {
      if (!/^[A-Z]$/.test(node.name || '')) throw new TypeError('入力名が不正です。');
      return;
    }
    if (node.type !== 'gate' || !REQUIRED_INPUTS[node.gate]) throw new TypeError('ゲート種別が不正です。');
    if (!Array.isArray(node.inputs) || node.inputs.length !== REQUIRED_INPUTS[node.gate]) {
      throw new TypeError(`${node.gate}ゲートの入力数が不正です。`);
    }
    node.inputs.forEach(assertAstNode);
  }

  // 子ゲートを必ず括弧で囲み、結合順を文字列だけで確実に復元できる正規形にする。
  function toStructureExpr(ast) {
    assertAstNode(ast);
    function serialize(node) {
      if (node.type === 'input') return node.name;
      if (node.gate === 'NOT') {
        const child = node.inputs[0];
        return child.type === 'input' ? `n${serialize(child)}` : `n(${serialize(child)})`;
      }
      const left = node.inputs[0].type === 'gate'
        ? `(${serialize(node.inputs[0])})`
        : serialize(node.inputs[0]);
      const right = node.inputs[1].type === 'gate'
        ? `(${serialize(node.inputs[1])})`
        : serialize(node.inputs[1]);
      return `${left}${GATE_SYMBOLS[node.gate]}${right}`;
    }
    return serialize(ast);
  }

  // 学習者に見せるときは、内部の構文記号ではなく一般的な論理記号で表す。
  function toDisplayExpr(ast) {
    assertAstNode(ast);
    function serialize(node) {
      if (node.type === 'input') return node.name;
      if (node.gate === 'NOT') {
        const child = node.inputs[0];
        return child.type === 'input' ? `¬${serialize(child)}` : `¬(${serialize(child)})`;
      }
      const left = node.inputs[0].type === 'gate'
        ? `(${serialize(node.inputs[0])})`
        : serialize(node.inputs[0]);
      const right = node.inputs[1].type === 'gate'
        ? `(${serialize(node.inputs[1])})`
        : serialize(node.inputs[1]);
      return `${left} ${DISPLAY_GATE_SYMBOLS[node.gate]} ${right}`;
    }
    return serialize(ast);
  }

  function collectInputs(ast) {
    assertAstNode(ast);
    const found = new Set();
    (function visit(node) {
      if (node.type === 'input') found.add(node.name);
      else node.inputs.forEach(visit);
    })(ast);
    return Array.from(found).sort();
  }

  function normalizeBit(value) {
    return value === true || value === 1 || value === '1' ? 1 : 0;
  }

  function evaluateDetailed(ast, inputValues) {
    assertAstNode(ast);
    const values = Object.create(null);
    const supplied = inputValues || {};

    function evaluateNode(node) {
      let value;
      if (node.type === 'input') {
        value = normalizeBit(supplied[node.name]);
      } else {
        const operands = node.inputs.map(evaluateNode);
        if (node.gate === 'NOT') value = operands[0] ? 0 : 1;
        else if (node.gate === 'AND') value = operands[0] && operands[1] ? 1 : 0;
        else if (node.gate === 'OR') value = operands[0] || operands[1] ? 1 : 0;
        else value = operands[0] !== operands[1] ? 1 : 0;
      }
      values[node.id] = value;
      return value;
    }

    return { value: evaluateNode(ast), values };
  }

  function evaluate(ast, inputValues) {
    return evaluateDetailed(ast, inputValues).value;
  }

  function normalizeInputNames(ast, inputNames) {
    const names = inputNames == null ? collectInputs(ast) : Array.from(inputNames);
    const unique = Array.from(new Set(names));
    unique.forEach(name => {
      if (!/^[A-Z]$/.test(name)) throw new TypeError(`入力名「${name}」は使用できません。`);
    });
    return unique.sort();
  }

  function generateInputRows(inputNames) {
    const names = Array.from(inputNames || []);
    const total = 2 ** names.length;
    return Array.from({ length: total }, (_, rowIndex) => {
      const inputs = Object.create(null);
      names.forEach((name, columnIndex) => {
        const shift = names.length - columnIndex - 1;
        inputs[name] = (rowIndex >> shift) & 1;
      });
      return inputs;
    });
  }

  function buildTruthTable(ast, inputNames) {
    const names = normalizeInputNames(ast, inputNames);
    return generateInputRows(names).map((inputs, index) => ({
      index,
      inputs,
      output: evaluate(ast, inputs)
    }));
  }

  function truthCode(ast, inputNames) {
    return buildTruthTable(ast, inputNames).map(row => String(row.output)).join('');
  }

  function parseAndAnalyze(source, inputNames) {
    const ast = parse(source);
    const inputs = normalizeInputNames(ast, inputNames);
    const table = buildTruthTable(ast, inputs);
    return {
      ast,
      inputs,
      structureExpr: toStructureExpr(ast),
      truthTable: table,
      truthCode: table.map(row => row.output).join('')
    };
  }

  // XORなどの派生演算を、回路図で使用するAND・OR・NOTだけのASTへ展開する。
  // XOR = (A OR B) AND NOT(A AND B)
  function toBasicGateAst(ast) {
    assertAstNode(ast);
    let serial = 0;

    function makeInput(node) {
      return {
        id: `basic-${++serial}`,
        type: 'input',
        name: node.name,
        sourceId: node.sourceId || node.id
      };
    }

    function makeGate(gate, inputs, source) {
      return {
        id: `basic-${++serial}`,
        type: 'gate',
        gate,
        inputs,
        sourceId: source.sourceId || source.id
      };
    }

    function convert(node) {
      if (node.type === 'input') return makeInput(node);
      if (node.gate !== 'XOR') {
        return makeGate(node.gate, node.inputs.map(convert), node);
      }

      const either = makeGate('OR', [convert(node.inputs[0]), convert(node.inputs[1])], node);
      const both = makeGate('AND', [convert(node.inputs[0]), convert(node.inputs[1])], node);
      const notBoth = makeGate('NOT', [both], node);
      return makeGate('AND', [either, notBoth], node);
    }

    return convert(ast);
  }

  function dedupeMessages(messages) {
    return Array.from(new Set(messages));
  }

  function graphToAst(graph) {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const wires = Array.isArray(graph?.wires) ? graph.wires : [];
    const errors = [];
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const incoming = new Map();
    const outgoing = new Map();

    function requiredInputs(node) {
      if (!node) return 0;
      if (node.type === 'output') return 1;
      return REQUIRED_INPUTS[String(node.type || '').toUpperCase()] || 0;
    }

    for (const wire of wires) {
      const from = nodeMap.get(wire.from);
      const to = nodeMap.get(wire.to);
      if (!from || !to) {
        errors.push('存在しない部品につながる配線があります。');
        continue;
      }
      if (from.type === 'output' || to.type === 'input') {
        errors.push('配線の向きが不正です。');
        continue;
      }
      const port = Number(wire.port);
      if (!Number.isInteger(port) || port < 0 || port >= requiredInputs(to)) {
        errors.push('接続先の入力端子が不正です。');
        continue;
      }
      const key = `${to.id}:${port}`;
      if (incoming.has(key)) errors.push('同じ入力端子に複数の配線があります。');
      else incoming.set(key, wire);
      if (!outgoing.has(from.id)) outgoing.set(from.id, []);
      outgoing.get(from.id).push(wire);
    }

    const outputs = nodes.filter(node => node.type === 'output');
    if (outputs.length !== 1) errors.push('出力Fを1つ配置してください。');
    const output = outputs[0];
    const reachable = new Set();
    const visiting = new Set();
    let astSerial = 0;

    function build(nodeId) {
      if (visiting.has(nodeId)) {
        errors.push('循環する回路は作成できません。');
        return null;
      }
      const node = nodeMap.get(nodeId);
      if (!node) return null;
      reachable.add(nodeId);
      if (node.type === 'input') {
        const name = node.name || node.label;
        if (!/^[A-Z]$/.test(name || '')) {
          errors.push('入力名が不正です。');
          return null;
        }
        return { id: `graph-ast-${++astSerial}`, type: 'input', name, sourceId: node.id };
      }

      visiting.add(nodeId);
      const count = requiredInputs(node);
      const children = [];
      for (let port = 0; port < count; port += 1) {
        const wire = incoming.get(`${node.id}:${port}`);
        if (!wire) {
          errors.push(node.type === 'output'
            ? '出力Fが接続されていません。'
            : `${String(node.type).toUpperCase()}ゲートの入力が不足しています。`);
          children.push(null);
        } else {
          children.push(build(wire.from));
        }
      }
      visiting.delete(nodeId);
      if (children.some(child => !child)) return null;
      if (node.type === 'output') return children[0];
      const gate = String(node.type || '').toUpperCase();
      if (!BASIC_GATE_SET.has(gate)) {
        errors.push('回路図で使用できるゲートはAND・OR・NOTだけです。');
        return null;
      }
      return { id: `graph-ast-${++astSerial}`, type: 'gate', gate, inputs: children, sourceId: node.id };
    }

    const ast = output ? build(output.id) : null;

    const detached = nodes.filter(node => node.type !== 'input' && node.type !== 'output' && !reachable.has(node.id));
    if (detached.length) errors.push('出力Fにつながっていないゲートがあります。');
    const detachedWires = wires.filter(wire => !reachable.has(wire.from) || !reachable.has(wire.to));
    if (detachedWires.length) errors.push('出力Fにつながっていない配線があります。');

    const uniqueErrors = dedupeMessages(errors);
    return { valid: Boolean(ast) && uniqueErrors.length === 0, ast, errors: uniqueErrors, reachable };
  }

  function graphAnalysis(graph, inputNames) {
    const compiled = graphToAst(graph);
    if (!compiled.valid) return { ...compiled, structureExpr: '', truthCode: '', truthTable: [], inputs: [] };
    const inputs = normalizeInputNames(compiled.ast, inputNames);
    const table = buildTruthTable(compiled.ast, inputs);
    return {
      ...compiled,
      inputs,
      structureExpr: toStructureExpr(compiled.ast),
      truthTable: table,
      truthCode: table.map(row => row.output).join('')
    };
  }

  function wouldCreateCycle(graph, fromId, toId) {
    if (fromId === toId) return true;
    const outgoing = new Map();
    for (const wire of graph?.wires || []) {
      if (!outgoing.has(wire.from)) outgoing.set(wire.from, []);
      outgoing.get(wire.from).push(wire.to);
    }
    if (!outgoing.has(fromId)) outgoing.set(fromId, []);
    outgoing.get(fromId).push(toId);
    const stack = [toId];
    const seen = new Set();
    while (stack.length) {
      const currentId = stack.pop();
      if (currentId === fromId) return true;
      if (seen.has(currentId)) continue;
      seen.add(currentId);
      (outgoing.get(currentId) || []).forEach(id => stack.push(id));
    }
    return false;
  }

  function createSvgFilename() {
    return 'logic-circuit.svg';
  }

  return Object.freeze({
    LogicSyntaxError,
    BASIC_GATES,
    REQUIRED_INPUTS,
    tokenize,
    parse,
    toStructureExpr,
    toDisplayExpr,
    collectInputs,
    evaluate,
    evaluateDetailed,
    generateInputRows,
    buildTruthTable,
    truthCode,
    parseAndAnalyze,
    toBasicGateAst,
    graphToAst,
    graphAnalysis,
    wouldCreateCycle,
    createSvgFilename
  });
});
