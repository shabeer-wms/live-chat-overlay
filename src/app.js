// Wires the modules together and owns the HTTP server.
const http = require('node:http')
const path = require('node:path')
const createConfig = require('./config')
const createAuth = require('./auth')
const createHub = require('./hub')
const createStore = require('./store')
const createOverlay = require('./overlay')
const createChat = require('./chat')
const createSources = require('./sources')
const createRoutes = require('./routes')
const createFeatures = require('./features')
const createEventLog = require('./eventlog')
const { send, readJson, serveStatic, HttpError } = require('./http')

const PUBLIC = path.join(__dirname, '..', 'public')

module.exports = function createApp(dataDir) {
  const config = createConfig(dataDir)
  const hub = createHub()
  const store = createStore(dataDir)
  const auth = createAuth(config, dataDir)
  const log = createEventLog(dataDir)
  const overlay = createOverlay({ config, store, hub })
  const features = createFeatures({ config, store, hub, log, overlay })
  const chat = createChat({ config, store, hub, overlay, features })
  const sources = createSources({ config, chat, hub })
  const routes = createRoutes({ config, auth, hub, store, overlay, chat, sources, features, log })
  routes.ensureKey()
  features.start()

  // /remote/<key>/<action...>: for Stream Deck and similar; GET or POST
  function remote(res, p) {
    const [, , key, ...rest] = p.split('/')
    const r = routes.remote(key, rest.join('/'))
    return r === true ? send(res, 200, { ok: true }) : send(res, r === false ? 403 : 404, { error: r === false ? 'bad key' : 'unknown action' })
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x')
    const p = url.pathname

    // pages
    if (req.method === 'GET') {
      if (p === '/') return send(res, 302, '', 'text/plain', { Location: '/admin' })
      if (p === '/overlay') return serveStatic(res, PUBLIC, 'overlay.html', 'overlay') || send(res, 404, 'not found', 'text/plain')
      if (p === '/events') { // public: OBS can't log in
        const profile = url.searchParams.get('profile') || ''
        return hub.overlay.subscribe(req, res, [...overlay.hello(profile), ...features.hello()])
      }
      if (p.startsWith('/overlay/') && serveStatic(res, PUBLIC, p.slice(1), 'overlay')) return
      if (p.startsWith('/remote/')) return remote(res, p)
      if (p === '/admin' || p === '/admin/') return serveStatic(res, PUBLIC, 'admin/index.html', 'admin')
      if (p.startsWith('/admin/') && serveStatic(res, PUBLIC, p.slice(1), 'admin')) return
    }

    if (req.method === 'POST' && p.startsWith('/remote/')) return remote(res, p)

    const r = routes.find((x) => x.method === req.method && x.path === p)
    if (!r) return send(res, 404, { error: 'not found' })
    if (r.auth && !auth.isAuthed(req)) return send(res, 401, { error: 'login' })

    let body = {}
    if (req.method === 'POST') {
      if (!(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'JSON only')
      body = await readJson(req, r.bodyLimit)
    }
    const out = await r.handle({ req, res, url, body })
    if (out === null) return // handler took over the response (SSE)
    if (out?.raw !== undefined) return send(res, 200, out.raw, out.type, out.headers)
    if (out?.body) return send(res, 200, out.body, 'application/json', out.headers)
    send(res, 200, out ?? { ok: true })
  }

  const server = http.createServer((req, res) => handle(req, res).catch((e) => {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message })
    console.error(e); send(res, 500, { error: 'server error' })
  }))

  return {
    server, config, store, auth, overlay, chat, sources, features, log,
    // host: omit for all interfaces; pass '127.0.0.1' to keep it on this computer only
    listen(port, host) {
      const ready = () => {
        console.log(`Overlay (OBS):  http://localhost:${server.address().port}/overlay`)
        console.log(`Admin:          http://localhost:${server.address().port}/admin`)
        sources.startConfigured()
      }
      host ? server.listen(port, host, ready) : server.listen(port, ready)
      return server
    },
  }
}
