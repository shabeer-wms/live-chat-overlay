// Desktop wrapper: runs the overlay server in-process and shows the admin console in a window.
// The server keeps running when the window is closed (OBS needs it); quit from the tray / app menu.
const { app, BrowserWindow, Menu, Tray, clipboard, nativeImage, shell } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SMOKE = process.argv.includes('--smoke-test')
const HOST = '127.0.0.1' // never exposed on the LAN
const PREFERRED_PORT = 3000

// Ubuntu 24.04+ blocks unprivileged user namespaces, which Chromium's sandbox needs. An AppImage
// cannot ship a setuid chrome-sandbox helper, so run it without the Chromium process sandbox
// (the renderer still loads only our own localhost UI). Same when running as root.
if (process.platform === 'linux' && (process.env.APPIMAGE || process.getuid?.() === 0)) {
  app.commandLine.appendSwitch('no-sandbox')
}

if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chatoverlay-smoke-')))

let win = null
let tray = null
let url = null // http://127.0.0.1:<port>
let quitting = false
let backend = null

function startServer(dataDir) {
  const createApp = require('../server')
  backend = createApp(dataDir)
  const { server } = backend
  return new Promise((resolve, reject) => {
    const onListening = () => resolve(`http://${HOST}:${server.address().port}`)
    let retried = false
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && !retried && !SMOKE) {
        retried = true
        server.removeAllListeners('listening') // drop the failed attempt's startup callback
        server.once('listening', onListening)
        backend.listen(0, HOST)
        return
      }
      reject(e)
    })
    server.once('listening', onListening)
    backend.listen(SMOKE ? 0 : PREFERRED_PORT, HOST)
  })
}

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, title: 'Chat Overlay', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.loadURL(`${url}/admin`)
  const external = (u) => { if (/^https?:/i.test(u)) shell.openExternal(u) }
  win.webContents.setWindowOpenHandler(({ url: u }) => { external(u); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, u) => {
    if (new URL(u).origin !== new URL(url).origin) { e.preventDefault(); external(u) }
  })
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide() } }) // keep serving
}

function buildTray() {
  const mac = process.platform === 'darwin'
  const icon = nativeImage.createFromPath(path.join(__dirname, mac ? 'trayTemplate.png' : 'tray.png'))
  tray = new Tray(mac ? icon : icon.resize({ width: 24, height: 24 }))
  tray.setToolTip('Chat Overlay')
  const loginItems = process.platform === 'win32' || mac
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open admin', click: showWindow },
    { label: 'Copy OBS link', click: () => clipboard.writeText(`${url}/overlay`) },
    { label: 'Open in browser', click: () => shell.openExternal(`${url}/admin`) },
    ...(loginItems ? [{
      label: 'Start with system', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    }] : []),
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setContextMenu(menu())
  tray.on('click', showWindow)
  tray.on('right-click', () => tray.setContextMenu(menu())) // refresh the login-item checkbox
}

function buildMenu() {
  const mac = process.platform === 'darwin'
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : [{ role: 'fileMenu' }]),
    { role: 'editMenu' }, // copy/paste in the admin forms
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]))
}

// ---- smoke test: boot, hit the real endpoints, print SMOKE OK, exit 0 (else exit 1) ----
async function smoke() {
  const fail = (msg) => { throw new Error(msg) }
  const dataDir = path.join(app.getPath('userData'), 'data')
  if (dataDir.includes('.asar')) fail('data dir is inside the asar')
  const base = await startServer(dataDir)
  const get = async (p, want) => {
    const r = await fetch(base + p)
    const t = await r.text()
    if (r.status !== 200) fail(`GET ${p} -> ${r.status}`)
    if (!want.test(t)) fail(`GET ${p}: unexpected content`)
  }
  await get('/api/auth/me', /defaultPin/)
  await get('/overlay', /<html/i)
  await get('/admin', /<html/i)
  await get('/admin/js/main.js', /\S{20}/)
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '123456' }),
  })
  if (r.status !== 200) fail(`POST /api/auth/login -> ${r.status}`)
  if (!fs.existsSync(dataDir)) fail('server did not write to the data dir')
}

if (SMOKE) {
  // --smoke-out <file>: also write the verdict to a file (Windows GUI apps don't reliably print to a pipe)
  const outIdx = process.argv.indexOf('--smoke-out')
  const outFile = outIdx > 0 ? process.argv[outIdx + 1] : ''
  const done = (code, msg) => {
    console.log(msg)
    if (outFile) try { fs.writeFileSync(outFile, msg + '\n') } catch {}
    backend?.server.close(); app.exit(code)
  }
  const timer = setTimeout(() => done(1, 'SMOKE FAIL: timeout after 30s'), 30000)
  app.whenReady().then(smoke).then(
    () => { clearTimeout(timer); done(0, 'SMOKE OK') },
    (e) => { clearTimeout(timer); done(1, `SMOKE FAIL: ${e.message}`) },
  )
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('activate', showWindow) // macOS dock click
  app.on('before-quit', () => { quitting = true })
  // keep running with no windows: the server and tray live on
  app.on('window-all-closed', () => {})
  app.whenReady().then(async () => {
    buildMenu()
    try {
      url = await startServer(path.join(app.getPath('userData'), 'data'))
    } catch (e) {
      require('electron').dialog.showErrorBox('Chat Overlay could not start', String(e.message || e))
      return app.exit(1)
    }
    buildTray()
    createWindow()
  })
}
