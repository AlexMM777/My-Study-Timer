# My Study Timer

A customizable Pomodoro timer with YouTube ambience and Spotify Premium controls. Runs locally with your own Spotify credentials, and stores only local preferences in your browser.

## Features

- Pomodoro Phases: Work, Short break, Long break with a configurable number of cycles before a long break.
- Full Timer Control: Pause/resume without losing remaining time, and jump to any phase instantly.
- Customizable Sound Cues: Plays sound cues for the first work start and automatic phase transitions. You can customize the sounds for work, short, and long breaks by pasting your own audio URLs in the settings.
- Spotify Premium Integration: Full playback control including login, next/prev track, and a configurable music behavior for breaks (Pause, Quiet, or Same Volume). Also includes an optional “Now Playing” pill.
- Custom YouTube Ambience: Use a list of YouTube links as a looping, full-screen background. The background video does not reset when saving other settings unless the links themselves are changed.
- Clean UI: A clean, medieval-inspired grey theme with a compact and organized settings modal.

## Demo (local)

This app is intended to run locally to ensure your Spotify credentials remain private.

## Prerequisites

    - Node.js 18+ (for fetch, ESM-compatible dependencies)
    - A Spotify Premium account
    - A Spotify Developer App (to obtain a Client ID)
    - A modern desktop browser (Chrome, Edge, Firefox, Safari)

## Quick Start

1) Clone the repo
    - git clone https://github.com/AlexMM777/My-Study-Timer.git
    - cd My-Study-Timer

2) Install dependencies
    - npm install

3) Create a Spotify app
    - Go to https://developer.spotify.com/dashboard.
    - Create a new app; note the Client ID (you do NOT need the Client Secret).
    - In your app's settings, add these Redirect URIs:
        - For local development: http://127.0.0.1:3000/callback
        - For Firebase deployment: https://my-study-timer.web.app/callback (replace with your Firebase URL)

4) Create your .env file
    - Copy the example file: cp .env.example .env
    - Edit .env and fill in your details:
        - SPOTIFY_CLIENT_ID=your_client_id_here
        - PORT=3000
    - Note: You no longer need SPOTIFY_CLIENT_SECRET. The app uses PKCE (Proof Key for Code Exchange) for secure authentication.

5) Run the server
    - npm start
    - Open http://127.0.0.1:3000/ in your browser.

6) Connect Spotify
    - Click "Login with Spotify" once. A popup will open for Spotify authentication.
    - After authorizing, the popup closes automatically and you're logged in.
    - The login button and status text will hide once the player is ready.
    - Press the Start button to begin the timer and music.

## Using the App

- Timer Controls: Use the main buttons below the timer to Start, Pause, or Reset.
- Jump Phases: Use the segmented control (Work | Short | Long) to skip the current phase and jump directly to another.
- Settings: Click the gear icon to open the settings modal. Here you can customize:
    - Durations: The length in minutes for Work, Short, and Long breaks.
    - Cycle Length: The number of short breaks to complete before a long break.
    - Break Music Behavior: Pause (stops music), Quiet (lowers volume), or Same.
    - Show Track Info: Toggles the "Now Playing" pill on or off.
    - Background Videos: Paste YouTube links, one per line. The order determines the playback sequence. The list will loop continuously.
    - Custom Sounds: Paste URLs for your own audio files for the work, short break, and long break sound cues. Leave these fields blank to use the default built-in sounds.

## Privacy & Security

- Do not commit your .env file. The project's .gitignore is configured to prevent this.
- **No Client Secret is stored or used.** This app uses the PKCE (Proof Key for Code Exchange) flow, which is specifically designed for public clients. Authentication is handled entirely on the client-side without needing a backend secret.
- All user preferences (durations, links, sound URLs) are stored only in your browser's localStorage.
- Access tokens and refresh tokens are stored securely in localStorage and used to authenticate with Spotify's API.

## Common Issues

- Background Video Paused on Load: The player is muted and attempts to autoplay. If a browser blocks it, a simple page refresh usually resolves it as the script retries on buffering.
- Video Looks Low Quality: The script repeatedly requests the highest quality available from YouTube. The final quality depends on the source video's resolution and your current network bandwidth.
- Spotify Controls Don’t Work: Ensure your Spotify account is Premium and that "My Study Timer" is the active device in Spotify. The app attempts to transfer playback automatically on the first connection.
- ECONNRESET Error: This is a network error that can occur when the server tries to contact Spotify's API. It is often temporary. Check that your firewall or VPN is not blocking Node.js, and ensure the Redirect URI in your .env file and Spotify dashboard are identical.

## Project Structure

- My-Study-Timer/
    - public/
        - index.html
        - callback.html (Spotify OAuth callback handler)
        - style.css
        - js/
            - main.js
            - spotify.js (PKCE authentication flow)
            - storage.js
            - timer.js
            - ui.js
            - youtube-bg.js
        - work_start.wav
        - short_break.wav
        - long_break.wav
    - server.js (Express server for local development)
    - package.json
    - .env.example
    - .gitignore
    - README.md


## Credits

- https://github.com/StanleySnyder
- https://github.com/omeryurekli