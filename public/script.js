/* -------- Phase labels -------- */
const workLabel  = document.getElementById('work');
const shortLabel = document.getElementById('short');
const longLabel  = document.getElementById('long');

/* -------- Defaults (minutes) -------- */
let workTime = 50;
let shortBreakTime = 10;
let longBreakTime = 20;

/* -------- User-configurable settings -------- */
let breakMusicBehavior = 'quiet';  // 'pause' | 'quiet' | 'same'
let cyclesUntilLong = 4;           // short breaks before a long break
let showTrackInfo = true;          // Now Playing pill
const DEFAULT_BG_LINKS = [
  'https://www.youtube.com/watch?v=tSreleyZgmg',
  'https://www.youtube.com/watch?v=XQ8_GEUPVtU',
  'https://www.youtube.com/watch?v=B0yp4H9EjAo',
  'https://www.youtube.com/watch?v=99ADFusxELs&t=282s',
  'https://www.youtube.com/watch?v=MPVb2rvum1A'
];
const BG_LINKS_KEY = 'bgVideoLinks';

/* -------- Timer state -------- */
let isPaused = true;
let timerInterval = null;
let phase = 'work';                     // 'work' | 'short' | 'long'
let completedWorkCycles = 0;
let minutesLeft = workTime;             // preserved across pause/resume
let secondsLeft = 0;

let justTransitioned = false; // set by auto phase switches
let firstStart = true;        // first Start -> play work ding

/* -------- Sound dings -------- */
const dingWork  = new Audio('work_start.wav');
const dingShort = new Audio('short_break.wav');
const dingLong  = new Audio('long_break.wav');

/* -------- Spotify SDK state -------- */
let spotifyPlayer = null;
let spotifyDeviceId = null;
let hasConnectedOnce = false;

const loginBtn = document.getElementById('loginSpotify');
const statusEl = document.getElementById('spotifyStatus');

/* -------- Volume targets -------- */
let workVolume = 1.0;   // max default
let quietVolume = 0.2;  // quieter on breaks

async function setPlayerVolume(vol) { try { if (spotifyPlayer) await spotifyPlayer.setVolume(vol); } catch (e) {} }
async function pauseSpotify()      { try { await spotifyPlayer?.pause(); } catch(e) {} }
async function resumeSpotify()     { try { await spotifyPlayer?.resume(); } catch(e) {} }

/* -------- Now Playing pill -------- */
const nowPlayingEl = document.getElementById('nowPlaying');
const npTitleEl = document.getElementById('npTitle');

function setTrackInfoVisible(on) {
  showTrackInfo = !!on;
  if (nowPlayingEl) nowPlayingEl.style.display = showTrackInfo ? 'block' : 'none';
}

let trackPollInterval = null;
let lastTrackId = null;

