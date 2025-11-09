# My Study Timer

A customizable Pomodoro timer with YouTube ambience and Spotify Premium controls. Runs locally with your own Spotify credentials, and stores only local preferences in your browser.

## Features

- Pomodoro phases: Work, Short break, Long break with configurable long-break cadence.
- Pause/resume without losing remaining time; jump to any phase instantly.
- Sound cues for first work start and automatic phase transitions.
- Spotify Premium Web Playback: login, next/prev, configurable break behavior (Pause / Quiet / Same), “Now Playing” pill (optional).
- YouTube ambience as full-screen background: paste your own video links (one per line), reorder by line order, loops continuously.
- Clean UI with grey theme and compact settings modal.

## Demo (local)

This app is intended to run locally so your Spotify credentials stay private.

## Prerequisites

- Node.js 18+ (for fetch, ESM-compatible dependencies)
- A Spotify Premium account
- A Spotify Developer App (to obtain Client ID/Secret)
- Modern desktop browser (Chrome/Edge/Firefox/Safari)

## Quick Start

1) Clone the repo
   - git clone https://github.com/AlexMM777/My-Study-Timer.git
   - cd My-Study-Timer
2) Install dependencies
   - npm install
3) Create a Spotify app
   - Go to https://developer.spotify.com/dashboard
   - Create an app; note the Client ID and Client Secret.
   - In your app settings, add this Redirect URI:
     - http://127.0.0.1:3000/auth/callback
4) Create your .env from the example cp .env.example .env
   - Edit .env and set:
       SPOTIFY_CLIENT_ID=your_client_id_here
       SPOTIFY_CLIENT_SECRET=your_client_secret_here
       SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/callback
       PORT=3000
5) Run the server
   - npm start
   - Open http://127.0.0.1:3000/ in your browser.

6) Connect Spotify
   - Click “Login with Spotify” once; the popup will close automatically.
   - The login button and status text will hide after the player is ready.
   - Press Start to begin the timer and resume music according to your break behavior setting.

## Using the App

- Start/Pause/Reset controls are below the timer.
- Jump to Work/Short/Long with the segmented control if you want to skip a phase.
- Click the gear icon to open Settings:
  - Durations for Work, Short, Long.
  - Short breaks before Long break (e.g., 4).
  - Break music behavior: Pause (stops music during breaks), Quiet (lower volume), or Same.
  - Show track info: On/Off to toggle the “Now Playing” pill.
  - Background videos: paste YouTube links, one per line; top plays first; remove lines to delete. Click Save to apply.

## Privacy & Security

- Do not commit your .env. This project includes .gitignore to keep it out of Git.
- The server reads Spotify secrets only from environment variables.
- No personal data is stored on the server; the app keeps preferences (e.g., background links) in your browser’s localStorage.

## Common Issues

- Background video paused at load:
  - The player is muted and attempts to autoplay on ready; some browsers still need a short initialization. A page refresh usually resolves it.
- Video looks low quality:
  - The script requests the highest quality available and nudges again after playback starts. Quality also depends on the source upload and your bandwidth.
- Spotify controls don’t work:
  - Ensure your Spotify account is Premium, the device “My Study Timer” is active (the app transfers playback automatically on first connect), and the page has focus.

## Project Structure
My-Study-Timer/
   public/
      index.html
      style.css
      script.js
      work_start.wav
      short_break.wav
      long_break.wav
   server.js
   package.json
   .env.example
   .gitignore
   README.md