/* 採点済みの詳細を並べ直す表示層。採点・得点・雛形の結合は変更しない。 */
var HtmlGradingFeedback = (function () {
  'use strict';
  var ENGINE = 'html-normal-1.0.0-html-css-0.3.0-parse5-8.0.1-csstree-3.2.1';
  var VERSION = 'html-checkpoints-1';
  var serial = 0;
  function need(value) { if (!value) throw Error('feedback_unavailable'); }
  function check(label, values) {
    need(values.length && values.every(function (v) { return typeof v === 'boolean'; }));
    return {label:label,passed:values.every(Boolean)};
  }
  function row(label, checks) { return {label:label,checks:checks}; }
  function group(title, rows, legend) { return {title:title,legend:legend || [],rows:rows}; }
  function build(result) {
    try { return buildChecked(result); } catch (_) { return null; }
  }
  function buildChecked(result) {
    if (!result || result.state !== 'graded' || result.engineVersion !== ENGINE ||
        result.rubricVersion !== '2026-09-normal-gss-draft-1' || !Array.isArray(result.rules)) return null;
    var used = {}, rules = {};
    result.rules.forEach(function (r) {
      need(r && typeof r.ruleId === 'string' && !rules[r.ruleId] && r.enabled !== false);
      rules[r.ruleId] = r;
    });
    function rule(id) { need(rules[id]); used[id] = true; return rules[id]; }
    function parts(id, count) {
      var r = rule(id), list = r.checks;
      need(Array.isArray(list) && list.length > 0 && list.length <= 1000 && (count == null || list.length === count));
      need(list.every(function (c) { return c && typeof c.passed === 'boolean'; }));
      return list.map(function (c) { return c.passed; });
    }
    var groups, id = result.rubricId;
    if (id === 'html14-01') {
      var images = parts('image-paths',5), widths = parts('image-widths',5), heights = parts('image-heights',5), alts = parts('image-alternatives',5);
      groups = [group('', images.map(function (_,i) {
        return row('写真0'+(i+1),[check('画像',[images[i]]),check('サイズ（width・height）',[widths[i],heights[i]]),check('代替テキスト（alt）',[alts[i]])]);
      }),['画像','サイズ','代替テキスト'])];
    } else if (id === 'html15-01') {
      var local = parts('relative-page-links',4), external = parts('external-links',3), tab = parts('external-new-tab',3);
      groups = [group('同じフォルダへのリンク',['html12-01.html','html13-01.html','html13-02.html','html14-01.html'].map(function (name,i) {
        return row(name,[check('リンク先の指定',[local[i]])]);
      })),group('外部サイトへのリンク',['海城中学高等学校','Apple','Google'].map(function (name,i) {
        return row(name,[check('リンク先の指定',[external[i]]),check('新しいタブで開く',[tab[i]])]);
      }),['リンク先','新しいタブ'])];
    } else if (id === 'html15-02') {
      var contents = parts('contents-heading',1), links = parts('matching-fragment-links',3), headings = parts('topic-headings',3), pictures = parts('topic-images',9);
      groups = [group('目次',[row('目次の見出し',[check('見出し',[contents[0]])])]),group('各テーマ',['インターネットの歴史','プログラミング言語の歴史','未来の技術'].map(function (name,i) {
        return row(name,[check('対応するページ内リンク',[links[i]]),check('見出し',[headings[i]]),check('画像（src・width・alt）',pictures.slice(i*3,i*3+3))]);
      }),['ページ内リンク','見出し','画像'])];
    } else if (id === 'html16-01') {
      var ingredients = parts('ingredients-list',7), steps = parts('procedure-list',9), topics = parts('nested-topics',3);
      // この凍結版は親リスト未検出時だけ子checksが空になる。親の不合格から枝の不在を確定する。
      function nested(id) {
        var r = rule(id);
        if (Array.isArray(r.checks) && r.checks.length === 0 && topics.every(function (v) { return !v; }) && r.passed === false && r.earned === 0) return Array(8).fill(false);
        return parts(id,8);
      }
      var second = nested('nested-second-level'), third = nested('nested-third-level');
      groups = [group('実習コード①：材料',['カレーのルウ','牛肉','玉ねぎ','じゃがいも','にんじん','サラダ油','水'].map(function (name,i) {
        return row(name,[check('箇条書きの項目',[ingredients[i]])]);
      })),group('実習コード②：手順',steps.map(function (v,i) {
        return row('手順'+(i+1),[check('番号付きリストの項目・順序',[v])]);
      }))];
      var topicNames = ['個人情報保護法の義務','本人の求めへの対応','個人情報の有効活用'];
      var secondNames = [['個人情報を取得する際は','個人情報が漏れたり','本人の同意がないのに'],['開示','訂正','利用停止'],['ターゲティング広告','匿名加工情報の利用']];
      var thirdNames = [['法令に基づく場合','生命・身体・財産の保護','公衆衛生・児童の健全な育成'],[],['オプトイン方式','オプトアウト方式','車のナビゲーション','医療情報の活用','家庭の電力利用履歴']];
      var si = 0, ti = 0;
      topicNames.forEach(function (name,i) {
        var rows = [row('大項目',[check('第1階層',[topics[i]])])];
        secondNames[i].forEach(function (label) { rows.push(row(label,[check('第2階層の位置',[second[si++]])])); });
        thirdNames[i].forEach(function (label) { rows.push(row(label,[check('第3階層の位置',[third[ti++]])])); });
        groups.push(group('実習コード③：'+name,rows));
      });
    } else if (id === 'html17-01') {
      var ordinary = parts('ordinary-table',8), horizontal = parts('horizontal-spans',3), vertical = parts('vertical-span',2), original = parts('original-table',3);
      groups = [group('',[
        row('実習コード①：基本の表',[check('行列の構成',[ordinary[0]]),check('見出しセル',[ordinary[1]]),check('2行目のセル',ordinary.slice(2,5)),check('3行目のセル',ordinary.slice(5,8))]),
        row('実習コード②：横の結合',[check('見出しのcolspan',[horizontal[0]]),check('3行目のcolspan',[horizontal[1]]),check('表の列構成',[horizontal[2]])]),
        row('実習コード③：縦の結合',[check('rowspan',[vertical[0]]),check('表の行列構成',[vertical[1]])]),
        row('実習コード④：自分の表',[check('表の構成・行数',[original[0]]),check('列数',[original[1]]),check('内容のあるセル',[original[2]])])
      ])];
    } else if (id === 'html22-01') {
      var specs = [['h1','specified-h1',['文字サイズ','フォント','色']],['h2','specified-h2',['文字サイズ','フォント','色']],['h3','specified-h3',['文字サイズ','フォント','色']],['p','specified-paragraph',['フォント','色']],['strong','specified-strong',['フォント','太さ']],['em','specified-emphasis',['フォント']]];
      groups = [group('',specs.map(function (spec) {
        var values = parts(spec[1]), count = values.length/spec[2].length;
        need(Number.isInteger(count) && count > 0);
        // 採点器はプロパティ順、その内側が対象要素順。各要素数は可変。
        return row(spec[0],spec[2].map(function (label,i) { return check(label,values.slice(i*count,(i+1)*count)); }));
      }))];
    } else if (id === 'html22-02') {
      var free = parts('free-targets'), freeRule = rule('free-targets'), offset = 0;
      var targetRows = ['h1','h2','h3','p','strong','em'].map(function (tag) {
        var start = offset, sum = 0, quota = freeRule.points/6;
        need(Number.isFinite(quota) && quota > 0);
        while (offset < free.length && sum < quota-1e-7) {
          var points = freeRule.checks[offset++].points;
          need(Number.isFinite(points) && points > 0); sum += points;
        }
        need(Math.abs(sum-quota) < 1e-7);
        return row(tag,[check('自由な文字書式の指定',free.slice(start,offset))]);
      });
      need(offset === free.length);
      groups = [group('対象ごとの自由書式',targetRows),group('使用した書式',[
        ['色','free-color'],['文字サイズ','free-size'],['フォント','free-family'],['太さ・斜体','free-emphasis']
      ].map(function (spec) { return row(spec[0],[check('いずれかの対象への指定',parts(spec[1],1))]); }))];
    } else if (id === 'html23-01') {
      groups = [group('',[1,2,3,4].map(function (i) {
        var values = parts('class-paragraph'+i,2);
        return row('paragraph'+i,[check('クラスに対応したCSS',[values[0]]),check('指定色の適用',[values[1]])]);
      }),['クラスとCSS','色'])];
    } else if (id === 'html24-01') {
      var properties = [['block-width','幅'],['block-height','高さ'],['block-padding','内側余白'],['block-margin','外側余白'],['block-border','枠線']];
      var values = properties.map(function (p) { return parts(p[0],5); });
      groups = [group('',[1,2,3,4,5].map(function (i) {
        return row('test0'+i,properties.map(function (p,j) { return check(p[1],[values[j][i-1]]); }));
      }),properties.map(function (p) { return p[1]; }))];
    } else return null;
    need(Object.keys(used).length === result.rules.length);
    return {schema:VERSION,targetId:id,groups:groups};
  }
  // 記録済みの表示要約を厳密に許可リスト化。点数・位置・ソース・本人情報は返さない。
  function publicView(view, targetId) {
    try {
      need(view && view.schema === VERSION && view.targetId === targetId && /^html(?:14|15|16|17|22|23|24)-0[12]$/.test(targetId));
      function text(v) { need(typeof v === 'string' && v.length <= 160); return v; }
      need(Array.isArray(view.groups) && view.groups.length > 0 && view.groups.length <= 8);
      return {schema:VERSION,targetId:targetId,groups:view.groups.map(function (g) {
        need(Array.isArray(g.legend) && g.legend.length <= 8 && Array.isArray(g.rows) && g.rows.length > 0 && g.rows.length <= 40);
        return {title:text(g.title),legend:g.legend.map(text),rows:g.rows.map(function (r) {
          need(Array.isArray(r.checks) && r.checks.length > 0 && r.checks.length <= 8);
          return {label:text(r.label),checks:r.checks.map(function (c) { need(c && typeof c.passed === 'boolean'); return {label:text(c.label),passed:c.passed}; })};
        })};
      })};
    } catch (_) { return null; }
  }
  function render(view, document) {
    view = publicView(view,view && view.targetId); if (!view) return null;
    var root = document.createElement('div'); root.className = 'html-grade-feedback';
    view.groups.forEach(function (g) {
      var section = document.createElement('section'); section.className = 'html-grade-group';
      if (g.title) { var heading = document.createElement('h4'); heading.textContent = g.title; section.append(heading); }
      if (g.legend.length) { var legend = document.createElement('p'); legend.className = 'html-grade-legend'; legend.textContent = '左から：'+g.legend.join('・'); section.append(legend); }
      var table = document.createElement('table'); table.className = 'html-grade-table';
      table.setAttribute('aria-label',g.title || '対象別の採点結果');
      var head = document.createElement('thead'), tr = document.createElement('tr');
      ['対象','採点結果'].forEach(function (label) { var th = document.createElement('th'); th.setAttribute('scope','col'); th.textContent = label; tr.append(th); });
      head.append(tr); table.append(head);
      var body = document.createElement('tbody');
      var detail = document.createElement('p'); detail.className = 'html-grade-detail'; detail.hidden = true; detail.id = 'html-grade-detail-'+(++serial); detail.setAttribute('role','status');
      var active = null;
      g.rows.forEach(function (r) {
        var line = document.createElement('tr'), name = document.createElement('th'), cell = document.createElement('td');
        name.setAttribute('scope','row'); name.textContent = r.label; line.append(name,cell);
        r.checks.forEach(function (c) {
          var button = document.createElement('button'), label = r.label+'：'+c.label+'：'+(c.passed?'達成':'要確認');
          button.type = 'button'; button.className = 'html-grade-check'+(c.passed?' correct':'');
          button.textContent = c.passed?'★':'☆'; button.setAttribute('aria-label',label); button.setAttribute('aria-controls',detail.id); button.setAttribute('aria-expanded','false');
          function show() { if (active) active.setAttribute('aria-expanded','false'); active = button; button.setAttribute('aria-expanded','true'); detail.textContent = label; detail.hidden = false; }
          function close() { if (active === button) { active = null; detail.hidden = true; button.setAttribute('aria-expanded','false'); } }
          button.addEventListener('mouseenter',show); button.addEventListener('focus',show);
          button.addEventListener('click',show); button.addEventListener('mouseleave',function () { if (document.activeElement !== button) close(); });
          button.addEventListener('blur',close); button.addEventListener('keydown',function (event) { if (event.key === 'Escape') { close(); event.preventDefault(); } });
          cell.append(button);
        });
        body.append(line);
      });
      table.append(body); section.append(table,detail); root.append(section);
    });
    return root;
  }
  return Object.freeze({build:build,publicView:publicView,render:render});
})();
if (typeof module === 'object' && module.exports) module.exports = HtmlGradingFeedback;
