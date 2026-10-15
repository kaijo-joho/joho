// Format with Python's own traceback module; filter only the editor execution bridge.
export const PYTHON_DIAGNOSTICS = String.raw`
import traceback as _editor_traceback, json as _editor_json, linecache as _editor_linecache

def _editor_cache_source(filename, source):
    _editor_linecache.cache[filename] = (len(source), None, source.splitlines(True), filename)

def _editor_exception_json(error):
    if error is None: return 'null'
    rendered = _editor_traceback.TracebackException.from_exception(error, capture_locals=False)
    seen = set()
    def clean(item):
        if item is None or id(item) in seen: return
        seen.add(id(item))
        item.stack = _editor_traceback.StackSummary.from_list([
            frame for frame in item.stack
            if frame.filename not in ('<エディタ実行>', '<エディタ内部>')
            and not frame.filename.endswith('/_pyodide/_base.py')
        ])
        clean(item.__cause__)
        clean(item.__context__)
        for child in getattr(item, 'exceptions', None) or []: clean(child)
    clean(rendered)
    locations = []
    def locate(exception):
        filename, line = None, None
        if isinstance(exception, SyntaxError):
            filename, line = exception.filename, exception.lineno
        if filename not in ('<コード>', '<準備コード>'):
            for frame in _editor_traceback.extract_tb(exception.__traceback__):
                if frame.filename in ('<コード>', '<準備コード>'):
                    filename, line = frame.filename, frame.lineno
        if filename in ('<コード>', '<準備コード>') and line and len(locations) < 20:
            locations.append({'source': 'code' if filename == '<コード>' else 'setup',
                              'line': line, 'name': type(exception).__name__, 'message': str(exception)})
        for child in getattr(exception, 'exceptions', ()):
            locate(child)
    locate(error)
    return _editor_json.dumps({'error': ''.join(rendered.format()),
        'diagnostics': {'name': type(error).__name__, 'message': str(error), 'locations': locations}}, ensure_ascii=False)
`;

// Hints stay local and are shown only after the learner opens a line's warning.
export function errorHints({name, message = ''}) {
  if (name === 'ValueError' && /invalid literal for int\(\)/.test(message)) return {
    summary: 'int()に渡した文字列を、整数として読み取れませんでした。',
    steps: ['input()は文字列（str）を返します。文字列であること自体は正常です。',
      '下のように入力と変換を分け、一度実行して値の中身と型を確認します。repr()では引用符や空白も見えます。',
      '型がstrでも、整数として読める中身とは限りません。エラー末尾の値や出力を、入力するつもりだった値と比べてみましょう。'],
    example: 'value = input("整数: ")\nprint(repr(value), type(value))\nn = int(value)'
  };
  const hints = {
    ValueError: ['値の内容が、この処理の受け付ける範囲や形式に合っていません。', 'この行で使う値をprint()で表示し、エラー末尾の説明や問題の条件と比べてみましょう。'],
    TypeError: ['演算や関数に渡した値の型を確認してみましょう。', 'エラー末尾にある型や引数の説明を読み、処理の直前に値とtype()を表示します。下のvalueは、調べたい変数名に置き換えてください。'],
    NameError: ['名前が使われる前に定義されているか確認しましょう。', '大文字・小文字、綴り、代入の順序、importの有無を見比べてください。'],
    UnboundLocalError: ['関数内の変数に、使う前に値が入るか確認しましょう。', '条件分岐によって代入を通らない場合や、関数の外の同名変数と混同している場合があります。'],
    SyntaxError: ['この行付近の書き方を確認しましょう。', 'エラーの矢印と末尾の説明を読み、括弧・引用符・コロンを確認します。前の行の閉じ忘れが原因の場合もあります。'],
    IndentationError: ['字下げとブロックの対応を確認しましょう。', 'if、for、defなどの行末のコロンと、その内側の字下げを見比べます。半角スペース4個ずつにそろえると確認しやすくなります。'],
    TabError: ['タブとスペースが混ざっていないか確認しましょう。', '同じブロックの字下げを、半角スペース4個ずつにそろえてみてください。'],
    IndexError: ['添字がリストなどの範囲内か確認しましょう。', '使った添字とlen()で調べた要素数を比べます。先頭の添字は0です。'],
    KeyError: ['指定したキーが辞書にあるか確認しましょう。', 'キーの値・型・綴りを、辞書に登録したものと見比べてください。'],
    ZeroDivisionError: ['割る数が0になる場合を調べましょう。', 'この行の直前で割る数をprint()し、どの入力や計算で0になるか確認します。'],
    ModuleNotFoundError: ['importしたライブラリの名前を確認しましょう。', '綴りを確認し、授業で指定されたライブラリか調べてください。ブラウザの実行環境で使えないものもあります。'],
    EOFError: ['input()が、入力の終了（EOF）を受け取りました。', 'もう一度実行して入力してください。確認用の入力値を使う場合は、input()の回数分を1回につき1行で指定します。']
  };
  const [summary, step] = hints[name] || ['エラー末尾の種類と説明を読み、この行で何が起きたか調べましょう。', '必要な値を処理の直前でprint()し、予想と実際の値を比べてみてください。'];
  return {summary, steps: [step], example: name === 'TypeError' ? 'print(repr(value), type(value))' : ''};
}
