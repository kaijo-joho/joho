(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphExpression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMIT = { input: 1000, tokens: 500, depth: 80, nodes: 400 };
  const FUNCTIONS = new Set(['sin','cos','tan','asin','acos','atan','sqrt','abs','exp','ln','log','floor','ceil','round','min','max']);
  const CONSTANTS = { pi: Math.PI, e: Math.E };
  const RESERVED = new Set(['constructor','prototype','__proto__']);
  const error = message => { throw new Error(message); };
  function tokenize(source, target) {
    if (typeof source !== 'string' || !source.trim()) error('数式を入力してください。');
    if (source.length > LIMIT.input) error('数式が長すぎます。');
    let text = source.trim();
    const left = text.match(/^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*/);
    if (left) {
      if (target === false) error('この数式には等号を使えません。');
      if (!['y','z'].includes(left[1])) error('数式の左辺は y または z にしてください。');
      if (target && left[1] !== target) error(target === 'y' ? '2D 関数の左辺は y にしてください。' : '3D 曲面の左辺は z にしてください。');
      text = text.slice(left[0].length);
    }
    if (/[=;\[\]{}]/.test(text)) error(target === false && text.includes('=') ? 'この数式には等号を使えません。' : '数式に使えない記号があります。');
    const out = []; let pos = 0;
    while (pos < text.length) {
      if (/\s/.test(text[pos])) { pos++; continue; }
      const part = text.slice(pos), num = part.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i), id = part.match(/^[A-Za-z_][A-Za-z_0-9]*/);
      if (num) { if (out.length && out[out.length-1].type === 'number') error('数値の間に演算記号を入力してください。'); out.push({ type: 'number', value: Number(num[0]) }); pos += num[0].length; }
      else if (id) { out.push({ type: 'id', value: id[0] }); pos += id[0].length; }
      else if ('+-*/^(),'.includes(text[pos])) { out.push({ type: text[pos], value: text[pos++] }); }
      else error('数式に使えない文字があります。');
      if (out.length > LIMIT.tokens) error('数式が複雑すぎます。');
    }
    return out;
  }
  function compile(expression, options = {}) {
    const vars = new Set(Array.isArray(options.variables) ? options.variables : []);
    const target = options.target;
    if (target !== undefined && target !== false && target !== 'y' && target !== 'z') error('数式の種類が不正です。');
    const angle = options.angle === 'deg' ? 'deg' : options.angle === 'rad' || options.angle === undefined ? 'rad' : error('角度の設定が不正です。');
    for (const name of vars) if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || FUNCTIONS.has(name) || Object.hasOwn(CONSTANTS, name) || RESERVED.has(name)) error('変数名が不正です。');
    const tokens = tokenize(expression, target); let index = 0, nodes = 0;
    const peek = () => tokens[index]; const consume = type => { const token = peek(); if (!token || token.type !== type) error('数式の構文が正しくありません。'); index++; return token; };
    const beginsAtom = token => token && (token.type === 'number' || token.type === 'id' || token.type === '(');
    function node(type, data) { if (++nodes > LIMIT.nodes) error('数式が複雑すぎます。'); return { type, ...data }; }
    function primary(depth) {
      if (depth > LIMIT.depth) error('数式の入れ子が深すぎます。');
      const t = peek(); if (!t) error('数式の終わり方が正しくありません。');
      if (t.type === 'number') { index++; return node('number', { value: t.value }); }
      if (t.type === 'id') {
        index++; const name = t.value;
        if (peek() && peek().type === '(' && FUNCTIONS.has(name)) {
          index++; const args = [];
          if (!peek() || peek().type !== ')') { args.push(add(depth + 1)); while (peek() && peek().type === ',') { index++; args.push(add(depth + 1)); } }
          consume(')');
          if ((name === 'min' || name === 'max') ? args.length < 1 : args.length !== 1) error('関数の引数の数が正しくありません。');
          return node('call', { name, args });
        }
        if (Object.hasOwn(CONSTANTS, name)) return node('number', { value: CONSTANTS[name] });
        if (!vars.has(name)) error(peek() && peek().type === '(' ? '許可されていない関数です。' : '未定義の変数「' + name + '」があります。');
        return node('variable', { name });
      }
      if (t.type === '(') { index++; const value = add(depth + 1); consume(')'); return value; }
      error('数式の構文が正しくありません。');
    }
    function power(depth) { let left = primary(depth); if (peek() && peek().type === '^') { index++; left = node('binary', { op: '^', left, right: unary(depth + 1) }); } return left; }
    function unary(depth) { if (depth > LIMIT.depth) error('数式の入れ子が深すぎます。'); const t = peek(); if (t && (t.type === '+' || t.type === '-')) { index++; return node('unary', { op: t.type, value: unary(depth + 1) }); } return power(depth); }
    function multiply(depth) { let left = unary(depth); while (true) { const t = peek(); if (t && (t.type === '*' || t.type === '/')) { index++; left = node('binary', { op: t.type, left, right: unary(depth + 1) }); } else if (beginsAtom(t)) left = node('binary', { op: '*', left, right: unary(depth + 1) }); else break; } return left; }
    function add(depth) { let left = multiply(depth); while (peek() && (peek().type === '+' || peek().type === '-')) { const op = peek().type; index++; left = node('binary', { op, left, right: multiply(depth + 1) }); } return left; }
    const tree = add(0); if (index !== tokens.length) error('数式の構文が正しくありません。');
    const radians = v => angle === 'deg' ? v * Math.PI / 180 : v, degrees = v => angle === 'deg' ? v * 180 / Math.PI : v;
    function evaluateNode(n, scope) {
      let value;
      if (n.type === 'number') value = n.value;
      else if (n.type === 'variable') value = scope[n.name];
      else if (n.type === 'unary') { const a = evaluateNode(n.value, scope); value = n.op === '-' ? -a : a; }
      else if (n.type === 'binary') { const a = evaluateNode(n.left, scope), b = evaluateNode(n.right, scope); value = n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b); }
      else { const a = n.args.map(arg => evaluateNode(arg, scope)); const f = n.name; value = f === 'sin' ? Math.sin(radians(a[0])) : f === 'cos' ? Math.cos(radians(a[0])) : f === 'tan' ? Math.tan(radians(a[0])) : f === 'asin' ? degrees(Math.asin(a[0])) : f === 'acos' ? degrees(Math.acos(a[0])) : f === 'atan' ? degrees(Math.atan(a[0])) : f === 'sqrt' ? Math.sqrt(a[0]) : f === 'abs' ? Math.abs(a[0]) : f === 'exp' ? Math.exp(a[0]) : f === 'ln' ? Math.log(a[0]) : f === 'log' ? Math.log10(a[0]) : f === 'floor' ? Math.floor(a[0]) : f === 'ceil' ? Math.ceil(a[0]) : f === 'round' ? Math.round(a[0]) : f === 'min' ? Math.min(...a) : Math.max(...a); }
      return Number.isFinite(value) ? value : NaN;
    }
    return { evaluate(scope = {}) { if (!scope || typeof scope !== 'object') return NaN; for (const key of vars) if (!Number.isFinite(scope[key])) return NaN; return evaluateNode(tree, scope); } };
  }
  function compileEquation(expression, options = {}) {
    if (typeof expression !== 'string' || !expression.trim()) error('数式を入力してください。');
    const count = (expression.match(/=/g) || []).length;
    if (count > 1) error('方程式の等号は1つまでです。');
    const parts = count ? expression.split('=') : [expression, '0'];
    if (!parts[0].trim() || !parts[1].trim()) error('方程式の左右を入力してください。');
    const common = { variables: options.variables, angle: options.angle, target: false };
    const left = compile(parts[0], common), right = compile(parts[1], common);
    return { evaluate(scope = {}) { const value = left.evaluate(scope) - right.evaluate(scope); return Number.isFinite(value) ? value : NaN; } };
  }
  return { compile, compileEquation };
});
