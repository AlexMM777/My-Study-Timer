import * as Spotify from './spotify.js';
import { getPrefs, setPrefs, getCustomSounds } from './storage.js';
import { TimerEngine, duration } from './timer-engine.mjs';
const workLabel = document.getElementById('work');
const shortLabel = document.getElementById('short');
const longLabel = document.getElementById('long');
const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
let breakMusicBehavior = 'quiet'; // 'pause' | 'quiet' | 'same'
let cyclesUntilLong = 4;
let showTrackInfo = true;


let phase = 'work';
let engine;
const listeners = new Set();
// Volume State
let musicVolume = 1.0;
let sfxVolume = 1.0;

// Master volume (both music and SFX)
let masterVolume = 1.0;

// Keep volume values 0 - 1
function clampVolume(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 1.0;

  return Math.max(0, Math.min(1, number));
}

// NEW: Calculate effective volumes
function getEffectiveMusicVolume() {
  return musicVolume * masterVolume;
}

function getEffectiveSfxVolume() {
  return sfxVolume * masterVolume;
}

// Sounds (can be replaced by custom URLs)
let dingWork  = new Audio('work_start.wav');
let dingShort = new Audio('short_break.wav');
let dingLong  = new Audio('long_break.wav');

export function applyCustomSoundsFromPrefs() {
  const { work, short, long } = getCustomSounds();

  try { if (work)  dingWork.src  = work; }  catch(e) {}
  try { if (short) dingShort.src = short; } catch(e) {}
  try { if (long)  dingLong.src  = long; }  catch(e) {}

  // Current volume applied
  applySfxVolume();
}

// Apply SFX volume with master volume multiplier
function applySfxVolume() {
  const effectiveVolume = getEffectiveSfxVolume();

  dingWork.volume = effectiveVolume;
  dingShort.volume = effectiveVolume;
  dingLong.volume = effectiveVolume;
}


function render() {
  phase = engine.phase;
  const seconds = Math.ceil(engine.remaining / 1000);
  minutesEl.textContent = Math.floor(seconds / 60);
  secondsEl.textContent = String(seconds % 60).padStart(2, '0');
  [workLabel, shortLabel, longLabel].forEach((el, i) => {
    el?.classList.toggle('active', ['work', 'short', 'long'][i] === phase);
    el?.classList.toggle('selected', ['work', 'short', 'long'][i] === phase);
  });
  const startButton = document.getElementById('startPause');
  if (startButton.dataset.paused !== String(engine.paused)) {
    startButton.innerHTML = engine.paused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
    startButton.dataset.paused = String(engine.paused);
  }
  document.getElementById('startPause').setAttribute('aria-label', engine.paused ? 'Start timer' : 'Pause timer');
  document.getElementById('reset').style.display = engine.started ? 'block' : 'none';
}
// Spotify music behavior with master volume
async function applyMusicForCurrentPhase(resume) {

  // Apply master multiplier
  const effectiveVolume = getEffectiveMusicVolume();

  // Quiet breaks use 20% of music volume
  const quietVol = effectiveVolume * 0.2;

  if (phase === 'work') {
    await Spotify.setVolume(effectiveVolume);

    if (resume) await Spotify.resume();

    return;
  }

  if (breakMusicBehavior === 'pause') {
    await Spotify.pause();

  } else if (breakMusicBehavior === 'quiet') {
    await Spotify.setVolume(quietVol);

    if (resume) await Spotify.resume();

  } else {
    // 'same' behavior
    await Spotify.setVolume(effectiveVolume);

    if (resume) await Spotify.resume();
  }
}


