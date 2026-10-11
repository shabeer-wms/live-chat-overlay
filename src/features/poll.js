// Chat poll: viewers vote by typing an option's key (1, 2, A...) as their whole comment.
const crypto = require('node:crypto')

const DEFAULTS = { question: 'What next?', options: [{ key: '1', label: 'Option one' }, { key: '2', label: 'Option two' }], seconds: 0, allowChange: true }
const norm = (s) => String(s).toLowerCase().trim()

function cleanSettings(input = {}, base = DEFAULTS) {
  const s = { ...base, ...input }
  const seen = new Set()
  const options = (Array.isArray(s.options) ? s.options : []).map((o, i) => ({
    key: String(o.key ?? i + 1).trim().slice(0, 12), label: String(o.label ?? '').trim().slice(0, 60),
  })).filter((o) => o.key && o.label && !seen.has(norm(o.key)) && seen.add(norm(o.key))).slice(0, 8)
  return {
    question: String(s.question || DEFAULTS.question).slice(0, 140),
    options: options.length >= 2 ? options : DEFAULTS.options,
    seconds: Math.min(86400, Math.max(0, Math.round(Number(s.seconds)) || 0)),
    allowChange: s.allowChange !== false,
  }
}

module.exports = function createPoll({ config, store, log, isBlocked }) {
  let p = null, closeTimer = null, notify = () => {}, timer = null

  const settings = () => cleanSettings(config.poll)
  const publish = (now) => {
    if (now) { clearTimeout(timer); timer = null; return notify() }
    if (!timer) timer = setTimeout(() => { timer = null; notify() }, 400)
  }

  function vote(m) {
    if (!p || p.phase !== 'open' || m.hidden || isBlocked(m.uid)) return
    let t = norm(m.text).replace(/^(!vote\s+|vote\s+|!)/, '')
    const i = p.options.findIndex((o) => norm(o.key) === t)
    if (i < 0) return
    if (p.votes.has(m.uid) && !p.allowChange) return
    p.votes.set(m.uid, i)
    publish()
  }

  const counts = () => {
    const c = p.options.map(() => 0)
    for (const i of p.votes.values()) c[i]++
    return c
  }
  const view = () => {
    if (!p) return null
    const c = counts(), total = c.reduce((a, b) => a + b, 0), top = Math.max(...c)
    return {
      phase: p.phase, question: p.question, total, endsAt: p.endsAt,
      options: p.options.map((o, i) => ({ key: o.key, label: o.label, votes: c[i], percent: total ? Math.round((c[i] / total) * 100) : 0, leading: p.phase === 'closed' && total > 0 && c[i] === top })),
    }
  }

  function open(input) {
    clearTimeout(closeTimer)
    const s = cleanSettings(input, settings())
    config.poll = s; config.save()
    p = { id: crypto.randomUUID(), phase: 'open', ...s, votes: new Map(), endsAt: 0, stream: store.streams()[0]?.stream || '' }
    if (s.seconds) { p.endsAt = Date.now() + s.seconds * 1000; closeTimer = setTimeout(close, s.seconds * 1000) }
    publish(true)
  }
  function close() {
    if (!p || p.phase !== 'open') return
    clearTimeout(closeTimer)
    p.phase = 'closed'; p.endsAt = 0
    const v = view()
    log.add({ kind: 'poll', id: p.id, stream: p.stream, question: p.question, total: v.total, options: v.options.map(({ key, label, votes, percent }) => ({ key, label, votes, percent })) })
    publish(true)
  }
  function reset() { clearTimeout(closeTimer); p = null; publish(true) }

  return {
    DEFAULTS, vote, open, close, reset,
    saveSettings(input) { config.poll = cleanSettings(input, settings()); config.save(); publish(true) },
    onChange(fn) { notify = fn },
    overlayState: view,
    adminState: () => ({ settings: settings(), current: view(), history: log.all('poll').slice(-10).reverse() }),
    stop: () => clearTimeout(closeTimer),
  }
}
module.exports.cleanSettings = cleanSettings
