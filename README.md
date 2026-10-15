# My Study Timer

A customizable Pomodoro timer with YouTube ambience and Spotify Premium controls. Runs locally with your own Spotify credentials, and stores only local preferences in your browser.

## Features

- Pomodoro Phases: Work, Short break, Long break with a configurable number of cycles before a long break.
- Timer Control: Pause/resume without losing remaining time, and jump to any phase.
- Customizable Sound Cues: Plays sound cues for the first work start and automatic phase transitions (Customizable sounds for work, short, and long breaks by pasting your own audio URLs in the settings).
- Integrated Spotify Premium: Playback control with login, next/prev track, and configurable music behavior for breaks (Pause, Quiet, or Same Volume).
- Custom YouTube Background: Use a list of YouTube links for looping backgrounds.

## Demo (local)

App for local use so your Spotify credentials and tokens remain private.

## Prerequisites

    - Node.js 18+ (for fetch, ESM-compatible dependencies)
    - A Spotify Premium account
    - A Spotify Developer App (for Client ID)
    - Desktop browser (Chrome, Edge, Firefox, Safari)

## Quick Start

1) Clone the repo
    - git clone https://github.com/AlexMM777/My-Study-Timer.git
    - cd My-Study-Timer

2) Install dependencies
    - npm install

3) Create a Spotify app
    - Go to https://developer.spotify.com/dashboard.
    - Create a new app and copy the Client ID.
    - In your app's settings, add these Redirect URIs:
        - Local development: http://127.0.0.1:3000/callback
        - Firebase deployment: https://my-study-timer.web.app/callback

4) Create your .env file
    - Copy .env.example into .env
    - Edit .env and set:
        - PORT=3000
5) Modify your Client ID
    - Inside spotfy.js and callback.html:
        - CLIENT_ID=your_client_id_here

6) Run the server
    - npm start
    - Open http://127.0.0.1:3000/ in your browser.

7) Connect Spotify
    - Click "Login with Spotify". A popup will prompt for authentication.
    - On approval, the popup closes and you're logged in.
    - Press Start to begin the timer and music.

## Using the App

- Timer Controls: Use the main buttons below the timer to Start, Pause, or Reset.
- Jump Phases: Use the control (Work | Short | Long) to skip the current phase and jump to another.
- Settings (Gear Icon):
    - Durations: The length in minutes for Work, Short, and Long breaks.
    - Cycle Length: The number of short breaks to complete before a long break.
    - Break Music: Select Pause (stops music), Quiet (lowers volume), or Same (full volume) for breaks.
    - Show Track Info: Toggles the "Now Playing" pill on or off.
    - Background Videos: Paste YouTube links, one per line. The order determines the playback sequence. The list will loop continuously.
    - Custom Sounds: Paste URLs for your own audio files for the work, short break, and long break sound cues. Leave these fields blank to use the default built-in sounds.

## Privacy & Security

- This uses the PKCE (Proof Key for Code Exchange) flow, so authentication is client-only.
- All user preferences (durations, links, sound URLs) are stored in your browser's localStorage.
- Access tokens and refresh tokens are stored in localStorage and used to authenticate with Spotify's API.

## Common Issues

- Background Video Paused on Load: The player is muted and attempts to autoplay. If a browser blocks it, a simple page refresh usually resolves it as the script retries on buffering.
- Low Video Quality: The app requests the highest video quality, but playback depends on the YouTube original and network speed.
- Spotify Controls Don’t Work: Ensure your Spotify account is Premium and that "My Study Timer" is the active device in Spotify. The app attempts to transfer playback automatically on the first connection. If fail to connect, check if browser privacy settings, content-blocking extensions, or network restrictions are blocking Spotify's playback services.
- ECONNRESET Error: Usually temporary. Double-check your firewall, VPN, and that all Redirect URIs in Spotify dashboard and .env match exactly.

## Project Structure

- My-Study-Timer/
    - public/
        - index.html
        - callback.html
        - style.css
        - js/
            - main.js
            - spotify.js
            - storage.js
            - timer.js
            - ui.js
            - youtube-bg.js
        - work_start.wav
        - short_break.wav
        - long_break.wav
    - server.js
    - package.json
    - .env.example
    - .gitignore
    - README.md


## Credits

- https://github.com/StanleySnyder
- https://github.com/omeryurekli