function onEvent(event) {
  phase = engine.phase;
  if (['phase', 'resume', 'jump'].includes(event.kind)) void applyMusicForCurrentPhase(!engine.paused).catch(() => {});
  if (['pause', 'suspend'].includes(event.kind)) void Spotify.pause().catch(() => {});
  if (event.kind === 'phase' && engine.paused) {
    void Spotify.pause().catch(() => {});
    document.getElementById('timerNotice').textContent = 'Break finished. Press Start when you are ready to study.';
  }
  if (event.kind === 'reset') void Spotify.setVolume(getEffectiveMusicVolume()).catch(() => {});
  if (event.kind === 'phase') (phase === 'work' ? dingWork : phase === 'short' ? dingShort : dingLong).play().catch(() => {});
  if (event.kind === 'suspend') {
    document.getElementById('timerNotice').textContent = 'Timer paused after a long interruption. Uncertain time was not counted.';
  }
  // Metrics failures must never interrupt the timer or music controls.
  for (const listener of listeners) { try { listener(event); } catch (error) { console.error('Activity listener failed', error); } }
}
export function startPause() {
  if (!engine.started && engine.phase === 'work') dingWork.play().catch(() => {});
  engine.toggle(); render();
  document.getElementById('timerNotice').textContent = '';
}
export function reset() { engine.reset(); render(); document.getElementById('timerNotice').textContent = ''; }
export function jumpToPhase(target) { engine.jump(target); render(); document.getElementById('timerNotice').textContent = ''; }
export function initTimer() {
  const p = getPrefs();
  breakMusicBehavior = ['pause', 'quiet', 'same'].includes(p.breakMusicBehavior) ? p.breakMusicBehavior : 'quiet';
  cyclesUntilLong = duration(p.cyclesUntilLong, 4); showTrackInfo = p.showTrackInfo !== false;
  musicVolume = clampVolume(p.musicVolume ?? 1); sfxVolume = clampVolume(p.sfxVolume ?? 1); masterVolume = clampVolume(p.masterVolume ?? 1);
  engine = new TimerEngine({ work: p.workTime, short: p.shortBreakTime, long: p.longBreakTime, cycles: cyclesUntilLong, autoStartWork: p.autoStartWork === true, emit: onEvent });
  applyCustomSoundsFromPrefs(); render();
  setInterval(() => { engine.tick(); render(); }, 1000);
  document.addEventListener('visibilitychange', () => { engine.tick(); render(); });
  return {
    startPause, reset, jumpToPhase,
    checkpoint: () => { engine.tick(); return engine.snapshot(); },
    restore: saved => { const restored = engine.restore(saved); render(); return restored; },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getState: () => ({ ...engine.snapshot(), minutesLeft: Math.floor(engine.remaining / 60000), secondsLeft: Math.ceil(engine.remaining / 1000) % 60,
      workTime: engine.durations.work, shortBreakTime: engine.durations.short, longBreakTime: engine.durations.long,
      breakMusicBehavior, cyclesUntilLong, showTrackInfo }),
    saveDurations: ({work, short, long}) => {
      engine.durations = { work: duration(work, engine.durations.work), short: duration(short, engine.durations.short), long: duration(long, engine.durations.long) };
      setPrefs({ workTime: engine.durations.work, shortBreakTime: engine.durations.short, longBreakTime: engine.durations.long });
    },
    saveBehavior: ({behavior, cycles, showTrack, autoStartWork}) => {
      if (['pause','quiet','same'].includes(behavior)) breakMusicBehavior = behavior;
      cyclesUntilLong = duration(cycles, cyclesUntilLong); engine.cycles = cyclesUntilLong;
      if (typeof showTrack === 'boolean') showTrackInfo = showTrack;
      if (typeof autoStartWork === 'boolean') engine.autoStartWork = autoStartWork;
      setPrefs({ breakMusicBehavior, cyclesUntilLong, showTrackInfo, autoStartWork: engine.autoStartWork });
    },
    // Include master volume
    getVolumes: () => ({
      music: musicVolume,
      sfx: sfxVolume,
      master: masterVolume
    }),

    setMusicVolume: (val) => {
      musicVolume = clampVolume(val);

      // Auto-save
      setPrefs({ musicVolume });

      // Update Spotify
      // Master volume applied automatically
      void applyMusicForCurrentPhase(false);
    },

    setSfxVolume: (val) => {
      sfxVolume = clampVolume(val);

      // Auto-save
      setPrefs({ sfxVolume });

      // Update audio objects immediately
      applySfxVolume();

      // Play preview sound
      dingWork.currentTime = 0;
      dingWork.play().catch(() => {});
    },

    // Master Volume Control
    setMasterVolume: (val) => {
      masterVolume = clampVolume(val);

      // Auto-save master volume
      setPrefs({ masterVolume });

      // Apply to Spotify without resuming playback
      void applyMusicForCurrentPhase(false);

      // Apply to all sound effects
      applySfxVolume();
    }
  };
}
