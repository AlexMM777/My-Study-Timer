// youtube-bg.js - Background YouTube player with quality preference and non-reset save
import { getBgLinks, setBgLinks, normalizeLinks, arraysEqual } from './storage.js';


export const DEFAULT_BG_LINKS = [
  // Spring Backgrounds
  'https://youtu.be/qukAeB9ZqTg',
  'https://youtu.be/G9sdTJGe7go',
  'https://youtu.be/PMnFB3pMliQ',
  'https://youtu.be/htbtVHpHKKI',
  'https://youtu.be/SPOUrcmCUyI'
];


let ytBgPlayer = null;
let bgVideoIds = [];
let currentBgIndex = 0;


export function extractVideoId(url) {
  try {
    const u = new URL((url || '').trim());
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v') || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/embed/'))  return u.pathname.split('/')[2] || null;
    }
    if (u.hostname === 'youtu.be') return u.pathname.replace('/', '') || null;
    return null;
  } catch { return null; }
}


export function computeIdsFromLinks(links) {
  const ids = [];
  for (const line of links) {
    const id = extractVideoId(line);
    if (id) ids.push(id);
  }
  return ids;
}


function setMaxQuality(player) {
  const prefs = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small'];
  for (const q of prefs) { try { player.setPlaybackQuality(q); } catch(e) {} }
  setTimeout(() => { for (const q of prefs) { try { player.setPlaybackQuality(q); } catch(e) {} } }, 500);
}


function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) return true;
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  return false;
}


export function initYouTubeBackground(mountId = 'bgPlayerMount') {
  // Expose callback expected by API
  window.onYouTubeIframeAPIReady = () => {
    const links = getBgLinks(DEFAULT_BG_LINKS);
    bgVideoIds = computeIdsFromLinks(links);


    ytBgPlayer = new YT.Player(mountId, {
      width: '1920', height: '1080',
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        loop: 1,
        playlist: bgVideoIds.join(',')   // Add playlist param here
      },
      events: {
        'onReady': e => {
          if (!bgVideoIds.length) bgVideoIds = computeIdsFromLinks(DEFAULT_BG_LINKS);
          if (bgVideoIds.length) {
            e.target.loadPlaylist(bgVideoIds, 0, 0);
            try { e.target.mute(); } catch(_) {}
            try { e.target.playVideo(); } catch(_) {}
          }
          setMaxQuality(e.target);
        },
        'onStateChange': e => {
          if (e.data === YT.PlayerState.BUFFERING) {
            try { e.target.mute(); } catch(_) {}
            try { e.target.playVideo(); } catch(_) {}
          }
          if (e.data === YT.PlayerState.BUFFERING || e.data === YT.PlayerState.PLAYING) setMaxQuality(e.target);
          if (e.data === YT.PlayerState.ENDED) {
            // Restart the playlist explicitly to avoid black screen
            e.target.playVideo(); 
            currentBgIndex = (currentBgIndex + 1) % (bgVideoIds.length || 1);
          }
        }
      }
    });
  };


  ensureYouTubeApi();
}


export function applyLinksIfChanged(textareaValue) {
  const currentLines = normalizeLinks((textareaValue || '').split('\n'));
  const storedLines = normalizeLinks(getBgLinks(DEFAULT_BG_LINKS));


  if (arraysEqual(currentLines, storedLines)) return false; // no change -> no reset


  const ids = computeIdsFromLinks(currentLines);
  const linksToPersist = ids.length ? currentLines : DEFAULT_BG_LINKS;
  setBgLinks(linksToPersist);
  bgVideoIds = computeIdsFromLinks(linksToPersist);
  if (ytBgPlayer && bgVideoIds.length) {
    ytBgPlayer.loadPlaylist(bgVideoIds, 0, 0);
    try { ytBgPlayer.mute(); } catch(_) {}
    try { ytBgPlayer.playVideo(); } catch(_) {}
  }
  return true;
}
