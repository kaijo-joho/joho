/* illustSlide: キャンバスと並べて使うアイコン・自作部品パネル。 */
(function () {
  'use strict';

  function create(ctx) {
    const C = window.IlapoCore, S = window.IlapoSVG, A = window.IlapoAssets;
    const byId = id => document.getElementById(id);
    const esc = ctx.esc, library = ctx.library;
    const thumbnails = new Map();
    let draftName = '', draftScope = '', panelError = '', importing = false;

    function scope() {
      return JSON.stringify([ctx.document().id, ctx.page().id, ctx.selected().slice().sort()]);
    }

    function selection() {
      const ids = new Set(ctx.selected());
      return ctx.page().objects.filter(object => ids.has(object.id));
    }

    function thumbnail(objects) {
      const page = C.createPage('部品', C.boardPreset('free'));
      page.objects = C.clone(objects);
      return 'data:image/svg+xml,' + encodeURIComponent(S.exportPage(page, { padding: 8 }));
    }

    function cachedThumbnail(key, getObjects) {
      if (!thumbnails.has(key)) thumbnails.set(key, thumbnail(getObjects()));
      return esc(thumbnails.get(key));
    }

    function message(error) {
      return /[ぁ-んァ-ヶ一-龯]/.test(error?.message || '') ? error.message : '部品集を更新できませんでした。ファイル形式やブラウザの保存容量を確認してください。';
    }

    function report(error) {
      panelError = message(error);
      if (ctx.isOpen()) {
        byId('components-error').textContent = panelError;
        byId('components-error').hidden = false;
      }
      ctx.toast(panelError);
    }

    function registrationReason(objects, libraryError, count) {
      if (libraryError) return libraryError;
      if (!library) return 'このブラウザでは部品集を保存できません。';
      if (!objects.length) return '登録する図形をキャンバスで選んでください。';
      if (objects.some(object => object.type === 'image' && object.reference)) return '下絵を含む選択は登録できません。「画像の設定」で出力用の画像に変更できます。';
      if (objects.length > 200) return '1つの部品には200個までの図形を登録できます。';
      if (count >= 100) return '部品は100件までです。不要な部品を削除すると登録できます。';
      return '';
    }

    function open() {
      const currentScope = scope();
      if (!ctx.isOpen() || currentScope !== draftScope) {
        draftName = '';
        panelError = '';
      }
      draftScope = currentScope;
      let components = [], libraryError = '';
      try { components = library?.list() || []; } catch (error) { libraryError = message(error); }
      const objects = selection();
      const reason = registrationReason(objects, libraryError, components.length);
      const disabled = reason ? 'disabled' : '';
      let preview = '';
      if (objects.length && objects.length <= 200 && !objects.some(object => object.type === 'image' && object.reference)) {
        try { preview = `<div id="component-registration-preview"><img alt="選択した図形のプレビュー" src="${esc(thumbnail(objects))}"></div>`; }
        catch (_) { /* プレビューを作れない場合も、既存の部品集と入力を保つ。 */ }
      }
      const builtins = A.icons().map(item => `<button type="button" data-insert-icon="${esc(item.id)}" data-inspector-focus="icon-${esc(item.id)}" aria-label="${esc(item.name)}を配置"><img alt="" src="${cachedThumbnail('icon:' + item.id, () => A.instantiateIcon(item.id, { size: 100 }))}"><span>${esc(item.name)}</span></button>`).join('');
      const custom = components.map(item => {
        let image = '';
        try { image = `<img alt="" src="${cachedThumbnail('component:' + item.id, () => library.instantiate(item.id, { size: 100 }))}">`; } catch (_) { /* サムネイル生成の失敗は、この部品の表示に限定する。 */ }
        return `<div class="asset-card"><button type="button" data-insert-component="${esc(item.id)}" data-inspector-focus="component-${esc(item.id)}" aria-label="${esc(item.name)}を配置">${image}<span>${esc(item.name)}</span></button><button type="button" class="asset-remove" data-remove-component="${esc(item.id)}" data-inspector-focus="remove-${esc(item.id)}" aria-label="${esc(item.name)}を部品集から削除" data-tip="部品集から削除">${ctx.icon('delete')}</button></div>`;
      }).join('');

      ctx.showInspector('assets', 'アイコン・部品', `
        <section class="component-registration" aria-labelledby="component-registration-heading">
          <h3 id="component-registration-heading">選択した図形を登録</h3>
          <p id="component-registration-target" class="muted">${objects.length ? `${objects.length}個の図形を選択中。` : ''}${esc(reason || '今の形・書式・内部の接続を部品にします。')}</p>
          ${preview}
          <label for="component-name">部品名<input id="component-name" maxlength="120" value="${esc(draftName)}" placeholder="例：データを送るPC" aria-describedby="component-registration-target" ${disabled}></label>
          <button type="button" id="components-register" class="primary" ${disabled}>${ctx.icon('plus')}部品に登録</button>
        </section>
        <p id="components-error" role="alert" ${panelError || libraryError ? '' : 'hidden'}>${esc(panelError || libraryError)}</p>
        <section aria-labelledby="builtin-icons-heading"><h3 id="builtin-icons-heading">アイコン</h3><p class="muted">クリックで配置。パスや色も編集できます。</p><div class="asset-grid">${builtins}</div></section>
        <section aria-labelledby="custom-components-heading"><h3 id="custom-components-heading">自作部品 <small class="muted">${components.length}件</small></h3>
          ${!components.length ? '<p class="muted">登録した部品はここに並びます。</p>' : ''}<div class="asset-grid">${custom}</div>
          <div class="list-actions component-library-actions"><button type="button" id="components-export" ${!components.length ? 'disabled' : ''}>${ctx.icon('save')}部品集を保存</button><button type="button" id="components-import" ${!library || libraryError || importing ? 'disabled' : ''}>${ctx.icon('open')}部品集を追加…</button></div>
          <p class="muted">部品集はこのブラウザに保存します。別のブラウザで使うには、部品集を保存して読み込みます。配置後の編集は登録した部品へ反映しません。</p>
        </section>`, null);

      const body = byId('inspector-body'), input = byId('component-name');
      input.oninput = () => { draftName = input.value; input.setCustomValidity(''); };
      const register = () => {
        if (byId('components-register').disabled) return;
        if (scope() !== currentScope) { open(); return; }
        if (!input.value.trim()) {
          input.setCustomValidity('部品名を入力してください。');
          input.reportValidity();
          input.focus();
          return;
        }
        try {
          library.save(input.value, selection());
          draftName = ''; panelError = '';
          open();
          byId('component-name').focus();
          ctx.toast('自作部品に登録しました。');
        } catch (error) { report(error); }
      };
      byId('components-register').onclick = register;
      input.onkeydown = event => {
        if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
          event.preventDefault();
          register();
        }
      };
      body.querySelectorAll('[data-insert-icon]').forEach(button => {
        button.onclick = () => {
          try { ctx.insertObjects(A.instantiateIcon(button.dataset.insertIcon, ctx.insertionPoint())); }
          catch (error) { report(error); }
        };
      });
      body.querySelectorAll('[data-insert-component]').forEach(button => {
        button.onclick = () => {
          try { ctx.insertObjects(library.instantiate(button.dataset.insertComponent, ctx.insertionPoint())); }
          catch (error) { report(error); }
        };
      });
      body.querySelectorAll('[data-remove-component]').forEach(button => {
        button.onclick = () => {
          const id = button.dataset.removeComponent, index = components.findIndex(item => item.id === id);
          ctx.showDialog('部品集から削除', `<p>「${esc(components[index].name)}」を部品集から削除します。作品に配置済みの図形は残ります。</p>`, '削除', () => {
            library.remove(id);
            thumbnails.delete('component:' + id);
            panelError = '';
            ctx.toast('部品集から削除しました。');
            // 確認ダイアログが閉じてから、一覧とフォーカスを更新する。
            queueMicrotask(() => {
              if (!ctx.isOpen()) return;
              open();
              const buttons = [...byId('inspector-body').querySelectorAll('[data-insert-component]')];
              (buttons[Math.min(index, buttons.length - 1)] || byId('components-import')).focus();
            });
          });
        };
      });
      byId('components-export').onclick = () => {
        try { ctx.download(library.exportJSON(), 'illustSlide部品集.json', 'application/json'); }
        catch (error) { report(error); }
      };
      byId('components-import').onclick = () => byId('components-input').click();
    }

    byId('components-input').onchange = async () => {
      const file = byId('components-input').files[0];
      byId('components-input').value = '';
      if (!file || importing) return;
      importing = true;
      if (ctx.isOpen()) byId('components-import').disabled = true;
      try {
        if (!library) throw Error('このブラウザでは部品集を保存できません。');
        if (file.size > 3 * 1024 * 1024) throw Error('部品集は3MiBまでです。');
        let raw = null;
        const temporary = A.createLibrary({ getItem: () => raw, setItem: (key, value) => { raw = value; } });
        temporary.importJSON(await file.text());
        // 読み込みを待つ間に登録された部品も残す。
        const incoming = JSON.parse(temporary.exportJSON()), existing = JSON.parse(library.exportJSON());
        incoming.components.forEach(component => { component.id = C.uid('component'); });
        existing.components.push(...incoming.components);
        library.importJSON(JSON.stringify(existing));
        panelError = '';
        ctx.toast(incoming.components.length + '件の部品を追加しました。');
      } catch (error) { report(error); }
      finally {
        importing = false;
        if (ctx.isOpen()) open();
      }
    };

    return Object.freeze({
      open,
      focusRegistration() {
        open();
        byId('component-name').focus();
        byId('component-registration-heading').scrollIntoView({ block: 'nearest' });
      }
    });
  }

  window.IlapoAssetsUI = Object.freeze({ create });
}());
