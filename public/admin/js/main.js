// Boot: theme, then either the PIN screen or the app.
import { api } from './api.js'
import { applyTheme } from './theme.js'
import { load, connect, disconnect } from './state.js'
import { renderLogin } from './login.js'
import { renderShell } from './shell.js'
import live from './pages/live.js'
import sources from './pages/sources.js'
import design from './pages/design.js'
import filters from './pages/filters.js'
import history from './pages/history.js'
import settings from './pages/settings.js'
import giveaway from './pages/giveaway.js'
import engage from './pages/engage.js'
import automation from './pages/automation.js'

applyTheme()
const root = document.getElementById('app')
const pages = { live, giveaway, engage, automation, sources, design, filters, history, settings }
let teardown = null

async function start() {
  teardown?.(); teardown = null; disconnect()
  const me = await api.get('/api/auth/me').catch(() => ({ authed: false }))
  if (!me.authed) return renderLogin(root, start)
  await load()
  connect()
  teardown = renderShell(root, pages)
}

window.addEventListener('auth:lost', () => { if (teardown) start() }) // session expired or signed out elsewhere
start()