async function getJson(url) {
  const token = await getAccessToken();
  if (!token) return null;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function updateNowPlaying() {
  if (!showTrackInfo) return;
  const data = await getJson('https://api.spotify.com/v1/me/player/currently-playing?market=from_token');
  if (!data || !data.item) return;
  const id = data.item.id;
  if (id === lastTrackId && nowPlayingEl.style.display !== 'none') return;

  lastTrackId = id;
  const title = data.item.name || '';
  const artists = Array.isArray(data.item.artists) ? data.item.artists.map(a => a.name).join(', ') : '';
  if (npTitleEl) npTitleEl.textContent = `${title} — ${artists}`;
  if (nowPlayingEl) nowPlayingEl.style.display = showTrackInfo ? 'block' : 'none';
}

function startTrackPolling() { if (!trackPollInterval) trackPollInterval = setInterval(updateNowPlaying, 3000); }
function stopTrackPolling()  { clearInterval(trackPollInterval); trackPollInterval = null; }

/* -------- UI helpers -------- */
function setPhaseUI() {
  [workLabel, shortLabel, longLabel].forEach(el => el && el.classList.remove('active','selected'));
  if (phase === 'work')  workLabel?.classList.add('active','selected');
  if (phase === 'short') shortLabel?.classList.add('active','selected');
  if (phase === 'long')  longLabel?.classList.add('active','selected');
}
function defaultMinutesForPhase(p) { return p === 'work' ? workTime : (p === 'short' ? shortBreakTime : longBreakTime); }
function setDisplay(min, sec) {
  document.getElementById('minutes').innerHTML = min;
  document.getElementById('seconds').innerHTML = sec < 10 ? `0${sec}` : sec;
}

/* -------- Background videos via YouTube IFrame API -------- */
let ytBgPlayer = null;
let bgVideoIds = [];
let currentBgIndex = 0;

function extractVideoId(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v') || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/embed/'))  return u.pathname.split('/')[2] || null;
    }
    if (u.hostname === 'youtu.be') return u.pathname.replace('/', '') || null;
    return null;
  } catch { return null; }
}
function loadBgLinks() {
  const raw = localStorage.getItem(BG_LINKS_KEY);
  if (!raw) return [...DEFAULT_BG_LINKS];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [...DEFAULT_BG_LINKS];
  } catch { return [...DEFAULT_BG_LINKS]; }
}
function saveBgLinks(links) { localStorage.setItem(BG_LINKS_KEY, JSON.stringify(links)); }
function computeIdsFromLinks(links) {
  const ids = [];
  for (const line of links) {
    const id = extractVideoId(line);
    if (id) ids.push(id);
  }
  return ids;
}
function applyBgIdsToPlayer(ids) {
  if (!ytBgPlayer || !ids.length) return;
  ytBgPlayer.loadPlaylist(ids, 0, 0);
  currentBgIndex = 0;
}
function initBgLinksUI() {
  const ta = document.getElementById('bgLinks');
  if (!ta) return;
  const existing = loadBgLinks();
  ta.value = existing.join('\n');
}
function saveBgLinksFromUI() {
  const ta = document.getElementById('bgLinks');
  if (!ta) return;
  const links = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
  const newIds = computeIdsFromLinks(links);
  const linksToPersist = newIds.length ? links : DEFAULT_BG_LINKS;
  saveBgLinks(linksToPersist);
  bgVideoIds = computeIdsFromLinks(linksToPersist);
  applyBgIdsToPlayer(bgVideoIds);
}
function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) return true;
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  return false;
}
function onYouTubeIframeAPIReady() {
  const links = loadBgLinks();
  bgVideoIds = computeIdsFromLinks(links);

  ytBgPlayer = new YT.Player('bgPlayerMount', {
  width: '1920', height: '1080',
  playerVars: {
    autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, loop: 1
  },
  events: {
    'onReady': e => {
      // Build/ensure list
      if (!bgVideoIds.length) bgVideoIds = computeIdsFromLinks(DEFAULT_BG_LINKS);
      if (bgVideoIds.length) {
        // Load and immediately try to play
        e.target.loadPlaylist(bgVideoIds, 0, 0); // load ensures it starts the list
        try { e.target.mute(); } catch(_) {}
        try { e.target.playVideo(); } catch(_) {}
      }
      setMaxQuality(e.target);
    },
    'onStateChange': e => {
      // If autoplay was blocked, attempt once more when states change to BUFFERING
      if (e.data === YT.PlayerState.BUFFERING) {
        try { e.target.mute(); } catch(_) {}
        try { e.target.playVideo(); } catch(_) {}
      }
      if (e.data === YT.PlayerState.BUFFERING || e.data === YT.PlayerState.PLAYING) {
        setMaxQuality(e.target);
      }
      if (e.data === YT.PlayerState.ENDED) {
        currentBgIndex = (currentBgIndex + 1) % bgVideoIds.length;
      }
    }
  }
});

}
function setMaxQuality(player) {
  const prefs = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small'];
  for (const q of prefs) { try { player.setPlaybackQuality(q); } catch(e) {} }
  // Nudge again shortly after to catch late adaptive switches
  setTimeout(() => {
    for (const q of prefs) { try { player.setPlaybackQuality(q); } catch(e) {} }
  }, 500);
}


