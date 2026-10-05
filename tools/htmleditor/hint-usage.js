/* ヒント利用だけを記録する任意データ。ソース・氏名・鍵・絶対パスを保存しない。 */
var HtmlEditorHintUsage = (function () {
  'use strict';
  const PREFIX = 'joho.htmleditor.hints.v1:', MAX_EVENTS = 100, MAX_FILES = 25, MAX_COUNT = 1000000;
  const id = value => typeof value === 'string' && /^html\d{2}-\d{2}$/.test(value);
  const count = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
  function missing(status = 'not-recorded') { return {v:1, status}; }
  // クライアント/サーバー共用。欠損や異常は0回にせず、任意記録だけを破棄する。
  function normalize(value, targetId, fileName) {
    try {
      if (value == null) return missing();
      if (typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 24000 || value.v !== 1) return missing('unavailable');
      if (['not-recorded','unavailable'].includes(value.status)) return missing(value.status);
      if (!['available','partial'].includes(value.status) || !id(targetId) || value.targetId !== targetId ||
          fileName !== targetId + '.html' || value.fileName !== fileName ||
          typeof value.validatorVersion !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.validatorVersion) ||
          !count(value.locationRequests) || !count(value.detailRequests) || !Array.isArray(value.events) || value.events.length > MAX_EVENTS ||
          typeof value.truncated !== 'boolean') return missing('unavailable');
      let previous = 0, locations = 0, details = 0;
      const events = value.events.map(event => {
        if (!event || !['locations','detail'].includes(event.kind) || !Number.isSafeInteger(event.at) || event.at < previous || event.at > 8640000000000000) throw Error();
        previous = event.at;
        if (event.kind === 'locations') { locations++; return {kind:event.kind, at:event.at}; }
        if (!Number.isSafeInteger(event.line) || event.line < 1 || event.line > 2000000 ||
            typeof event.code !== 'string' || !/^[a-z0-9-]{1,64}$/.test(event.code)) throw Error();
        details++; return {kind:event.kind, at:event.at, line:event.line, code:event.code};
      });
      if (locations > value.locationRequests || details > value.detailRequests ||
          !value.truncated && (locations !== value.locationRequests || details !== value.detailRequests)) return missing('unavailable');
      return {v:1, status:value.status, validatorVersion:value.validatorVersion, targetId, fileName,
        locationRequests:value.locationRequests, detailRequests:value.detailRequests, events, truncated:value.truncated};
    } catch { return missing('unavailable'); }
  }
  function create(storage, {fileKey, targetId, fileName, validatorVersion, now = Date.now}) {
    const valid = id(targetId) && fileName === targetId + '.html' && /^[a-f0-9]{32}$/.test(fileKey || '');
    const key = valid ? PREFIX + targetId + ':' + fileKey : '';
    let consent = false, broken = !key || !storage;
    let value = {v:1, status:broken ? 'partial' : 'available', validatorVersion, targetId, fileName,
      locationRequests:0, detailRequests:0, events:[], truncated:false};
    if (!broken) {
      try {
        const raw = storage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw), normalized = normalize(saved.usage, targetId, fileName);
          if (!['available','partial'].includes(normalized.status) || normalized.validatorVersion !== validatorVersion) throw Error();
          value = normalized; consent = saved.consent === true;
        }
      } catch { broken = true; value.status = 'partial'; }
    }
    function persist() {
      if (!key || !storage) return false;
      try {
        const raw = JSON.stringify({consent, usage:value});
        storage.setItem(key, raw);
        if (storage.getItem(key) !== raw) throw Error();
        // 記録数を制限。他の自動保存・アカウント情報には触れない。
        const keys = [];
        for (let i = 0; i < storage.length; i++) {
          const candidate = storage.key(i);
          if (candidate?.startsWith(PREFIX) && candidate !== key) keys.push(candidate);
        }
        while (keys.length >= MAX_FILES) storage.removeItem(keys.shift());
        return true;
      } catch { broken = true; value.status = 'partial'; return false; }
    }
    return Object.freeze({
      hasConsent:() => consent,
      consent() { consent = true; persist(); },
      record(kind, diagnostic) {
        if (!consent || !['locations','detail'].includes(kind)) return false;
        const field = kind === 'locations' ? 'locationRequests' : 'detailRequests';
        if (value[field] < MAX_COUNT) value[field]++; else value.truncated = true;
        const at = Math.max(Number(now()) || 0, value.events.at(-1)?.at || 0);
        const event = kind === 'locations' ? {kind, at} : {kind, at, line:diagnostic.line, code:diagnostic.code};
        value.events.push(event);
        if (value.events.length > MAX_EVENTS) { value.events.shift(); value.truncated = true; }
        persist(); return true;
      },
      snapshot() {
        if (!consent) return missing(); // 未同意/取消を「記録あり・0回」にしない。
        if (!key) return missing('unavailable');
        // 別タブの記録を取り込む。共有の追記競合は完全には防げないので証明には使わない。
        if (!broken) {
          try {
            const raw = storage.getItem(key);
            if (raw) {
              const latest = normalize(JSON.parse(raw).usage, targetId, fileName);
              if (latest.status === 'available' && latest.locationRequests >= value.locationRequests && latest.detailRequests >= value.detailRequests) value = latest;
              else if (latest.status === 'unavailable') { broken = true; value.status = 'partial'; }
            }
          } catch { broken = true; value.status = 'partial'; }
        }
        return normalize(value, targetId, fileName);
      },
      isPartial:() => broken || value.status === 'partial'
    });
  }
  return Object.freeze({normalize, missing, create});
})();
if (typeof module === 'object' && module.exports) module.exports = HtmlEditorHintUsage;
