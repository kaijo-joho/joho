import {dashboardUrl, worksheetUrl, legacyWorksheetIds} from './10_model.mjs?v=20261016-5';
const ids = new URLSearchParams(location.search).getAll('id');
if (ids.length) {
  if (ids.length === 1 && legacyWorksheetIds.includes(ids[0])) {
    const fragment = location.hash.length <= 512 ? location.hash : '';
    const target = worksheetUrl + '?id=' + encodeURIComponent(ids[0]) + fragment;
    document.getElementById('dashboard-link').href = target;
    location.replace(target);
  } else {
    const message = document.getElementById('legacy-message'); message.hidden = false;
    message.textContent = '指定されたワークシートを確認できません。「提出状況を確認する」から開いてください。';
  }
} else {
  document.getElementById('dashboard-link').href = dashboardUrl;
}
// Device hints only affect the links shown, never authentication or eligibility.
const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
const mobile = navigator.userAgentData?.mobile || touchMac || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const desktop = !mobile && /Mac|Win|Linux|CrOS/i.test(navigator.platform || navigator.userAgent);
const device = mobile ? 'mobile' : desktop ? 'desktop' : null;
if (device) {
  const methods = [...document.querySelectorAll('[data-device]')];
  const toggle = document.getElementById('show-all-methods');
  const message = document.getElementById('device-message');
  const hint = device === 'mobile' ? 'スマホ向けの提出方法を表示しています。' : 'Mac・パソコン向けの提出方法を表示しています。';
  let showAll = false;
  function render() {
    for (const method of methods) method.hidden = !showAll && method.dataset.device !== device;
    message.textContent = showAll ? 'すべての提出方法を表示しています。' : hint;
    toggle.setAttribute('aria-expanded', String(showAll));
    toggle.querySelector('span').textContent = showAll ? 'この端末向けの方法だけ表示' : 'すべての提出方法を表示';
  }
  toggle.hidden = false;
  toggle.addEventListener('click', () => { showAll = !showAll; render(); });
  render();
}
