import {dashboardUrl, worksheetUrl, legacyWorksheetIds} from './10_model.mjs';
const ids = new URLSearchParams(location.search).getAll('id');
if (ids.length) {
  if (ids.length === 1 && legacyWorksheetIds.includes(ids[0])) {
    const fragment = location.hash.length <= 512 ? location.hash : '';
    const target = worksheetUrl + '?id=' + encodeURIComponent(ids[0]) + fragment;
    document.getElementById('dashboard-link').href = target;
    location.replace(target);
  } else {
    const message = document.getElementById('legacy-message'); message.hidden = false;
    message.textContent = '指定されたワークシートを確認できません。「提出状況・一覧」から開いてください。';
  }
} else {
  document.getElementById('dashboard-link').href = dashboardUrl;
}
