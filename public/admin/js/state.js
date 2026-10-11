// App state: the server's settings snapshot, kept fresh by the live event stream.
import { api } from './api.js'

export const state = { server: null, online: false } // server = GET /api/state

const subs = new Set()
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn) }
const notify = () => subs.forEach((fn) => fn(state.server))

// events other modules care about (comment, removed, refresh, connection)
const handlers = new Map()
export const bus = {
  on(evt, fn) { (handlers.get(evt) || handlers.set(evt, new Set()).get(evt)).add(fn); return () => handlers.get(evt).delete(fn) },
  emit(evt, data) { handlers.get(evt)?.forEach((fn) => fn(data)) },
}

export async function load() { state.server = await api.get('/api/state'); notify(); return state.server }
export function patch(partial) { Object.assign(state.server, partial); notify() }

let es
export function connect() {
  es?.close()
  es = new EventSource('/api/events')
  es.onopen = () => { state.online = true; bus.emit('connection', true); load().catch(() => {}) } // also resyncs after a drop
  es.onerror = async () => {
    state.online = false; bus.emit('connection', false)
    const me = await api.get('/api/auth/me').catch(() => null)
    if (me && !me.authed) { es.close(); window.dispatchEvent(new Event('auth:lost')) }
  }
  const on = (name, fn) => es.addEventListener(name, (e) => fn(JSON.parse(e.data)))
  on('status', (status) => { Object.keys(status).forEach((k) => (state.server.sources[k].status = status[k])); notify() })
  on('style', ({ profile, style }) => (profile ? patch({ profiles: { ...state.server.profiles, [profile]: style } }) : patch({ style })))
  on('feature', ({ kind, state: st }) => { state.server.features[kind] = st; notify() })
  on('mode', ({ mode }) => patch({ mode }))
  on('display', (display) => patch({ display }))
  on('highlight', ({ id, comment }) => patch({ highlighted: id, highlightedComment: comment }))
  on('queue', ({ ids, comments }) => patch({ queue: ids, queueComments: comments }))
  on('comment', (c) => bus.emit('comment', c))
  on('removed', (d) => bus.emit('removed', d))
  on('refresh', () => { bus.emit('refresh'); load().catch(() => {}) })
}
export const disconnect = () => { es?.close(); es = null; state.online = false }
