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

  function calculationNumber(value, digits = 4) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('ja-JP', {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0
    }).format(number);
  }

  function greatestCommonDivisor(left, right) {
    let a = Math.abs(Math.trunc(left));
    let b = Math.abs(Math.trunc(right));
    while (b !== 0) {
      [a, b] = [b, a % b];
    }
    return a;
  }

  function simplifiedDataSizeExpression(params, answerUnit) {
    const powers = { B: 0, KB: 1, MB: 2, GB: 3, KiB: 1, MiB: 2, GiB: 3 };
    const power = powers[answerUnit] ?? 0;
    const base = params.base ?? (answerUnit.includes('i') ? 1024 : 1000);
    const numerators = [params.sampleRate, params.seconds, params.bitDepth, params.channels];
    const denominators = [8, ...Array.from({ length: power }, () => base)];

    denominators.forEach((denominator, denominatorIndex) => {
      let remaining = denominator;
      // bit→Bは量子化ビット数から、KB・MB等は時間や標本化周波数から先に約分する。
      const priority = denominatorIndex === 0 ? [2, 3, 0, 1] : [1, 0, 3, 2];
      priority.forEach(index => {
        if (remaining === 1) return;
        const divisor = greatestCommonDivisor(numerators[index], remaining);
        numerators[index] /= divisor;
        remaining /= divisor;
      });
      denominators[denominatorIndex] = remaining;
    });

    const numeratorText = numerators
      .filter(value => value !== 1)
      .map(value => calculationNumber(value))
      .join(' × ') || '1';
    const remainingDenominators = denominators.filter(value => value !== 1);
    return remainingDenominators.length
      ? `${numeratorText} ÷ ${remainingDenominators.map(value => calculationNumber(value)).join(' ÷ ')}`
      : numeratorText;
  }

  function calculationSolution(kind, params, expected, answerUnit, answerDigits) {
    let steps;
    let point;
    if (kind === 'periodFromRate') {
      steps = [
        { label: '式を選ぶ', text: '標本化周期は T = 1 / fs で求めます。' },
        { label: '値を代入する', text: `T = 1 / ${calculationNumber(params.sampleRate)} とします。` },
        { label: '計算して単位を付ける', text: `T = ${calculationNumber(expected, answerDigits)}秒です。` }
      ];
      point = 'Hzは1秒間の標本化回数です。逆数をとると、1回あたりの時間である標本化周期になります。';
    } else if (kind === 'rateFromPeriod') {
      steps = [
        { label: '式を選ぶ', text: '標本化周波数は fs = 1 / T で求めます。' },
        { label: '値を代入する', text: `fs = 1 / ${calculationNumber(params.period)} とします。` },
        { label: '計算して単位を付ける', text: `fs = ${calculationNumber(expected, answerDigits)}Hzです。` }
      ];
      point = '周期の単位を秒にそろえてから逆数をとります。周波数の単位はHzです。';
    } else if (kind === 'levelsFromBits') {
      steps = [
        { label: '式を選ぶ', text: 'n bitで表せる量子化段階数は 2^n です。' },
        { label: 'ビット数を代入する', text: `2^${params.bitDepth} を計算します。` },
        { label: '段階数を求める', text: `${calculationNumber(expected, answerDigits)}段階です。` }
      ];
      point = '1bitごとに0と1の2通りがあるため、n bitの組み合わせは2^n通りです。';
    } else if (kind === 'bitsFromLevels') {
      const lowerBits = Math.max(0, expected - 1);
      const lowerLevels = 2 ** lowerBits;
      const upperLevels = 2 ** expected;
      steps = [
        { label: '必要な条件を立てる', text: `2^n が${calculationNumber(params.levels)}段階以上になる、最小のnを探します。` },
        { label: '前後の段階数を比べる', text: `2^${lowerBits} = ${calculationNumber(lowerLevels)}、2^${expected} = ${calculationNumber(upperLevels)}です。` },
        { label: '最小のビット数を選ぶ', text: `${calculationNumber(expected, answerDigits)}bit必要です。` }
      ];
      point = '段階数と同じ値になる場合だけでなく、必要な段階数をすべて表せる最小のビット数を選びます。';
    } else if (kind === 'dataSize') {
      const duration = params.durationParts
        ? `${params.durationParts.minutes} × 60 + ${params.durationParts.seconds} = ${calculationNumber(params.seconds)}秒`
        : `${calculationNumber(params.seconds)}秒`;
      const powers = { B: 0, KB: 1, MB: 2, GB: 3, KiB: 1, MiB: 2, GiB: 3 };
      const power = powers[answerUnit] ?? 0;
      const base = params.base ?? (answerUnit.includes('i') ? 1024 : 1000);
      const byteUnits = answerUnit.includes('i')
        ? ['B', 'KiB', 'MiB', 'GiB']
        : ['B', 'KB', 'MB', 'GB'];
      const unitDivisions = Array.from(
        { length: power },
        (_, index) => ` ÷ ${calculationNumber(base)}［${byteUnits[index]}/${byteUnits[index + 1]}］`
      );
      const unitRules = Array.from(
        { length: power },
        (_, index) => `1${byteUnits[index + 1]} = ${calculationNumber(base)}${byteUnits[index]}`
      ).join('、');
      const formulaGroup = 'data-size-formula';
      let formula = `${calculationNumber(params.sampleRate)}［回/秒］`;
      const formulaSteps = [
        {
          replaceGroup: formulaGroup,
          label: '標本化周波数を置く',
          formula,
          text: `1秒間に${calculationNumber(params.sampleRate)}回、音の大きさを取り出します。`
        }
      ];
      formula += ` × ${calculationNumber(params.seconds)}［秒］`;
      formulaSteps.push({
        replaceGroup: formulaGroup,
        label: '時間を掛ける',
        formula,
        text: `${calculationNumber(params.seconds)}秒分を掛け、録音時間全体を表します。ここではまだ計算しません。`
      });
      formula += ` × ${calculationNumber(params.bitDepth)}［bit］`;
      formulaSteps.push({
        replaceGroup: formulaGroup,
        label: '量子化ビット数を掛ける',
        formula,
        text: `1回・1チャンネルあたり${calculationNumber(params.bitDepth)}bitで記録します。`
      });
      formula += ` × ${calculationNumber(params.channels)}［チャンネル］`;
      formulaSteps.push({
        replaceGroup: formulaGroup,
        label: 'チャンネル数を掛ける',
        formula,
        text: `${params.channels === 1 ? 'モノラル' : params.channels === 2 ? 'ステレオ' : `${params.channels}チャンネル`}なので、${calculationNumber(params.channels)}チャンネル分を掛けます。`
      });
      formula += ' ÷ 8［bit/B］';
      formulaSteps.push({
        replaceGroup: formulaGroup,
        label: 'bitからBへ換算する',
        formula,
        text: '8bit = 1Bなので、8で割ります。'
      });
      if (power > 0) {
        formula += unitDivisions.join('');
        formulaSteps.push({
          replaceGroup: formulaGroup,
          label: `${answerUnit}へ換算する`,
          formula,
          text: `${unitRules}なので、${calculationNumber(base)}で${power > 1 ? `${power}回` : '1回'}割ります。`
        });
      }
      steps = [
        { label: '時間を秒にそろえる', text: `音声の長さは${duration}です。` },
        ...formulaSteps,
        {
          label: '約分して、まとめて計算する',
          text: `計算しやすい形にすると、${simplifiedDataSizeExpression(params, answerUnit)} = ${calculationNumber(expected, answerDigits)}${answerUnit}です。`
        }
      ];
      point = '途中ごとに大きな数を求めず、単位換算まで含む一本の式を先に立てます。掛け算と割り算をまとめると、割り切れる部分を先に約分して計算量を減らせます。';
    } else {
      steps = [];
      point = '';
    }
    return Object.freeze({
      steps: Object.freeze(steps.map(step => Object.freeze(step))),
      point
    });
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
    const answerDigits = definition.answerDigits ?? 4;
    return Object.freeze({
      id: definition.id,
      type: definition.kind,
      pattern: definition.pattern,
      level: definition.level,
      params,
      expected,
      prompt: definition.prompt,
      answerUnit: definition.answerUnit,
      answerDigits,
      tolerance: definition.tolerance ?? Math.max(1e-7, Math.abs(expected) * 1e-6),
      solution: calculationSolution(definition.kind, params, expected, definition.answerUnit, answerDigits)
    });
  }

  function createChannelDataExample() {
    const params = Object.freeze({
      sampleRate: 44100,
      seconds: 1,
      bitDepth: 16,
      channels: 2,
      answerUnit: 'KB',
      base: 1000
    });
    const oneSample = Core.audioDataSize({
      sampleRate: 1,
      seconds: 1,
      bitDepth: params.bitDepth,
      channels: params.channels
    });
    const oneSecond = Core.audioDataSize(params);
    const kilobytesPerSecond = Core.convertBytes(oneSecond.bytes, params.answerUnit, params.base);
    const sampleGroup = 'channel-data-one-sample';
    const secondGroup = 'channel-data-one-second';
    const sampleFormulaBase = `${calculationNumber(params.bitDepth)}［bit］`;
    const sampleFormulaWithChannels = `${sampleFormulaBase} × ${calculationNumber(params.channels)}［チャンネル］`;
    const sampleFormulaBytes = `${sampleFormulaWithChannels} ÷ 8［bit/B］ = ${calculationNumber(oneSample.bytes)}［B/回］`;
    const secondFormulaBase = `${calculationNumber(oneSample.bytes)}［B/回］ × ${calculationNumber(params.sampleRate)}［回/秒］`;

    const steps = [
      {
        replaceGroup: sampleGroup,
        label: '量子化ビット数を置く',
        formula: sampleFormulaBase,
        text: `1回・1チャンネル分の音を${calculationNumber(params.bitDepth)}bitで記録します。`
      },
      {
        replaceGroup: sampleGroup,
        label: '2チャンネル分を掛ける',
        formula: sampleFormulaWithChannels,
        text: 'ステレオには左右2系統の音信号があるため、2チャンネル分を掛けます。'
      },
      {
        replaceGroup: sampleGroup,
        label: '1回分をBへ換算する',
        formula: sampleFormulaBytes,
        text: `8bit = 1Bなので、1回の標本化で生じるデータ量は${calculationNumber(oneSample.bytes)}Bです。`
      },
      {
        replaceGroup: secondGroup,
        label: '1秒間の標本化回数を掛ける',
        formula: `${secondFormulaBase} = ${calculationNumber(oneSecond.bytes)}［B/秒］`,
        text: `1秒間に${calculationNumber(params.sampleRate)}回標本化するため、1回分の${calculationNumber(oneSample.bytes)}Bに${calculationNumber(params.sampleRate)}回を掛けます。`
      },
      {
        replaceGroup: secondGroup,
        label: 'KBへ換算する',
        formula: `${secondFormulaBase} ÷ 1,000［B/KB］ = ${calculationNumber(kilobytesPerSecond, 1)}［KB/秒］`,
        text: `1KB = 1,000Bとして換算すると、1秒あたり${calculationNumber(kilobytesPerSecond, 1)}KBです。`
      }
    ];

    return Object.freeze({
      id: 'channel-data-cd-one-second',
      type: 'workedExample',
      params,
      expected: Object.freeze({
        bytesPerSample: oneSample.bytes,
        bytesPerSecond: oneSecond.bytes,
        kilobytesPerSecond
      }),
      solution: Object.freeze({
        steps: Object.freeze(steps.map(step => Object.freeze(step))),
        point: '計算で掛けるのはスピーカーの台数ではなく、独立した音信号の系統数です。ステレオは2チャンネルとして計算します。'
      })
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
    const hasDigitization = Boolean(byId('digitization-judge'));
    const calculationHosts = Array.from(document.querySelectorAll('[data-sound-calculation]'));
    const workedExampleHosts = Array.from(document.querySelectorAll('[data-sound-worked-example]'));
    const terminologyHost = document.querySelector('[data-sound-terminology]');
    const hasCalculation = calculationHosts.length > 0;
    const hasWorkedExample = workedExampleHosts.length > 0;
    const hasTerminology = Boolean(terminologyHost);
    if (!hasDigitization && !hasCalculation && !hasWorkedExample && !hasTerminology) return;

    const querySeed = new URLSearchParams(window.location.search).get('seed');
    const seed = querySeed || document.body.dataset.soundQuizSeed || 'sound-classroom-v1';
    const random = Core.createSeededRandom(seed);
    const score = { attempted: 0, correct: 0 };
    const state = {
      digitization: null,
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
        id: 'period-10hz', kind: 'periodFromRate', pattern: 'sampling', level: 1,
        params: { sampleRate: 10 },
        prompt: '標本化周波数が10Hzのとき、標本化周期Tは何秒ですか。',
        answerUnit: '秒'
      }),
      createCalculationProblem({
        id: 'rate-002sec', kind: 'rateFromPeriod', pattern: 'sampling', level: 1,
        params: { period: 0.02 },
        prompt: '標本化周期が0.02秒のとき、標本化周波数fsは何Hzですか。',
        answerUnit: 'Hz'
      }),
      createCalculationProblem({
        id: 'levels-4bit', kind: 'levelsFromBits', pattern: 'quantization', level: 1,
        params: { bitDepth: 4 },
        prompt: '量子化ビット数が4bitのとき、量子化段階数はいくつですか。',
        answerUnit: '段階'
      }),
      createCalculationProblem({
        id: 'bits-32levels', kind: 'bitsFromLevels', pattern: 'quantization', level: 2,
        params: { levels: 32 },
        prompt: '32段階を区別するために必要な量子化ビット数は何bitですか。',
        answerUnit: 'bit'
      }),
      createCalculationProblem({
        id: 'bits-17levels', kind: 'bitsFromLevels', pattern: 'quantization', level: 2,
        params: { levels: 17 },
        prompt: '17段階を区別するために必要な量子化ビット数は何bitですか。',
        answerUnit: 'bit'
      }),
      createCalculationProblem({
        id: 'pdf-6000b', kind: 'dataSize', pattern: 'data-size', level: 2,
        params: { sampleRate: 200, seconds: 60, bitDepth: 4, channels: 1, answerUnit: 'B' },
        prompt: '標本化周波数200Hz、量子化4bit、モノラル、60秒の音声データは何Bですか。',
        answerUnit: 'B'
      }),
      createCalculationProblem({
        id: 'pdf-81920b', kind: 'dataSize', pattern: 'data-size', level: 2,
        params: { sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1, answerUnit: 'B' },
        prompt: '標本化周波数20,480Hz、量子化16bit、モノラル、2秒の音声データは何Bですか。',
        answerUnit: 'B'
      }),
      createCalculationProblem({
        id: 'pdf-80kb-binary', kind: 'dataSize', pattern: 'data-size', level: 2,
        params: { sampleRate: 20480, seconds: 2, bitDepth: 16, channels: 1, answerUnit: 'KB', base: 1024 },
        prompt: '標本化周波数20,480Hz、量子化16bit、モノラル、2秒の音声データは何KBですか。この問題では1KB = 1024Bで換算します。',
        answerUnit: 'KB'
      }),
      createCalculationProblem({
        id: 'cd-one-second-decimal', kind: 'dataSize', pattern: 'data-size', level: 2,
        params: { sampleRate: 44100, seconds: 1, bitDepth: 16, channels: 2, answerUnit: 'KB', base: 1000 },
        prompt: 'CD音質（44,100Hz、16bit、ステレオ）の1秒分は何KBですか。1KB = 1000Bで換算します。',
        answerUnit: 'KB', answerDigits: 1
      }),
      createCalculationProblem({
        id: 'cd-full-binary', kind: 'dataSize', pattern: 'data-size', level: 3,
        params: {
          sampleRate: 44100,
          seconds: 74 * 60 + 42,
          durationParts: { minutes: 74, seconds: 42 },
          bitDepth: 16,
          channels: 2,
          answerUnit: 'MB',
          base: 1024
        },
        prompt: 'CD音質（44,100Hz、16bit、ステレオ）で74分42秒を記録すると約何MBですか。この問題では1KB = 1024B、1MB = 1024KBで換算し、小数第1位まで答えてください。',
        answerUnit: 'MB', answerDigits: 1, tolerance: 0.06
      }),
      createCalculationProblem({
        id: 'high-resolution-binary', kind: 'dataSize', pattern: 'data-size', level: 3,
        params: {
          sampleRate: 192000,
          seconds: 4 * 60 + 16,
          durationParts: { minutes: 4, seconds: 16 },
          bitDepth: 24,
          channels: 2,
          answerUnit: 'MB',
          base: 1024
        },
        prompt: '192kHz、24bit、ステレオ、4分16秒の音声データは何MBですか。この問題では1KB = 1024B、1MB = 1024KBで換算します。',
        answerUnit: 'MB', answerDigits: 2
      })
    ];

    const calculationPatterns = Object.freeze(['sampling', 'quantization', 'data-size']);
    const calculationProblemGroups = Object.freeze(Object.fromEntries(
      calculationPatterns.map(pattern => [
        pattern,
        Object.freeze(calculationProblems.filter(problem => problem.pattern === pattern))
      ])
    ));

    const terminologyProblems = [
      ...TERM_PROBLEMS,
      theoremChoice({ id: 'theorem-sufficient', level: 2, signalFrequency: 4, sampleRate: 10 }),
      theoremChoice({ id: 'theorem-boundary', level: 2, signalFrequency: 5, sampleRate: 10 }),
      theoremChoice({ id: 'theorem-insufficient', level: 2, signalFrequency: 7, sampleRate: 10 })
    ];

    document.querySelectorAll('[data-sound-quiz-seed-output]').forEach(output => {
      output.textContent = `問題シード：${seed}`;
    });

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

    function buildSolution(problem, revealedSteps) {
      const solution = el('div', 'dr-solution');
      solution.appendChild(el('h4', 'dr-solution__title', '解き方'));
      if (revealedSteps === 0) {
        solution.appendChild(el('p', 'dr-solution__prompt', '「次へ」を押すと、解き方を一段階ずつ確認できます。'));
      } else {
        const list = el('ol', 'dr-solution__steps');
        const revealed = problem.solution.steps.slice(0, revealedSteps);
        const visibleSteps = [];
        const replaceGroupIndexes = new Map();
        revealed.forEach(step => {
          if (!step.replaceGroup) {
            visibleSteps.push(step);
            return;
          }
          if (replaceGroupIndexes.has(step.replaceGroup)) {
            visibleSteps[replaceGroupIndexes.get(step.replaceGroup)] = step;
            return;
          }
          replaceGroupIndexes.set(step.replaceGroup, visibleSteps.length);
          visibleSteps.push(step);
        });
        const newestStep = revealed[revealed.length - 1];
        visibleSteps.forEach(step => {
          const item = document.createElement('li');
          if (step === newestStep) item.classList.add('is-new');
          item.appendChild(el('strong', 'dr-solution__step-label', step.label));
          if (step.formula) item.appendChild(el('span', 'dr-solution__formula', step.formula));
          item.appendChild(el('span', 'dr-solution__step-text', step.text));
          list.appendChild(item);
        });
        solution.appendChild(list);
      }
      if (revealedSteps === problem.solution.steps.length) {
        const point = el('p', 'dr-solution__point is-new');
        point.append(
          el('strong', '', 'ポイント'),
          document.createTextNode(`：${problem.solution.point}`)
        );
        solution.appendChild(point);
      }
      return solution;
    }

    function renderCalculationFeedback(host, result, correct) {
      const problem = result.problem;
      const target = host.querySelector('[data-calculation-feedback]');
      target.className = `dr-feedback ${correct ? 'is-correct' : 'is-wrong'}`;
      const outcome = el(
        'p',
        'dr-feedback__result',
        correct
          ? `正解です。答えは ${calculationNumber(problem.expected, problem.answerDigits)}${problem.answerUnit} です。`
          : `正解は ${calculationNumber(problem.expected, problem.answerDigits)}${problem.answerUnit} です。`
      );
      const solution = buildSolution(problem, result.revealedSteps);
      target.replaceChildren(outcome, solution);
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }

    function initializeWorkedExample(host) {
      if (host.dataset.soundWorkedExample !== 'channel-data') return;
      const problem = createChannelDataExample();
      const target = host.querySelector('[data-worked-example-feedback]');
      const nextButton = host.querySelector('[data-worked-example-next]');
      if (!target || !nextButton) return;
      let revealedSteps = 0;

      function render() {
        const solution = buildSolution(problem, revealedSteps);
        solution.classList.add('dr-solution--standalone');
        target.className = 'dr-feedback is-info';
        target.replaceChildren(solution);
        const finished = revealedSteps === problem.solution.steps.length;
        nextButton.textContent = finished ? '最初から見る' : '次へ';
        nextButton.setAttribute(
          'aria-label',
          finished ? '例題の解き方を最初から見る' : `解き方の${revealedSteps + 1}段階目を表示`
        );
        document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      }

      nextButton.addEventListener('click', () => {
        revealedSteps = revealedSteps === problem.solution.steps.length ? 0 : revealedSteps + 1;
        render();
        nextButton.scrollIntoView({ block: 'nearest' });
      });
      render();
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
      const promptText = el('div', '', `波形から各標本の値を読み取り、量子化後の値・段階値・${params.bitDepth}bitの2進数を入力してください。`);
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
        title: '波形のデジタル化問題'
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

    function renderCalculation(controller) {
      const { host, result } = controller;
      const problem = result.problem;
      host.querySelector('[data-calculation-prompt]').textContent = problem.prompt;
      const input = host.querySelector('[data-calculation-answer]');
      input.value = result.answer;
      input.disabled = result.judged;
      host.querySelector('[data-calculation-unit]').textContent = problem.answerUnit;
      host.querySelector('[data-calculation-judge]').disabled = result.judged;
      const nextButton = host.querySelector('[data-calculation-next]');
      const hasHiddenSteps = result.judged && result.revealedSteps < problem.solution.steps.length;
      nextButton.textContent = hasHiddenSteps ? '次へ' : '次の問題';
      nextButton.setAttribute(
        'aria-label',
        hasHiddenSteps
          ? `解き方の${result.revealedSteps + 1}段階目を表示`
          : '次の問題を表示'
      );
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }

    function newCalculationProblem(controller, focusAnswer = true) {
      const problem = choose(`calculation-${controller.pattern}`, calculationProblemGroups[controller.pattern]);
      controller.result = { problem, answer: '', judged: false, counted: false, revealedSteps: 0 };
      setFeedback(
        controller.host.querySelector('[data-calculation-feedback]'),
        '式を立てて数値を入力してください。単位は問題文と入力欄の右側で確認できます。'
      );
      renderCalculation(controller);
      if (focusAnswer) controller.host.querySelector('[data-calculation-answer]').focus({ preventScroll: true });
    }

    function initializeCalculation(host) {
      const pattern = host.dataset.soundCalculation;
      if (!calculationProblemGroups[pattern]) return;
      const controller = { host, pattern, result: null };
      const input = host.querySelector('[data-calculation-answer]');
      input.addEventListener('input', event => {
        if (controller.result) controller.result.answer = event.target.value;
      });
      host.querySelector('[data-calculation-judge]').addEventListener('click', () => {
        const result = controller.result;
        if (!result || result.judged) return;
        const answer = Number(result.answer);
        const correct = result.answer.trim() !== ''
          && Number.isFinite(answer)
          && Math.abs(answer - result.problem.expected) <= result.problem.tolerance;
        result.judged = true;
        result.correct = correct;
        record(result, correct);
        renderCalculationFeedback(host, result, correct);
        renderCalculation(controller);
        host.querySelector('[data-calculation-next]').focus({ preventScroll: true });
      });
      host.querySelector('[data-calculation-next]').addEventListener('click', () => {
        const result = controller.result;
        if (result?.judged && result.revealedSteps < result.problem.solution.steps.length) {
          result.revealedSteps += 1;
          renderCalculationFeedback(host, result, result.correct);
          renderCalculation(controller);
          host.querySelector('[data-calculation-next]').scrollIntoView({ block: 'nearest' });
          return;
        }
        newCalculationProblem(controller);
      });
      newCalculationProblem(controller, false);
    }

    function renderTerminology() {
      const result = state.terminology;
      const problem = result.problem;
      terminologyHost.querySelector('[data-terminology-prompt]').textContent = problem.params.prompt;
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
          const selected = Array.from(terminologyHost.querySelectorAll('[data-terminology-choices] .dr-choice'))
            .find(node => node.dataset.choice === choice.value);
          selected?.focus();
        });
        return button;
      });
      terminologyHost.querySelector('[data-terminology-choices]').replaceChildren(...choices);
      terminologyHost.querySelector('[data-terminology-judge]').disabled = result.judged || !result.answer;
    }

    function newTerminologyProblem() {
      const problem = choose('terminology', terminologyProblems);
      state.terminology = { problem, answer: '', judged: false, counted: false };
      setFeedback(terminologyHost.querySelector('[data-terminology-feedback]'), '最も適切な選択肢を1つ選んでください。');
      renderTerminology();
    }

    if (hasTerminology) {
      terminologyHost.querySelector('[data-terminology-judge]').addEventListener('click', () => {
        const result = state.terminology;
        if (!result || result.judged || !result.answer) return;
        result.judged = true;
        const correct = result.answer === result.problem.expected;
        record(result, correct);
        setFeedback(
          terminologyHost.querySelector('[data-terminology-feedback]'),
          `${correct ? '正解です。' : '不正解です。'}${result.problem.explanation}`,
          correct ? 'correct' : 'wrong'
        );
        renderTerminology();
      });
      terminologyHost.querySelector('[data-terminology-next]').addEventListener('click', newTerminologyProblem);
    }

    updateScore();
    if (hasDigitization) newDigitizationProblem();
    if (hasCalculation) calculationHosts.forEach(initializeCalculation);
    if (hasWorkedExample) workedExampleHosts.forEach(initializeWorkedExample);
    if (hasTerminology) newTerminologyProblem();
  }

  root.SoundQuiz = Object.freeze({
    makeDigitizationProblem,
    createCalculationProblem,
    createChannelDataExample,
    theoremChoice
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
