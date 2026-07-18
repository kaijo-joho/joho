/* シンタックスハイライト */
//console.log('highlight.js loaded');
// ===== エスケープ処理 =====
function escapeHTML(str) {
  return String(str).replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

// 生成した <span> を後続の正規表現から保護する。
// private-use 文字を一時マーカーとして使い、最後にまとめて HTML へ戻す。
function createTokenStore() {
  const tokens = [];
  const markerBase = 0xE000;
  const markerLimit = 0xF8FF;

  const stash = (html) => {
    if (markerBase + tokens.length > markerLimit) {
      throw new Error('Too many syntax-highlight tokens on one line.');
    }

    const marker = String.fromCharCode(markerBase + tokens.length);
    tokens.push(html);
    return marker;
  };

  const token = (className, value) =>
    stash(`<span class="${className}">${escapeHTML(value)}</span>`);

  const restore = (value) => {
    let result = String(value);
    let previous = '';
    let passes = 0;

    // 外側のトークン内に別のトークンがある場合も復元する。
    while (result !== previous && passes <= tokens.length) {
      previous = result;
      result = result.replace(/[\uE000-\uF8FF]/g, (marker) => {
        const index = marker.charCodeAt(0) - markerBase;
        return tokens[index] === undefined ? marker : tokens[index];
      });
      passes++;
    }

    return result;
  };

  return { stash, token, restore };
}

function findSequenceOutsideQuotes(source, sequence, quoteChars = ['"', "'"]) {
  let quote = '';

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (quoteChars.includes(char)) {
      quote = char;
      continue;
    }

    if (source.startsWith(sequence, i)) return i;
  }

  return -1;
}

function protectQuotedStrings(source, store, quoteChars = ['"', "'"]) {
  let result = '';
  let i = 0;

  while (i < source.length) {
    const quote = source[i];

    if (!quoteChars.includes(quote)) {
      result += source[i++];
      continue;
    }

    let end = i + 1;
    while (end < source.length) {
      if (source[end] === '\\') {
        end += 2;
      } else if (source[end] === quote) {
        end++;
        break;
      } else {
        end++;
      }
    }

    result += store.token('token-string', source.slice(i, end));
    i = end;
  }

  return result;
}

function protectCssLiterals(source, store, startsInComment = false) {
  let result = '';
  let inComment = startsInComment;
  let i = 0;

  while (i < source.length) {
    if (inComment || source.startsWith('/*', i)) {
      const start = i;
      const end = source.indexOf('*/', inComment ? i : i + 2);

      if (end === -1) {
        result += store.token('token-comment', source.slice(start));
        return { source: result, inComment: true };
      }

      result += store.token('token-comment', source.slice(start, end + 2));
      i = end + 2;
      inComment = false;
      continue;
    }

    const quote = source[i];
    if (quote === '"' || quote === "'") {
      let end = i + 1;
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2;
        } else if (source[end] === quote) {
          end++;
          break;
        } else {
          end++;
        }
      }

      result += store.token('token-string', source.slice(i, end));
      i = end;
      continue;
    }

    result += source[i++];
  }

  return { source: result, inComment };
}

function tokenWithOuterWhitespace(store, className, value) {
  const match = String(value).match(/^(\s*)([\s\S]*?)(\s*)$/);
  const [, before, core, after] = match;
  return core ? before + store.token(className, core) + after : value;
}

