import {randomId} from './10_model.mjs';
const database = 'worksheet-home-drafts-v1';
let dbPromise;
async function packBlob(value){
  if(!(value instanceof Blob))return value;
  return {wsBinaryImage:1,bytes:await value.arrayBuffer(),type:value.type};
}
function unpackBlob(value){
  return value?.wsBinaryImage===1?new Blob([value.bytes],{type:value.type || ''}):value;
}
async function packDraft(value){
  const pages={};
  for(const [side,page] of Object.entries(value.pages || {}))pages[side]={...page,originalBlob:await packBlob(page.originalBlob),correctedBlob:await packBlob(page.correctedBlob)};
  return {...value,pages,test:await packBlob(value.test)};
}
function unpackDraft(value){
  if(!value)return null;
  const pages={};
  for(const [side,page] of Object.entries(value.pages || {}))pages[side]={...page,originalBlob:unpackBlob(page.originalBlob),correctedBlob:unpackBlob(page.correctedBlob)};
  return {...value,pages,test:unpackBlob(value.test)};
}
function open() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('STORAGE_UNAVAILABLE'));
    request.onblocked = () => reject(Error('STORAGE_BLOCKED'));
  });
  return dbPromise;
}
export async function getDraft(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('drafts').objectStore('drafts').get(id);
    r.onsuccess = () => resolve(unpackDraft(r.result)); r.onerror = () => reject(Error('STORAGE_READ_FAILED'));
  });
}
export async function listDrafts(owner = null) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('drafts').objectStore('drafts').getAll();
    r.onsuccess = () => resolve(r.result.map(unpackDraft).filter(d => d.owner === owner && Object.keys(d.pages || {}).length)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    r.onerror = () => reject(Error('STORAGE_READ_FAILED'));
  });
}
export async function saveDraft(value, expectedRevision) {
  const db = await open();
  const packed=await packDraft(value);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
    const r = store.get(value.id); let next, failed;
    r.onsuccess = () => {
      if ((r.result ? r.result.revision : 0) !== expectedRevision) {failed = Error('DRAFT_CONFLICT'); tx.abort(); return;}
      next = {...packed, revision: expectedRevision + 1, updatedAt: new Date().toISOString()};
      store.put(next);
    };
    tx.oncomplete = () => resolve(unpackDraft(next));
    tx.onerror = tx.onabort = () => reject(failed || Error('STORAGE_WRITE_FAILED'));
  });
}
export async function discardDraft(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').delete(id);
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(Error('STORAGE_DELETE_FAILED'));
  });
}
export async function probeStorage() {
  const id = 'probe-' + randomId();
  const d = await saveDraft({id, revision: 0, owner: '__probe__', pages: {}, test: new Blob(['probe'])}, 0);
  const restored = await getDraft(id);
  if (!restored || !(restored.test instanceof Blob) || await restored.test.text() !== 'probe') throw Error('STORAGE_VERIFY_FAILED');
  await discardDraft(d.id);
}
export function deviceId() {
  try {
    let value = localStorage.getItem('ws-home-device-v1');
    if (!/^[a-f0-9-]{36}$/.test(value || '')) {value = randomId(); localStorage.setItem('ws-home-device-v1', value);}
    return value;
  } catch (e) {
    let value = sessionStorage.getItem('ws-home-device-fallback');
    if (!value) {value = randomId(); sessionStorage.setItem('ws-home-device-fallback', value);}
    return value;
  }
}
