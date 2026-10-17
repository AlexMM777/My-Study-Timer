// Only unsynced activity and a recovery checkpoint persist on this device, scoped by UID.
export function openLocal(indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('study-timer-metrics-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export function readLocal(db, uid) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('accounts').objectStore('accounts').get(uid);
    request.onsuccess = () => resolve(request.result || { queue: {} });
    request.onerror = () => reject(request.error);
  });
}
export function writeLocal(db, uid, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite');
    tx.objectStore('accounts').put(value, uid);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
