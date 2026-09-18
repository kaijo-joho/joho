/* Keep one global panel beside the current inspector without duplicating forms. */
(function (root) {
  'use strict';
  const key = 'kaijo-ilapo:panel-dock';
  const labels = {pages:'ページ',objects:'レイヤー',animation:'動きと再生順序',assets:'部品',view:'表示と吸着',board:'用紙サイズ'};
  function create(options) {
    const byId = id => document.getElementById(id), app = byId('app');
    const primaryRoot = byId('inspector-panel'), exportPanel = byId('export-panel');
    const dock = document.createElement('div'); dock.id = 'panel-dock'; dock.hidden = true;
    const switcher = document.createElement('nav'); switcher.id = 'panel-dock-switcher'; switcher.setAttribute('aria-label','並べたパネルの切り替え');
    const panes = document.createElement('div'); panes.id = 'panel-panes';
    primaryRoot.before(dock); dock.append(switcher, panes);
    const pinnedRoot = primaryRoot.cloneNode(true);
    pinnedRoot.querySelectorAll('[id]').forEach(el => el.id = 'pinned-' + el.id);
    pinnedRoot.id = 'pinned-inspector-panel'; pinnedRoot.setAttribute('aria-labelledby','pinned-inspector-title');
    pinnedRoot.classList.add('global-settings');
    pinnedRoot.querySelector('#pinned-inspector-tabs').hidden = true;
    const unpin = pinnedRoot.querySelector('#pinned-inspector-pin'); unpin.id = 'pinned-inspector-unpin';
    unpin.setAttribute('aria-label','横並べを解除'); unpin.dataset.tip = 'このパネルの横並べを解除'; unpin.setAttribute('aria-pressed','true');
    unpin.querySelector('path').setAttribute('d','M12 4v16M5 9h4');
    panes.append(pinnedRoot, primaryRoot, exportPanel);
    let pinnedSection = null, active = 'primary', moving = false, layoutRunning = false, primary, pinned;
    const wide = () => matchMedia('(min-width:1120px)').matches;
    const instances = () => [primary,pinned].filter(Boolean);
    const primaryOpen = () => primary?.isOpen || !exportPanel.hidden;
    const count = () => Number(Boolean(primaryOpen())) + Number(Boolean(pinned?.isOpen));
    function maxWidth() {
      const stage = byId('stage').getBoundingClientRect();
      const side = document.querySelector('.side-tab').getBoundingClientRect();
      const available = Math.max(220, side.left - stage.left - 220);
      return Math.max(220, Math.min(520, Math.floor(available / (wide() ? Math.max(1,count()) : 1))));
    }
    function save() { try { localStorage.setItem(key, JSON.stringify({section:pinnedSection})); } catch (_) {} }
    function layout() {
      if (layoutRunning || !primary || !pinned) return;
      layoutRunning = true;
      try {
        if (pinnedSection && !pinned.isOpen && !moving) { pinnedSection = null; save(); }
        if (active === 'pinned' && !pinned.isOpen) active = 'primary';
        if (active === 'primary' && !primaryOpen() && pinned.isOpen) active = 'pinned';
        dock.hidden = !count(); app.classList.toggle('inspector-open',Boolean(count()));
        const two = count() === 2, compact = two && !wide();
        switcher.hidden = !compact;
        const entries = pinned.isOpen ? [['pinned',labels[pinned.section] || pinned.request.title]] : [];
        if (primaryOpen()) entries.push(['primary',primary.isOpen ? labels[primary.section] || primary.request.title : '書き出し']);
        const signature = entries.map(([slot,label]) => slot + ':' + label).join('|');
        if (switcher.dataset.signature !== signature) {
          switcher.dataset.signature = signature; switcher.replaceChildren();
          entries.forEach(([slot,label]) => {
            const button = document.createElement('button'); button.type = 'button'; button.dataset.dockSlot = slot; button.textContent = label;
            button.onclick = () => activate(slot); switcher.append(button);
          });
        }
        switcher.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.dockSlot === active)));
        for (const [slot,panel] of [['primary',primaryRoot],['pinned',pinnedRoot],['primary',exportPanel]]) {
          const inactive = compact && active !== slot;
          panel.classList.toggle('dock-inactive',inactive); panel.inert = inactive;
        }
        primary.reflow(); pinned.reflow();
        byId('inspector-pin').hidden = !labels[primary.section] || Boolean(pinnedSection);
        for (const section of Object.keys(labels)) {
          const instance = instances().find(i => i.isOpen && i.section === section);
          const button = byId(section + '-toggle');
          button?.setAttribute('aria-expanded',String(Boolean(instance)));
          button?.setAttribute('aria-controls',instance?.root.id || 'inspector-panel');
        }
        document.querySelector('.side-tab [data-action="export-toggle"]')?.setAttribute('aria-expanded',String(!exportPanel.hidden));
      } finally { layoutRunning = false; }
      options.onLayout?.();
    }
    function activate(slot, focus = false) {
      active = slot; layout();
      if (focus) (slot === 'pinned' ? pinned : primary).element('inspector-title')?.focus({preventScroll:true});
    }
    const common = { ...options, managed:true, maxWidth, onLayout:layout };
    primary = root.IlapoInspector.create({...common,background:()=>active !== 'primary' && !wide()});
    pinned = root.IlapoInspector.create({...common,prefix:'pinned-',background:()=>active !== 'pinned' && !wide()});
    function forSection(section) { return pinnedSection === section ? pinned : primary; }
    function show(request) {
      const target = forSection(request.section);
      if (target === primary) {
        if (!target.isOpen || target.section !== request.section) active = 'primary';
        exportPanel.hidden = true;
      }
      target.show(request); layout();
    }
    function pin() {
      if (pinnedSection || !labels[primary.section]) return;
      options.cancelDrag?.();
      const request = primary.request;
      moving = true; pinnedSection = request.section; active = 'pinned';
      primary.close({focus:false});
      try { request.refresh?.(); } finally { moving = false; layout(); save(); }
      pinned.element('inspector-title').focus({preventScroll:true});
    }
    function release() {
      options.cancelDrag?.();
      const request = pinned.request; if (!request) return;
      moving = true; pinned.close({focus:false}); pinnedSection = null; active = 'primary';
      try { request.refresh?.(); } finally { moving = false; layout(); save(); }
      primary.element('inspector-title').focus({preventScroll:true});
    }
    function close(options = {}) {
      primary.close(options);
      layout();
    }
    function toggle(section, open) {
      const target = forSection(section), slot = target === pinned ? 'pinned' : 'primary';
      if (target.isOpen && target.section === section) {
        if (!wide() && active !== slot) activate(slot,true);
        else { options.cancelDrag?.(); target.close(); }
      } else { active = slot; open(); }
      layout();
    }
    function toggleExport() {
      const opening = exportPanel.hidden || (!wide() && active !== 'primary');
      if (opening) { primary.close({focus:false}); exportPanel.hidden = false; active = 'primary'; }
      else exportPanel.hidden = true;
      layout();
    }
    byId('inspector-pin').addEventListener('click',pin);
    unpin.addEventListener('click',release);
    for (const [slot,panel] of [['primary',primaryRoot],['pinned',pinnedRoot],['primary',exportPanel]]) {
      panel.addEventListener('focusin',() => { active = slot; });
    }
    window.addEventListener('resize',layout);
    return {
      show, close, toggle, toggleExport, reflow:layout,
      sync() { instances().forEach(i => i.sync()); },
      reset() { instances().forEach(i => i.reset()); },
      element(section,id) { return forSection(section).element(id); },
      isSectionOpen(section) { return instances().some(i => i.isOpen && i.section === section); },
      restore() {
        try {
          const saved = JSON.parse(localStorage.getItem(key));
          if (typeof saved?.section === 'string' && Object.hasOwn(labels,saved.section)) { pinnedSection = saved.section; active = 'pinned'; moving = true; options.openSection(saved.section); }
        } catch (_) {} finally { moving = false; layout(); }
      },
      get section() { return primary.section || pinned.section; },
      get isOpen() { return instances().some(i => i.isOpen); },
      get changeGroup() { return primary.changeGroup || pinned.changeGroup; },
      get root() { return dock; },
      get primarySection() { return primary.section; }
    };
  }
  root.IlapoPanelDock = {create};
}(globalThis));