// ===== インデント補正 =====
function normalizeIndentation(lines, spaceSize = 2) {
  
  const nonEmptyLines = lines.filter(line => line.trim() !== '');
  if (nonEmptyLines.length === 0) return lines;

  // ✅ 最初の非空行のインデントサイズ
  const firstIndent = nonEmptyLines[0].match(/^ */)[0].length;

  // ✅ 全体で使われているインデント幅の推定（2か4）
  const guessIndent = (() => {
    const indents = nonEmptyLines.map(line => line.match(/^ */)[0].length - firstIndent)
                                  .filter(i => i > 0);
    if (indents.length === 0) return spaceSize;
    return Math.min(...indents);
  })();

  return lines.map(line => {
    if (line.trim() === '') return '';

    const currentIndent = line.match(/^ */)[0].length;
    const relative = Math.max(0, currentIndent - firstIndent);

    const level = Math.round(relative / guessIndent); // きっちり階層を判断
    return ' '.repeat(level * spaceSize) + line.trimStart();
  });
}
// ===== Python 構文ハイライト =====
function highlightPythonSyntax(line) {
  const store = createTokenStore();
  let source = protectQuotedStrings(String(line), store);

  // 数値（整数・小数・負数）
  source = source.replace(
    /(^|[^\w])(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)(?![\w])/g,
    (_, before, number) => before + store.token('token-number', number)
  );

  // 真偽値 True, False
  source = source.replace(/\b(?:True|False|None)\b/g, (match) =>
    store.token('token-boolean', match)
  );

  // メソッド（ドット付きの英単語に続く括弧）
  source = source.replace(/\.(\w+)(?=\s*\()/g, (_, method) =>
    '.' + store.token('token-method', method)
  );

  // すべての括弧をハイライト（丸・角・波）
  source = source.replace(/[()\[\]{}]/g, (match) => store.token('token-paren', match));

  // 組み込み関数
  source = source.replace(/\b(?:print|input|int|str|float|len|range)\b/g, (match) =>
    store.token('token-builtins', match)
  );

  // キーワード
  source = source.replace(
    /\b(?:if|else|elif|for|while|def|return|import|from|as|in|not|and|or|break|continue|class|try|except|finally|with|pass|raise|yield)\b/g,
    (match) => store.token('token-keyword', match)
  );

  return store.restore(escapeHTML(source));
}

function highlightPythonLines(lines) {
  return lines.map(line => {
    const commentIndex = findSequenceOutsideQuotes(line, '#');
    if (commentIndex >= 0) {
      const codePart = line.slice(0, commentIndex);
      const commentPart = escapeHTML(line.slice(commentIndex));
      return highlightPythonSyntax(codePart) + '<span class="token-comment">' + commentPart + '</span>';
    } else {
      return highlightPythonSyntax(line);
    }
  });
}

// ===== HTML 構文ハイライト =====
function highlightHtmlLines(lines) {
  return lines.map(line => {
    let html = escapeHTML(line);

    // コメントのマスク
    const commentMatches = [];
    html = html.replace(/(&lt;!--.*?--&gt;)/g, (match) => {
      commentMatches.push(match);
      return `%%COMMENT_PLACEHOLDER_${commentMatches.length - 1}%%`;
    });

    // タグ＋属性
    html = html.replace(
      /(&lt;\/?)([A-Za-z][\w:-]*)(\s[^&]*?)?(&gt;)/g,
      (match, open, tag, rest = '', close) => {
        const attrProcessed = rest.replace(
          /([\s]+)([^\s=]+)="([^"]*)"/g,
          (m, space, attr, val) =>
            `${space}<span class="token-attr">${attr}</span>="<span class="token-value">${val}</span>"`
        );
        return `${open}<span class="token-tag">${tag}</span>${attrProcessed}${close}`;
      }
    );

    // コメントを戻す
    html = html.replace(/%%COMMENT_PLACEHOLDER_(\d+)%%/g, (_, i) => {
      return `<span class="token-comment">${commentMatches[i]}</span>`;
    });

    return html;
  });
}

