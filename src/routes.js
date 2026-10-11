// API surface. Each route: [method, path, { auth, handle(ctx) }]. Handlers return JSON or throw HttpError.
const { HttpError } = require('./http')
const { DEFAULT_STYLE } = require('./config')
const check = require('./moderation')

const ANIM = ['slide', 'pop', 'left', 'right', 'fade', 'none']
const ENUMS = { animation: ANIM, animationOut: ANIM, position: ['bottom', 'top'], spotPosition: ['top', 'center'], boxWidth: ['fit', 'full'], align: ['left', 'center', 'right'], layout: ['inline', 'stacked', 'card', 'chip', 'compact'], nameColorBy: ['fixed', 'role', 'platform'] }
const RANGES = { fontSize: [10, 160], bgOpacity: [0, 100], radius: [0, 80], maxMessages: [1, 30], fadeSeconds: [0, 600], spotSize: [16, 200], spotSeconds: [0, 600], maxWidth: [20, 100] }

// keep only known keys with the right type and sane values
function cleanStyle(input = {}) {
  const out = {}
  for (const [k, def] of Object.entries(DEFAULT_STYLE)) {
    let v = input[k]
    if (typeof def === 'number') {
      v = Number(v); const [lo, hi] = RANGES[k] || [0, 1e4]
      out[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def
    } else if (typeof def === 'boolean') out[k] = typeof v === 'boolean' ? v : def
    else if (ENUMS[k]) out[k] = ENUMS[k].includes(v) ? v : def
    else if (/Color$/.test(k)) out[k] = /^#[0-9a-f]{6}$/i.test(v) ? v : def
    else out[k] = typeof v === 'string' ? v.slice(0, k === 'customCss' ? 8000 : 300) : def
  }
  return out
}
const list = (a, max = 500) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x).trim().slice(0, 100)).filter(Boolean))].slice(0, max)
const cleanFilters = (f = {}) => ({
  words: list(f.words), bots: list(f.bots, 100),
  links: !!f.links, exemptStaff: f.exemptStaff !== false,
  maxLength: Math.max(0, Math.min(2000, Math.round(Number(f.maxLength)) || 0)),
  maxCapsPercent: Math.max(0, Math.min(100, Math.round(Number(f.maxCapsPercent)) || 0)),
  blockRepeats: !!f.blockRepeats,
})
const ACTIONS = new Set(['show', 'highlight', 'unhighlight', 'queue', 'unqueue', 'star', 'unstar', 'answer', 'unanswer', 'hide', 'unhide', 'delete', 'block', 'unblock'])
const PROFILE = /^[\w -]{1,30}$/

