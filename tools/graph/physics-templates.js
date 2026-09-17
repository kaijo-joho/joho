/* 物理の数式モデル用テンプレート。外部データやコードは実行しない。 */
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.GraphCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphPhysicsTemplates = api;
}(typeof globalThis === 'object' ? globalThis : this, function (Core) {
  'use strict';

  const OPENSTAX = 'https://openstax.org/';
  const SOURCES = {
    kinematics: OPENSTAX + 'books/physics/pages/5-3-projectile-motion',
    shm: OPENSTAX + 'books/physics/pages/5-5-simple-harmonic-motion',
    beats: OPENSTAX + 'books/physics/pages/14-4-sound-interference-and-resonance',
    ohm: OPENSTAX + 'books/college-physics-2e/pages/20-2-ohms-law-resistance-and-simple-circuits',
    rc: OPENSTAX + 'books/university-physics-volume-2/pages/10-5-rc-circuits'
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const style = (color) => ({ color, width: 2, dash: 'solid', points: false, lines: true, opacity: .9 });
  const model = (title, url, notes) => ({ kind: 'model', title, url, notes });

  function document(name) {
    const out = Core.createDocument();
    out.name = name;
    out.mode = '2d';
    out.grid = true;
    out.legend = true;
    return out;
  }
  function axis(label, symbol, unit, min, max, step) {
    return { label, symbol, unit, min, max, scale: 'linear', ticks: { step: step || null, format: 'auto' } };
  }
  function series(id, name, expression, domain, source, color) {
    const out = Core.createSeries('function');
    out.id = id; out.name = name; out.expression = expression; out.domain = domain;
    out.source = source; out.style = style(color || '#2563eb');
    return out;
  }
  function parametric(id, name, components, interval, source, color) {
    const out = Core.createSeries('parametric');
    out.id = id; out.name = name; out.components = components; out.interval = interval;
    out.source = source; out.style = style(color || '#2563eb');
    return out;
  }

  function makeTemplates() {
    const accelerated = document('等加速度運動（位置と時間）');
    accelerated.axes.x = axis('時間', 't', 's', 0, 10, 1);
    accelerated.axes.y = axis('位置', 's', 'm', -80, 120, 20);
    accelerated.parameters = [
      { name: 's0', value: 0, min: -20, max: 20, step: 1 },
      { name: 'v0', value: 4, min: -10, max: 10, step: .5 },
      { name: 'a', value: 1.2, min: -4, max: 4, step: .2 }
    ];
    accelerated.series.push(series('uniform-acceleration-position', 's = s₀ + v₀t + ½at²', 's0+v0*x+0.5*a*x^2', { x: [0, 10], y: [-80, 120] }, model('等加速度直線運動の位置の式', SOURCES.kinematics, '数式から生成する理想モデルで、実測値ではありません。加速度 a は一定、一次元運動とし、空気抵抗など位置や速度に依存する力は扱いません。s₀ (m)、v₀ (m/s)、a (m/s²) を変更できます。'), '#2563eb'));

    const projectile = document('斜方投射（着地点まで）');
    projectile.angle = 'deg';
    projectile.axes.x = axis('水平距離', 'x', 'm', 0, 140, 20);
    projectile.axes.y = axis('高さ', 'y', 'm', 0, 45, 5);
    projectile.parameters = [
      { name: 'v0', value: 25, min: 10, max: 35, step: 1 },
      { name: 'theta', value: 45, min: 15, max: 75, step: 1 }
    ];
    projectile.series.push(parametric('projectile-trajectory', '投射軌道', {
      x: 'v0*cos(theta)*(2*v0*sin(theta)/9.8)*t',
      y: 'v0*sin(theta)*(2*v0*sin(theta)/9.8)*t-0.5*9.8*(2*v0*sin(theta)/9.8)^2*t^2'
    }, [0, 1], model('同じ高さへ着地する斜方投射の式', SOURCES.kinematics, '数式から生成する理想モデルで、実測値ではありません。重力加速度 g=9.8 m/s² を一定とし、空気抵抗・風・地球の曲率を無視します。角度 theta は度で入力します。媒介変数 t は秒ではなく、離陸0から着地1までの進行度です。飛行時間 2v₀sin(theta)/g を式へ入れているため、軌道を地面より下へ描きません。'), '#dc2626'));

    const shm = document('単振動（変位と時間）');
    shm.axes.x = axis('時間', 't', 's', 0, 8, 1);
    shm.axes.y = axis('変位', 'd', 'm', -3.2, 3.2, .5);
    shm.parameters = [
      { name: 'A', value: 2, min: .2, max: 3, step: .1 },
      { name: 'f', value: 1, min: .25, max: 2, step: .05 },
      { name: 'phi', value: 0, min: -3.141592654, max: 3.141592654, step: .1 }
    ];
    shm.series.push(series('simple-harmonic-displacement', 'd = A cos(2πft + φ)', 'A*cos(2*pi*f*x+phi)', { x: [0, 8], y: [-3.2, 3.2] }, model('単振動の正弦波モデル', SOURCES.shm, '数式から生成する理想モデルで、実測値ではありません。振幅 A (m)、周波数 f (Hz)、初期位相 phi (rad) を変更できます。減衰・外力・振幅の変化は含めません。角度設定はラジアンです。'), '#7c3aed'));

    const beats = document('波の重ね合わせ（うなり）');
    beats.axes.x = axis('時間', 't', 's', 0, 4, .5);
    beats.axes.y = axis('変位', 'd', 'arb.', -2.3, 2.3, .5);
    beats.parameters = [
      { name: 'A', value: 1, min: .2, max: 1.5, step: .1 },
      { name: 'f1', value: 4, min: 3, max: 5, step: .1 },
      { name: 'f2', value: 4.5, min: 3, max: 5, step: .1 }
    ];
    const beatSource = model('波の重ね合わせとうなり', SOURCES.beats, '数式から生成する理想モデルで、実測値ではありません。同じ振幅 A の正弦波2つを一点で重ねます。周波数差 |f₁−f₂| がうなりの周波数です。位相差、減衰、媒質中の伝わり方は扱いません。縦軸 arb. は相対的な変位です。');
    beats.series.push(series('beat-wave-1', '波 1', 'A*sin(2*pi*f1*x)', { x: [0, 4], y: [-2.3, 2.3] }, beatSource, '#2563eb'));
    beats.series.push(series('beat-wave-2', '波 2', 'A*sin(2*pi*f2*x)', { x: [0, 4], y: [-2.3, 2.3] }, beatSource, '#16a34a'));
    beats.series.push(series('beat-resultant', '重ね合わせ', 'A*sin(2*pi*f1*x)+A*sin(2*pi*f2*x)', { x: [0, 4], y: [-2.3, 2.3] }, beatSource, '#dc2626'));

    const ohm = document('オームの法則（電圧と電流）');
    ohm.axes.x = axis('電圧', 'V', 'V', 0, 12, 1);
    ohm.axes.y = axis('電流', 'I', 'mA', 0, 125, 20);
    ohm.parameters = [{ name: 'R', value: 220, min: 100, max: 1000, step: 10 }];
    ohm.series.push(series('ohms-law-current', 'I = V / R', '1000*x/R', { x: [0, 12], y: [0, 125] }, model('オームの法則 I=V/R', SOURCES.ohm, '数式から生成する理想モデルで、実測値ではありません。R は抵抗 (Ω)、横軸は電圧 (V)、縦軸は電流 (mA) です。式の 1000 は A を mA へ換算する係数です。温度変化・非オーム性・電源内部抵抗を無視し、R は一定とします。'), '#d97706'));

    const rc = document('RC回路の充電（コンデンサー電圧）');
    rc.axes.x = axis('時間', 't', 's', 0, 15, 1);
    rc.axes.y = axis('コンデンサー電圧', 'Vc', 'V', 0, 12, 1);
    rc.parameters = [
      { name: 'E', value: 5, min: 1, max: 12, step: .5 },
      { name: 'R', value: 1, min: .1, max: 5, step: .1 },
      { name: 'C', value: 1000, min: 10, max: 1000, step: 10 }
    ];
    rc.series.push(series('rc-charging-voltage', 'Vc = E(1 − exp(−t/RC))', 'E*(1-exp(-x/(R*C/1000)))', { x: [0, 15], y: [0, 12] }, model('RC直列回路の充電式', SOURCES.rc, '数式から生成する理想モデルで、実測値ではありません。E は直流電源電圧 (V)、R は抵抗 (kΩ)、C は静電容量 (μF) です。式の R*C/1000 は kΩ×μF を秒へ換算した時定数 τ=RC です。初めコンデンサーは無充電、R・C は一定、理想直流電源で漏れ電流・内部抵抗・誘電体の非理想性を無視します。'), '#0891b2'));

    return [
      { id: 'physics-uniform-acceleration-position', name: accelerated.name, category: '物理', description: '初期位置・初速度・一定加速度を変え、位置と時間の関係を調べます。', document: accelerated },
      { id: 'physics-projectile-trajectory', name: projectile.name, category: '物理', description: '速度と角度を変え、同じ高さへ着地する投射の軌道を見ます。', document: projectile },
      { id: 'physics-simple-harmonic-motion', name: shm.name, category: '物理', description: '振幅・周波数・初期位相を変え、単振動の変位を比べます。', document: shm },
      { id: 'physics-wave-superposition-beats', name: beats.name, category: '物理', description: '近い周波数の2波と重ね合わせを比べ、うなりを見ます。', document: beats },
      { id: 'physics-ohms-law', name: ohm.name, category: '物理', description: '抵抗を変え、電圧と電流の比例関係を調べます。', document: ohm },
      { id: 'physics-rc-charging', name: rc.name, category: '物理', description: '電源・抵抗・容量を変え、RC回路の充電曲線を調べます。', document: rc }
    ];
  }

  const templates = makeTemplates();
  return { list: function () { return clone(templates); } };
}));
