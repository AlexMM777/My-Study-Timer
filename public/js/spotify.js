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
let connectPromise = null;
let refreshPromise = null;       // Prevent two simultaneous refresh requests
let tokenMaintenanceInterval = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let spotifyDeviceId = null;
let hasConnectedOnce = false;

let trackPollInterval = null;
let lastTrackId = null;

export function getDeviceId() { return spotifyDeviceId; }

/* ~ ~ ~ ~ PKCE helpers ~ ~ ~ ~ */
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

/* ~ ~ ~ ~ Token management (localStorage) ~ ~ ~ ~ */
function getAccessToken() {
  return localStorage.getItem('spotify_access_token');
}

// Check when the token expires
function getTokenExpiry() {
  const expiry = localStorage.getItem('spotify_token_expires_at');
  return expiry ? parseInt(expiry, 10) : 0;
}

// Accepts expiresInSeconds to calculate absolute expiry
function setAccessToken(token, expiresInSeconds) {
  if (token) {
    localStorage.setItem('spotify_access_token', token);
    if (expiresInSeconds) {
      // Calculate expiry timestamp
      const expiry = Date.now() + (expiresInSeconds * 1000);
      localStorage.setItem('spotify_token_expires_at', expiry);
    }
  } else {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expires_at');
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

// Get a valid token, refreshing it five min before expiry
// Requests share one refresh operation, prevents races when the Spotify SDK and "now playing" polling need token simultaneously
async function fetchToken() {
  const savedToken = getAccessToken();
  const expiry = getTokenExpiry();
  const now = Date.now();

  if (savedToken && expiry > now + 5 * 60 * 1000) {
    return savedToken;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return savedToken && expiry > now ? savedToken : null;
  }

  if (!refreshPromise) {
    refreshPromise = refreshAccessToken(refreshToken).finally(() => {
      refreshPromise = null;
    });
  }

  const renewedToken = await refreshPromise;
  if (renewedToken) return renewedToken;

  // A temp failure may occur before the old token expires, continue using it while valid
  const stillValid = getAccessToken();
  return stillValid && getTokenExpiry() > Date.now() ? stillValid : null;
}

async function refreshAccessToken(refreshToken) {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn('Spotify refresh failed:', response.status, errorData.error);

      // Only explicit invalid_grant means the stored refresh credential is no longer accepted
      if (response.status === 400 && errorData.error === 'invalid_grant') {
        setRefreshToken(null);
        setAccessToken(null);
        showSpotifyError('Spotify authorization expired. Please log in again.');
      }
      return null;
    }

    const data = await response.json();
    if (!data.access_token || !data.expires_in) {
      console.error('Spotify refresh response omitted access_token or expires_in.');
      return null;
    }

    setAccessToken(data.access_token, data.expires_in);

    // Spotify may rotate the refresh token, keep the old one if it doesn't
    if (data.refresh_token) setRefreshToken(data.refresh_token);

    console.info('Spotify access token renewed.');
    return data.access_token;
  } catch (error) {
    console.warn('Spotify token refresh temporarily unavailable:', error);
    // Preserve both tokens and retry later
    return null;
  }
}

// Keep the login valid even if the SDK is idle or the track display is off
// Browser timers can pause while a computer sleeps, so catch-up check after the tab wakes up
function startTokenMaintenance(onReady) {
  if (tokenMaintenanceInterval) return;

  const maintain = async () => {
    if (!getRefreshToken()) return;
    const token = await fetchToken();
    if (token && !spotifyDeviceId && window.Spotify) {
      void bootPlayer(onReady);
    }
  };

  tokenMaintenanceInterval = setInterval(() => {
    if (getRefreshToken() && getTokenExpiry() <= Date.now() + 5 * 60 * 1000) {
      void maintain();
    }
  }, 60 * 1000);

  window.addEventListener('online', () => { void maintain(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void maintain();
  });
}

// Reconnect after interruptions, with exponential backoff (up to one min)
function scheduleReconnect(onReady) {
  if (reconnectTimer || !spotifyPlayer || !getRefreshToken()) return;
  const delay = Math.min(60000, 2000 * 2 ** Math.min(reconnectAttempts, 5));
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (spotifyDeviceId) return;
    if (!navigator.onLine) {
      scheduleReconnect(onReady);
      return;
    }
    spotifyPlayer.disconnect();
    void bootPlayer(onReady);
  }, delay);
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

function showSpotifyError(message) {
  console.warn('Spotify:', message);
  const status = document.getElementById('spotifyStatus');
  if (status) {
    status.style.display = 'inline';
    status.textContent = message;
  }
  // Always allow manual retry via login, valid tokens preserved when SDK connection fails due to network / DRM problem
  const btn = document.getElementById('loginSpotify');
  if (btn) btn.style.display = 'inline-flex';
}

