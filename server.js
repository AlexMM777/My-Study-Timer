// server.js
// CommonJS-friendly fetch shim
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const express = require('express');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;         // set in .env (not committed)
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET; // set in .env (not committed)
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/auth/callback';

let refreshToken = null; // simple in-memory store

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function makeState() { return crypto.randomBytes(16).toString('hex'); }

const SCOPES = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ');

/* -------- Helpers: retries + robust parsing -------- */
async function fetchWithRetry(url, opts, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 250 * (i + 1) ** 2));
    }
  }
  throw lastErr;
}

async function jsonOrText(res) {
  const ct = res.headers.get('content-type') || '';
  const raw = await res.text(); // always read body
  if (ct.includes('application/json')) {
    try { return { ok: true, data: JSON.parse(raw), raw }; }
    catch { return { ok: false, error: 'invalid_json', raw }; }
  }
  return { ok: false, error: 'non_json_response', raw };
}

/* -------- Auth endpoints -------- */

// Step 1: login
app.get('/auth/login', (req, res) => {
  const state = makeState();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state
  });
  res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

// Step 2: callback
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send('Missing code');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI
  });

  let tokenRes;
  try {
    tokenRes = await fetchWithRetry('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
  } catch (e) {
    console.error('Token fetch failed (auth/callback):', e?.message || e);
    return res.status(502).send('Auth error. Network failure contacting Spotify.');
  }

  const parsed = await jsonOrText(tokenRes);
  if (!tokenRes.ok || !parsed.ok || parsed.data?.error) {
    console.error('Token error (auth/callback):', {
      status: tokenRes.status,
      error: parsed.error || parsed.data?.error,
      body: parsed.ok ? parsed.data : parsed.raw?.slice(0, 500) // log first 500 chars
    });
    return res.status(400).send('Auth error. See server logs for details.');
  }

  refreshToken = parsed.data.refresh_token || refreshToken;

  res.send(`
<html><body>
<script>
  window.opener && window.opener.postMessage({ type: 'spotify-auth-success' }, '*');
  window.close();
</script>
Success. You can close this window.
</body></html>
  `);
});

// Step 3: refresh access token for client
app.get('/auth/token', async (req, res) => {
  if (!refreshToken) return res.json({ access_token: null });

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  let tokenRes;
  try {
    tokenRes = await fetchWithRetry('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
  } catch (e) {
    console.error('Token fetch failed (/auth/token):', e?.message || e);
    return res.status(502).json({ access_token: null, error: 'network_failure' });
  }

  const parsed = await jsonOrText(tokenRes);
  if (!tokenRes.ok || !parsed.ok || parsed.data?.error) {
    console.error('Token error (/auth/token):', {
      status: tokenRes.status,
      error: parsed.error || parsed.data?.error,
      body: parsed.ok ? parsed.data : parsed.raw?.slice(0, 500)
    });
    return res.status(400).json({ access_token: null, error: 'token_exchange_failed' });
  }

  res.json({ access_token: parsed.data.access_token });
});

/* -------- Static and server start -------- */
app.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
});