module.exports = function createRoutes({ config, auth, hub, store, overlay, chat, sources, features, log }) {
  const ok = { ok: true }
  const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg) }
  const withCookie = (r) => { need(!r.error, r.status, r.error); return { body: ok, headers: { 'Set-Cookie': r.cookie } } }

  const state = () => ({
    defaultPin: auth.isDefaultPin(),
    sources: {
      youtube: { input: config.youtube.input, status: sources.status.youtube },
      facebook: { videoId: config.facebook.videoId, hasToken: !!config.facebook.token, status: sources.status.facebook },
    },
    style: config.style, profiles: config.profiles, mode: config.mode, filters: config.filters, blocked: config.blocked,
    display: config.display, autoQueue: config.autoQueue, remoteKey: config.remoteKey,
    features: features.states(),
    ...overlay.state(), stored: store.count(),
  })

  const R = []
  const route = (method, path, auth, handle, opts = {}) => R.push({ method, path, auth, handle, ...opts })

  // ---- auth (PIN only) ----
  route('GET', '/api/auth/me', false, ({ req }) => ({ authed: auth.isAuthed(req), defaultPin: auth.isDefaultPin() }))
  route('POST', '/api/auth/login', false, ({ req, body }) => withCookie(auth.login(body.pin, req.socket.remoteAddress)))
  route('POST', '/api/auth/logout', true, ({ req }) => ({ body: ok, headers: { 'Set-Cookie': auth.logout(req) } }))
  route('POST', '/api/auth/pin', true, ({ req, body }) => withCookie(auth.changePin(body.current, body.next, req.socket.remoteAddress)))
  route('POST', '/api/auth/logout-all', true, () => ({ body: ok, headers: { 'Set-Cookie': auth.logoutEverywhere() } }))

  // ---- state + live feed ----
  route('GET', '/api/state', true, state)
  route('GET', '/api/events', true, ({ req, res }) => { hub.admin.subscribe(req, res); return null })

  // ---- sources ----
  route('POST', '/api/sources/connect', true, ({ body }) => {
    need(sources.names.includes(body.source), 400, 'unknown source')
    if (body.source === 'youtube') config.youtube.input = String(body.input || '').trim()
    else {
      config.facebook.videoId = String(body.videoId || '').trim()
      if (body.token) config.facebook.token = String(body.token).trim()
    }
    config.save()
    sources.start(body.source)
    return state()
  })
  route('POST', '/api/sources/disconnect', true, ({ body }) => {
    need(sources.names.includes(body.source), 400, 'unknown source')
    sources.stop(body.source)
    return state()
  })

  // ---- look, mode, filters ----
  route('POST', '/api/style', true, ({ body }) => {
    const profile = body.profile ? String(body.profile) : ''
    need(!profile || PROFILE.test(profile), 400, 'profile names use letters, numbers, spaces, - and _ (max 30)')
    if (profile) {
      need(profile in config.profiles || Object.keys(config.profiles).length < 20, 400, 'at most 20 profiles')
      config.profiles[profile] = cleanStyle(body.style)
    } else config.style = cleanStyle(body.style)
    config.save()
    const payload = { profile, style: profile ? config.profiles[profile] : config.style }
    hub.overlay.emit('style', payload)
    hub.admin.emit('style', payload)
    return state()
  })
  route('POST', '/api/mode', true, ({ body }) => {
    need(body.mode === 'auto' || body.mode === 'manual', 400, 'mode must be auto or manual')
    config.mode = body.mode; config.save(); hub.admin.emit('mode', { mode: config.mode })
    return state()
  })
  route('POST', '/api/filters/test', true, ({ body }) => { // would this comment be held back by the saved filters?
    const c = { name: String(body.name || 'Viewer'), badge: String(body.badge || ''), text: String(body.text || '') }
    return { flag: check(c, config.filters) }
  })
  route('POST', '/api/filters', true, ({ body }) => {
    config.filters = cleanFilters(body.filters); config.save()
    return state()
  })

  // ---- comments ----
  route('GET', '/api/comments', true, ({ url }) => {
    const stream = url.searchParams.get('stream') || ''
    const limit = Math.min(5000, Number(url.searchParams.get('limit')) || 1000)
    return { comments: store.query({ stream, limit }).map(chat.view), streams: store.streams() }
  })
  route('POST', '/api/comments/action', true, ({ body }) => {
    need(ACTIONS.has(body.action), 400, 'unknown action')
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 2000).map(String) : [String(body.id)]
    if (body.action === 'unblock' && body.uid) return chat.unblock(String(body.uid)) && ok
    const done = ids.filter((id) => chat.act(id, body.action)).length
    need(done > 0, 400, 'unknown comment')
    return { ok: true, done }
  })
  route('POST', '/api/comments/prune', true, ({ body }) => {
    const days = Number(body.days)
    need(days >= 0 && Number.isFinite(days), 400, 'days required')
    const n = store.prune(Date.now() - days * 864e5, body.stream ? String(body.stream) : '')
    hub.admin.emit('refresh', {})
    return { ok: true, removed: n }
  })
  route('POST', '/api/comments/clear', true, ({ body }) => {
    overlay.highlight(null)
    store.clear(body.stream ? String(body.stream) : '')
    hub.admin.emit('refresh', {})
    return ok
  })
  route('GET', '/api/comments/export', true, ({ url }) => {
    const stream = url.searchParams.get('stream') || ''
    const json = url.searchParams.get('format') === 'json'
    return {
      raw: json ? JSON.stringify(store.query({ stream, limit: 1e9 }), null, 2) : store.csv(stream),
      type: json ? 'application/json' : 'text/csv; charset=utf-8',
      headers: { 'Content-Disposition': `attachment; filename="comments.${json ? 'json' : 'csv'}"` },
    }
  })

  // ---- overlay controls ----
  route('POST', '/api/overlay/clear', true, () => { overlay.clear(); return ok })
  route('POST', '/api/overlay/chat', true, ({ body }) => { // hide or show the whole chat list on stream
    features.setChatHidden(!!body.hidden)
    return state()
  })
  route('POST', '/api/overlay/next', true, () => { overlay.next(); return ok })
  route('POST', '/api/overlay/unhighlight', true, () => { overlay.highlight(null); return ok })
  route('POST', '/api/overlay/test', true, ({ body }) => {
    chat.ingest({
      platform: body.platform === 'facebook' ? 'facebook' : 'youtube', stream: 'test', name: 'Test Viewer', avatar: '',
      parts: [{ text: String(body.text || 'Hello from the admin panel!').slice(0, 500) }], badge: '',
      ...(body.paid ? { money: { amount: 5, currency: '$', text: '$5.00', color: '#1e88e5' } } : {}), // preview a Super Chat
    })
    return ok
  })

  const fr = require('./routes-features')({ config, hub, store, overlay, chat, features, log, route, need, ok, state, helpers: { cleanStyle, cleanFilters } })
  R.summary = fr.summary
  R.remote = fr.remote
  R.ensureKey = fr.ensureKey
  return R
}
module.exports.cleanStyle = cleanStyle
module.exports.cleanFilters = cleanFilters