// ===== CSS 構文ハイライト =====
function highlightCssLines(lines) {
  let inBlockComment = false;

  return lines.map(raw => {
    const store = createTokenStore();
    const protectedLine = protectCssLiterals(String(raw), store, inBlockComment);
    let source = protectedLine.source;
    inBlockComment = protectedLine.inComment;

    // セレクタ全体を先に保護し、:hover などをプロパティと誤認しないようにする。
    const openBraceIndex = source.indexOf('{');
    if (openBraceIndex >= 0) {
      const selector = source.slice(0, openBraceIndex);
      source = tokenWithOuterWhitespace(store, 'token-selector', selector)
        + '{' + source.slice(openBraceIndex + 1);
    }

    // 行頭、{ の直後、または ; の直後だけを宣言として扱う。
    source = source.replace(
      /(^|[;{])(\s*)(-{0,2}[A-Za-z_][\w-]*)(\s*:\s*)([^;{}]*)(?=;|}|$)/g,
      (_, boundary, spacing, property, colon, value) =>
        boundary
        + spacing
        + store.token('token-prop', property)
        + colon
        + tokenWithOuterWhitespace(store, 'token-value', value)
    );

    return store.restore(escapeHTML(source));
  });
}


// ===== result のハイライト（#コメントのみ）=====
function highlightResultLines(lines) {
  // 「Error」という文字列を含む単語を全体ごと捕まえるための正規表現
  //   - \b は単語境界
  //   - \w* は英数字やアンダースコアを含む0文字以上
  //   - 例: ZeroDivisionError, NameError, MyCustomError などを検出
  const errorPattern = /\b(\w*Error\w*)\b/g;
  
  return lines.map(line => {
    // コメントの位置を探す
    const commentIndex = line.indexOf('#');
    
    if (commentIndex >= 0) {
      // コメント部以外（先頭～# 直前）
      let codePart = escapeHTML(line.slice(0, commentIndex));
      // コメント部（#以降）
      let commentPart = escapeHTML(line.slice(commentIndex));
      
      // 「Error を含む単語」を赤太字化（code部/コメント部ともに実行）
      codePart = codePart.replace(errorPattern, 
        '<span class="font-weight-bold red">$1</span>');
      commentPart = commentPart.replace(errorPattern, 
        '<span class="font-weight-bold red">$1</span>');
      
      // コメント部はトークンを付与
      return codePart + '<span class="token-comment">' + commentPart + '</span>';
    } else {
      // コメントがない行
      let escapedLine = escapeHTML(line);
      escapedLine = escapedLine.replace(errorPattern, 
        '<span class="font-weight-bold red">$1</span>');
      return escapedLine;
    }
  });
}

// ===== Spreadsheet(Excel/Sheets) 構文ハイライト =====
const SHEETS_FUNCS = [
  // 集計/統計
  'SUM','SUMIF','SUMIFS','AVERAGE','AVERAGEIF','AVERAGEIFS','COUNT','COUNTA','COUNTIF','COUNTIFS',
  'MIN','MAX','MINIFS','MAXIFS','MEDIAN','MODE','MODE.SNGL','MODE.MULT',
  'QUARTILE','QUARTILE.INC','QUARTILE.EXC','PERCENTILE','PERCENTILE.INC','PERCENTILE.EXC',
  'RANK','RANK.EQ','RANK.AVG','STDEV','STDEV.P','STDEV.S','VAR','VAR.P','VAR.S','CORREL',
  'ROUND','ROUNDUP','ROUNDDOWN','INT','MOD','ABS','SIGN','SQRT','POWER',
  // 論理/選択
  'IF','IFS','IFERROR','IFNA','AND','OR','NOT','XOR','SWITCH','CHOOSE','LET','LAMBDA',
  'ISBLANK','ISNUMBER','ISTEXT','ISERROR','ISNA',
  // 配列/動的配列
  'FILTER','SORT','SORTBY','UNIQUE','TAKE','DROP','SEQUENCE','INDEX','MATCH','XLOOKUP','VLOOKUP','HLOOKUP','LOOKUP',
  'OFFSET','INDIRECT','MMULT','TRANSPOSE','BYROW','BYCOL','MAP','REDUCE','SCAN',
  // 文字列
  'TEXT','TEXTJOIN','CONCAT','CONCATENATE','SPLIT','LEFT','RIGHT','MID','LEN','LOWER','UPPER','PROPER','VALUE',
  // 日付/時間
  'DATE','DATEVALUE','TIME','TIMEVALUE','EDATE','EOMONTH','WEEKDAY','WEEKNUM','WORKDAY','NETWORKDAYS','DATEDIF',
  // 乱数/時刻
  'NOW','TODAY','RAND','RANDBETWEEN',
  // Sheets専用系
  'REGEXMATCH','REGEXREPLACE','REGEXEXTRACT','QUERY','IMPORTRANGE','HYPERLINK','ARRAYFORMULA'
];

