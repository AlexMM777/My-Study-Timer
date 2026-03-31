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

// Sounds (can be replaced by custom URLs)
let dingWork  = new Audio('work_start.wav');
let dingShort = new Audio('short_break.wav');
let dingLong  = new Audio('long_break.wav');

export function applyCustomSoundsFromPrefs() {
  const { work, short, long } = getCustomSounds();
  try { if (work)  dingWork.src  = work; }  catch(e) {}
  try { if (short) dingShort.src = short; } catch(e) {}
  try { if (long)  dingLong.src  = long; }  catch(e) {}
}

// Helper to apply SFX volume to all audio objects
function applySfxVolume() {
  dingWork.volume = sfxVolume;
  dingShort.volume = sfxVolume;
  dingLong.volume = sfxVolume;
}

function setPhaseUI() {
  [workLabel, shortLabel, longLabel].forEach(el => el && el.classList.remove('active','selected'));
  if (phase === 'work')  workLabel?.classList.add('active','selected');
  if (phase === 'short') shortLabel?.classList.add('active','selected');
  if (phase === 'long')  longLabel?.classList.add('active','selected');
}
function setDisplay(min, sec) {
  minutesEl.textContent = min;
  secondsEl.textContent = sec < 10 ? `0${sec}` : sec;
}

function defaultMinutesForPhase(p) {
  return p === 'work' ? workTime : (p === 'short' ? shortBreakTime : longBreakTime);
}

async function applyMusicForCurrentPhase(resume) {
  const quietVol = musicVolume * 0.2; // 20% of set music volume

  if (phase === 'work') {
    await Spotify.setVolume(musicVolume);
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
    await Spotify.setVolume(musicVolume);
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
        nextPhase = (completedWorkCycles % cyclesUntilLong === 0) ? 'long' : 'short';
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
    if (phase === 'work') dingWork.play();
    else if (phase === 'short') dingShort.play();
    else dingLong.play();
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
  applyMusicForCurrentPhase(true);
}

export function startPause() {
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
    Spotify.pause();
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
  document.getElementById('startPause').innerHTML = '<i class="fa-solid fa-play"></i>';
  document.getElementById('reset').style.display = "none";
  setPhaseUI();
  Spotify.setVolume(1.0);
  firstStart = true;
}

export function jumpToPhase(target) {
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

export function initTimer() {
  // Load prefs
  const p = getPrefs();
  if (Number.isFinite(p.workTime)) workTime = p.workTime;
  if (Number.isFinite(p.shortBreakTime)) shortBreakTime = p.shortBreakTime;
  if (Number.isFinite(p.longBreakTime)) longBreakTime = p.longBreakTime;
  if (p.breakMusicBehavior) breakMusicBehavior = p.breakMusicBehavior;
  if (Number.isFinite(p.cyclesUntilLong) && p.cyclesUntilLong >= 1) cyclesUntilLong = p.cyclesUntilLong;
  if (typeof p.showTrackInfo === 'boolean') showTrackInfo = p.showTrackInfo;
  if (Number.isFinite(p.musicVolume)) musicVolume = p.musicVolume;
  if (Number.isFinite(p.sfxVolume)) sfxVolume = p.sfxVolume;

  // Apply initial SFX volume
  applySfxVolume();

  // Init display
  phase = 'work';
  completedWorkCycles = 0;
  minutesLeft = defaultMinutesForPhase(phase);
  secondsLeft = 0;
  setDisplay(minutesLeft, secondsLeft);
  setPhaseUI();

  // Apply custom sounds (if any)
  applyCustomSoundsFromPrefs();

  // Expose controls for UI to bind
  return {
    startPause,
    reset,
    jumpToPhase,
    getState: () => ({
      phase, minutesLeft, secondsLeft, workTime, shortBreakTime, longBreakTime,
      breakMusicBehavior, cyclesUntilLong, showTrackInfo
    }),
    saveDurations: ({ work, short, long }) => {
      if (Number.isFinite(work)) workTime = work;
      if (Number.isFinite(short)) shortBreakTime = short;
      if (Number.isFinite(long)) longBreakTime = long;
      setPrefs({ workTime, shortBreakTime, longBreakTime });
    },
    saveBehavior: ({ behavior, cycles, showTrack }) => {
      if (behavior) breakMusicBehavior = behavior;
      if (Number.isFinite(cycles) && cycles >= 1) cyclesUntilLong = cycles;
      if (typeof showTrack === 'boolean') showTrackInfo = showTrack;
      setPrefs({ breakMusicBehavior, cyclesUntilLong, showTrackInfo });
    },

    getVolumes: () => ({ music: musicVolume, sfx: sfxVolume }),
    setMusicVolume: (val) => {
      musicVolume = val;
      setPrefs({ musicVolume }); // Auto-save
      applyMusicForCurrentPhase(false); // Update Spotify immediately
    },
    setSfxVolume: (val) => {
      sfxVolume = val;
      setPrefs({ sfxVolume }); // Auto-save
      applySfxVolume(); // Update Audio objects immediately
      dingWork.currentTime = 0; 
      dingWork.play().catch(()=>{}); 
    },
  };
}
