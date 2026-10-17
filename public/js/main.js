// main.js - app bootstrap
import { initYouTubeBackground } from './youtube-bg.js';
import { initSpotifyAuth, startNowPlayingPolling } from './spotify.js';
import { initTimer } from './timer.js';
import { getPrefs } from './storage.js';
import { bindUI, updateNowPlayingText } from './ui.js';

window.addEventListener('DOMContentLoaded', () => {
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
  // Account services are optional and must never prevent the timer from starting.
  import('./metrics.js').then(module => module.initMetrics(controls)).catch(error => {
    document.getElementById('metricsStatus').textContent = 'Tracking unavailable · Timer still works';
    document.getElementById('openAccount').onclick = () => {
      document.getElementById('accountMessage').textContent = 'Account services could not load. Check your connection and reload to try again.';
      document.getElementById('accountDialog').showModal();
      document.querySelector('[data-close="accountDialog"]').onclick = () => document.getElementById('accountDialog').close();
    };
    console.error('Optional account services unavailable', error);
  });
});