/* -------- Start / Pause / Reset -------- */
function startPause() {
  if (isPaused) {
    document.getElementById('startPause').innerHTML = '<i class="fa-solid fa-pause"></i>';
    document.getElementById('reset').style.display = "block";
    isPaused = false;

    if (firstStart && phase === 'work') { try { dingWork.play(); } catch(e) {} firstStart = false; }

    applyMusicForCurrentPhase(true);
    runTimer();
  } else {
    document.getElementById('startPause').innerHTML = '<i class="fa-solid fa-play"></i>';
    isPaused = true;
    clearInterval(timerInterval);
    pauseSpotify();
  }
}
function resetTimer() {
  clearInterval(timerInterval);
  isPaused = true;
  phase = 'work';
  completedWorkCycles = 0;
  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;
  setDisplay(minutesLeft, secondsLeft);
  document.getElementById('startPause').innerHTML = '<i class="fa-solid fa-play"></i>';
  document.getElementById('reset').style.display = "none";
  setPhaseUI();
  setPlayerVolume(workVolume);
  firstStart = true;
}

/* -------- Timer engine -------- */
function runTimer() {
  clearInterval(timerInterval);
  const tick = () => {
    if (isPaused) return;
    setDisplay(minutesLeft, secondsLeft);
    if (secondsLeft === 0) {
      if (minutesLeft === 0) {
        let nextPhase;
        if (phase === 'work') {
          completedWorkCycles++;
          nextPhase = (completedWorkCycles % cyclesUntilLong === 0) ? 'long' : 'short';
        } else { nextPhase = 'work'; }
        justTransitioned = true;
        phaseStart(nextPhase);
        return;
      }
      minutesLeft--; secondsLeft = 59;
    } else { secondsLeft--; }
    setDisplay(minutesLeft, secondsLeft);
  };
  setDisplay(minutesLeft, secondsLeft);
  timerInterval = setInterval(tick, 1000);
}

/* -------- Phase transitions -------- */
function phaseStart(nextPhase) {
  phase = nextPhase;
  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;
  setPhaseUI();
  setDisplay(minutesLeft, secondsLeft);

  if (justTransitioned) {
    if (phase === 'work') { try { dingWork.play(); } catch(e) {} }
    else if (phase === 'short') { try { dingShort.play(); } catch(e) {} }
    else { try { dingLong.play(); } catch(e) {} }
  }
  justTransitioned = false;
  applyMusicForCurrentPhase(true);
}

/* -------- Music behavior -------- */
async function applyMusicForCurrentPhase(resume) {
  if (phase === 'work') { await setPlayerVolume(workVolume); if (resume) await resumeSpotify(); return; }
  if (breakMusicBehavior === 'pause') { await pauseSpotify(); }
  else if (breakMusicBehavior === 'quiet') { await setPlayerVolume(quietVolume); if (resume) await resumeSpotify(); }
  else { await setPlayerVolume(workVolume); if (resume) await resumeSpotify(); }
}

/* -------- Settings modal -------- */
function openSettings() { document.getElementById('settingsModal').style.display = 'block'; }
function closeSettings() { document.getElementById('settingsModal').style.display = 'none'; }

function saveSettings() {
  const w  = parseInt(document.getElementById('workDuration').value);
  const sb = parseInt(document.getElementById('shortBreakDuration').value);
  const lb = parseInt(document.getElementById('longBreakDuration').value);
  const beh = document.getElementById('breakMusicBehavior')?.value;
  const cycles = parseInt(document.getElementById('cyclesUntilLong')?.value);
  const sti = document.getElementById('showTrackInfo')?.value;

  if (!isNaN(w))  workTime = w;
  if (!isNaN(sb)) shortBreakTime = sb;
  if (!isNaN(lb)) longBreakTime = lb;
  if (['pause','quiet','same'].includes(beh)) breakMusicBehavior = beh;
  if (!isNaN(cycles) && cycles >= 1) cyclesUntilLong = cycles;
  if (sti === 'on') setTrackInfoVisible(true);
  if (sti === 'off') setTrackInfoVisible(false);

  // Background links persist and apply
  saveBgLinksFromUI();

  if (isPaused) {
    minutesLeft = defaultMinutesForPhase(phase);
    secondsLeft = 0;
    setDisplay(minutesLeft, secondsLeft);
  }
  closeSettings();
}