function highlightSpreadsheetLines(lines) {
  const escapedFunctions = SHEETS_FUNCS.map(name =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const FUNC_RE = new RegExp('\\b(?:' + escapedFunctions.join('|') + ')\\b(?=\\s*\\()', 'gi');
  const ERR_RE  = /#(?:N\/A|VALUE!|REF!|NAME\?|DIV\/0!|NUM!|NULL!|CALC!|SPILL!|ERROR!)/gi;
  const BOOL_RE = /\b(?:TRUE|FALSE)\b/gi;
  // num: 123, 1.23, 1E-3, 50%
  const NUM_RE  = /(^|[^A-Za-z0-9_])(\d+(?:\.\d+)?(?:E[+\-]?\d+)?%?)/gi;
  const ARGSEP_RE = /[,;]/g;                   // 引数区切り（, / ; 両対応）
  const COMP_RE   = /<=|>=|<>|=|<|>/g;         // 比較演算子
  const OP_RE     = /[+\-*\/^&:]/g;             // 算術/連結/範囲演算子
  const PAREN_RE  = /[(){}\[\]]/g;             // 括弧類
  // テーブル構造化参照（Excel）
  const TABLE_REF_RE = /\b([A-Za-z_][A-Za-z0-9_]*)(\s*)\[([^\]\[]+)\]/g;
  // 3D参照: Sheet1:Sheet3!A1 or 'A B' : 'C D' !A1
  const THREED_RE = /((?:'[^']+'|[A-Za-z0-9_]+):(?:'[^']+'|[A-Za-z0-9_]+))!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)/g;
  // シート参照: Sheet1!A1, '売上 2025'!$B$2:$B$99
  const SHEET_REF_RE = /((?:'[^']+'|[A-Za-z0-9_]+))!(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)/g;
  // A1 or A1:B10
  const RANGE_RE = /(^|[^A-Za-z0-9_])(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![A-Za-z0-9_])/g;

  return lines.map(raw => {
    const line = String(raw);

    // 数式に公式のコメント構文はないため、教材用の行頭 ' と // のみを注釈扱いする。
    // # は #N/A などのエラー値に使われるので、コメント開始とはみなさない。
    if (/^\s*'/.test(line)) {
      return '<span class="token-comment">' + escapeHTML(line) + '</span>';
    }

    const commentIndex = findSequenceOutsideQuotes(line, '//');
    const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : '';
    let source = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const store = createTokenStore();

    // "..." 内の演算子・セル名・URLは数式トークンとして再処理しない。
    source = source.replace(/"(?:[^"]|"")*"/g, (match) =>
      store.token('token-string', match)
    );

    // エラー値は / や ? を含むため、演算子より先に保護する。
    source = source.replace(ERR_RE, (match) => store.token('token-error', match));

    // 3D参照 → シート/範囲分離
    source = source.replace(THREED_RE, (_, sheets, range) =>
      store.token('token-sheet', sheets) + '!' + store.token('token-range', range)
    );
    // シート!範囲
    source = source.replace(SHEET_REF_RE, (_, sheet, range) =>
      store.token('token-sheet', sheet) + '!' + store.token('token-range', range)
    );
    // テーブル構造化参照 Table1[Column]
    source = source.replace(TABLE_REF_RE, (_, table, spacing, field) =>
      store.token('token-table', table)
      + spacing
      + store.token('token-bracket', '[')
      + store.token('token-field', field)
      + store.token('token-bracket', ']')
    );
    // 単独の A1 / A1:B10
    source = source.replace(RANGE_RE, (_, before, reference) =>
      before + store.token(reference.includes(':') ? 'token-range' : 'token-cell', reference)
    );

    // 関数名（ホワイトリスト）
    source = source.replace(FUNC_RE, (match) => store.token('token-func', match));

    // その他のトークン
    source = source.replace(BOOL_RE, (match) => store.token('token-boolean', match));
    source = source.replace(NUM_RE, (_, before, number) =>
      before + store.token('token-number', number)
    );
    source = source.replace(COMP_RE, (match) => store.token('token-compare', match));
    source = source.replace(OP_RE, (match) => store.token('token-operator', match));
    source = source.replace(ARGSEP_RE, (match) => store.token('token-argsep', match));
    source = source.replace(PAREN_RE, (match) => store.token('token-paren', match));

    const highlighted = store.restore(escapeHTML(source));
    return commentPart
      ? highlighted + '<span class="token-comment">' + escapeHTML(commentPart) + '</span>'
      : highlighted;
  });
}





