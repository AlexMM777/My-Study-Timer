// ui.js - DOM bindings, settings modal, Now Playing, and wiring to modules
import * as Timer from './timer.js';
import * as Spotify from './spotify.js';
import { DEFAULT_BG_LINKS, applyLinksIfChanged } from './youtube-bg.js';
import {
  getPrefs,
  setPrefs,
  getBgLinks,
  setBgLinks,
  getCustomSounds,
  setCustomSounds
} from './storage.js';

const settingsBtn = document.getElementById('settings');
const modal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsForm = document.getElementById('settingsForm');

// Controls
const startPauseBtn = document.getElementById('startPause');
const resetBtn = document.getElementById('reset');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const jumpWorkBtn = document.getElementById('jumpWork');
const jumpShortBtn = document.getElementById('jumpShort');
const jumpLongBtn = document.getElementById('jumpLong');

// Fields
const workInput = document.getElementById('workDuration');
const shortInput = document.getElementById('shortBreakDuration');
const longInput = document.getElementById('longBreakDuration');
const cyclesInput = document.getElementById('cyclesUntilLong');
const behaviorSelect = document.getElementById('breakMusicBehavior');
const autoStartWorkSelect = document.getElementById('autoStartWork');

// Volume controls
const masterSlider = document.getElementById('masterVolume');
const masterLabel = document.getElementById('volValue');

const musicSlider = document.getElementById('musicVolume');
const musicLabel = document.getElementById('musicVolValue');

const sfxSlider = document.getElementById('sfxVolume');
const sfxLabel = document.getElementById('sfxVolValue');

const showTrackSelect = document.getElementById('showTrackInfo');
const bgLinksTA = document.getElementById('bgLinks');
const soundWork = document.getElementById('soundWork');
const soundShort = document.getElementById('soundShort');
const soundLong = document.getElementById('soundLong');

// Now Playing pill
const nowPlaying = document.getElementById('nowPlaying');
const npTitle = document.getElementById('npTitle');

export function bindUI(timerControls) {

  // Initialize fields from preferences
  const p = getPrefs();
  autoStartWorkSelect.value = p.autoStartWork === true ? 'automatic' : 'manual';

  if (Number.isFinite(p.workTime))
    workInput.value = p.workTime;

  if (Number.isFinite(p.shortBreakTime))
    shortInput.value = p.shortBreakTime;

  if (Number.isFinite(p.longBreakTime))
    longInput.value = p.longBreakTime;

  if (Number.isFinite(p.cyclesUntilLong))
    cyclesInput.value = p.cyclesUntilLong;

  if (p.breakMusicBehavior)
    behaviorSelect.value = p.breakMusicBehavior;

  if (typeof p.showTrackInfo === 'boolean')
    showTrackSelect.value = p.showTrackInfo ? 'on' : 'off';

  // Background videos
  const savedLinks = getBgLinks(DEFAULT_BG_LINKS);
  bgLinksTA.value = savedLinks.join('\n');

  // Custom sound effects
  const cs = getCustomSounds();

  soundWork.value = cs.work || '';
  soundShort.value = cs.short || '';
  soundLong.value = cs.long || '';

  //  ~ ~ ~ Initialize Volume Sliders ~ ~ ~ 
  const vols = timerControls.getVolumes();

  // Music
  const musicPct = Math.round(vols.music * 100);
  musicSlider.value = musicPct;
  musicLabel.textContent = `${musicPct}%`;

  // Sound effects
  const sfxPct = Math.round(vols.sfx * 100);
  sfxSlider.value = sfxPct;
  sfxLabel.textContent = `${sfxPct}%`;

  // Master volume
  const masterPct = Math.round(vols.master * 100);
  masterSlider.value = masterPct;
  masterLabel.textContent = `${masterPct}%`;

  //  ~ ~ ~ Settings Modal ~ ~ ~ 
  settingsBtn?.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  closeSettingsBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  //  ~ ~ ~ Timer Controls ~ ~ ~ 
  startPauseBtn?.addEventListener('click', () => {
    timerControls.startPause();
  });

  resetBtn?.addEventListener('click', () => {
    timerControls.reset();
  });

  prevBtn?.addEventListener('click', () => {
    Spotify.prev();
  });

  nextBtn?.addEventListener('click', () => {
    Spotify.next();
  });

  jumpWorkBtn?.addEventListener('click', () => {
    timerControls.jumpToPhase('work');
  });

  jumpShortBtn?.addEventListener('click', () => {
    timerControls.jumpToPhase('short');
  });

  jumpLongBtn?.addEventListener('click', () => {
    timerControls.jumpToPhase('long');
  });

  //  ~ ~ ~ Music Volume ~ ~ ~ 
  musicSlider?.addEventListener('input', (e) => {
    const value = Number(e.target.value);

    musicLabel.textContent = `${value}%`;

    timerControls.setMusicVolume(value / 100);
  });

  //  ~ ~ ~ SFX Volume ~ ~ ~ 
  sfxSlider?.addEventListener('input', (e) => {
    const value = Number(e.target.value);
    sfxLabel.textContent = `${value}%`;
    timerControls.setSfxVolume(value / 100);
  });

  //  ~ ~ ~ Master Volume ~ ~ ~ 
  masterSlider?.addEventListener('input', (e) => {
    const value = Number(e.target.value);
    masterLabel.textContent = `${value}%`;
    timerControls.setMasterVolume(value / 100);
  });

  //  ~ ~ ~ Save Settings ~ ~ ~ 
  settingsForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const w = parseInt(workInput.value, 10);
    const sb = parseInt(shortInput.value, 10);
    const lb = parseInt(longInput.value, 10);
    const cycles = parseInt(cyclesInput.value, 10);

    const behavior = behaviorSelect.value;
    const showTrack = showTrackSelect.value === 'on';

    timerControls.saveDurations({
      work: w,
      short: sb,
      long: lb
    });

    timerControls.saveBehavior({
      autoStartWork: autoStartWorkSelect.value === 'automatic',
      behavior,
      cycles,
      showTrack
    });

    // Now Playing visibility
    setPrefs({ showTrackInfo: showTrack });

    if (showTrack) {
      nowPlaying.style.display = 'block';
    } else {
      nowPlaying.style.display = 'none';
    }

    // Background videos
    const hasChanged = applyLinksIfChanged(bgLinksTA.value);

    if (!hasChanged) {
      setBgLinks(
        bgLinksTA.value
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean)
      );
    }

    // Custom sounds
    setCustomSounds({
      work: (soundWork.value || '').trim(),
      short: (soundShort.value || '').trim(),
      long: (soundLong.value || '').trim()
    });

    Timer.applyCustomSoundsFromPrefs();

    modal.style.display = 'none';
  });
}

// ~ ~ ~ Now Playing ~ ~ ~
export function updateNowPlayingText(txt) {
  if (!txt) return;

  npTitle.textContent = txt;
  nowPlaying.style.display = 'block';
}
