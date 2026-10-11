# Installing Chat Overlay

Chat Overlay runs a small web server on your computer. Open the **admin console** to connect a YouTube/Facebook live,
and paste the **overlay link** into an OBS Browser Source.

- Admin: `http://127.0.0.1:3000/admin` (the desktop app opens it for you)
- OBS overlay: `http://127.0.0.1:3000/overlay` (tray menu: **Copy OBS link**)
- Default PIN is `123456`. Change it in Settings.

The desktop app only listens on `127.0.0.1` (this computer). If port 3000 is busy it picks a free port; use
**Copy OBS link** from the tray icon to get the exact URL. Closing the window keeps the server running in the
tray (OBS keeps working); use tray **Quit** to stop it. Your settings live in the app's user-data folder
(`data/` inside it), so updating or reinstalling keeps them.

Downloads are on the project's GitHub **Releases** page. Verify with `SHA256SUMS.txt` if you like.

> These builds are **not code-signed**. Windows and macOS will warn you the first time. That is expected.

## Windows

Pick one:

- **Installer** `ChatOverlay-Setup-<version>-win-x64.exe`: run it, choose a folder, finish. Creates Desktop and
  Start-menu shortcuts.
- **Portable** `ChatOverlay-<version>-win-x64-portable.exe`: no install; run it from anywhere (USB stick, etc.).

If SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.

Optional: tray icon, right-click, **Start with system**.

## macOS

Download the `.dmg` for your Mac: `arm64` for Apple Silicon (M1/M2/M3/M4), `x64` for Intel. (`.zip` builds are the same app.)

1. Open the dmg and drag **Chat Overlay** to **Applications**.
2. First launch: macOS blocks unsigned apps. **Right-click** (or Control-click) the app, choose **Open**, then **Open**
   again in the dialog. You only need to do this once.
3. If macOS says the app "is damaged and can't be opened" (common for downloaded unsigned apps), remove the quarantine flag:

   ```sh
   xattr -dr com.apple.quarantine "/Applications/Chat Overlay.app"
   ```

   Or: System Settings, Privacy & Security, scroll down, **Open Anyway**.

The app lives in the menu bar; closing the window keeps the server running. Quit from the menu bar icon or Cmd+Q.

## Linux

### AppImage (any distro)

```sh
chmod +x ChatOverlay-<version>-linux-x86_64.AppImage   # exact file name may differ slightly
./ChatOverlay-<version>-linux-x86_64.AppImage
```

If it does not start, install FUSE 2 (`sudo apt install libfuse2` on Ubuntu 22.04+; `libfuse2t64` on 24.04), or run with
`--appimage-extract-and-run`. The AppImage starts without Chromium's process sandbox, because Ubuntu 24.04 blocks the
unprivileged user namespaces it needs; the app only loads its own local pages, so this is acceptable.

### Debian / Ubuntu `.deb`

```sh
sudo apt install ./ChatOverlay-<version>-linux-amd64.deb   # exact file name may differ slightly
chat-overlay
```

It also appears in your application menu (Audio/Video). A tray icon needs a system-tray extension on GNOME
(e.g. AppIndicator); without one, closing the window hides it and you must quit with `pkill chat-overlay`.

### Headless mode (no desktop): systemd user service

Needs Node 20+ and a checkout of this repo (`npm ci --omit=dev`). Create `~/.config/systemd/user/chat-overlay.service`:

```ini
[Unit]
Description=Chat Overlay

[Service]
WorkingDirectory=%h/chat-overlay
Environment=PORT=3000 DATA_DIR=%h/.local/share/chat-overlay
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now chat-overlay
loginctl enable-linger "$USER"   # keep it running when you are logged out
```

Note `node server.js` listens on **all interfaces** (it does not bind 127.0.0.1 only). Firewall it, or put it behind a
reverse proxy, and change the default PIN.

### Docker

```sh
docker compose up -d --build        # http://127.0.0.1:3000/admin
```

Data is kept in the `chat-overlay-data` volume. The compose file publishes the port on `127.0.0.1` only; to reach it
from other machines change it to `"3000:3000"` in `docker-compose.yml` and **change the default PIN first**.
Plain Docker: `docker build -t chat-overlay . && docker run -d -p 127.0.0.1:3000:3000 -v chat-overlay-data:/data chat-overlay`.

## Running from source

```sh
npm ci
npm run app      # desktop window
npm start        # headless server on :3000
npm run smoke    # boots the desktop app without a window and checks the endpoints
```