// ===== result 用：共通の先頭インデントだけを除去 =====
function stripCommonIndent(lines) {
  const nonEmptyLines = lines.filter(line => line.trim() !== '');
  if (nonEmptyLines.length === 0) return lines;

  const minIndent = Math.min(
    ...nonEmptyLines.map(line => (line.match(/^ */) || [''])[0].length)
  );

  return lines.map(line => {
    if (line.trim() === '') return '';
    return line.slice(minIndent);
  });
}

function setNumberedHeading(h2, numberedText) {
  const directAnchor = Array.from(h2.children || [])
    .find(child => child.tagName === 'A');

  // 旧ページの <h2><a id="..."></a></h2> を壊さず、既存のアンカーを残す。
  if (directAnchor && h2.textContent.trim() === directAnchor.textContent.trim()) {
    directAnchor.textContent = numberedText;
  } else {
    h2.textContent = numberedText;
  }
}

const SUPPORTED_CODE_LANGUAGES = ['python', 'html', 'css', 'sheets', 'excel', 'other', 'result'];

function getCodeLanguage(pre, code = pre.querySelector('code') || pre) {
  const classes = [...pre.classList, ...code.classList];

  for (const className of classes) {
    const normalized = className.startsWith('language-')
      ? className.slice('language-'.length)
      : className;
    if (SUPPORTED_CODE_LANGUAGES.includes(normalized)) return normalized;
  }

  // FAQや埋め込み例でクラスが付いていない数式だけは内容から判定する。
  return code.textContent.trimStart().startsWith('=') ? 'sheets' : '';
}

