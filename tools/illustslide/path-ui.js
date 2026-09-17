/* 直接選択。アンカーの選択状態とドラッグ中の形は保存する作品から分離する。 */
(function (root) {
  'use strict';
  function create(ctx) {
    const C = root.IlapoCore, P = root.IlapoPathEdit, G = root.IlapoGeometry, Grid = root.IlapoGrid;
    const $ = id => document.getElementById(id);
    let refs = [], edge = null, snapTarget = null, addMode = false, addModeSelection = [];
    const key = ref => JSON.stringify([ref.id, ref.path, ref.index]);
    const same = (a, b) => key(a) === key(b);
    const objectOf = (id, page = ctx.page()) => page.objects.find(o => o.id === id);
    const selectedPaths = () => ctx.selected().map(id => objectOf(id)).filter(o => o?.type === 'path');
    const node = (ref, page = ctx.page()) => {
      const object = objectOf(ref.id, page);
      return object?.type === 'path' ? P.inspect(object)[ref.path]?.segments[ref.index] : null;
    };
    function stopAddMode() { addMode = false; addModeSelection = []; }
    function clean() {
      const selected = ctx.selected(), inspected = new Map();
      refs = refs.filter(ref => {
        if (!selected.includes(ref.id)) return false;
        if (!inspected.has(ref.id)) {
          const object = objectOf(ref.id);
          inspected.set(ref.id, object?.type === 'path' ? P.inspect(object) : []);
        }
        return !!inspected.get(ref.id)[ref.path]?.segments[ref.index];
      });
      if (edge && !selected.includes(edge.id)) edge = null;
      if (addMode && JSON.stringify(ctx.selected().slice().sort()) !== JSON.stringify(addModeSelection)) stopAddMode();
    }
    function reset() { refs = []; edge = null; snapTarget = null; stopAddMode(); }
    function selectRefs(next, ids) {
      refs = [...new Map(next.map(ref => [key(ref), ref])).values()];
      ctx.select(ids || [...new Set(refs.map(ref => ref.id))]);
      ctx.render();
    }
    function allRefs(objects = selectedPaths()) {
      return objects.flatMap(o => P.inspect(o).flatMap((path, pi) => path.segments.map((s, i) => ({ id: o.id, path: pi, index: i }))));
    }
    function endpoints() {
      return refs.length === 2 && refs.every(ref => {
        const object = objectOf(ref.id), path = object && P.inspect(object)[ref.path];
        return path && !path.closed && (ref.index === 0 || ref.index === path.segments.length - 1);
      });
    }
    function replace(page, id, next) {
      const index = page.objects.findIndex(o => o.id === id);
      if (next) page.objects[index] = next;
      else page.objects.splice(index, 1);
    }
    function mutate(fn, clear = false) {
      if (!ctx.editable()) return false;
      const changed = ctx.changePage(page => fn(page));
      if (changed && clear) { refs = []; edge = null; }
      ctx.render();
      return changed;
    }
    function editRefs(method, ...args) {
      if (!refs.length) return ctx.toast('編集するアンカーを選んでください。');
      mutate(page => {
        for (const id of new Set(refs.map(r => r.id))) {
          replace(page, id, P[method](objectOf(id, page), refs.filter(r => r.id === id), ...args));
        }
      }, ['deleteAnchors', 'roundCorners'].includes(method));
    }
    function begin(kind, event, point, base, extra = {}) {
      ctx.setDrag({ kind, pointerId: event.pointerId, start: point, base,
        originalSelection: ctx.selected().slice(), originalNodes: C.clone(refs), ...extra });
    }
    function inspectTargets(base) {
      return base.objects.filter(o => o.type === 'path').map(object => ({ object, paths: P.inspect(object), box: G.bounds(object) }));
    }
    function snapped(point, event, drag) {
      snapTarget = null;
      // Option中だけ吸着を解除し、ハンドルにもアンカーと同じ目盛りを使う。
      if (event.altKey) return point;
      const settings = ctx.settings(), interval = Grid.step(settings, event), aligned = value => Grid.matches(value.x, interval) && Grid.matches(value.y, interval), tolerance = (event.pointerType === 'touch' ? 14 : 9) / ctx.zoom();
      const targets = drag.targets || (drag.targets = inspectTargets(drag.base));
      const moving = drag.nodes || refs;
      let best;
      if (settings.snapAnchor) for (const target of targets) {
        target.paths.forEach((path, pi) => path.segments.forEach((segment, i) => {
          if (moving.some(r => r.id === target.object.id && r.path === pi && r.index === i)) return;
          const distance = Math.hypot(point.x - segment.point.x, point.y - segment.point.y);
          if (aligned(segment.point) && distance <= tolerance && (!best || distance < best.distance)) {
            best = { point: segment.point, distance, kind: 'アンカー', id: target.object.id };
          }
        }));
      }
      if (!best && settings.snapPath) for (const target of targets) {
        // 移動中に形が変わる自分自身の区間へは吸着しない。
        if (moving.some(r => r.id === target.object.id)) continue;
        const b = target.box;
        if (point.x < b.x - tolerance || point.x > b.x + b.width + tolerance || point.y < b.y - tolerance || point.y > b.y + b.height + tolerance) continue;
        const near = P.nearest(target.object, point);
        if (near && aligned(near.point) && near.distance <= tolerance && (!best || near.distance < best.distance)) {
          best = { ...near, kind: 'パス', id: target.object.id };
        }
      }
      if (!best && (settings.snap || settings.snapPixel)) {
        best = { point: Grid.point(point, settings, event), kind: settings.snap ? 'グリッド' : 'ピクセル' };
      }
      if (best) { snapTarget = best; return best.point; }
      return point;
    }
    function nearestSelected(point, event) {
      const tolerance = (event.pointerType === 'touch' ? 14 : 9) / ctx.zoom();
      let best = null;
      for (const object of selectedPaths()) {
        const bounds = G.bounds(object);
        if (point.x < bounds.x - tolerance || point.x > bounds.x + bounds.width + tolerance || point.y < bounds.y - tolerance || point.y > bounds.y + bounds.height + tolerance) continue;
        const near = P.nearest(object, point);
        if (near && near.distance <= tolerance && (!best || near.distance < best.distance)) best = { ...near, id: object.id };
      }
      return best;
    }
    function beginAddMode() {
      clean();
      const paths = selectedPaths();
      if (!paths.length) return ctx.toast('アンカーを追加するパスを選択してください。');
      if (!ctx.editable()) return false;
      // 通常のツール切替を通し、全体選択に残ったパス編集状態も解除する。
      ctx.setTool('direct');
      addMode = true;
      addModeSelection = ctx.selected().slice().sort();
      edge = null;
      ctx.render();
      return true;
    }
    function pointerDown(event, point, base) {
      clean();
      if (addMode) {
        // 既存のアンカーやハンドルを押しても、そこへ重複追加しない。
        if (event.target.closest('[data-node],[data-bezier]')) return;
        const near = nearestSelected(point, event);
        if (!near) return;
        edge = { ...near };
        addAnchor();
        return;
      }
      const anchorElement = event.target.closest('[data-node]'), handleElement = event.target.closest('[data-bezier]');
      if (handleElement) {
        const [id, path, index, which] = JSON.parse(handleElement.dataset.bezier), ref = { id, path, index };
        if (ctx.editable()) begin('bezier', event, point, base, { ref, which, nodes: [ref] });
        return;
      }
      if (anchorElement) {
        const [id, path, index] = JSON.parse(anchorElement.dataset.node), ref = { id, path, index };
        const already = refs.some(r => same(r, ref));
        if (event.shiftKey) selectRefs(already ? refs.filter(r => !same(r, ref)) : [...refs, ref], [...ctx.selected(), id]);
        else if (!already) selectRefs([ref], [id]);
        edge = null;
        if (refs.some(r => same(r, ref)) && ctx.editable()) {
          begin('nodes', event, point, base, { nodes: C.clone(refs), primary: ref, origin: node(ref).point });
        }
        return;
      }
      let id = event.target.closest('[data-object]')?.dataset.object, near = null;
      if (!id) {
        // 塗りがない細い線も、見た目のすぐそばをクリックすれば選べる。
        for (const o of [...base.objects].reverse()) {
          if (o.type !== 'path') continue;
          const b = G.bounds(o), t = 8 / ctx.zoom();
          if (point.x < b.x - t || point.x > b.x + b.width + t || point.y < b.y - t || point.y > b.y + b.height + t) continue;
          const candidate = P.nearest(o, point);
          if (candidate && candidate.distance <= t) { id = o.id; near = candidate; break; }
        }
      }
      const object = objectOf(id, base);
      if (object?.type === 'text' || object?.type === 'image') {
        refs = []; edge = null;
        ctx.select(event.shiftKey ? [...ctx.selected(), id] : [id]);
        if (ctx.editable()) begin('move', event, point, base);
      } else if (object) {
        near ||= P.nearest(object, point);
        if (near && near.distance <= 9 / ctx.zoom()) {
          const path = P.inspect(object)[near.path], next = (near.index + 1) % path.segments.length;
          const pair = [{ id, path: near.path, index: near.index }, { id, path: near.path, index: next }];
          selectRefs(event.shiftKey ? [...refs, ...pair] : pair, event.shiftKey ? [...ctx.selected(), id] : [id]);
          edge = { ...near, id };
          if (ctx.editable()) begin('nodes', event, point, base, { nodes: C.clone(refs), primary: pair[0], origin: node(pair[0]).point });
        } else {
          refs = []; edge = null;
          const ids = ctx.selected();
          ctx.select(event.shiftKey ? (ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]) : [id]);
        }
      } else {
        const before = C.clone(refs), selectedBefore = ctx.selected().slice();
        if (!event.shiftKey) { refs = []; ctx.select([]); }
        begin('node-marquee', event, point, base, { box: { x: point.x, y: point.y, width: 0, height: 0 }, add: event.shiftKey, originalNodes: before, originalSelection: selectedBefore });
        edge = null;
      }
    }
    function pointerMove(event, point, drag) {
      if (!['nodes', 'bezier', 'node-marquee'].includes(drag.kind)) return false;
      if (drag.kind === 'node-marquee') {
        drag.box = { x: Math.min(point.x, drag.start.x), y: Math.min(point.y, drag.start.y), width: Math.abs(point.x - drag.start.x), height: Math.abs(point.y - drag.start.y) };
      } else if (drag.moved) {
        try {
          const preview = C.clone(drag.base);
          if (drag.kind === 'nodes') {
            const target = snapped({ x: drag.origin.x + point.x - drag.start.x, y: drag.origin.y + point.y - drag.start.y }, event, drag);
            for (const id of new Set(drag.nodes.map(r => r.id))) {
              replace(preview, id, P.moveAnchors(objectOf(id, drag.base), drag.nodes.filter(r => r.id === id), target.x - drag.origin.x, target.y - drag.origin.y));
            }
          } else {
            const target = snapped(point, event, drag);
            replace(preview, drag.ref.id, P.moveHandle(objectOf(drag.ref.id, drag.base), drag.ref, drag.which, target, { independent: event.altKey }));
          }
          ctx.setPreview(preview);
        } catch (error) {
          if (!drag.error) ctx.toast(ctx.errorMessage(error));
          drag.error = true;
        }
      }
      return true;
    }
    function finishDrag(action, result) {
      if (!['nodes', 'bezier', 'node-marquee'].includes(action.kind)) return false;
      snapTarget = null;
      if (action.kind === 'node-marquee' && action.moved) {
        const b = action.box, hits = [];
        for (const o of ctx.page().objects.filter(o => o.type === 'path')) {
          P.inspect(o).forEach((path, pi) => path.segments.forEach((segment, index) => {
            const point = segment.point;
            if (point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) hits.push({ id: o.id, path: pi, index });
          }));
        }
        selectRefs(action.add ? [...action.originalNodes, ...hits] : hits);
      } else if (action.moved && result) ctx.changePage(page => { page.objects = result.objects; });
      return true;
    }
    function cancel(drag) { if (drag?.originalNodes) refs = drag.originalNodes; snapTarget = null; }
    function doubleClick(event, point) {
      if (addMode) return;
      if (event.target.closest('[data-node],[data-bezier]')) return;
      const id = event.target.closest('[data-object]')?.dataset.object, object = objectOf(id);
      if (object?.type !== 'path') return;
      const near = P.nearest(object, point);
      if (near && near.distance <= 9 / ctx.zoom()) { ctx.select([id]); edge = { id, ...near }; addAnchor(); }
    }
    function render(page, z) {
      clean();
      const paths = page.objects.filter(o => ctx.selected().includes(o.id) && o.type === 'path');
      if (!paths.length) return null;
      const stroke = 1.2 / z, hit = (matchMedia('(pointer:coarse)').matches ? 15 : 8) / z;
      const chosen = new Set(refs.map(key));
      let result = '';
      for (const object of paths) {
        result += `<path d="${ctx.esc(object.d)}" transform="matrix(${object.matrix.join(' ')})" fill="none" stroke="#2563eb" stroke-width="1.2" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
        const inspected = P.inspect(object);
        // ハンドル線を先に描き、アンカーを上に重ねる。
        inspected.forEach((path, pi) => path.segments.forEach((segment, i) => {
          if (!chosen.has(key({ id: object.id, path: pi, index: i }))) return;
          for (const [which, vector] of [['in', segment.handleIn], ['out', segment.handleOut]]) {
            if (Math.hypot(vector.x, vector.y) < 1e-8) continue;
            const p = segment.point, x = p.x + vector.x, y = p.y + vector.y;
            result += `<path d="M${p.x} ${p.y}L${x} ${y}" stroke="#2563eb" stroke-width="${stroke}" pointer-events="none"/>`;
            result += `<g data-bezier="${ctx.esc(JSON.stringify([object.id, pi, i, which]))}" style="cursor:crosshair"><circle cx="${x}" cy="${y}" r="${hit}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${3.5 / z}" fill="#fff" stroke="#2563eb" stroke-width="${stroke}"/></g>`;
          }
        }));
        inspected.forEach((path, pi) => path.segments.forEach((segment, i) => {
          const active = chosen.has(key({ id: object.id, path: pi, index: i })), p = segment.point;
          const endpoint = !path.closed && (i === 0 || i === path.segments.length - 1), size = (endpoint ? 5 : 4) / z;
          result += `<g data-node="${ctx.esc(JSON.stringify([object.id, pi, i]))}" style="cursor:${object.locked ? 'not-allowed' : 'move'}"><circle cx="${p.x}" cy="${p.y}" r="${hit}" fill="transparent"/><rect x="${p.x - size}" y="${p.y - size}" width="${size * 2}" height="${size * 2}" rx="${endpoint ? 3 / z : 0}" fill="${active ? '#2563eb' : '#fff'}" stroke="#2563eb" stroke-width="${stroke}"/></g>`;
        }));
      }
      return result + snapMarkup(z);
    }
    function snapMarkup(z) {
      if (!snapTarget) return '';
      const p = snapTarget.point, r = 10 / z;
      return `<g id="snap-target" pointer-events="none"><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="#d97706" stroke-width="${2 / z}"/><path d="M${p.x - r} ${p.y}h${2 * r}M${p.x} ${p.y - r}v${2 * r}" stroke="#d97706" stroke-width="${1 / z}"/><text x="${p.x + 14 / z}" y="${p.y - 14 / z}" font-size="${12 / z}" font-family="sans-serif" fill="#92400e" stroke="white" stroke-width="${3 / z}" paint-order="stroke">${snapTarget.kind}</text></g>`;
    }
    function addAnchor() {
      if (!edge) return beginAddMode();
      let added;
      try {
        if (mutate(page => {
          added = P.addAnchor(objectOf(edge.id, page), edge.point);
          replace(page, edge.id, added.object);
        })) { selectRefs([{ id: edge.id, ...added.ref }], [edge.id]); edge = null; stopAddMode(); }
      } catch (error) {
        ctx.toast(ctx.errorMessage(error));
      }
    }
    function anchorList() {
      const objects = selectedPaths();
      if (!objects.length) return;
      const items = allRefs(objects), chosen = new Set(refs.map(key)), paths = new Map(objects.map(o => [o.id, P.inspect(o)]));
      ctx.showDialog('アンカーを選択', '<p class="muted">複数選べます。端点は開いたパスの端にあるアンカーです。</p><div class="anchor-list">' + items.map((ref, i) => {
        const path = paths.get(ref.id)[ref.path], p = path.segments[ref.index].point;
        const endpoint = !path.closed && (ref.index === 0 || ref.index === path.segments.length - 1);
        return `<label class="check"><input type="checkbox" data-anchor-pick="${i}" ${chosen.has(key(ref)) ? 'checked' : ''}><span>${ctx.esc(objectOf(ref.id).name)} · パス${ref.path + 1} 点${ref.index + 1}${endpoint ? '（端点）' : ''}<small>x ${ctx.round(p.x)} / y ${ctx.round(p.y)}</small></span></label>`;
      }).join('') + '</div>', '選択', () => {
        const next = [...$('dialog-body').querySelectorAll('[data-anchor-pick]:checked')].map(el => items[Number(el.dataset.anchorPick)]), ids = ctx.selected().slice();
        ctx.setTool('direct'); selectRefs(next, ids);
      });
    }
    function coordinateDialog() {
      if (!refs.length || !ctx.editable()) return;
      // 即時反映を繰り返しても移動量を重ねないよう、開始時の形から再計算する。
      const formRefs = C.clone(refs), formObjects = new Map();
      formRefs.forEach(ref => { if (!formObjects.has(ref.id)) formObjects.set(ref.id, C.clone(objectOf(ref.id))); });
      const formNodes = formRefs.map(ref => {
        const object = formObjects.get(ref.id), inspected = P.inspect(object);
        return inspected[ref.path].segments[ref.index];
      });
      const points = formNodes.map(value => value.point), x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
      const single = formRefs.length === 1 ? formNodes[0] : null;
      const field = (id, label, value) => `<label>${label}<input id="${id}" type="number" step="any" required value="${ctx.round(value)}"></label>`;
      ctx.showInspector('anchor','アンカーの座標', `<p class="muted">${single ? '用紙上の座標をpxで指定します。ハンドルはアンカーからの距離です。' : '選んだアンカー全体の左上の座標です。相対位置を保って移動します。'}</p><div class="fields">${field('anchor-x', 'x', x)}${field('anchor-y', 'y', y)}</div>${single ? `<details><summary>ハンドルの位置</summary><div class="fields">${field('anchor-in-x', '入る側 Δx', single.handleIn.x)}${field('anchor-in-y', '入る側 Δy', single.handleIn.y)}${field('anchor-out-x', '出る側 Δx', single.handleOut.x)}${field('anchor-out-y', '出る側 Δy', single.handleOut.y)}</div><p class="muted">数値入力では両側を独立して指定します。</p></details>` : ''}`, '適用', () => {
        const nx = Number($('anchor-x').value), ny = Number($('anchor-y').value);
        if (![nx, ny].every(Number.isFinite)) throw Error('座標を確認してください。');
        mutate(page => {
          for (const id of new Set(formRefs.map(r => r.id))) {
            const source = formObjects.get(id), objectRefs = formRefs.filter(r => r.id === id);
            let next = P.moveAnchors(source, objectRefs, nx - x, ny - y);
            if (single) for (const which of ['in', 'out']) {
              const dx = Number($('anchor-' + which + '-x').value), dy = Number($('anchor-' + which + '-y').value);
              if (![dx, dy].every(Number.isFinite)) throw Error('ハンドルの座標を確認してください。');
              next = P.moveHandle(next, formRefs[0], which, { x: nx + dx, y: ny + dy }, { independent: true });
            }
            replace(page, id, next);
          }
        });
      });
    }
    function roundingDialog() {
      if (!refs.length || !ctx.editable()) return;
      ctx.showDialog('選んだ角を丸める', `<p>選んだアンカーの角を曲線に置き換えます。</p><label>半径（px）<input id="corner-radius" type="number" min="0.001" step="any" required value="${Math.max(.1, ctx.standardSize() / 8)}"></label><p class="muted">直線同士の角が対象です。隣の角と重ならない大きさに収めます。元に戻す操作で取り消せます。</p>`, '丸める', () => {
        const radius = Number($('corner-radius').value);
        if (!Number.isFinite(radius) || radius <= 0) throw Error('半径は0より大きい数にしてください。');
        editRefs('roundCorners', radius);
      });
    }
    function joinDialog() {
      if (!endpoints() || !ctx.editable()) return;
      ctx.showDialog('2つの端点をつなぐ', '<label>つなぎ方<select id="join-mode"><option value="line">直線でつなぐ</option><option value="merge">中間の1点にまとめる</option><option value="smooth">滑らかな曲線でつなぐ</option></select></label><p class="muted">最初に選んだパスの書式を使います。同じパスの両端をつなぐと閉じます。</p>', 'つなぐ', () => {
        const [a, b] = refs, mode = $('join-mode').value;
        if (mutate(page => {
          const result = P.joinEndpoints(objectOf(a.id, page), a, objectOf(b.id, page), b, mode);
          replace(page, a.id, result);
          if (a.id !== b.id) page.objects = page.objects.filter(o => o.id !== b.id);
        }, true)) ctx.select([a.id]);
      });
    }
    function combine(operation) {
      const objects = selectedPaths();
      if (objects.length < 2 || objects.length !== ctx.selected().length || !ctx.editable()) return;
      const first = objects[0].id;
      if (mutate(page => {
        const result = P.boolean(objects, operation), ids = new Set(objects.map(o => o.id));
        const index = page.objects.findIndex(o => o.id === first);
        if (result) page.objects[index] = result;
        page.objects = page.objects.filter(o => (result && o.id === first) || !ids.has(o.id));
      }, true)) { ctx.select([first]); ctx.setTool('direct'); }
    }
    const commands = {
      'path-direct': () => { ctx.setTool('direct'); },
      'path-whole': () => { reset(); ctx.setTool('select'); },
      'anchor-list': anchorList,
      'anchor-all': () => { ctx.setTool('direct'); selectRefs(allRefs(), ctx.selected()); },
      'anchor-position': coordinateDialog,
      'anchor-add': addAnchor,
      'anchor-add-mode': beginAddMode,
      'anchor-delete': () => editRefs('deleteAnchors', { open: true }),
      'anchor-remove': () => editRefs('deleteAnchors', { open: false }),
      'anchor-corner': () => editRefs('setAnchorType', 'corner'),
      'anchor-smooth': () => editRefs('setAnchorType', 'smooth'),
      'anchor-round': roundingDialog,
      'path-open': () => {
        if (refs.length !== 1) return;
        mutate(page => replace(page, refs[0].id, P.openPath(objectOf(refs[0].id, page), refs[0])), true);
      },
      'path-close': () => mutate(page => {
        for (const object of selectedPaths()) replace(page, object.id, P.closePaths(object, P.inspect(object).flatMap((p, i) => p.closed ? [] : [i])));
      }, true),
      'path-join': joinDialog,
      'path-union': () => combine('union'),
      'path-subtract': () => combine('subtract'),
      'path-intersect': () => combine('intersect')
    };
    function menu(button) {
      clean();
      const noRefs = !refs.length, paths = selectedPaths(), combineDisabled = paths.length < 2 || paths.length !== ctx.selected().length;
      return button('アンカーを選択…', 'anchor-list', !paths.length) + button('すべてのアンカーを選択', 'anchor-all', !paths.length) + button('アンカーの座標…', 'anchor-position', noRefs)
        + '<hr>' + button('アンカーを追加', 'anchor-add', !paths.length) + button('削除して切り開く', 'anchor-delete', noRefs) + button('削除して前後をつなぐ', 'anchor-remove', noRefs)
        + '<hr>' + button('角にする', 'anchor-corner', noRefs) + button('滑らかにする', 'anchor-smooth', noRefs) + button('選んだ角を丸める…', 'anchor-round', noRefs)
        + '<hr>' + button('ここで切り開く', 'path-open', refs.length !== 1) + button('パスを閉じる', 'path-close', !paths.length) + button('2つの端点をつなぐ…', 'path-join', !endpoints())
        + '<hr>' + button('合体', 'path-union', combineDisabled) + button('型抜き（最初の図形から）', 'path-subtract', combineDisabled) + button('重なりを残す', 'path-intersect', combineDisabled);
    }
    function nudge(dx, dy, event) { if (!refs.length) return false; const delta = Grid.nudgeDelta(node(refs[0]).point, { x: dx, y: dy }, ctx.settings(), event); editRefs('moveAnchors', delta.x, delta.y); return true; }
    function keyboard(event) {
      if (ctx.tool() !== 'direct') return false;
      if (addMode && event.key === 'Escape') { stopAddMode(); edge = null; ctx.render(); return true; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && refs.length) { commands['anchor-delete'](); return true; }
      // Enter はポップアップを開く。Tabで点を巡回する操作を強制しない。
      if (event.key === 'Enter' && !event.target.closest('button') && selectedPaths().length) { anchorList(); return true; }
      return false;
    }
    return { reset, clean, cancel, pointerDown, pointerMove, finishDrag, doubleClick, render, menu, commands, nudge, keyboard,
      count: () => { clean(); return refs.length; },
      getRefs: () => C.clone(refs),
      context: () => { clean(); return { adding: addMode, edgeSelected: Boolean(edge) }; },
      hint: () => addMode ? '追加するパスの輪郭をクリック · 1点追加後に終了 · Escapeで取消' : snapTarget ? `${snapTarget.kind}に吸着 · Optionで解除` : refs.length ? '選んだアンカーをドラッグ · Optionでハンドルを独立・吸着解除' : '点・区間をクリック · 空白をドラッグして点を範囲選択 · 全体の操作は V' };
  }
  root.IlapoPathUI = { create };
}(typeof globalThis !== 'undefined' ? globalThis : this));
