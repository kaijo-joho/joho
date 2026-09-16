/* illustSlide: キャンバスと並べて使う図形一覧。選択だけを変更する。 */
(function () {
  'use strict';

  const TYPE_NAMES = Object.freeze({
    path: '図形',
    text: '文字',
    image: '画像',
    connector: '接続矢印'
  });

  function create(ctx) {
    const esc = ctx.esc;
    const typeName = object => TYPE_NAMES[object.type] || '図形';
    const typeIcon = object => object.type === 'path' ? 'path' : object.type;

    function open() {
      const page = ctx.page();
      const selected = new Set(ctx.selected());
      const rows = page.objects.slice().reverse().map((object, index) => {
        const states = [object.locked ? '固定' : '', object.group ? 'グループ' : ''].filter(Boolean);
        const state = states.length ? ` · ${states.join('・')}` : '';
        const isSelected = selected.has(object.id);
        const layer = index + 1;
        return `<div class="page-card ${isSelected ? 'selected' : ''}"><button type="button" class="page-pick" id="object-pick-${esc(object.id)}" data-pick-object="${esc(object.id)}" data-object-pick="${esc(object.id)}" role="option" aria-selected="${isSelected}" ${isSelected ? 'aria-current="true"' : ''} aria-label="${esc(typeName(object))}、${esc(object.name || '名前なし')}${esc(state)}、${layer}番目（前面から）"><span class="page-label"><span aria-hidden="true">${ctx.icon(typeIcon(object))}</span><span>${esc(object.name || '名前なし')}</span></span><small class="muted">${esc(typeName(object))}${esc(state)}</small></button></div>`;
      }).join('');
      const html = page.objects.length
        ? `<p class="muted">上ほど前面にある図形です。Shiftを押しながら選ぶと追加できます。</p><div id="object-rows" class="page-cards" role="listbox" aria-label="図形の一覧" aria-multiselectable="true">${rows}</div>`
        : '<p>図形はまだありません。</p>';
      ctx.showInspector('objects', '図形', html, null);

      const body = document.getElementById('inspector-body');
      const valid = () => ctx.page().id === page.id;
      const pick = (id, add) => {
        if (!valid() || !ctx.page().objects.some(object => object.id === id)) return;
        ctx.select(add ? [...ctx.selected(), id] : [id]);
      };
      body.querySelectorAll('[data-object-pick]').forEach(button => {
        button.onclick = event => pick(button.dataset.objectPick, event.shiftKey);
      });
      body.querySelector('#object-rows')?.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key) || !valid()) return;
        const button = event.target.closest('[data-object-pick]');
        if (!button) return;
        event.preventDefault();
        const buttons = [...body.querySelectorAll('[data-object-pick]')];
        const index = buttons.indexOf(button);
        if (event.key === 'Enter' || event.key === ' ') {
          pick(button.dataset.objectPick, event.shiftKey);
          return;
        }
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        const target = buttons[next];
        pick(target.dataset.objectPick, event.shiftKey);
        queueMicrotask(() => document.getElementById(`object-pick-${target.dataset.objectPick}`)?.focus());
      });
    }

    return Object.freeze({ open });
  }

  window.IlapoObjectsUI = Object.freeze({ create });
}());