async function transferPlaybackToDevice(deviceId, play = false) {
  const token = await fetchToken();
  if (!token || !deviceId) return;
  try {
    const response = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceId], play })
    });
    if (!response.ok) {
      console.error('Spotify playback transfer failed:', response.status, await response.text());
      showSpotifyError(`Spotify playback transfer failed (HTTP ${response.status}).`);
    }
  } catch (error) {
    console.error('Spotify playback transfer network error:', error);
    showSpotifyError('Could not transfer playback to this browser.');
  }
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

  // Browser autoplay rules require player activation inside a real user click
  document.getElementById('startPause')?.addEventListener('click', () => {
    if (spotifyPlayer) {
      void spotifyPlayer.activateElement().catch(error => {
        console.warn('Spotify player activation failed:', error);
      });
    }
  });

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
    // Only accept credentials from our own site's OAuth callback
    if (ev.origin !== window.location.origin) return;
    if (ev.data && ev.data.type === 'spotify-auth-success') {
      // Pass expires_in to setAccessToken
      setAccessToken(ev.data.access_token, ev.data.expires_in);

      if (ev.data.refresh_token) {
        setRefreshToken(ev.data.refresh_token);
      }
      setAuthUI(!!getAccessToken(), !!spotifyDeviceId);
      void bootPlayer(onReady);
    }
  });

  window.onSpotifyWebPlaybackSDKReady = () => { void bootPlayer(onReady); };

  // Initial UI state
  setAuthUI(!!getAccessToken(), !!spotifyDeviceId);
  if (window.Spotify) void bootPlayer(onReady);
  startTokenMaintenance(onReady);
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
  if (!window.Spotify) {
    showSpotifyError('Spotify SDK has not loaded. Check blocked scripts or reload the page.');
    return;
  }

  const token = await fetchToken();
  if (!token) {
    if (getRefreshToken()) {
      showSpotifyError('Spotify temporarily unavailable; will retry automatically.');
      scheduleReconnect(onReady);
    } else {
      setAuthUI(false, false);
    }
    return;
  }

  if (!spotifyPlayer) {
    spotifyPlayer = new Spotify.Player({
      name: 'My Study Timer',
      getOAuthToken: async cb => {
        const freshToken = await fetchToken();
        if (!freshToken) showSpotifyError('Spotify access token is unavailable. Log in again.');
        cb(freshToken || '');
      },
      volume: 1.0
    });

    spotifyPlayer.addListener('ready', ({ device_id }) => {
      spotifyDeviceId = device_id;
      reconnectAttempts = 0;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      console.info('Spotify player is ready:', device_id);
      setAuthUI(true, true);
      if (!hasConnectedOnce) {
        hasConnectedOnce = true;
        // Transfers the current context
        void transferPlaybackToDevice(device_id, false);
      }
      onReady?.();
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      if (spotifyDeviceId === device_id) spotifyDeviceId = null;
      hasConnectedOnce = false;
      setAuthUI(true, false);
      scheduleReconnect(onReady);
    });

    spotifyPlayer.addListener('initialization_error', ({ message }) => {
      console.error('init_error:', message);
      showSpotifyError(`Spotify player initialization failed: ${message}`);
    });
    spotifyPlayer.addListener('authentication_error', ({ message }) => {
      console.error('auth_error:', message);
      showSpotifyError(`Spotify player authentication failed: ${message}`);
      spotifyDeviceId = null;
      hasConnectedOnce = false;
      scheduleReconnect(onReady);
    });
    spotifyPlayer.addListener('account_error', ({ message }) => {
      console.error('account_error:', message);
      showSpotifyError(`Spotify account error: ${message}. Check Premium and app allowlist.`);
    });
    spotifyPlayer.addListener('playback_error', ({ message }) => {
      console.error('playback_error:', message);
      showSpotifyError(`Spotify playback failed: ${message}`);
    });
    spotifyPlayer.addListener('autoplay_failed', () => {
      console.warn('Spotify autoplay blocked. Press Start or manually play a song.');
      showSpotifyError('Browser blocked autoplay. Press Start or select a song in Spotify.');
    });
  }

  if (spotifyDeviceId) return;
  if (connectPromise) return connectPromise;

  setAuthUI(true, false);
  connectPromise = (async () => {
    try {
      const connected = await spotifyPlayer.connect();
      if (!connected) {
        showSpotifyError('Spotify player did not connect. Will retry automatically.');
        scheduleReconnect(onReady);
      }
    } catch (error) {
      console.error('Spotify player connection error:', error);
      showSpotifyError(`Spotify player connection error: ${error.message || error}`);
      scheduleReconnect(onReady);
    } finally {
      connectPromise = null;
    }
  })();
  return connectPromise;
}
