// storage.js - safe localStorage helpers

const BG_LINKS_KEY = 'bgVideoLinks';
const SND_KEY = 'customSounds';
const PREFS_KEY = 'prefs';

export function normalizeLinks(lines) {
  return lines.map(s => (s || '').trim()).filter(Boolean);
}
export function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* Background links */
export function getBgLinks(defaults) {
  try {
    const raw = localStorage.getItem(BG_LINKS_KEY);
    if (!raw) return defaults || [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : (defaults || []);
  } catch { return defaults || []; }
}
export function setBgLinks(links) {
  localStorage.setItem(BG_LINKS_KEY, JSON.stringify(links || []));
}

/* Custom sounds */
export function getCustomSounds() {
  try { return JSON.parse(localStorage.getItem(SND_KEY)) || {}; }
  catch { return {}; }
}
export function setCustomSounds(obj) {
  localStorage.setItem(SND_KEY, JSON.stringify(obj || {}));
}

/* Generic prefs (durations, behavior, showTrackInfo, cycles, etc.) */
export function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
  catch { return {}; }
}
export function setPrefs(partial) {
  const curr = getPrefs();
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...curr, ...(partial || {}) }));
}
