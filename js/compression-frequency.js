(function () {
  'use strict';

  const root = document.querySelector('[data-cp-frequency-assignment]');
  const Core = window.CompressionCore;
  if (!root || !Core || !Core.HUFFMAN_EXAMPLE) return;

  const fixture = Core.HUFFMAN_EXAMPLE;
  const symbols = Object.keys(fixture.frequencies).sort((left, right) =>
    fixture.frequencies[right] - fixture.frequencies[left] || left.localeCompare(right, 'en')
  );
  const codes = fixture.codes;
  const tree = Core.huffmanFromCodes(fixture.frequencies, codes);
  const expectedOrder = ['B', 'A', 'C', 'D', 'E'];
  if (symbols.join('') !== expectedOrder.join('') || tree.totalBits !== 38) return;

  const source = root.querySelector('[data-cp-frequency-source]');
  const codeCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-code]'), cell => [cell.dataset.cpFrequencyCode, cell]));
  const bitCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-contribution]'), cell => [cell.dataset.cpFrequencyContribution, cell]));
  const frequencyCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-count]'), cell => [cell.dataset.cpFrequencyCount, cell]));
  const columns = new Map(Object.keys(fixture.frequencies).map(symbol => [symbol,
    Array.from(root.querySelectorAll(`[data-cp-frequency-column="${symbol}"]`))
  ]));
  const original = root.querySelector('[data-cp-frequency-original-total]');
  const compressed = root.querySelector('[data-cp-frequency-compressed-total]');
  const status = root.querySelector('[data-cp-frequency-assignment-status]');
  const controls = root.querySelector('[data-cp-frequency-assignment-controls]');
  const play = root.querySelector('[data-cp-frequency-play]');
  const next = root.querySelector('[data-cp-frequency-next]');
  const replay = root.querySelector('[data-cp-frequency-replay]');
  if (!source || !status || !controls || !play || !next || !replay || symbols.some(symbol =>
    !codeCells.has(symbol) || !bitCells.has(symbol) || !frequencyCells.has(symbol) || !columns.get(symbol)?.length
  )) return;

  source.textContent = fixture.text;
  for (const symbol of Object.keys(fixture.frequencies)) frequencyCells.get(symbol).textContent = String(fixture.frequencies[symbol]);
  original.textContent = `${fixture.text.length * fixture.fixedBits}bit`;
  compressed.textContent = `${tree.totalBits}bit`;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const slide = root.closest('[data-lesson-slide]');
  let step = 0;
  let timer = 0;
  let running = false;
  const messages = {
    B: 'B（7回）には1bitの符号0。最も多い文字に短い符号が使われています。',
    A: 'A（5回）には2bitの符号10。次に多い文字の符号も短めです。',
    C: 'C（3回）には3bitの符号110。頻度が下がると符号が長くなっています。',
    D: 'D（2回）には4bitの符号1110。符号はハフマン木の枝から決まります。',
    E: 'E（1回）には4bitの符号1111。次のスライドで木から符号の決まり方を確かめます。'
  };

  function isAvailable() {
    return !document.hidden && (!slide || (!slide.hidden && slide.getAttribute('aria-hidden') !== 'true'));
  }

  function stop() {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    running = false;
    play.textContent = '再生';
    play.setAttribute('aria-label', '頻度の高い順に符号を表示');
    play.setAttribute('aria-pressed', 'false');
  }

  function render() {
    symbols.forEach((symbol, index) => {
      const shown = index < step;
      codeCells.get(symbol).textContent = shown ? codes[symbol] : '';
      bitCells.get(symbol).textContent = shown ? String(fixture.frequencies[symbol] * codes[symbol].length) : '';
      columns.get(symbol).forEach(cell => cell.classList.toggle('is-current', index === step - 1));
    });
    if (step === 0) status.textContent = '再生または「次の割り当て」で、頻度の高い文字から符号とbit数を見ます。';
    else if (step < symbols.length) status.textContent = messages[symbols[step - 1]];
    else status.textContent = '合計は38bit。固定長3bitの54bitに対して約70%です。符号は次のスライドで作るハフマン木から読み取れます。';
    compressed.textContent = step >= symbols.length ? `${tree.totalBits}bit` : '—';
    next.disabled = step >= symbols.length;
    play.disabled = step >= symbols.length;
  }

  function advance() {
    if (step < symbols.length) step += 1;
    render();
    if (step >= symbols.length) stop();
  }

  function schedule() {
    if (!running || !isAvailable()) { stop(); return; }
    timer = window.setTimeout(() => {
      timer = 0;
      advance();
      if (running) schedule();
    }, 900);
  }

  function start() {
    if (step >= symbols.length || !isAvailable()) return;
    if (reducedMotion.matches) {
      step = symbols.length;
      render();
      return;
    }
    running = true;
    play.textContent = '一時停止';
    play.setAttribute('aria-label', 'アニメーションを一時停止');
    play.setAttribute('aria-pressed', 'true');
    schedule();
  }

  function reset() {
    stop();
    step = 0;
    render();
  }

  controls.hidden = false;
  root.classList.add('is-enhanced');
  play.addEventListener('click', () => running ? stop() : start());
  next.addEventListener('click', () => { stop(); advance(); });
  replay.addEventListener('click', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  document.addEventListener('joho:lesson-slide-change', event => {
    if (event.detail?.slide !== slide) stop();
  });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) stop(); });
  render();
})();
