// spotify.js - Spotify auth (PKCE flow), player, now playing, volume/transport

const CLIENT_ID = 'ddfacef7a6e549bcae188f789f23682b';
const REDIRECT_URI = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:3000/callback'
  : 'https://my-study-timer.web.app/callback';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ');


let spotifyPlayer = null;
let spotifyDeviceId = null;
let hasConnectedOnce = false;

let trackPollInterval = null;
let lastTrackId = null;

export function getDeviceId() { return spotifyDeviceId; }

/* -------- PKCE helpers -------- */
function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(arrayBuffer) {
  const byteArray = new Uint8Array(arrayBuffer);
  let binaryString = '';
  for (let i = 0; i < byteArray.length; i++) {
    binaryString += String.fromCharCode(byteArray[i]);
  }
  return btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(codeVerifier) {
  const hash = await sha256(codeVerifier);
  return base64UrlEncode(hash);
}

/* -------- Token management (localStorage) -------- */
function getAccessToken() {
  return localStorage.getItem('spotify_access_token');
}

function setAccessToken(token) {
  if (token) {
    localStorage.setItem('spotify_access_token', token);
  } else {
    localStorage.removeItem('spotify_access_token');
  }
}

function getRefreshToken() {
  return localStorage.getItem('spotify_refresh_token');
}

function setRefreshToken(token) {
  if (token) {
    localStorage.setItem('spotify_refresh_token', token);
  } else {
    localStorage.removeItem('spotify_refresh_token');
  }
}

async function fetchToken() {
  let token = getAccessToken();
  if (token) return token;

  // Try to refresh if refresh token exists
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    token = await refreshAccessToken(refreshToken);
    if (token) return token;
  }

  return null;
}

async function refreshAccessToken(refreshToken) {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID
      })
    });

    if (!response.ok) {
      console.error('Token refresh failed:', response.status);
      setRefreshToken(null);
      setAccessToken(null);
      setAuthUI(false, false);
      return null;
    }

    const data = await response.json();
    setAccessToken(data.access_token);
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token);
    }
    return data.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    setRefreshToken(null);
    setAccessToken(null);
    setAuthUI(false, false);
    return null;
  }
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
  loginBtn?.addEventListener('click', initiateLogin);

  // Check if just returned from OAuth callback; handles case where callback.html redirects back
  const params = new URLSearchParams(window.location.search);
  const token = params.get('access_token');
  if (token) {
    setAccessToken(token);
    const refreshToken = params.get('refresh_token');
    if (refreshToken) setRefreshToken(refreshToken);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Listen for messages from callback window if using popup
  window.addEventListener('message', async (ev) => {
    if (ev.data && ev.data.type === 'spotify-auth-success') {
      setAccessToken(ev.data.access_token);
      if (ev.data.refresh_token) {
        setRefreshToken(ev.data.refresh_token);
      }
      setAuthUI(!!getAccessToken(), !!spotifyDeviceId);
      bootPlayer(onReady);
    }
  });

  window.onSpotifyWebPlaybackSDKReady = () => bootPlayer(onReady);

  // Initial UI state
  setAuthUI(!!getAccessToken(), !!spotifyDeviceId);
}

async function initiateLogin() {
  // Generate PKCE values
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store code_verifier in sessionStorage
  sessionStorage.setItem('spotify_code_verifier', codeVerifier);

  // Build authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  // Open in popup
  window.open(
    'https://accounts.spotify.com/authorize?' + params.toString(),
    'spotify-login',
    'width=500,height=700'
  );
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

    spotifyPlayer.addListener('initialization_error', ({ message }) => {
      console.error('init_error:', message);
      setAuthUI(false, false);
    });
    spotifyPlayer.addListener('authentication_error', ({ message }) => {
      console.error('auth_error:', message);
      setRefreshToken(null);
      setAccessToken(null);
      setAuthUI(false, false);
    });
    spotifyPlayer.addListener('account_error', ({ message }) => {
      console.error('account_error:', message);
      setAuthUI(false, false);
    });

    await spotifyPlayer.connect();
  }
}
