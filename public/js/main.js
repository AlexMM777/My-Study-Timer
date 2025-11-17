// main.js - app bootstrap
import { initYouTubeBackground } from './youtube-bg.js';
import { initSpotifyAuth, startNowPlayingPolling } from './spotify.js';
import { initTimer } from './timer.js';
import { getPrefs } from './storage.js';
import { bindUI, updateNowPlayingText } from './ui.js';
import initAuthUI from './auth-ui.js';

window.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  // YouTube background
  initYouTubeBackground('bgPlayerMount');

  // Spotify + Now Playing
  initSpotifyAuth({
    onReady: () => {
      const p = getPrefs();
      if (p.showTrackInfo !== false) {
        startNowPlayingPolling(true, updateNowPlayingText);
      }
    }
  });

  // Timer
  const controls = initTimer();

  // UI bindings
  bindUI(controls);
});
