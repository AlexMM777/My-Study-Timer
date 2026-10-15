// timer.js - timer state machine, sounds, and phase logic
import * as Spotify from './spotify.js';
import { getPrefs, setPrefs, getCustomSounds } from './storage.js';

const workLabel  = document.getElementById('work');
const shortLabel = document.getElementById('short');
const longLabel  = document.getElementById('long');
const minutesEl  = document.getElementById('minutes');
const secondsEl  = document.getElementById('seconds');

let workTime = 50;
let shortBreakTime = 10;
let longBreakTime = 20;

let breakMusicBehavior = 'quiet'; // 'pause' | 'quiet' | 'same'
let cyclesUntilLong = 4;
let showTrackInfo = true;

let isPaused = true;
let timerInterval = null;
let phase = 'work'; // 'work' | 'short' | 'long'
let completedWorkCycles = 0;
let minutesLeft = workTime;
let secondsLeft = 0;

let justTransitioned = false;
let firstStart = true;

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

function setPhaseUI() {
  [workLabel, shortLabel, longLabel].forEach(el =>
    el && el.classList.remove('active', 'selected')
  );

  if (phase === 'work')
    workLabel?.classList.add('active', 'selected');

  if (phase === 'short')
    shortLabel?.classList.add('active', 'selected');

  if (phase === 'long')
    longLabel?.classList.add('active', 'selected');
}

function setDisplay(min, sec) {
  minutesEl.textContent = min;
  secondsEl.textContent = sec < 10 ? `0${sec}` : sec;
}

function defaultMinutesForPhase(p) {
  return p === 'work'
    ? workTime
    : (p === 'short' ? shortBreakTime : longBreakTime);
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

function tick() {
  if (isPaused) return;

  setDisplay(minutesLeft, secondsLeft);

  if (secondsLeft === 0) {
    if (minutesLeft === 0) {
      let nextPhase;

      if (phase === 'work') {
        completedWorkCycles++;

        nextPhase =
          (completedWorkCycles % cyclesUntilLong === 0)
            ? 'long'
            : 'short';
      } else {
        nextPhase = 'work';
      }

      justTransitioned = true;
      phaseStart(nextPhase);
      return;
    }

    minutesLeft--;
    secondsLeft = 59;

  } else {
    secondsLeft--;
  }

  setDisplay(minutesLeft, secondsLeft);
}

function runTimer() {
  clearInterval(timerInterval);

  setDisplay(minutesLeft, secondsLeft);

  timerInterval = setInterval(tick, 1000);
}

function playPhaseDingIfTransitioned() {
  if (!justTransitioned) return;

  try {
    if (phase === 'work') {
      dingWork.play().catch(() => {});
    } else if (phase === 'short') {
      dingShort.play().catch(() => {});
    } else {
      dingLong.play().catch(() => {});
    }
  } catch(e) {}

  justTransitioned = false;
}

function phaseStart(nextPhase) {
  phase = nextPhase;

  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;

  setPhaseUI();
  setDisplay(minutesLeft, secondsLeft);

  playPhaseDingIfTransitioned();

  void applyMusicForCurrentPhase(true);
}

export function startPause() {
  if (isPaused) {

    document.getElementById('startPause').innerHTML =
      '<i class="fa-solid fa-pause"></i>';

    document.getElementById('reset').style.display = "block";

    isPaused = false;

    if (firstStart && phase === 'work') {
      try {
        dingWork.play().catch(() => {});
      } catch(e) {}

      firstStart = false;
    }

    void applyMusicForCurrentPhase(true);
    runTimer();

  } else {

    document.getElementById('startPause').innerHTML =
      '<i class="fa-solid fa-play"></i>';

    isPaused = true;

    clearInterval(timerInterval);
    void Spotify.pause();
  }
}

export function reset() {
  clearInterval(timerInterval);

  isPaused = true;
  phase = 'work';
  completedWorkCycles = 0;

  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;

  setDisplay(minutesLeft, secondsLeft);

  document.getElementById('startPause').innerHTML =
    '<i class="fa-solid fa-play"></i>';

  document.getElementById('reset').style.display = "none";

  setPhaseUI();

  // Restore music volume
  void Spotify.setVolume(getEffectiveMusicVolume());

  firstStart = true;
}

export function jumpToPhase(target) {
  if (!['work', 'short', 'long'].includes(target)) return;

  clearInterval(timerInterval);

  phase = target;

  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;

  setPhaseUI();
  setDisplay(minutesLeft, secondsLeft);

  const shouldResume = !isPaused;

  void applyMusicForCurrentPhase(shouldResume);

  if (!isPaused) runTimer();
}

export function initTimer() {
  // Load preferences
  const p = getPrefs();

  if (Number.isFinite(p.workTime))
    workTime = p.workTime;

  if (Number.isFinite(p.shortBreakTime))
    shortBreakTime = p.shortBreakTime;

  if (Number.isFinite(p.longBreakTime))
    longBreakTime = p.longBreakTime;

  if (p.breakMusicBehavior)
    breakMusicBehavior = p.breakMusicBehavior;

  if (Number.isFinite(p.cyclesUntilLong) &&
      p.cyclesUntilLong >= 1)
    cyclesUntilLong = p.cyclesUntilLong;

  if (typeof p.showTrackInfo === 'boolean')
    showTrackInfo = p.showTrackInfo;

  // Load music and SFX volumes
  if (Number.isFinite(p.musicVolume))
    musicVolume = clampVolume(p.musicVolume);

  if (Number.isFinite(p.sfxVolume))
    sfxVolume = clampVolume(p.sfxVolume);

  // Load saved master volume
  if (Number.isFinite(p.masterVolume))
    masterVolume = clampVolume(p.masterVolume);

  // Apply initial SFX volume
  applySfxVolume();

  // Initialize display
  phase = 'work';
  completedWorkCycles = 0;
  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;

  setDisplay(minutesLeft, secondsLeft);
  setPhaseUI();

  // Apply custom sounds
  applyCustomSoundsFromPrefs();

  // Expose controls for UI to bind
  return {
    startPause,
    reset,
    jumpToPhase,

    getState: () => ({
      phase,
      minutesLeft,
      secondsLeft,
      workTime,
      shortBreakTime,
      longBreakTime,
      breakMusicBehavior,
      cyclesUntilLong,
      showTrackInfo
    }),

    saveDurations: ({ work, short, long }) => {
      if (Number.isFinite(work))
        workTime = work;

      if (Number.isFinite(short))
        shortBreakTime = short;

      if (Number.isFinite(long))
        longBreakTime = long;

      setPrefs({
        workTime,
        shortBreakTime,
        longBreakTime
      });
    },

    saveBehavior: ({ behavior, cycles, showTrack }) => {
      if (behavior)
        breakMusicBehavior = behavior;

      if (Number.isFinite(cycles) && cycles >= 1)
        cyclesUntilLong = cycles;

      if (typeof showTrack === 'boolean')
        showTrackInfo = showTrack;

      setPrefs({
        breakMusicBehavior,
        cyclesUntilLong,
        showTrackInfo
      });
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
