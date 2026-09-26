/* HTML/CSSのみのプレビュー。元のエディタ内容・配付コメントは変更しない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlPreview = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const CSP = "default-src 'none'; script-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'";
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
      this.onNavigate = options.onNavigate || (() => {});
      this.onNotice = options.onNotice || (() => {});
      this.lastHtml = ''; this.basePath = '';
      this.localLinks = new Map();
      this.iframe?.addEventListener('load', () => {
        try {
          const href = this.localLinks.get(this.iframe.contentWindow.location.href);
          if (!href) return;
          // WebKitではscripts禁止iframe内の親製click handlerも働かない。
          // 通信を伴わないabout:blankへのネイティブ遷移を、親のloadで受ける。
          // 未保存確認を取り消しても、元のプレビューを失わない。
          this.update(this.lastHtml, this.basePath);
          this.onNavigate(href);
        } catch { /* 親がアクセスできない画面には介入しない。 */ }
      });
    }
    update(source, basePath = '') {
      this.lastHtml = source; this.basePath = basePath;
      if (this.iframe) this.iframe.srcdoc = this.transform(source);
    }
    transform(source, detached = false) {
      const absent = missingStructure(source);
      if (absent.length) {
        if (!detached) this.localLinks.clear();
        const message = absent.map(tag => '<' + tag + '>').join(' と ') +
          ' の開始タグがありません。文書の構成を確認してから、プレビューを更新してください。';
        this.onNotice(message);
        return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP + '"></head><body>' +
          '<div role="alert" style="font-family:sans-serif;line-height:1.7;padding:20px;background:#fff4df;color:#723c00">' +
          '<strong>プレビューを表示していません</strong><p>' + message.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</p></div></body></html>';
      }
      // DOMParserの入力時点から通信禁止の方針を先頭へ置く。生徒のCSP等は後で除去する。
      const doc = new DOMParser().parseFromString('<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' + source, 'text/html');
      const missing = new Set();
      const localLinks = new Map(), navigationId = crypto.randomUUID();
      doc.querySelectorAll('script,base,iframe,object,embed,meta[http-equiv],audio,video,source,track').forEach(node => node.remove());
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
        const url = node.rel.toLowerCase() === 'stylesheet' && !external(href) && this.fs?.resolveResourceUrl(href, this.basePath);
        if (url) node.setAttribute('href', url);
        else { if (node.rel.toLowerCase() === 'stylesheet') missing.add(href || 'CSS'); node.remove(); }
      });
      doc.querySelectorAll('a').forEach(node => {
        const href = node.getAttribute('href') || '';
        node.removeAttribute('data-local-link'); node.removeAttribute('download'); node.removeAttribute('target');
        if (/^https?:\/\//i.test(href)) {
          node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer');
        } else if (href.startsWith('#')) { /* ページ内移動は維持する。 */ }
        else if (href && !external(href)) {
          const destination = 'about:blank#html-editor-' + navigationId + '-' + localLinks.size;
          node.setAttribute('data-local-link', href);
          node.setAttribute('href', detached ? '#' : destination);
          localLinks.set(destination, href);
          if (detached) node.setAttribute('title', 'ファイル間の移動は元のエディタで確認してください。');
        } else node.removeAttribute('href');
      });
      if (doc.querySelector('style') && /(?:url\s*\(|@import)/i.test([...doc.querySelectorAll('style')].map(node => node.textContent).join('\n')) ||
          [...doc.querySelectorAll('[style]')].some(node => /url\s*\(/i.test(node.getAttribute('style')))) {
        missing.add('CSS内の画像・読み込み指定（このプレビューでは未対応）');
      }
      this.onNotice(missing.size ? '表示できない参照：' + [...missing].slice(0,8).join('、') +
        '。画像やCSSを含むフォルダを読み込み、相対パスを確認してください。外部素材の自動読込は行いません。' : '');
      if (!detached) this.localLinks = localLinks;
      return '<!doctype html>\n' + doc.documentElement.outerHTML;
    }
    openInNewTab() {
      const transformed = this.transform(this.lastHtml, true);
      const srcdoc = transformed.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      const wrapper = '<!doctype html><html lang="ja"><meta charset="utf-8"><title>HTMLプレビュー</title>' +
        '<style>body{margin:0;font-family:sans-serif}p{margin:0;padding:8px}iframe{display:block;border:0;width:100%;height:calc(100vh - 48px)}</style>' +
        '<p>ファイル間の移動は元のエディタで確認してください。</p>' +
        '<iframe title="HTMLプレビュー" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="' + srcdoc + '"></iframe></html>';
      const url = URL.createObjectURL(new Blob([wrapper], {type:'text/html;charset=utf-8'}));
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }
  HtmlPreview.missingStructure = missingStructure;
  return HtmlPreview;
});
