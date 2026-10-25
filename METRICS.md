# Optional study tracking

The timer works without signing in. Google or email/password sign-in enables private study, break and pause history. Spotify authorization is independent. The existing Standard `(default)` Firestore database and Firebase Authentication are used; no Functions, billing upgrade or database migration is required.

## Behavior

- Timestamp-based timing starts breaks automatically after work. By default, a finished short or long break waits for Start before the next study session; this waiting time is excluded from metrics. Settings > After a break can restore automatic study starts, saved on this device. Background tabs count. A callback gap over two minutes or a backwards clock change pauses the timer without crediting the uncertain gap. This is a conservative heuristic: browser suspension can cause undercounting, and short sleeps can still count.
- Only signed-in activity is recorded, starting when tracking becomes ready. Initial idle and reset idle are excluded. Each user-initiated pause is capped at 30 minutes, even when switching phases while paused.
- Local IndexedDB checkpoints run every five seconds when callbacks are available and on state/visibility changes. Refresh/reopen restores the last persisted timer checkpoint, paused. Browser shutdown delivery is not guaranteed; clearing browser storage can lose pending data.
- Cloud saves happen at phase completion, manual phase change, reset, sign-out, and after a pause lasts one minute. Start/resume, opening statistics, switching tabs, and uninterrupted sessions do not trigger periodic activity saves. Event saves are coalesced with a two-second delay and one-minute cooldown. Sign-out and recovery/reconnect can bypass that cooldown.
- Pending activity retries on the next session event, reconnection or reopening with the same account. Successful server acknowledgement is required before removing it locally. There is no endless retry timer. A single tab holds an account-specific Web Lock; other tabs can read statistics. Browsers without Web Locks cannot record metrics safely and show an explanation.

## Storage and correctness

Private namespace: `studyMetricsV1/{uid}`. The profile stores schema version 1, an immutable IANA time zone selected from the browser at first setup, and a weekly goal in seconds (default five hours). Weeks run Monday–Sunday. Ten study minutes qualify a streak day; an unfinished current day does not break yesterday's streak.

`hours/{day}_{hourStart}` stores a 3,600-character coverage string aligned to a UTC hour, additionally split at local midnight. Each character represents one second: 0 idle, 1 pause, 2 break, 3 study. Pointwise maximum merges are associative, commutative and idempotent, so old uploads cannot erase newer coverage and overlapping devices cannot inflate totals. The priority is study, then break, then pause. No unbounded daily interval arrays or per-tick cloud documents are used.

`days/{date}` stores only study/break/pause seconds. Small online transactions merge up to eight hourly shards, calculate category deltas and update the affected daily summaries atomically. Coverage fields are not indexed. An unchanged replay performs no document writes. A clock-hour-aligned 50/10 cycle uses four activity document writes; boundaries, extra transitions, account creation and goal edits can increase that number. The local `cloudWrites` diagnostic counts acknowledged activity-document writes from this device, not total project usage.

The dashboard loads daily summaries on demand and hourly history in pages of 48 records. It has no permanent history listeners. Time-of-day charts explicitly describe the loaded history. The timer's current local activity appears without triggering saves. Firebase history uses an in-memory cache; only the account-scoped pending queue, preferences and recovery checkpoint persist locally.

Rules authorize by UID in the path, reject unknown fields, validate both creates and updates, bound payload sizes, and deny deletes and all legacy collection access. Existing legacy data remains untouched. These are prototype rules reviewed with automated owner/guest/cross-account tests. Personal client measurements are not tamper-proof scores; these rules do not prove that a person actually studied or enforce perfect aggregate consistency against a modified client.

## Verification and release

Run `npm test` for timing, overlap, DST, local recovery, account isolation and event scheduling. Run `npm run test:emulator` with local Firestore on 8080 and Auth on 9099 for actual transaction, security and account-flow tests. Firebase CLI emulators need Java 21 or newer. Start the app through the Hosting emulator on 5000 and append `?emulators=1` to connect to local services; this switch is accepted only on localhost/127.0.0.1.

Before release, record the current Hosting version and ruleset, run all checks, and deploy Firestore rules/index configuration before Hosting. Existing provider configuration and Spotify `/callback` are preserved. Roll back Hosting on a critical loading failure; leave secure metrics data in place. Real Google popup consent, verification/reset email delivery and Spotify Premium playback still require an appropriate real account to validate beyond the emulator.
