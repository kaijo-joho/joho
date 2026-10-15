import { LIMITS, PYODIDE_URL } from './core.mjs';
import { adaptColab, PYTHON_BRIDGE } from './runtime.mjs';
let pyodide, generation, count, figures, current;
let inputSequence = 0, pendingInput;
let pending = { stdout: '', stderr: '' };
function send(type, details = {}) { postMessage({ type, generation, ...details }); }
function flush() {
  for (const stream of ['stdout', 'stderr']) if (pending[stream]) {
    send('text', { stream, text: pending[stream] });
    pending[stream] = '';
  }
}
globalThis._pythonEditorText = (stream, value) => {
  count += value.length;
  if (count > LIMITS.output) { flush(); throw new Error('出力が上限を超えたため停止しました。'); }
  pending[stream] += value;
  if (pending[stream].length >= 1000 || value.includes('\n')) flush();
};
globalThis._pythonEditorFigure = data => {
  if (++figures > LIMITS.figures || data.length > LIMITS.figureBytes * 1.4) throw new Error('グラフの数または大きさが上限を超えました。');
  flush(); send('figure', { data });
};
globalThis._pythonEditorFile = (name, data) => {
  if (++figures > LIMITS.figures) throw new Error('出力ファイルの数が上限を超えました。');
  flush(); send('file', { name, data });
};
async function prepare(code) {
  if (!pyodide) {
    const { loadPyodide } = await import(PYODIDE_URL + 'pyodide.mjs');
    pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  }
  pyodide.runPython("import sys; sys.path.insert(0, '/home/pyodide') if '/home/pyodide' not in sys.path else None");
  const plot = /\b(matplotlib|japanize_matplotlib|japanize-matplotlib)\b/.test(code);
  if (plot) {
    send('status', { text: 'グラフのライブラリを準備しています…' });
    await pyodide.loadPackage(['numpy', 'matplotlib']);
  } else if (/\bnumpy\b/.test(code)) await pyodide.loadPackage('numpy');
  if (/\bjapanize_matplotlib\b|japanize-matplotlib/.test(code)) {
    if (!pyodide.runPython("import importlib.util; importlib.util.find_spec('japanize_matplotlib') is not None")) {
      send('status', { text: '日本語フォントを準備しています…' });
      const directory = '/home/pyodide/japanize_matplotlib';
      pyodide.FS.mkdirTree(directory + '/fonts');
      for (const path of ['__init__.py', 'japanize_matplotlib.py', 'fonts/ipaexg.ttf']) {
        // GitHub Pages omits underscore-prefixed assets; keep the Python package name in the virtual filesystem.
        const assetPath = path === '__init__.py' ? 'init.py' : path;
        const response = await fetch(new URL('./vendor/japanize_matplotlib/' + assetPath, import.meta.url));
        if (!response.ok) throw new Error('日本語フォントを取得できませんでした。通信を確認して再実行してください。');
        let bytes = new Uint8Array(await response.arrayBuffer());
        // 原版のdistutilsはPython 3.12以降にない。matplotlib同梱のpackagingへ接続する。
        if (path === 'japanize_matplotlib.py') bytes = new TextEncoder().encode(new TextDecoder().decode(bytes)
          .replace('from distutils.version import LooseVersion', 'from packaging.version import Version as LooseVersion')
          .replace("LooseVersion(matplotlib.__version__) < '3.2'", "LooseVersion(matplotlib.__version__) < LooseVersion('3.2')"));
        pyodide.FS.writeFile(directory + '/' + path, bytes);
      }
    }
  }
  pyodide.runPython(PYTHON_BRIDGE);
  pyodide.runPython('_editor_reset_files()');
  if (plot) pyodide.runPython('_editor_plot_setup()');
  return plot;
}
self.onmessage = async ({ data }) => {
  if (data.type === 'input') {
    if (pendingInput && data.generation === generation && data.inputId === pendingInput.id) {
      const { resolve } = pendingInput; pendingInput = null;
      resolve(data.eof ? null : data.value);
    }
    return;
  }
  if (data.type !== 'run' || current) return;
  current = true; generation = data.generation; count = 0; figures = 0;
  pending = { stdout: '', stderr: '' };
  let globals;
  try {
    const setup = adaptColab(data.setupCode || ''), code = adaptColab(data.code || '');
    const plot = await prepare(setup + '\n' + code);
    const lines = [...(data.stdin || [])];
    const control = data.inputBuffer ? new Int32Array(data.inputBuffer, 0, 2) : null;
    globalThis._pythonEditorInput = async () => {
      flush();
      let value;
      if (lines.length) value = lines.shift();
      else {
        value = await new Promise(resolve => {
          const id = ++inputSequence; pendingInput = { id, resolve };
          send('input', { inputId: id });
        });
        send('status', { text: '実行中' });
      }
      if (value !== null) send('text', { stream: 'input', text: value + '\n' });
      return { eof: value === null, value: value ?? '' };
    };
    pyodide.setStdin({ stdin: () => {
      if (lines.length) {
        const value = lines.shift();
        flush(); send('text', { stream: 'input', text: value + '\n' });
        return value;
      }
      if (!control) return null;
      Atomics.store(control, 0, 0);
      flush(); send('input');
      while (Atomics.load(control, 0) === 0) Atomics.wait(control, 0, 0);
      if (Atomics.load(control, 0) === 2) return null;
      // TextDecoderには共有メモリのviewを直接渡せないブラウザがある。
      const value = new TextDecoder().decode(new Uint8Array(data.inputBuffer, 8, Atomics.load(control, 1)).slice());
      send('text', { stream: 'input', text: value + '\n' });
      send('status', { text: '実行中' });
      return value;
    } });
    // 前問の変数を次の結果へ混ぜない。必要な前問コードは明示的に渡す。
    globals = pyodide.runPython("{'__name__': '__main__'}");
    pyodide.globals.set('_editor_namespace', globals);
    pyodide.globals.set('_editor_setup', setup);
    pyodide.globals.set('_editor_code', code);
    if (Number.isInteger(data.seed)) pyodide.runPython(`import random; random.seed(${data.seed})`);
    send('status', { text: '実行中' });
    await pyodide.runPythonAsync(`
from pyodide.code import eval_code_async as _editor_eval
from pyodide.ffi import can_run_sync as _editor_can_run_sync
if _editor_can_run_sync():
    _sys.stdin = _EditorInputStream()
exec(compile(_editor_setup, '<準備コード>', 'exec'), _editor_namespace)
_editor_result = await _editor_eval(_editor_code, globals=_editor_namespace, filename='<コード>', dedent=False)
if _editor_result is not None:
    print(repr(_editor_result))
`);
    if (plot) pyodide.runPython('import matplotlib.pyplot as _plt; _plt.show()');
    flush(); send('done', { figures });
  } catch (e) {
    flush();
    let error = String(e.message || e);
    if (pyodide && e.type) {
      try { error = pyodide.runPython("import sys, traceback; ''.join(traceback.format_exception(sys.last_exc))") || error; } catch {}
    }
    send('error', { error });
  }
  finally {
    globals?.destroy();
    if (pyodide) {
      for (const name of ['_editor_namespace', '_editor_setup', '_editor_code', '_editor_result']) if (pyodide.globals.has(name)) pyodide.globals.delete(name);
      pyodide.runPython('import sys; sys.last_exc = None');
    }
    pendingInput = null;
    current = false;
  }
};
