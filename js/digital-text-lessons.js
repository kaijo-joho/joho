(function () {
  'use strict';
  const Core = window.DigitalTextCore;
  if (!Core) return;
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const one = (root, selector) => root.querySelector(selector);
  const set = (root, selector, value) => { one(root, selector).textContent = value; };
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const enhance = root => all(root, '.db-enhancement').forEach(element => { element.hidden = false; });
  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  const code = (text, base) => [node('span', text, 'dtx-code'), ...(base ? [node('sub', `(${base})`)] : [])];
  function cell(tag, children) {
    const element = node(tag);
    element.replaceChildren(...children);
    if (tag === 'th') element.scope = 'row';
    return element;
  }
  function asciiRows(entries) {
    return entries.map(entry => {
      const row = node('tr');
      row.append(cell('th', [node('span', entry.label)]), cell('td', code(entry.hex, 16)), cell('td', code(entry.bits, 2)));
      return row;
    });
  }
  function error(root, valid, message, input) {
    input.setAttribute('aria-invalid', String(!valid));
    one(root, '[data-dtx-error]').hidden = valid;
    one(root, '[data-dtx-output]').hidden = !valid;
    set(root, '[data-dtx-error]', valid ? '' : message);
  }
  function setupAscii(root) {
    const buttons = all(root, '[data-dtx-ascii-code]');
    let selected = 65;
    function pick(value, focus) {
      selected = value;
      const e = Core.asciiEntry(value), high = Math.floor(value / 16), low = value % 16;
      buttons.forEach(button => {
        const current = Number(button.dataset.dtxAsciiCode) === value;
        button.setAttribute('aria-pressed', String(current));
        button.tabIndex = current ? 0 : -1;
      });
      all(root, '[data-dtx-col]').forEach(th => th.classList.toggle('dtx-axis-selected', Number(th.dataset.dtxCol) === high));
      all(root, '[data-dtx-row]').forEach(th => th.classList.toggle('dtx-axis-selected', Number(th.dataset.dtxRow) === low));
      set(root, '[data-dtx-selected-label]', e.label); set(root, '[data-dtx-selected-name]', e.name);
      one(root, '[data-dtx-selected-code]').replaceChildren(node('span', `列${high} ＋ 行${low.toString(16).toUpperCase()} → `), ...code(e.hex, 16), node('span', ' ＝ '), ...code(e.bits, 2), node('span', ' ＝ '), ...code(String(e.code), 10));
      const button = one(root, `[data-dtx-ascii-code="${value}"]`);
      if (focus) {
        button.focus({ preventScroll: true });
        const scroller = one(root, '.dtx-ascii-scroll');
        const box = button.getBoundingClientRect(), frame = scroller.getBoundingClientRect();
        const topInset = one(root, 'thead').getBoundingClientRect().height;
        const leftInset = one(root, 'tbody th').getBoundingClientRect().width;
        if (box.top < frame.top + topInset) scroller.scrollTop -= frame.top + topInset - box.top;
        if (box.bottom > frame.bottom) scroller.scrollTop += box.bottom - frame.bottom;
        if (box.left < frame.left + leftInset) scroller.scrollLeft -= frame.left + leftInset - box.left;
        if (box.right > frame.right) scroller.scrollLeft += box.right - frame.right;
      }
      resize();
    }
    buttons.forEach(button => {
      button.disabled = false;
      button.addEventListener('click', () => pick(Number(button.dataset.dtxAsciiCode), false));
      button.addEventListener('keydown', event => {
        const high = Math.floor(selected / 16), low = selected % 16;
        const destinations = { ArrowUp: selected - (low > 0 ? 1 : 0), ArrowDown: selected + (low < 15 ? 1 : 0), ArrowLeft: selected - (high > 0 ? 16 : 0), ArrowRight: selected + (high < 7 ? 16 : 0), Home: 0, End: 127 };
        if (!(event.key in destinations)) return;
        event.preventDefault(); event.stopPropagation(); pick(destinations[event.key], true);
      });
    });
    all(root, '[data-dtx-pick]').forEach(button => button.addEventListener('click', () => pick(Number(button.dataset.dtxPick), true)));
    enhance(root); pick(65, false);
  }
  function setupSteps(root) {
    let count = 1;
    const rows = all(root, '[data-dtx-step-rows] > tr'), next = one(root, '[data-dtx-next]');
    function render() {
      rows.forEach((row, index) => { row.hidden = index >= count; });
      one(root, '[data-dtx-stage-final]').hidden = count < rows.length;
      set(root, '[data-dtx-progress]', `${count} / ${rows.length}文字`);
      next.disabled = count === rows.length; resize();
    }
    next.addEventListener('click', () => { count = Math.min(rows.length, count + 1); render(); });
    one(root, '[data-dtx-reset]').addEventListener('click', () => { count = 1; render(); });
    enhance(root); render();
  }
  function setupConverter(root) {
    const input = one(root, '[data-dtx-input]'), mode = one(root, '[data-dtx-mode]');
    let previousMode = mode.value, lastText = 'Kaijo';
    function render() {
      const textMode = mode.value === 'text', binary = mode.value === '2';
      set(root, '[data-dtx-input-label]', textMode ? '文字列（ASCII）' : binary ? 'ビット列' : '16進数のバイト列');
      set(root, '[data-dtx-hint]', textMode ? 'ASCIIの文字を32文字まで。空白と改行もそのまま変換します。' : `${binary ? '8bit' : '16進数2桁'}ずつ、32Bまで。区切りの空白・改行は省略できます。`);
      let result;
      try { result = textMode ? Core.encodeAscii(input.value) : Core.decodeAscii(input.value, Number(mode.value)); }
      catch { result = null; }
      const valid = result !== null && result.byteLength > 0;
      error(root, valid, textMode ? 'ASCIIで表せる文字を1〜32文字入力してください。日本語・全角英字・絵文字はASCIIに含まれません。' : `ASCIIの範囲を、${binary ? '8桁の0と1（先頭は0）' : '00〜7Fの16進数2桁'}にそろえて入力してください。1〜32Bに対応します。`, input);
      if (!valid) { resize(); return; }
      lastText = result.text;
      // 制御文字は結果の表示だけ略号にし、変換対象の文字列は保持する。
      set(root, '[data-dtx-decoded]', result.entries.map(e => e.kind === 'control' ? `[${e.label}]` : e.character).join(''));
      one(root, '[data-dtx-convert-rows]').replaceChildren(...asciiRows(result.entries));
      set(root, '[data-dtx-count]', `${result.byteLength}文字・${result.byteLength}B（${result.byteLength * 8}bit）`); resize();
    }
    input.addEventListener('input', render);
    mode.addEventListener('change', () => {
      if (mode.value === previousMode) return;
      const encoded = Core.encodeAscii(lastText);
      input.value = mode.value === 'text' ? encoded.text : mode.value === '2' ? encoded.bits : encoded.hex;
      previousMode = mode.value; render();
    });
    one(root, '[data-dtx-reset]').addEventListener('click', () => { mode.value = '2'; previousMode = '2'; input.value = Core.encodeAscii('Kaijo').bits; render(); });
    enhance(root); render();
  }
  function setupUtf8(root) {
    const input = one(root, '[data-dtx-input]');
    function render() {
      let result;
      try { result = Core.utf8(input.value); } catch { result = null; }
      error(root, result !== null, '32コードポイント以内の文字列を入力してください。不完全なUnicodeの文字は扱えません。', input);
      if (!result) { resize(); return; }
      const rows = result.entries.map(entry => {
        const row = node('tr');
        row.append(cell('th', [node('span', entry.label)]), cell('td', code(entry.codePointLabel)), cell('td', code(entry.hex, 16)), cell('td', [node('span', `${entry.byteLength}B`)]));
        return row;
      });
      one(root, '[data-dtx-utf8-rows]').replaceChildren(...rows);
      const sizes = result.entries.map(e => `${e.byteLength}B`).join(' ＋ ');
      one(root, '[data-dtx-total]').replaceChildren(node('span', sizes ? `${sizes} ＝ ` : ''), node('strong', `${result.byteLength}B（${result.byteLength * 8}bit）`));
      set(root, '[data-dtx-cp-count]', `${result.codePointCount}コードポイントを符号化した結果です。${result.codePointCount === 0 ? '空の文字列にはバイトがありません。' : ''}`); resize();
    }
    input.addEventListener('input', render);
    all(root, '[data-dtx-preset]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.dtxPreset; render(); }));
    enhance(root); render();
  }
  function setupMojibake(root) {
    const write = one(root, '[data-dtx-write]'), read = one(root, '[data-dtx-read]');
    // 実際に「日本」を各方式で符号化した固定例を使う。
    const samples = {
      'utf-8': [0xE6, 0x97, 0xA5, 0xE6, 0x9C, 0xAC],
      'shift_jis': [0x93, 0xFA, 0x96, 0x7B],
      'iso-2022-jp': [0x1B, 0x24, 0x42, 0x46, 0x7C, 0x4B, 0x5C, 0x1B, 0x28, 0x42]
    };
    const names = { 'utf-8': 'UTF-8', 'shift_jis': 'Shift_JIS', 'iso-2022-jp': 'ISO-2022-JP' };
    function render() {
      const bytes = samples[write.value], result = Core.decodeBytes(bytes, read.value);
      one(root, '[data-dtx-stored]').replaceChildren(...code(bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '), 16));
      set(root, '[data-dtx-write-label]', `${names[write.value]}で保存`);
      set(root, '[data-dtx-read-label]', `${names[read.value]}で読む`);
      // ISO-2022-JPのESCなどを別方式で読んだ場合も、見えない文字を略号で示す。
      const visible = result.ok ? Array.from(result.text, ch => {
        const cp = ch.codePointAt(0);
        return (cp < 32 || cp === 127) ? `[${Core.asciiEntry(cp).label}]` : ch;
      }).join('') : '読み取れません';
      set(root, '[data-dtx-read-result]', visible);
      set(root, '[data-dtx-mojibake-result]', write.value === read.value && result.ok ? '方式が一致し、もとの「日本」を読み取れました。' : result.ok ? '方式が一致せず、別の文字として読み取られました。制御文字は略号で示しています。' : '指定した方式では不正なバイト列になるため、読み取れません。'); resize();
    }
    [write, read].forEach(select => select.addEventListener('change', render));
    one(root, '[data-dtx-match]').addEventListener('click', () => { read.value = write.value; render(); });
    enhance(root); render();
  }
  function init() {
    for (const [selector, setup] of [['[data-dtx-ascii-table]', setupAscii], ['[data-dtx-encode-steps]', setupSteps], ['[data-dtx-converter]', setupConverter], ['[data-dtx-utf8]', setupUtf8], ['[data-dtx-mojibake]', setupMojibake]]) {
      all(document, selector).forEach(root => { try { setup(root); } catch (exception) { console.error('文字コードの操作を初期化できませんでした。', exception); } });
    }
    all(document, 'details').forEach(details => details.addEventListener('toggle', resize));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
