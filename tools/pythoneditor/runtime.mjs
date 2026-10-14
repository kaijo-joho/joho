// 原本は変更せず、既知のColab準備行だけを同じ行数のコメントへ置換する。
export function adaptColab(code) {
  return code.split('\n').map(line => {
    if (/^\s*!pip\s+install\s+japanize-matplotlib\s*$/.test(line)) return '# japanize-matplotlib はエディタが準備します';
    if (/^\s*[!%]/.test(line)) throw new Error('このColab専用の準備行は未対応です: ' + line.slice(0, 100));
    return line;
  }).join('\n');
}
export const PYTHON_BRIDGE = String.raw`
import sys as _sys, io as _io, os as _os, types as _types, base64 as _b64, shutil as _shutil
from js import _pythonEditorText, _pythonEditorFigure, _pythonEditorFile
class _EditorStream:
    encoding = 'utf-8'
    def __init__(self, kind): self.kind = kind
    def write(self, value):
        _pythonEditorText(self.kind, str(value))
        return len(value)
    def flush(self): pass
    def isatty(self): return False
_sys.stdout = _EditorStream('stdout')
_sys.stderr = _EditorStream('stderr')
def _editor_reset_files():
    directory = '/home/pyodide/editor-work'
    _os.chdir('/home/pyodide')
    if _os.path.exists(directory): _shutil.rmtree(directory)
    _os.makedirs(directory)
    _os.chdir(directory)
def _editor_download(path):
    path = _os.fspath(path)
    with open(path, 'rb') as f: data = f.read(4000001)
    if len(data) > 4000000: raise ValueError('保存するファイルが大きすぎます')
    _pythonEditorFile(_os.path.basename(path), _b64.b64encode(data).decode('ascii'))
_google = _sys.modules.setdefault('google', _types.ModuleType('google'))
_colab = _sys.modules.setdefault('google.colab', _types.ModuleType('google.colab'))
_files = _types.ModuleType('google.colab.files')
_files.download = _editor_download
def _no_upload(*args, **kwargs):
    raise NotImplementedError('Colabのfiles.upload()は未対応です。今回の授業対象にファイル読込はありません。')
_files.upload = _no_upload
_sys.modules['google.colab.files'] = _files
_google.colab = _colab
_colab.files = _files
def _editor_plot_setup():
    import matplotlib
    matplotlib.use('agg', force=True)
    import matplotlib.pyplot as plt
    plt.close('all')
    def show(*args, **kwargs):
        for num in list(plt.get_fignums()):
            fig = plt.figure(num)
            target = _io.BytesIO()
            fig.savefig(target, format='png', dpi=110, bbox_inches='tight')
            _pythonEditorFigure(_b64.b64encode(target.getvalue()).decode('ascii'))
            plt.close(fig)
    plt.show = show
`;
