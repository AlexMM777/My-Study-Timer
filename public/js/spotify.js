// spotify.js - Spotify auth, player, now playing, volume/transport
let spotifyPlayer = null;
let spotifyDeviceId = null;
let hasConnectedOnce = false;

let trackPollInterval = null;
let lastTrackId = null;

export function getDeviceId() { return spotifyDeviceId; }

async function fetchToken() {
  try {
    const r = await fetch('/auth/token');
    const j = await r.json();
    return j.access_token || null;
  } catch { return null; }
}

async function getJson(url) {
  const token = await fetchToken();
  if (!token) return null;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

export async function setVolume(vol) { try { await spotifyPlayer?.setVolume(vol); } catch(e) {} }
export async function pause()      { try { await spotifyPlayer?.pause(); } catch(e) {} }
export async function resume()     { try { await spotifyPlayer?.resume(); } catch(e) {} }
export async function next()       { try { await spotifyPlayer?.nextTrack(); } catch(e) {} }
export async function prev()       { try { await spotifyPlayer?.previousTrack(); } catch(e) {} }

function setAuthUI(connected, playerReady) {
  const btn = document.getElementById('loginSpotify');
  const status = document.getElementById('spotifyStatus');
  if (btn) btn.style.display = connected ? 'none' : 'inline-flex';
  if (!status) return;
  if (connected && playerReady) status.style.display = 'none';
  else if (connected && !playerReady) { status.style.display = 'inline'; status.textContent = 'Connecting player...'; }
  else { status.style.display = 'inline'; status.textContent = 'Not connected'; }
}

async function transferPlaybackToDevice(deviceId, play = false) {
  const token = await fetchToken();
  if (!token || !deviceId) return;
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play })
  });
}

export function startNowPlayingPolling(show, updateCb) {
  if (!show) return;
  if (trackPollInterval) return;
  trackPollInterval = setInterval(async () => {
    const data = await getJson('https://api.spotify.com/v1/me/player/currently-playing?market=from_token');
    if (!data || !data.item) return;
    const id = data.item.id;
    if (id === lastTrackId) return;
    lastTrackId = id;
    const title = data.item.name || '';
    const artists = Array.isArray(data.item.artists) ? data.item.artists.map(a => a.name).join(', ') : '';
    updateCb(`${title} — ${artists}`);
  }, 3000);
}
export function stopNowPlayingPolling() {
  clearInterval(trackPollInterval);
  trackPollInterval = null;
}

export function initSpotifyAuth({ onReady }) {
  const loginBtn = document.getElementById('loginSpotify');
  loginBtn?.addEventListener('click', () => {
    window.open('/auth/login', 'spotify-login', 'width=500,height=700');
  });

  window.addEventListener('message', async (ev) => {
    if (ev.data && ev.data.type === 'spotify-auth-success') {
      const token = await fetchToken();
      setAuthUI(!!token, !!spotifyDeviceId);
      bootPlayer(onReady);
    }
  });

  window.onSpotifyWebPlaybackSDKReady = () => bootPlayer(onReady);

  // Initial UI state
  fetchToken().then(token => setAuthUI(!!token, !!spotifyDeviceId));
}

async function bootPlayer(onReady) {
  if (!window.Spotify) return;
  const token = await fetchToken();
  if (!token) return;

  if (!spotifyPlayer) {
    spotifyPlayer = new Spotify.Player({
      name: 'My Study Timer',
      getOAuthToken: async cb => cb((await fetchToken()) || ''),
      volume: 1.0
    });

    spotifyPlayer.addListener('ready', ({ device_id }) => {
      spotifyDeviceId = device_id;
      setAuthUI(true, true);
      if (!hasConnectedOnce) { hasConnectedOnce = true; transferPlaybackToDevice(device_id, false); }
      onReady?.();
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      if (spotifyDeviceId === device_id) spotifyDeviceId = null;
      setAuthUI(true, false);
    });

    spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('init_error', message));
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('auth_error', message));
    spotifyPlayer.addListener('account_error', ({ message }) => console.error('account_error', message));

    await spotifyPlayer.connect();
  }
}
