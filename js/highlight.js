/* シンタックスハイライト */
//console.log('highlight.js loaded');
// ===== エスケープ処理 =====
function escapeHTML(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
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
  // 文字列
  line = line.replace(/"([^"]*)"/g, '<span class="token-string">"$1"</span>');

  // 数値（整数・小数・負数）
  line = line.replace(/(?<![\w])(-?\d+(?:\.\d+)?)(?![\w])/g, '<span class="token-number">$1</span>');

  // 真偽値 True, False
  line = line.replace(/\b(True|False)\b/g, '<span class="token-boolean">$1</span>');

  // メソッド（ドット付きの英単語に続く括弧）
  line = line.replace(/\.(\w+)(?=\s*\()/g, '.<span class="token-method">$1</span>');

  // すべての括弧をハイライト（丸・角・波）
  line = line.replace(/([\(\)\[\]\{\}])/g, '<span class="token-paren">$1</span>');

  // 組み込み関数
  ['print', 'input', 'int', 'str', 'float', 'len', 'range'].forEach(fn => {
    const re = new RegExp('\\b' + fn + '\\b', 'g');
    line = line.replace(re, `<span class="token-builtins">${fn}</span>`);
  });

  // キーワード
  ['if', 'else', 'elif', 'for', 'while', 'def', 'return', 'import', 'from', 'as', 'in', 'not', 'and', 'or', 'break'].forEach(kw => {
    const re = new RegExp('\\b' + kw + '\\b', 'g');
    line = line.replace(re, `<span class="token-keyword">${kw}</span>`);
  });

  return line;
}

function highlightPythonLines(lines) {
  return lines.map(line => {
    const commentIndex = line.indexOf('#');
    if (commentIndex >= 0) {
      const codePart = escapeHTML(line.slice(0, commentIndex));
      const commentPart = escapeHTML(line.slice(commentIndex));
      return highlightPythonSyntax(codePart) + '<span class="token-comment">' + commentPart + '</span>';
    } else {
      return highlightPythonSyntax(escapeHTML(line));
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
    html = html.replace(/(&lt;\/?)([^\s&gt;]+)((?:\s[^&]*?)?)(&gt;)/g, (match, open, tag, rest, close) => {
      const attrProcessed = rest.replace(/([\s]+)([^\s=]+)="([^"]*)"/g,
        (m, space, attr, val) =>
          `${space}<span class="token-attr">${attr}</span>="<span class="token-value">${val}</span>"`);
      return `${open}<span class="token-tag">${tag}</span>${attrProcessed}${close}`;
    });

    // コメントを戻す
    html = html.replace(/%%COMMENT_PLACEHOLDER_(\d+)%%/g, (_, i) => {
      return `<span class="token-comment">${commentMatches[i]}</span>`;
    });

    return html;
  });
}

// ===== CSS 構文ハイライト =====
function highlightCssLines(lines) {
  return lines.map(line => {
    let html = escapeHTML(line);
    html = html.replace(/^([^{}]+){/, '<span class="token-selector">$1</span>{');
    html = html.replace(/([\p{L}\p{N}_-]+)(:)/gu, '<span class="token-prop">$1</span>$2');
    html = html.replace(/:\s*([^;]+);/g, ': <span class="token-value">$1</span>;');
    html = html.replace(/(\/\*.*?\*\/)/g, '<span class="token-comment">$1</span>');
    return html;
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
/*
function highlightResultLines(lines) {
  return lines.map(line => {
    const commentIndex = line.indexOf('#');
    if (commentIndex >= 0) {
      const codePart = escapeHTML(line.slice(0, commentIndex));
      const commentPart = escapeHTML(line.slice(commentIndex));
      return codePart + '<span class="token-comment">' + commentPart + '</span>';
    } else {
      return escapeHTML(line);
    }
  });
}
  */

// ===== メイン関数 =====
function highlightCodeBlocksWithIds() {
  //console.log('highlightCodeBlocksWithIds() called');
  const headings = document.querySelectorAll('h2');
  let sectionIndex = 0;

  headings.forEach(h2 => {
    sectionIndex++;

    // ✅ 「X. タイトル」形式で見出しテキストを上書き
    const originalText = h2.textContent.replace(/^\(?\d+\)?[.、）]?\s*/, '').trim();
    h2.textContent = `${sectionIndex}. ${originalText}`;
    h2.setAttribute('data-section-index', sectionIndex);

    let exerciseIndex = 1;
    let exampleIndex = 1;
    let el = h2.nextElementSibling;

    while (el && el.tagName !== 'H2') {
      if (el.tagName === 'PRE') {
        const code = el.querySelector('code');
        if (!code) { el = el.nextElementSibling; continue; }

        const classList = el.className.split(/\s+/);
        const isExample = classList.includes('example');
        const lang = classList.find(c => ['python', 'html', 'css', 'other', 'result'].includes(c));
        if (!lang) { el = el.nextElementSibling; continue; }

        let lines = code.textContent.replace(/\r\n/g, '\n').split('\n');
        // ✅ 言語に応じてインデント幅変更
        const indentSize = (lang === 'python') ? 4 : 2;
        
        lines = normalizeIndentation(lines, indentSize);
        while (lines.length > 0 && lines[0].trim() === '') lines.shift();
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

        const titleText = el.getAttribute('data-title') || '';
        let commentLabel = '';
        let idText = '';

        if (lang !== 'result') {
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
          } else if (lang === 'result') {
            commentLabel = `// ${idText}` + (titleText ? ` ${titleText}` : '');
          } else if (lang === 'other') {
            commentLabel = `// ${idText}` + (titleText ? ` ${titleText}` : '');
          }

          if (commentLabel) lines.unshift(commentLabel);
        }

        let highlighted;
        if (lang === 'python') {
          highlighted = highlightPythonLines(lines);
        } else if (lang === 'html') {
          highlighted = highlightHtmlLines(lines);
        } else if (lang === 'css') {
          highlighted = highlightCssLines(lines);
        } else if (lang === 'other') {
          highlighted = lines.map(escapeHTML);
        } else if (lang === 'result') {
          highlighted = highlightResultLines(lines);
        }

        code.innerHTML = highlighted.join('\n');

        if (idText) {
          el.setAttribute('data-code-id', idText);
          el.id = `code-${idText.replace(/[^a-zA-Z0-9]/g, '-')}`;
        }
      }

      el = el.nextElementSibling;
    }
  });
}






