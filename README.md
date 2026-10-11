# Chat Overlay

YouTube and Facebook live comments as an OBS Browser Source, with an admin console to moderate them, run giveaways and polls, and put widgets on stream.

## Install
Download the build for your system from the GitHub Releases page (built by `.github/workflows/build.yml`):

| System | File |
|---|---|
| Windows | `ChatOverlay-Setup-<version>-win-x64.exe` (installer) or `ChatOverlay-<version>-win-x64-portable.exe` |
| macOS | `ChatOverlay-<version>-mac-arm64.dmg` (Apple silicon) or `…-mac-x64.dmg` (Intel) |
| Linux | `ChatOverlay-<version>-linux-x86_64.AppImage` or `ChatOverlay-<version>-linux-amd64.deb` |

The builds are unsigned, so macOS and Windows warn on first launch. Steps for each system, headless/systemd mode and Docker are in [docs/INSTALL.md](docs/INSTALL.md). To publish a release, push a tag like `v1.0.0` ([docs/RELEASING.md](docs/RELEASING.md)).

## Run from source
```bash
npm install
npm start        # server only      (npm run dev restarts on code changes)
npm run app      # desktop app (Electron)
npm test
```
- Admin: `http://localhost:3000/admin`, sign in with your 6-digit PIN (**default `123456`, change it in Settings**).
- OBS: add a Browser source with `http://localhost:3000/overlay`, sized to your canvas (1920×1080).

## What it does
| Page | What it does |
|---|---|
| **Live** | Comment feed: spotlight, queue, show, star, hide, block, delete, mark questions answered; bulk select; pause; keyboard shortcuts (`?`). Auto/Manual mode and a live monitor of what OBS shows. |
| **Giveaway** | Winner picker from chat: raffle, first to type, closest number, most entries, quiz. Keywords, weighted entries, runners-up, claim timer, reroll, on-stream reveal, and a saved fair-draw proof. |
| **Engage** | Chat poll, countdown, Super Chat goal bar, word cloud, top chatters, and where each widget sits on screen. |
| **Automation** | Chat commands (`!rules`), auto-queue rules, slow mode, read-aloud, and remote-control links for Stream Deck. |
| **Sources** | Connect YouTube (no key) and Facebook (Page token). |
| **Design** | Six one-click looks, a full customizer with live preview, text-fit or full-width boxes, wrapping, per-scene looks. |
| **Filters** | Blocked words, links, length, SHOUTING, repeats, bots, blocked users. Held-back comments stay in History. |
| **History** | Every comment saved on disk, a stream summary, search, export CSV/JSON, delete by age. |
| **Settings** | OBS link builder (per scene, per widget), change PIN, backup and restore, theme. |

Blocking, hiding and filtering only affect your overlay. They never change YouTube or Facebook itself.

### OBS sources
`/overlay` draws everything. Narrow it down with query parameters (the Settings link builder writes these for you):
- `?show=chat,spotlight,giveaway,poll,goal,timer,wordcloud,leaderboard,alerts` draws only those parts.
- `?profile=Name` uses a saved look from Design, one per scene.

### Limits worth knowing
- YouTube Super Chats, Super Stickers and members are read from chat. Gifted-membership events are not exposed by the chat library, and Facebook Stars are not available through Facebook's comment stream (use "Add amount" on the goal).
- YouTube chat gives no subscriber status, so a giveaway cannot require "subscribed".
- Facebook only lets you read live comments on a Page you manage, with that Page's access token.

## Layout
```
server.js              entry (PORT, DATA_DIR)
electron/main.js       desktop wrapper (window, tray, single instance, --smoke-test)
src/app.js             wires the modules, owns the HTTP server
src/routes.js          core API (validation lives here)   src/routes-features.js  feature API, summary, backup, remote
src/auth.js            PIN, sessions, lockout
src/chat.js            incoming-comment pipeline + operator actions
src/overlay.js         what is on stream: messages, spotlight, queue, slow mode
src/features/          giveaway, poll, goal, word cloud, leaderboard, timer, commands
src/moderation.js      filter rules      src/store.js comments      src/eventlog.js giveaway/poll history
src/sources/           youtube.js, facebook.js
public/overlay.html    the OBS page      public/overlay/ widgets.js + widgets.css
public/admin/          the console: ES modules, no build step
```
Everything user-specific lives in `data/` (or the app's user-data folder): settings, PIN hash, Facebook token, sessions, comments.

## Security notes
- PIN is hashed (scrypt); wrong guesses lock out for longer each time. 6 digits is still weak, so don't expose this to the internet without HTTPS and, ideally, an access layer (VPN, Cloudflare Access).
- The desktop app listens on `127.0.0.1` only.
- `/overlay`, `/events` and `/overlay/*` are public by design (OBS can't sign in) but expose only what is already on screen. Remote links carry a secret key; regenerate it if it leaks.
- Backups never include the PIN. The Facebook token is included only if you tick the box.
