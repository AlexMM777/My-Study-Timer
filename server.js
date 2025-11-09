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

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await tokenRes.json();
  if (data.error) return res.status(400).send('Auth error: ' + JSON.stringify(data));

  refreshToken = data.refresh_token || refreshToken;

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

// Fresh access tokens using refresh_token
app.get('/auth/token', async (req, res) => {
  if (!refreshToken) return res.json({ access_token: null });

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await tokenRes.json();
  if (data.error) return res.status(400).json({ access_token: null, error: data });

  res.json({ access_token: data.access_token });
});

app.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
});