function prepareCodeLines(source, lang) {
  let lines = String(source).replace(/\r\n?/g, '\n').split('\n');

  if (lang === 'python') {
    lines = normalizeIndentation(lines, 4);
  } else if (lang === 'result') {
    lines = stripCommonIndent(lines);
  } else {
    lines = normalizeIndentation(lines, 2);
  }

  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

function highlightLinesForLanguage(lines, lang) {
  if (lang === 'python') return highlightPythonLines(lines);
  if (lang === 'html') return highlightHtmlLines(lines);
  if (lang === 'css') return highlightCssLines(lines);
  if (lang === 'sheets' || lang === 'excel') return highlightSpreadsheetLines(lines);
  if (lang === 'result') return highlightResultLines(lines);
  return lines.map(escapeHTML);
}

/**
 * FAQやレッスンドック内など、見出しの直後ではないコード例を装飾する。
 * 教材本文用の番号・識別コメントは追加しない。
 */
function highlightEmbeddedCodeBlocks(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const selector = 'pre.codeInDescription, pre[class*="language-"]';
  const blocks = [];
  if (root.matches && root.matches(selector)) blocks.push(root);
  blocks.push(...root.querySelectorAll(selector));

  [...new Set(blocks)].forEach(pre => {
    if (pre.dataset.syntaxHighlighted === 'true') return;

    const code = pre.querySelector('code') || pre;
    const lang = getCodeLanguage(pre, code);
    if (!lang) return;

    const lines = prepareCodeLines(code.textContent, lang);
    code.innerHTML = highlightLinesForLanguage(lines, lang).join('\n');
    pre.dataset.syntaxHighlighted = 'true';
  });
}

// ===== メイン関数 =====
function highlightCodeBlocksWithIds() {
  //console.log('highlightCodeBlocksWithIds() called');
  const headings = Array.from(document.querySelectorAll('h2'))
    .filter(h2 => !h2.closest('#faq-app, .lesson-dock, #lesson-dock'));
  let sectionIndex = 0;

  headings.forEach(h2 => {
    // data-skip-numbering がある見出しは、表示も連番のカウントも変更しない。
    const skipNumbering = h2.matches('[data-skip-numbering]');

    if (!skipNumbering) {
      sectionIndex++;

      // 「X. タイトル」形式で見出しテキストを上書き
      const originalText = h2.textContent
        .replace(/^(?:\(\d+\)|\d+[.、）])\s*/, '')
        .trim();
      setNumberedHeading(h2, `${sectionIndex}. ${originalText}`);
      h2.setAttribute('data-section-index', sectionIndex);
    }

    let exerciseIndex = 1;
    let exampleIndex = 1;
    let el = h2.nextElementSibling;

    while (el && el.tagName !== 'H2') {
      if (el.tagName === 'PRE') {
        // 一部の旧ページは <pre> 直下にコードがあり、<code> 開始タグがない。
        const code = el.querySelector('code') || el;

        const classList = el.className.split(/\s+/);
        const isExample = classList.includes('example');
        const lang = getCodeLanguage(el, code);

        if (!lang) {
          el = el.nextElementSibling;
          continue;
        }

        // 同じ関数が再実行されても、識別コメントや <span> を重ねない。
        if (el.dataset.syntaxHighlighted === 'true') {
          if (lang !== 'result') {
            if (isExample) exampleIndex++;
            else exerciseIndex++;
          }
          el = el.nextElementSibling;
          continue;
        }

        let lines = prepareCodeLines(code.textContent, lang);

        const titleText = el.getAttribute('data-title') || '';
        let commentLabel = '';
        let idText = '';

        if (lang !== 'result' && !skipNumbering) {
          const labelType = isExample ? '例' : '実習';
          const subIndex = isExample ? exampleIndex++ : exerciseIndex++;
          idText = `${labelType} ${sectionIndex}-${String(subIndex).padStart(2, '0')}`;

          // 言語ごとのコメント記法で識別子挿入
          if (lang === 'python') {
            commentLabel = `# ${idText}` + (titleText ? ` ${titleText}` : '');
          } else if (lang === 'html') {
            commentLabel = `<!-- ${idText}` + (titleText ? ` ${titleText}` : '') + ' -->';
          } else if (lang === 'css') {
            commentLabel = `/* ${idText}` + (titleText ? ` ${titleText}` : '') + ' */';
          } else if (lang === 'sheets' || lang === 'excel') {
            // 数式に公式のコメント記法はないので、行頭'で注釈とする
            commentLabel = `' ${idText}` + (titleText ? ` ${titleText}` : '');
          } else if (lang === 'other') {
            commentLabel = `// ${idText}` + (titleText ? ` ${titleText}` : '');
          }

          if (commentLabel) lines.unshift(commentLabel);
        }

        const highlighted = highlightLinesForLanguage(lines, lang);

        code.innerHTML = highlighted.join('\n');

        if (idText) {
          el.setAttribute('data-code-id', idText);
          el.id = `code-${idText.replace(/[^a-zA-Z0-9]/g, '-')}`;
        }

        el.dataset.syntaxHighlighted = 'true';
      }

      el = el.nextElementSibling;
    }
  });

  highlightEmbeddedCodeBlocks(document);
}

window.highlightCodeBlocksWithIds = highlightCodeBlocksWithIds;
window.highlightEmbeddedCodeBlocks = highlightEmbeddedCodeBlocks;
