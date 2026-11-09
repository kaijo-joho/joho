/* HTML/CSSのみのプレビュー。元のエディタ内容・配付コメントは変更しない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./diagnostics.js'));
  else root.HtmlPreview = factory(root.HtmlEditorDiagnostics);
})(typeof globalThis === 'undefined' ? this : globalThis, function (diagnostics) {
  'use strict';
  const CSP = "default-src 'none'; script-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'";
  // コメント・通常の文字列は飛ばし、CSSのurl()だけを置き換える。
  const CSS_REFERENCE = /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|(@import\b)|(?<![\w\\\u0080-\uffff-])url\(\s*(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|((?:\\[\s\S]|[^\s"'()\\])*))\s*\)/gi;
  function decodeCssUrl(value) {
    return value.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|(\r\n|[\n\r\f])|([\s\S]))/gi, (_, hex, newline, literal) => {
      if (!hex) return newline ? '' : literal;
      const code = Number.parseInt(hex, 16);
      return !code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
    });
  }
  function rewriteCssImages(css, fs, basePath, missing) {
    return css.replace(CSS_REFERENCE, (token, imported, doubleQuoted, singleQuoted, unquoted) => {
      if (imported) missing.add('CSSの @import（プレビューでは未対応）');
      const raw = doubleQuoted ?? singleQuoted ?? unquoted;
      if (!raw) return token;
      const path = decodeCssUrl(raw);
      if (!path || path.startsWith('#') || /^data:/i.test(path)) return token;
      const url = fs?.resolveResourceUrl(path, basePath);
      if (url) return 'url(' + JSON.stringify(url) + ')';
      missing.add(path);
      return 'url("data:,")';
    });
  }
  function resolveLocalLink(href, base, files) {
    if (typeof href !== 'string' || /^[a-z][a-z0-9+.-]*:|^\/|\\|[\u0000-\u001f\u007f]|%(?:2f|5c|00)/i.test(href)) return null;
    try {
      const separator = href.indexOf('#');
      const relative = separator < 0 ? href : href.slice(0, separator);
      const fragment = separator < 0 ? '' : href.slice(separator);
      if (relative.includes('?')) return null;
      const parts = base.split('/').slice(0, -1);
      for (const part of decodeURIComponent(relative).split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { if (!parts.length) return null; parts.pop(); }
        else parts.push(part);
      }
      const path = parts.join('/');
      return /\.html?$/i.test(path) && files?.has(path) ? {path, fragment} : null;
    } catch { return null; }
  }
  // DOMParserは省略したhtml/bodyを補うため、入力中の開始タグを先に確認する。
  // コメント・属性値・文字列として扱う要素・template/外国語要素内は数えない。
  function missingStructure(source) {
    const text = String(source), found = new Set(), inert = [];
    const raw = new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript']);
    let i = 0;
    while ((i = text.indexOf('<', i)) !== -1) {
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4); if (end < 0) break;
        i = end + 3; continue;
      }
      const token = /^<(\/?)([a-z][a-z0-9:-]*)(?=[\s/>])/i.exec(text.slice(i));
      let end = i + 1, quote = '';
      for (; end < text.length; end++) {
        const ch = text[end];
        if (quote) { if (ch === quote) quote = ''; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (end === text.length) break;
      if (!token) { i = end + 1; continue; }
      const closing = Boolean(token[1]), tag = token[2].toLowerCase();
      if (closing) {
        if (inert.at(-1) === tag) inert.pop();
      } else {
        if (!inert.length && (tag === 'html' || tag === 'body')) found.add(tag);
        if (tag === 'template' || ['svg','math'].includes(tag) && !/\/\s*>$/.test(text.slice(i,end + 1))) inert.push(tag);
        if (tag === 'plaintext') break;
        if (raw.has(tag)) {
          const close = new RegExp('</' + tag + '\\s*>', 'ig'); close.lastIndex = end + 1;
          const match = close.exec(text); if (!match) break;
          i = close.lastIndex; continue;
        }
      }
      i = end + 1;
    }
    return ['html','body'].filter(tag => !found.has(tag));
  }
  class HtmlPreview {
    constructor(options = {}) {
      this.iframe = options.iframe; this.fs = options.fs;
      this.onNavigate = options.onNavigate;
      this.onNotice = options.onNotice || (() => {});
      this.onTitle = options.onTitle || (() => {});
      this.onDiagnostics = options.onDiagnostics || (() => {});
      this.projectView = options.projectView === true;
      this.renderedHtml = ''; this.basePath = ''; this.fragment = ''; this.linked = false; this.revision = 0;
      this.localLinks = new Map();
      this.stylesheetUrls = new Set();
      this.iframe?.addEventListener('load', () => {
        try {
          const location = this.iframe.contentWindow.location;
          const href = this.localLinks.get(location.href);
          if (!href) {
            // リンク先のsrcdocが読み込まれてから、ブラウザ本来の位置移動を使う。
            // 次のupdateで解除するため、古いloadが先に届いても指定を失わない。
            if (this.fragment && location.href.startsWith('about:srcdoc')) location.hash = this.fragment;
            return;
          }
          // WebKitではscripts禁止iframe内の親製click handlerも働かない。
          // 通信を伴わないabout:blankへのネイティブ遷移を、親のloadで受ける。
          // 以前のsrcdocは読取り失敗時だけ戻す。先に戻すとWebKitで新しい表示と位置指定が競合する。
          this.revision++; this.fragment = '';
          if (this.onNavigate) {
            this.iframe.srcdoc = this.renderedHtml;
            this.onNavigate(href);
          } else this.navigate(href, {restoreOnFailure:true});
        } catch { /* 親がアクセスできない画面には介入しない。 */ }
      });
    }
    update(source, basePath = '', fragment = '', linked = false) {
      this.revision++; this.linked = linked;
      this.basePath = basePath;
      this.fragment = typeof fragment === 'string' && fragment.startsWith('#') ? fragment : '';
      this.releaseStylesheets();
      this.renderedHtml = this.transform(source);
      if (this.iframe) this.iframe.srcdoc = this.renderedHtml;
    }
    releaseStylesheets() {
      for (const url of this.stylesheetUrls) URL.revokeObjectURL(url);
      this.stylesheetUrls.clear();
    }
    async navigate(href, {restoreOnFailure = false} = {}) {
      const revision = this.revision, fs = this.fs;
      const entries = fs?.fileEntries, directory = fs?.dirHandle;
      const link = resolveLocalLink(href, this.basePath, entries);
      const current = () => revision === this.revision && fs === this.fs && entries === fs?.fileEntries && directory === fs?.dirHandle;
      try {
        if (!link) throw Error('リンク先を読み込んだフォルダ内で見つけられません。パスを確認してください。');
        const source = await fs.readFile(link.path, {activate:false});
        // 更新・別ファイルの選択・フォルダ変更後に古い読取りを表示しない。
        if (!current() || !fs.fileEntries.has(link.path)) return;
        this.update(source, link.path, link.fragment, true);
      } catch (error) {
        if (!current()) return;
        if (restoreOnFailure && this.iframe) this.iframe.srcdoc = this.renderedHtml;
        this.onNotice(error.message || 'リンク先をプレビューできませんでした。');
      }
    }
    blocked() {
      this.localLinks.clear(); this.fragment = ''; this.onTitle(null);
      const message = this.projectView ? 'このページのコードをエディタで見直してください。' :
        this.linked ? 'リンク先のコードに問題があります。「開く」からリンク先のファイルを開いて修正してください。プレビューを更新すると編集中のファイルへ戻ります。' :
        'コードに問題があります。修正してからプレビューを更新してください。まずは自分で見直し、必要なときは「エラーを探す」を使えます。';
      this.onNotice(message);
      return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP + '"></head><body>' +
        '<div role="alert" style="font-family:sans-serif;line-height:1.7;padding:20px;background:#fff4df;color:#723c00">' +
        '<strong>プレビューを表示していません</strong><p>' + message + '</p></div></body></html>';
    }
    showBlocked() { this.revision++; this.releaseStylesheets(); this.renderedHtml = this.blocked(); if (this.iframe) this.iframe.srcdoc = this.renderedHtml; }
    transform(source) {
      const result = diagnostics.check(source, {supports:typeof CSS === 'undefined' ? null : (name, value) => CSS.supports(name, value),
        selector:value => { try { document.createDocumentFragment().querySelector(value); return true; } catch { return false; } }});
      if (!this.linked) this.onDiagnostics(result);
      if (!result.valid) return this.blocked();
      // DOMParserの入力時点から通信禁止の方針を先頭へ置く。生徒のCSP等は後で除去する。
      const doc = new DOMParser().parseFromString('<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' + source, 'text/html');
      const missing = new Set();
      const localLinks = new Map(), navigationId = crypto.randomUUID();
      doc.querySelectorAll('script,base,iframe,object,embed,meta[http-equiv],audio,video,source,track').forEach(node => node.remove());
      this.onTitle(doc.title);
      doc.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attribute => {
        if (/^on/i.test(attribute.name) || ['srcset','ping','autofocus'].includes(attribute.name)) node.removeAttribute(attribute.name);
      }));
      const meta = doc.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = CSP; doc.head.prepend(meta);
      function external(value) { return /^[a-z][a-z0-9+.-]*:|^\/|\\|[\u0000-\u001f\u007f]/i.test(value); }
      doc.querySelectorAll('img').forEach(node => {
        const src = node.getAttribute('src') || '';
        if (!src) return;
        if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)) return;
        const url = !external(src) && this.fs?.resolveResourceUrl(src, this.basePath);
        if (url) node.setAttribute('src', url);
        else { missing.add(src); node.removeAttribute('src'); }
      });
      doc.querySelectorAll('link').forEach(node => {
        const href = node.getAttribute('href') || '';
        const stylesheet = node.rel.toLowerCase() === 'stylesheet';
        const file = stylesheet && !external(href) && this.fs?.resolveStylesheet(href, this.basePath);
        if (!file) { if (stylesheet) missing.add(href || 'CSS'); node.remove(); return; }
        const css = rewriteCssImages(file.text, this.fs, file.path, missing);
        // CSSは別のBlobとして渡し、外部CSSの本文をHTMLのstyle要素に埋め込まない。
        const url = URL.createObjectURL(new Blob([css], {type:'text/css;charset=utf-8'}));
        this.stylesheetUrls.add(url);
        node.setAttribute('href', url);
      });
      doc.querySelectorAll('style').forEach(node => { node.textContent = rewriteCssImages(node.textContent, this.fs, this.basePath, missing); });
      doc.querySelectorAll('[style]').forEach(node => {
        node.setAttribute('style', rewriteCssImages(node.getAttribute('style'), this.fs, this.basePath, missing));
      });
      doc.querySelectorAll('a').forEach(node => {
        const href = node.getAttribute('href') || '';
        node.removeAttribute('data-local-link'); node.removeAttribute('download'); node.removeAttribute('target');
        if (/^https?:\/\//i.test(href)) {
          node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer');
        } else if (href.startsWith('#')) {
          // srcdocの相対URLは親エディタを基準にする。文書自身を明示し、
          // スクリプトなしで同じプレビュー内をネイティブに移動する。
          node.setAttribute('href', 'about:srcdoc' + href);
        }
        else if (href && !external(href)) {
          const destination = 'about:blank#html-editor-' + navigationId + '-' + localLinks.size;
          node.setAttribute('data-local-link', href);
          node.setAttribute('href', destination);
          localLinks.set(destination, href);
        } else node.removeAttribute('href');
      });
      const linkedNotice = !this.projectView && this.linked ? 'リンク先をプレビューしています：' + this.basePath + '。編集中のファイルは変わりません。更新すると元の表示へ戻ります。' : '';
      this.onNotice([linkedNotice, missing.size ? '表示できない参照：' + [...missing].slice(0,8).join('、') +
        '。画像やCSSを含むフォルダを読み込み、相対パスを確認してください。外部素材の自動読込は行いません。' : ''].filter(Boolean).join(' '));
      this.localLinks = localLinks;
      return '<!doctype html>\n' + doc.documentElement.outerHTML;
    }
  }
  HtmlPreview.missingStructure = missingStructure;
  HtmlPreview.resolveLocalLink = resolveLocalLink;
  return HtmlPreview;
});