/* -------- Jump to phase control -------- */
function jumpToPhase(target) {
  if (!['work','short','long'].includes(target)) return;
  clearInterval(timerInterval);
  phase = target;
  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;
  setPhaseUI();
  setDisplay(minutesLeft, secondsLeft);
  const shouldResume = !isPaused;
  applyMusicForCurrentPhase(shouldResume);
  if (!isPaused) runTimer();
}

/* -------- Spotify Web Playback SDK and UI hiding -------- */
function setAuthUI(connected, playerReady) {
  const btn = document.getElementById('loginSpotify');
  const status = document.getElementById('spotifyStatus');
  if (btn) btn.style.display = connected ? 'none' : 'inline-flex';
  if (!status) return;
  if (connected && playerReady) status.style.display = 'none';
  else if (connected && !playerReady) { status.style.display = 'inline'; status.textContent = 'Connecting player...'; }
  else { status.style.display = 'inline'; status.textContent = 'Not connected'; }
}

loginBtn.addEventListener('click', () => {
  window.open('/auth/login', 'spotify-login', 'width=500,height=700');
});

window.addEventListener('message', (ev) => {
  if (ev.data && ev.data.type === 'spotify-auth-success') {
    updateSpotifyStatus();
    bootSpotifyPlayer();
  }
});

async function updateSpotifyStatus() {
  const token = await getAccessToken();
  setAuthUI(!!token, !!spotifyDeviceId);
}

window.onSpotifyWebPlaybackSDKReady = () => { bootSpotifyPlayer(); };

async function getAccessToken() {
  try { const r = await fetch('/auth/token'); const j = await r.json(); return j.access_token || null; }
  catch { return null; }
}

async function bootSpotifyPlayer() {
  if (!window.Spotify) return;
  const token = await getAccessToken();
  if (!token) return;

  if (!spotifyPlayer) {
    spotifyPlayer = new Spotify.Player({
      name: 'My Study Timer',
      getOAuthToken: async cb => { cb((await getAccessToken()) || ''); },
      volume: workVolume
    });

    spotifyPlayer.addListener('ready', ({ device_id }) => {
      spotifyDeviceId = device_id;
      setAuthUI(true, true);
      if (!hasConnectedOnce) { hasConnectedOnce = true; transferPlaybackToDevice(device_id, false); }
      startTrackPolling();
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      if (spotifyDeviceId === device_id) spotifyDeviceId = null;
      setAuthUI(true, false);
      stopTrackPolling();
    });

    spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('init_error', message));
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('auth_error', message));
    spotifyPlayer.addListener('account_error', ({ message }) => console.error('account_error', message));

    await spotifyPlayer.connect();
  }
}

async function transferPlaybackToDevice(deviceId, play = false) {
  const token = await getAccessToken();
  if (!token || !deviceId) return;
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play })
  });
}

/* -------- Transport controls -------- */
async function onNextTrack() { try { await spotifyPlayer?.nextTrack(); } catch(e) {} }
async function onPrevTrack() { try { await spotifyPlayer?.previousTrack(); } catch(e) {} }

/* -------- Page init -------- */
window.onload = () => {
  phase = 'work';
  completedWorkCycles = 0;
  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;
  setDisplay(minutesLeft, secondsLeft);
  setPhaseUI();
  setTrackInfoVisible(true);
  updateSpotifyStatus();

  // Initialize YouTube background controls only when Settings opens, but player can mount now
  initBgLinksUI();
  if (!ensureYouTubeApi() && typeof onYouTubeIframeAPIReady === 'function') {
    // API callback will invoke when ready
  }
};

/* -------- Expose to HTML -------- */
window.startPause    = startPause;
window.resetTimer    = resetTimer;
window.openSettings  = openSettings;
window.closeSettings = closeSettings;
window.saveSettings  = saveSettings;
window.onNextTrack   = onNextTrack;
window.onPrevTrack   = onPrevTrack;
window.jumpToPhase   = jumpToPhase;
