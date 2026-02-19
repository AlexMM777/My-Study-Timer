// ui.js - DOM bindings, settings modal, Now Playing, and wiring to modules
import * as Timer from './timer.js';
import * as Spotify from './spotify.js';
import { DEFAULT_BG_LINKS, applyLinksIfChanged } from './youtube-bg.js';
import { getPrefs, setPrefs, getBgLinks, setBgLinks, getCustomSounds, setCustomSounds } from './storage.js';

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
const workInput  = document.getElementById('workDuration');
const shortInput = document.getElementById('shortBreakDuration');
const longInput  = document.getElementById('longBreakDuration');
const cyclesInput = document.getElementById('cyclesUntilLong');
const behaviorSelect = document.getElementById('breakMusicBehavior');

const volumeSlider = document.getElementById('masterVolume');
const volumeLabel = document.getElementById('volValue');
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
  // Init fields from prefs and storage
  const p = getPrefs();
  if (Number.isFinite(p.workTime)) workInput.value = p.workTime;
  if (Number.isFinite(p.shortBreakTime)) shortInput.value = p.shortBreakTime;
  if (Number.isFinite(p.longBreakTime)) longInput.value = p.longBreakTime;
  if (Number.isFinite(p.cyclesUntilLong)) cyclesInput.value = p.cyclesUntilLong;
  if (p.breakMusicBehavior) behaviorSelect.value = p.breakMusicBehavior;
  if (typeof p.showTrackInfo === 'boolean') showTrackSelect.value = p.showTrackInfo ? 'on' : 'off';

  const savedLinks = getBgLinks(DEFAULT_BG_LINKS);
  bgLinksTA.value = savedLinks.join('\n');

  const cs = getCustomSounds();
  soundWork.value  = cs.work  || '';
  soundShort.value = cs.short || '';
  soundLong.value  = cs.long  || '';

  // Init volume slider
  const state = timerControls.getState();
  if (Number.isFinite(state.masterVolume)) {
    const pct = Math.round(state.masterVolume * 100);
    volumeSlider.value = pct;
    volumeLabel.textContent = `${pct}%`;
  }

  // Initialize Sliders from Timer State
  const vols = timerControls.getVolumes();
  
  // Music
  const musicPct = Math.round(vols.music * 100);
  musicSlider.value = musicPct;
  musicLabel.textContent = `${musicPct}%`;

  // SFX
  const sfxPct = Math.round(vols.sfx * 100);
  sfxSlider.value = sfxPct;
  sfxLabel.textContent = `${sfxPct}%`;

  // Modal open/close
  settingsBtn?.addEventListener('click', () => modal.style.display = 'block');
  closeSettingsBtn?.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  // Buttons
  startPauseBtn?.addEventListener('click', () => timerControls.startPause());
  resetBtn?.addEventListener('click', () => timerControls.reset());
  prevBtn?.addEventListener('click', () => Spotify.prev());
  nextBtn?.addEventListener('click', () => Spotify.next());
  jumpWorkBtn?.addEventListener('click', () => timerControls.jumpToPhase('work'));
  jumpShortBtn?.addEventListener('click', () => timerControls.jumpToPhase('short'));
  jumpLongBtn?.addEventListener('click', () => timerControls.jumpToPhase('long'));

  // Volume slider listener
  volumeSlider?.addEventListener('input', (e) => {
    const pct = e.target.value;
    volumeLabel.textContent = `${pct}%`;
    const floatVal = parseInt(pct, 10) / 100.0;
    timerControls.setMasterVolume(floatVal);
  });

  // Music Volume Change
  musicSlider?.addEventListener('input', (e) => {
    const val = e.target.value;
    musicLabel.textContent = `${val}%`;
    timerControls.setMusicVolume(val / 100.0);
  });

  // SFX Volume Change
  sfxSlider?.addEventListener('input', (e) => {
    const val = e.target.value;
    sfxLabel.textContent = `${val}%`;
    timerControls.setSfxVolume(val / 100.0);
  });

  // Settings form save
  settingsForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    // Durations and prefs
    const w  = parseInt(workInput.value, 10);
    const sb = parseInt(shortInput.value, 10);
    const lb = parseInt(longInput.value, 10);
    const cycles = parseInt(cyclesInput.value, 10);
    const behavior = behaviorSelect.value;
    const showTrack = showTrackSelect.value === 'on';

    timerControls.saveDurations({ work: w, short: sb, long: lb });
    timerControls.saveBehavior({ behavior, cycles, showTrack });

    // Now Playing visibility
    setPrefs({ showTrackInfo: showTrack });
    if (showTrack) {
      nowPlaying.style.display = 'block';
    } else {
      nowPlaying.style.display = 'none';
    }

    // Background links: only reload if changed
    const hasChanged = applyLinksIfChanged(bgLinksTA.value);
    if (!hasChanged) {
      // No reset performed; but persist normalized links back if needed
      setBgLinks(bgLinksTA.value.split('\n').map(s => s.trim()).filter(Boolean));
    }

    // Custom sound URLs
    setCustomSounds({
      work:  (soundWork.value || '').trim(),
      short: (soundShort.value || '').trim(),
      long:  (soundLong.value || '').trim()
    });
    Timer.applyCustomSoundsFromPrefs();

    // Close modal
    modal.style.display = 'none';
  });
}

export function updateNowPlayingText(txt) {
  if (!txt) return;
  npTitle.textContent = txt;
  nowPlaying.style.display = 'block';
}
