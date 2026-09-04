// 音のデジタル表現の宣言的な問題生成・採点UI。
(function (root) {
  'use strict';

  const Core = root.SoundCore;
  const Renderer = root.SoundRenderer;
  const Widgets = root.SoundWidgets;
  if (!Core || !Renderer || !Widgets) throw new Error('sound-quiz.jsの依存ファイルが読み込まれていません。');

  const el = Widgets.element;

  function byId(id) {
    return document.getElementById(id);
  }

  function makeDigitizationProblem(definition) {
    const params = Object.freeze({
      values: Object.freeze(Array.from(definition.values)),
      sampleRate: definition.sampleRate,
      bitDepth: definition.bitDepth,
      range: Object.freeze({ ...definition.range }),
      start: definition.start ?? 0
    });
    return Object.freeze({
      id: definition.id,
      type: 'waveDigitization',
      level: definition.level,
      params,
      expected: Object.freeze(Core.deriveDigitizationAnswers(params.values, params)),
      explanation: definition.explanation || '標本時刻の値を読み、最も近い段階値へそろえてから、決められたビット数の2進数にします。'
    });
  }

  function generatedDigitizationProblems(random) {
    const problems = [];
    for (let problemIndex = 1; problemIndex <= 5; problemIndex += 1) {
      const bitDepth = random.integer(3, 4);
      const levels = Core.quantizationLevels(bitDepth);
      const range = { min: 0, max: 8 };
      const width = Core.quantizationWidth(bitDepth, range);
      const count = random.integer(4, 6);
      const values = [];
      for (let index = 0; index < count; index += 1) {
        let code = random.integer(1, levels - 2);
        if (index > 0 && code === Math.round(values[index - 1] / width)) {
          code = code === levels - 2 ? code - 1 : code + 1;
        }
        values.push(code * width);
      }
      problems.push(makeDigitizationProblem({
        id: `grid-${problemIndex}-${bitDepth}bit`,
        level: bitDepth === 3 ? 2 : 3,
        values,
        sampleRate: random() < 0.5 ? 5 : 10,
        bitDepth,
        range,
        explanation: '正解となる格子上の標本値を先に決め、その点を通る滑らかな曲線を描いています。標本点は量子化境界ちょうどには置いていません。'
      }));
    }
    return problems;
  }

  function createCalculationProblem(definition) {
    const params = Object.freeze({ ...definition.params });
    let expected;
    if (definition.kind === 'periodFromRate') {
      expected = Core.samplingPeriod(params.sampleRate);
    } else if (definition.kind === 'rateFromPeriod') {
      expected = 1 / params.period;
    } else if (definition.kind === 'levelsFromBits') {
      expected = Core.quantizationLevels(params.bitDepth);
    } else if (definition.kind === 'bitsFromLevels') {
      expected = Core.requiredBitsForLevels(params.levels);
    } else if (definition.kind === 'dataSize') {
      const size = Core.audioDataSize(params);
      expected = params.answerUnit === 'B'
        ? size.bytes
        : Core.convertBytes(size.bytes, params.answerUnit, params.base);
    } else {
      throw new TypeError(`未対応の計算問題「${definition.kind}」です。`);
    }
    return Object.freeze({
      id: definition.id,
      type: definition.kind,
      level: definition.level,
      params,
      expected,
      prompt: definition.prompt,
      answerUnit: definition.answerUnit,
      tolerance: definition.tolerance ?? Math.max(1e-7, Math.abs(expected) * 1e-6),
      explanation: definition.explanation
    });
  }

  function theoremChoice(definition) {
    const theorem = Core.samplingTheoremState(definition.signalFrequency, definition.sampleRate);
    return Object.freeze({
      id: definition.id,
      type: 'samplingTheoremChoice',
      level: definition.level,
      params: Object.freeze({
        prompt: `成分波の最大周波数が${definition.signalFrequency}Hz、標本化周波数が${definition.sampleRate}Hzです。状態として最も適切なものを選んでください。`,
        choices: Object.freeze([
          Object.freeze({ value: 'sufficient', label: '標本化周波数が最大周波数の2倍より大きい' }),
          Object.freeze({ value: 'boundary', label: '標本化周波数が最大周波数の2倍と等しい' }),
          Object.freeze({ value: 'insufficient', label: '標本化周波数が最大周波数の2倍より小さい' })
        ])
      }),
      expected: theorem.state,
      explanation: theorem.state === 'sufficient'
        ? `${definition.sampleRate} > 2 × ${definition.signalFrequency} なので条件を満たします。`
        : theorem.state === 'boundary'
          ? `${definition.sampleRate} = 2 × ${definition.signalFrequency} の境界です。位相によって一意に判断できない場合があります。`
          : `${definition.sampleRate} < 2 × ${definition.signalFrequency} なので標本化する回数が不足し、元の波形とは異なる波形として見える場合があります。`
    });
  }

  const TERM_PROBLEMS = Object.freeze([
    {
      id: 'term-sampling', type: 'termChoice', level: 1,
      params: {
        prompt: '一定の時間間隔で、アナログ波形の値を取り出す操作はどれですか。',
        choices: [
          { value: 'sampling', label: '標本化（サンプリング）' },
          { value: 'quantization', label: '量子化' },
          { value: 'encoding', label: '符号化' }
        ]
      },
      expected: 'sampling',
      explanation: '標本化は、一定の時間間隔で波形の値を取り出す操作です。'
    },
    {
      id: 'term-quantization', type: 'termChoice', level: 1,
      params: {
        prompt: '標本値を、用意された段階のうち最も近い値へそろえる操作はどれですか。',
        choices: [
          { value: 'encoding', label: '符号化' },
          { value: 'quantization', label: '量子化' },
          { value: 'sampling', label: '標本化' }
        ]
      },
      expected: 'quantization',
      explanation: '量子化では連続的な大きさを、有限個の段階の値へ対応させます。'
    },
    {
      id: 'term-encoding', type: 'termChoice', level: 1,
      params: {
        prompt: '量子化した段階値を、0と1の組み合わせで表現する操作はどれですか。',
        choices: [
          { value: 'sampling', label: '標本化' },
          { value: 'encoding', label: '符号化（コード化）' },
          { value: 'superposition', label: '重ね合わせ' }
        ]
      },
      expected: 'encoding',
      explanation: '符号化（コード化）は、量子化した段階値を2進数で表現する操作です。'
    },
    {
      id: 'term-pcm', type: 'termChoice', level: 1,
      params: {
        prompt: '「パルス符号変調」を表す略語はどれですか。',
        choices: [
          { value: 'pcm', label: 'PCM' },
          { value: 'hz', label: 'Hz' },
          { value: 'bit', label: 'bit' }
        ]
      },
      expected: 'pcm',
      explanation: 'PCMは「パルス符号変調」の略です。'
    },
    {
      id: 'term-frequency', type: 'termChoice', level: 2,
      params: {
        prompt: '「1秒間に何回、波形の値を取り出すか」を表し、単位にHzを使う量はどれですか。',
        choices: [
          { value: 'period', label: '標本化周期' },
          { value: 'rate', label: '標本化周波数' },
          { value: 'bitDepth', label: '量子化ビット数' }
        ]
      },
      expected: 'rate',
      explanation: '標本化周波数fsは1秒間の標本化回数です。標本化周期はT = 1 / fsです。'
    },
    {
      id: 'term-levels', type: 'termChoice', level: 2,
      params: {
        prompt: '量子化ビット数をn bitとすると、量子化段階数はいくつですか。',
        choices: [
          { value: 'twice', label: '2n 段階' },
          { value: 'power', label: '2ⁿ 段階' },
          { value: 'square', label: 'n² 段階' }
        ]
      },
      expected: 'power',
      explanation: 'n個のbitにはそれぞれ0/1があるので、組み合わせは2ⁿ通りです。'
    },
    {
      id: 'term-theorem', type: 'termChoice', level: 2,
      params: {
        prompt: '元の波形を再現するための標本化定理の条件はどれですか。',
        choices: [
          { value: 'greater', label: '成分波の最大周波数の2倍より大きい周波数で標本化する' },
          { value: 'equalOrGreater', label: '成分波の最大周波数以上で標本化する' },
          { value: 'less', label: '成分波の最大周波数の2倍より小さい周波数で標本化する' }
        ]
      },
      expected: 'greater',
      explanation: '成分波の最大周波数の2倍より大きい周波数で標本化すれば、元の波形を再現できます。'
    },
    {
      id: 'term-boundary', type: 'termChoice', level: 3,
      params: {
        prompt: '標本化周波数が成分波の最大周波数の2倍と等しい場合について、最も適切な説明はどれですか。',
        choices: [
          { value: 'always', label: '位相に関係なく、必ず元の波形を一意に判断できる' },
          { value: 'phase', label: '位相によっては、元の波形を一意に判断できない' },
          { value: 'none', label: '標本化周波数とは無関係である' }
        ]
      },
      expected: 'phase',
      explanation: '波の零交差点だけを標本化すると、すべて0になることがあります。これが境界に注意する理由です。'
    }
  ].map(problem => Object.freeze({
    ...problem,
    params: Object.freeze({
      ...problem.params,
      choices: Object.freeze(problem.params.choices.map(choice => Object.freeze({ ...choice })))
    })
  })));

  function initialize() {
    const tabsHost = byId('sound-quiz-tabs');
    const hasDigitization = Boolean(byId('digitization-judge'));
    const hasCalculation = Boolean(byId('calculation-judge'));
    const hasTerminology = Boolean(byId('terminology-judge'));
    if (!hasDigitization && !hasCalculation && !hasTerminology) return;

    const querySeed = new URLSearchParams(window.location.search).get('seed');
    const seed = querySeed || document.body.dataset.soundQuizSeed || 'sound-classroom-v1';
    const random = Core.createSeededRandom(seed);
    const score = { attempted: 0, correct: 0 };
    const state = {
      digitization: null,
      calculation: null,
      terminology: null,
      last: { digitization: '', calculation: '', terminology: '' }
    };

    const digitizationProblems = [
      makeDigitizationProblem({
        id: 'pdf-3bit-wave',
        level: 1,
        values: [2, 3, 6, 7, 6, 3],
        sampleRate: 10,
        bitDepth: 3,
        range: { min: 0, max: 8 },
        explanation: '3bitの例です。範囲0以上8未満を幅1で量子化し、各段階値を3桁の2進数にします。'
      }),
      makeDigitizationProblem({
        id: 'pdf-4bit-wave',
        level: 2,
        values: [4, 12, 12, 2],
        sampleRate: 5,
        bitDepth: 4,
        range: { min: 0, max: 16 },
        explanation: '4bitの例です。2進数は0100 1100 1100 0010となります。'
      }),
      ...generatedDigitizationProblems(random)
    ];

    const calculationProblems = [
      createCalculationProblem({
        id: 'period-10hz', kind: 'periodFromRate', level: 1,
        params: { sampleRate: 10 },
        prompt: '標本化周波数が10Hzのとき、標本化周期Tは何秒ですか。',
        answerUnit: '秒',
        explanation: 'T = 1 / fs = 1 / 10 = 0.1秒です。'
      }),
      createCalculationProblem({
        id: 'rate-002sec', kind: 'rateFromPeriod', level: 1,
        params: { period: 0.02 },
        prompt: '標本化周期が0.02秒のとき、標本化周波数fsは何Hzですか。',
        answerUnit: 'Hz',
        explanation: 'fs = 1 / T = 1 / 0.02 = 50Hzです。'
      }),
      createCalculationProblem({
        id: 'levels-4bit', kind: 'levelsFromBits', level: 1,
        params: { bitDepth: 4 },
        prompt: '量子化ビット数が4bitのとき、量子化段階数はいくつですか。',
        answerUnit: '段階',
        explanation: '2⁴ = 16段階です。'
      }),
      createCalculationProblem({
        id: 'bits-32levels', kind: 'bitsFromLevels', level: 2,
        params: { levels: 32 },
        prompt: '32段階を区別するために必要な量子化ビット数は何bitですか。',
        answerUnit: 'bit',
        explanation: '2⁵ = 32なので5bit必要です。'
      }),
      createCalculationProblem({
        id: 'pdf-6000b', kind: 'dataSize', level: 2,
        params: { sampleRate: 200, seconds: 60, bitDepth: 4, channels: 1, answerUnit: 'B' },
        prompt: '標本化周波数200Hz、量子化4bit、モノラル、60秒の音声データは何Bですか。',
        answerUnit: 'B',
        explanation: '200 × 60 × 4 × 1 = 48,000bit、8で割って6,000Bです。'
      }),
      createCalculationProblem({
        id: 'pdf-81920b', kind: 'dataSize', level: 2,
        params: { sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1, answerUnit: 'B' },
        prompt: '標本化周波数20,480Hz、量子化16bit、モノラル、2秒の音声データは何Bですか。',
        answerUnit: 'B',
        explanation: '20,480 × 2 × 16 × 1 ÷ 8 = 81,920Bです。'
      }),
      createCalculationProblem({
        id: 'pdf-80kb-binary', kind: 'dataSize', level: 2,
        params: { sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1, answerUnit: 'KB', base: 1024 },
        prompt: '標本化周波数20,480Hz、量子化16bit、モノラル、2秒の音声データは何KBですか。この問題では1KB = 1024Bで換算します。',
        answerUnit: 'KB',
        explanation: '81,920B ÷ 1,024 = 80KBです。この問題の換算基数は1024です。'
      }),
      createCalculationProblem({
        id: 'cd-one-second-decimal', kind: 'dataSize', level: 2,
        params: { sampleRate: 44100, seconds: 1, bitDepth: 16, channels: 2, answerUnit: 'KB', base: 1000 },
        prompt: 'CD音質（44,100Hz、16bit、ステレオ）の1秒分は何KBですか。1KB = 1000Bで換算します。',
        answerUnit: 'KB',
        explanation: '44,100 × 1 × 16 × 2 ÷ 8 = 176,400B、1,000で割って176.4KBです。'
      }),
      createCalculationProblem({
        id: 'cd-full-binary', kind: 'dataSize', level: 3,
        params: { sampleRate: 44100, seconds: 74 * 60 + 42, bitDepth: 16, channels: 2, answerUnit: 'MB', base: 1024 },
        prompt: 'CD音質（44,100Hz、16bit、ステレオ）で74分42秒を記録すると約何MBですか。この問題では1KB = 1024B、1MB = 1024KBで換算し、小数第1位まで答えてください。',
        answerUnit: 'MB', tolerance: 0.06,
        explanation: '74分42秒 = 4,482秒。790,624,800B ÷ 1,024² ≈ 754.0MBです。'
      }),
      createCalculationProblem({
        id: 'high-resolution-binary', kind: 'dataSize', level: 3,
        params: { sampleRate: 192000, seconds: 256, bitDepth: 24, channels: 2, answerUnit: 'MB', base: 1024 },
        prompt: '192kHz、24bit、ステレオ、256秒の音声データは何MBですか。この問題では1KB = 1024B、1MB = 1024KBで換算します。',
        answerUnit: 'MB',
        explanation: '192,000 × 256 × 24 × 2 ÷ 8 = 294,912,000B、1,024²で割って281.25MBです。'
      })
    ];

    const terminologyProblems = [
      ...TERM_PROBLEMS,
      theoremChoice({ id: 'theorem-sufficient', level: 2, signalFrequency: 4, sampleRate: 10 }),
      theoremChoice({ id: 'theorem-boundary', level: 2, signalFrequency: 5, sampleRate: 10 }),
      theoremChoice({ id: 'theorem-insufficient', level: 2, signalFrequency: 7, sampleRate: 10 })
    ];

    const seedOutput = byId('sound-quiz-seed');
    if (seedOutput) seedOutput.textContent = `問題シード：${seed}`;

    function updateScore() {
      document.querySelectorAll('[data-sound-score]').forEach(output => {
        output.textContent = `解答 ${score.attempted}問 ／ 正解 ${score.correct}問`;
      });
    }

    function record(result, correct) {
      if (!result.counted) {
        result.counted = true;
        score.attempted += 1;
        if (correct) score.correct += 1;
      }
      updateScore();
    }

    function setFeedback(target, message, kind = '') {
      target.className = `dr-feedback${kind ? ` is-${kind}` : ''}`;
      target.textContent = message;
    }

    function choose(mode, pool) {
      const problem = Core.chooseWithoutImmediateRepeat(pool, state.last[mode], random);
      state.last[mode] = problem.id;
      return problem;
    }

    function answerCell(row, field, value, judged, expected) {
      const cell = document.createElement('td');
      const input = el('input', `dr-quiz-input${field === 'binary' ? ' dr-quiz-input--binary' : ''}`);
      input.type = field === 'binary' ? 'text' : 'number';
      if (field !== 'binary') input.step = 'any';
      input.inputMode = field === 'binary' ? 'numeric' : 'decimal';
      input.value = value ?? '';
      input.dataset.answerField = field;
      input.dataset.answerIndex = String(row);
      const fieldNames = {
        sampleValue: '標本値',
        quantizedValue: '量子化後の値',
        code: '段階値',
        binary: '2進数'
      };
      input.setAttribute('aria-label', `標本${row + 1}の${fieldNames[field]}`);
      input.addEventListener('input', () => {
        state.digitization.answers[row][field] = input.value;
      });
      if (judged) {
        input.disabled = true;
        const normalized = field === 'binary'
          ? String(value ?? '').replace(/\s/g, '')
          : Number(value);
        const correct = field === 'binary'
          ? normalized === expected.binary
          : Number.isFinite(normalized) && Math.abs(normalized - expected[field]) <= 1e-6;
        const unanswered = String(value ?? '').trim() === '';
        cell.classList.add(unanswered ? 'is-unanswered' : correct ? 'is-correct' : 'is-wrong');
        input.setAttribute('aria-invalid', correct ? 'false' : 'true');
        const mark = el('span', 'dr-cell-mark');
        mark.textContent = correct ? '✓ 正解' : `正解：${expected[field]}`;
        cell.append(input, mark);
      } else {
        cell.appendChild(input);
      }
      return cell;
    }

    function renderDigitization() {
      const result = state.digitization;
      const problem = result.problem;
      const params = problem.params;
      byId('digitization-prompt').replaceChildren();
      const promptText = el('div', '', `波形から各標本の値を読み取り、量子化後の値・段階値・${params.bitDepth}bitの2進数を入力してください。（難易度 ${problem.level}）`);
      const conditions = el('div', 'dr-condition-list');
      [
        `fs = ${params.sampleRate} Hz`,
        `T = ${Widgets.formatNumber(Core.samplingPeriod(params.sampleRate), 3)} 秒`,
        `${params.bitDepth} bit（${Core.quantizationLevels(params.bitDepth)}段階）`,
        `範囲 ${params.range.min}以上${params.range.max}未満`,
        `量子化の幅 ${Widgets.formatNumber(Core.quantizationWidth(params.bitDepth, params.range), 3)}`
      ].forEach(text => conditions.appendChild(el('span', 'dr-condition', text)));
      byId('digitization-prompt').append(promptText, conditions);
      Renderer.renderDigitizationProblem(byId('digitization-graph'), params, {
        title: `難易度${problem.level}のデジタル化問題`
      });

      const table = el('table', 'dr-answer-table');
      table.appendChild(el('caption', '', '標本ごとに入力してください'));
      const thead = document.createElement('thead');
      const header = document.createElement('tr');
      ['時刻［秒］', '標本値', '量子化後の値', '段階値', `${params.bitDepth}bitの2進数`].forEach(text => header.appendChild(el('th', '', text)));
      thead.appendChild(header);
      const tbody = document.createElement('tbody');
      problem.expected.forEach((expected, index) => {
        const row = document.createElement('tr');
        row.appendChild(el('td', '', Widgets.formatNumber(expected.time, 3)));
        ['sampleValue', 'quantizedValue', 'code', 'binary'].forEach(field => {
          row.appendChild(answerCell(index, field, result.answers[index][field], result.judged, expected));
        });
        tbody.appendChild(row);
      });
      table.append(thead, tbody);
      const scroll = el('div', 'dr-table-scroll');
      scroll.appendChild(table);
      byId('digitization-answer-grid').replaceChildren(scroll);
      byId('digitization-judge').disabled = result.judged;
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }

    function newDigitizationProblem() {
      const problem = choose('digitization', digitizationProblems);
      state.digitization = {
        problem,
        answers: problem.expected.map(() => ({ sampleValue: '', quantizedValue: '', code: '', binary: '' })),
        judged: false,
        counted: false
      };
      setFeedback(byId('digitization-feedback'), 'グラフと条件を読み、すべてのセルへ入力してから判定します。');
      renderDigitization();
    }

    if (hasDigitization) {
      byId('digitization-judge').addEventListener('click', () => {
        const result = state.digitization;
        if (!result || result.judged) return;
        result.judged = true;
        const incorrectSamples = [];
        let correctCells = 0;
        let unansweredCells = 0;
        result.problem.expected.forEach((expected, index) => {
          let sampleCorrect = true;
          ['sampleValue', 'quantizedValue', 'code', 'binary'].forEach(field => {
            const raw = result.answers[index][field];
            if (String(raw).trim() === '') unansweredCells += 1;
            const correct = field === 'binary'
              ? String(raw).replace(/\s/g, '') === expected.binary
              : Number.isFinite(Number(raw)) && String(raw).trim() !== '' && Math.abs(Number(raw) - expected[field]) <= 1e-6;
            if (correct) correctCells += 1;
            else sampleCorrect = false;
          });
          if (!sampleCorrect) incorrectSamples.push(index + 1);
        });
        const totalCells = result.problem.expected.length * 4;
        const correct = correctCells === totalCells;
        record(result, correct);
        const detail = correct
          ? `全${totalCells}セル正解です。${result.problem.explanation}`
          : `${correctCells}/${totalCells}セルが正解です。見直す標本：${incorrectSamples.join('、')}。${unansweredCells ? `未回答は${unansweredCells}セルです。` : ''} ${result.problem.explanation}`;
        setFeedback(byId('digitization-feedback'), detail, correct ? 'correct' : 'wrong');
        renderDigitization();
      });
      byId('digitization-next').addEventListener('click', newDigitizationProblem);
    }

    function renderCalculation() {
      const result = state.calculation;
      const problem = result.problem;
      byId('calculation-prompt').textContent = `${problem.prompt}（難易度 ${problem.level}）`;
      const input = byId('calculation-answer');
      input.value = result.answer;
      input.disabled = result.judged;
      byId('calculation-unit').textContent = problem.answerUnit;
      byId('calculation-judge').disabled = result.judged;
    }

    function newCalculationProblem() {
      const problem = choose('calculation', calculationProblems);
      state.calculation = { problem, answer: '', judged: false, counted: false };
      setFeedback(byId('calculation-feedback'), '式を立てて数値を入力してください。単位は問題文と入力欄の右側で確認できます。');
      renderCalculation();
      byId('calculation-answer').focus({ preventScroll: true });
    }

    if (hasCalculation) {
      byId('calculation-answer').addEventListener('input', event => {
        if (state.calculation) state.calculation.answer = event.target.value;
      });
      byId('calculation-judge').addEventListener('click', () => {
        const result = state.calculation;
        if (!result || result.judged) return;
        const answer = Number(result.answer);
        const correct = result.answer.trim() !== ''
          && Number.isFinite(answer)
          && Math.abs(answer - result.problem.expected) <= result.problem.tolerance;
        result.judged = true;
        record(result, correct);
        const expected = Widgets.formatNumber(result.problem.expected, 4);
        setFeedback(
          byId('calculation-feedback'),
          correct
            ? `正解です。${result.problem.explanation}`
            : `正解は ${expected}${result.problem.answerUnit} です。${result.problem.explanation}`,
          correct ? 'correct' : 'wrong'
        );
        renderCalculation();
      });
      byId('calculation-next').addEventListener('click', newCalculationProblem);
    }

    function renderTerminology() {
      const result = state.terminology;
      const problem = result.problem;
      byId('terminology-prompt').textContent = `${problem.params.prompt}（難易度 ${problem.level}）`;
      const choices = problem.params.choices.map(choice => {
        const button = el('button', 'dr-choice', choice.label);
        button.type = 'button';
        button.dataset.choice = choice.value;
        button.setAttribute('aria-pressed', result.answer === choice.value ? 'true' : 'false');
        if (result.judged) {
          button.disabled = true;
          if (choice.value === problem.expected) button.classList.add('is-correct');
          else if (choice.value === result.answer) button.classList.add('is-wrong');
        }
        button.addEventListener('click', () => {
          if (result.judged) return;
          result.answer = choice.value;
          renderTerminology();
          const selected = Array.from(byId('terminology-choices').querySelectorAll('.dr-choice'))
            .find(node => node.dataset.choice === choice.value);
          selected?.focus();
        });
        return button;
      });
      byId('terminology-choices').replaceChildren(...choices);
      byId('terminology-judge').disabled = result.judged || !result.answer;
    }

    function newTerminologyProblem() {
      const problem = choose('terminology', terminologyProblems);
      state.terminology = { problem, answer: '', judged: false, counted: false };
      setFeedback(byId('terminology-feedback'), '最も適切な選択肢を1つ選んでください。');
      renderTerminology();
    }

    if (hasTerminology) {
      byId('terminology-judge').addEventListener('click', () => {
        const result = state.terminology;
        if (!result || result.judged || !result.answer) return;
        result.judged = true;
        const correct = result.answer === result.problem.expected;
        record(result, correct);
        setFeedback(
          byId('terminology-feedback'),
          `${correct ? '正解です。' : '不正解です。'}${result.problem.explanation}`,
          correct ? 'correct' : 'wrong'
        );
        renderTerminology();
      });
      byId('terminology-next').addEventListener('click', newTerminologyProblem);
    }

    const tabs = tabsHost ? Array.from(tabsHost.querySelectorAll('[role="tab"][data-mode]')) : [];
    function activateTab(mode, focus = false) {
      tabs.forEach(tab => {
        const active = tab.dataset.mode === mode;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
        if (focus && active) tab.focus();
      });
      document.querySelectorAll('.dr-quiz-panel').forEach(panel => {
        panel.hidden = panel.dataset.panel !== mode;
      });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.mode));
      tab.addEventListener('keydown', event => {
        let nextIndex = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex == null) return;
        event.preventDefault();
        activateTab(tabs[nextIndex].dataset.mode, true);
      });
    });

    updateScore();
    if (hasDigitization) newDigitizationProblem();
    if (hasCalculation) newCalculationProblem();
    if (hasTerminology) newTerminologyProblem();
    if (tabs.length) activateTab(tabs[0].dataset.mode);
  }

  root.SoundQuiz = Object.freeze({
    makeDigitizationProblem,
    createCalculationProblem,
    theoremChoice
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
