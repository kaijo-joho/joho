// dr31の「数値の例」で共通の式ビルダーを使う。解答の計算と採点はSoundCore由来の
// SoundFormulasへ委ね、ここでは表示と明示的な解説の開閉だけを担当する。
(function (root) {
  'use strict';

  const Core = root.SoundCore;
  const Formulas = root.SoundFormulas;
  const FormulaBuilder = root.LessonFormulaBuilder;

  const problems = Object.freeze({
    'period-10hz': Object.freeze({ id: 'dr31-period-10hz', type: 'periodFromRate', params: Object.freeze({ sampleRate: 10 }) }),
    'rate-005sec': Object.freeze({ id: 'dr31-rate-005sec', type: 'rateFromPeriod', params: Object.freeze({ period: 0.05 }) }),
    'levels-3bit': Object.freeze({ id: 'dr31-levels-3bit', type: 'levelsFromBits', params: Object.freeze({ bitDepth: 3 }) }),
    'bits-16levels': Object.freeze({ id: 'dr31-bits-16levels', type: 'bitsFromLevels', params: Object.freeze({ levels: 16 }) })
  });

  function format(value) {
    return Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 12 });
  }

  function solutionLines(problem, expected) {
    if (problem.type === 'periodFromRate') {
      return [`T = 1 / fs = 1 / ${format(problem.params.sampleRate)} = ${format(expected)}秒`, `答え：${format(expected)}秒`];
    }
    if (problem.type === 'rateFromPeriod') {
      return [`fs = 1 / T = 1 / ${format(problem.params.period)} = ${format(expected)}Hz`, `答え：${format(expected)}Hz`];
    }
    if (problem.type === 'levelsFromBits') {
      return [`2ⁿ = 2${toSuperscript(problem.params.bitDepth)} = ${format(expected)}段階`, `答え：${format(expected)}段階`];
    }
    if (problem.type === 'bitsFromLevels') {
      const lower = Core.quantizationLevels(expected - 1);
      return [`2${toSuperscript(expected - 1)} = ${format(lower)} < ${format(problem.params.levels)} ≤ 2${toSuperscript(expected)} = ${format(Core.quantizationLevels(expected))}`, `したがって、必要な最小のビット数は${format(expected)}bitです。`];
    }
    return [];
  }

  function toSuperscript(value) {
    const digits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    return String(value).split('').map(digit => digits[Number(digit)] || digit).join('');
  }

  function renderSolution(host, problem, definition) {
    const target = host.querySelector('[data-sound-reference-solution] > div');
    const task = definition.tasks[0];
    if (!target || !task) return;
    target.replaceChildren(...solutionLines(problem, task.expected).map((line, index) => {
      const paragraph = document.createElement('p');
      const node = document.createElement(index === 1 ? 'strong' : 'code');
      node.textContent = line;
      paragraph.append(node);
      return paragraph;
    }));
  }

  function requestResize() {
    document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  }

  function initialize(scope = document) {
    const controllers = [];
    scope.querySelectorAll('[data-sound-reference-example]').forEach(host => {
      const problem = problems[host.dataset.soundReferenceExample];
      const formulaHost = host.querySelector('[data-sound-reference-formula]');
      if (!problem || !formulaHost) return;
      if (!Core || !Formulas || !FormulaBuilder) {
        formulaHost.textContent = '式の編集部品を読み込めませんでした。ページを再読み込みしてください。';
        return;
      }
      try {
        const definition = Formulas.define(problem);
        renderSolution(host, problem, definition);
        let feedback = null;
        const builder = FormulaBuilder.mount(formulaHost, definition, {
          onJudge({ rowId, taskId, intermediate, draft }) {
            const judgment = intermediate
              ? Formulas.gradeRow(definition, draft, rowId)
              : Formulas.grade(definition, draft, { taskId });
            feedback = judgment;
            builder.setFeedback(feedback);
          },
          onChange() {
            feedback = null;
          }
        });
        controllers.push(Object.freeze({ id: problem.id, host, definition, builder }));
      } catch (error) {
        formulaHost.textContent = `式の編集部品を表示できませんでした：${error.message}`;
        console.error('[sound-reference-formulas] initialization failed:', error);
      }
      host.querySelectorAll('details').forEach(details => details.addEventListener('toggle', requestResize));
    });
    return controllers;
  }

  const api = Object.freeze({ initialize, problems });
  root.SoundReferenceFormulas = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  } else {
    initialize();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
