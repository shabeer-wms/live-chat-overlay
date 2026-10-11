// Giveaway / winner picker. Modes:
//   raffle  random winner(s) among people who typed the keyword (optionally weighted)
//   first   the first person to type the keyword wins instantly
//   closest the number nearest to `target` wins
//   most    the person who typed the keyword most often wins
//   quiz    correct answers qualify; pick one at random or the fastest
// Random draws are reproducible: HMAC-SHA256(seed, index) drives a weighted pick, and the seed
// plus an entry hash are saved, so a result can be re-checked later.
const crypto = require('node:crypto')

const DEFAULTS = {
  mode: 'raffle', title: 'Giveaway', keywords: ['!enter'], match: 'contains',
  winners: 1, runnersUp: 1,
  oneEntry: true, // raffle: each person counts once however often they type it
  memberWeight: 1, // raffle: tickets per member (1 = no bonus)
  excludeStaff: true, excludeBlocked: true,
  activeMinutes: 0, // winner must have chatted in the last N minutes (0 = off)
  durationSeconds: 0, // auto-close the entry window (0 = manual)
  autoDraw: false, // draw as soon as the window closes by itself
  claimSeconds: 0, // winner must reply in chat within N seconds or the next runner-up takes over (0 = off)
  target: 0, // closest mode
  quizPick: 'random', // quiz mode: random | fastest
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()
const rng = (seed, i) => crypto.createHmac('sha256', seed).update(String(i)).digest().readUIntBE(0, 6) / 2 ** 48

// weighted pick without replacement; `pool` must be in a stable order
function pickMany(pool, count, seed) {
  const left = pool.map((p) => ({ ...p })), out = []
  for (let k = 0; k < count && left.length; k++) {
    const total = left.reduce((s, p) => s + p.weight, 0)
    let r = rng(seed, k) * total
    let i = left.findIndex((p) => (r -= p.weight) < 0)
    if (i < 0) i = left.length - 1
    out.push(left.splice(i, 1)[0])
  }
  return out
}

function cleanSettings(input = {}, base = DEFAULTS) {
  const n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d }
  const s = { ...base, ...input }
  return {
    mode: ['raffle', 'first', 'closest', 'most', 'quiz'].includes(s.mode) ? s.mode : DEFAULTS.mode,
    title: String(s.title || DEFAULTS.title).slice(0, 80),
    keywords: [...new Set((Array.isArray(s.keywords) ? s.keywords : String(s.keywords).split(',')).map((k) => String(k).trim()).filter(Boolean))].slice(0, 20),
    match: s.match === 'exact' ? 'exact' : 'contains',
    winners: n(s.winners, 1, 50, 1), runnersUp: n(s.runnersUp, 0, 50, 1),
    oneEntry: s.oneEntry !== false, memberWeight: n(s.memberWeight, 1, 20, 1),
    excludeStaff: s.excludeStaff !== false, excludeBlocked: s.excludeBlocked !== false,
    activeMinutes: n(s.activeMinutes, 0, 720, 0), durationSeconds: n(s.durationSeconds, 0, 86400, 0),
    autoDraw: !!s.autoDraw, claimSeconds: n(s.claimSeconds, 0, 3600, 0),
    target: Number.isFinite(Number(s.target)) ? Number(s.target) : 0,
    quizPick: s.quizPick === 'fastest' ? 'fastest' : 'random',
  }
}

module.exports = function createGiveaway({ config, store, log, isBlocked }) {
  let g = null // the current giveaway, or null
  let closeTimer = null, ticker = null

  const settings = () => cleanSettings(config.giveaway)
  const clearTimers = () => { clearTimeout(closeTimer); clearInterval(ticker); closeTimer = ticker = null }

  // ---------- collecting entries ----------
  const matches = (text, s) => {
    const t = norm(text), kws = s.keywords.map(norm)
    if (!kws.length) return true
    return s.match === 'exact' ? kws.includes(t) : kws.some((k) => t.includes(k))
  }

  function collect(m) {
    if (!g) return
    if (g.phase === 'drawn') return noteClaim(m)
    if (g.phase !== 'open' || m.hidden || !m.text) return
    const s = g.settings
    if (s.excludeBlocked && isBlocked(m.uid)) return
    if (s.excludeStaff && (m.badge === 'owner' || m.badge === 'mod')) return
    if (!matches(m.text, s)) return

    let guess = null
    if (s.mode === 'closest') {
      const num = m.text.match(/-?\d+(?:[.,]\d+)?/)
      if (!num) return
      guess = parseFloat(num[0].replace(',', '.'))
    }
    let e = g.entries.get(m.uid)
    if (!e) {
      e = { uid: m.uid, name: m.name, avatar: m.avatar, platform: m.platform, member: m.badge === 'member', count: 0, firstAt: m.ts, guess }
      g.entries.set(m.uid, e)
    }
    e.count++; e.lastAt = m.ts
    if (s.mode === 'first') { g.visible = true; return draw() }
    publish()
  }

  function noteClaim(m) {
    const w = g.winners.find((x) => x.uid === m.uid && x.status === 'pending')
    if (w && !m.hidden) { w.status = 'claimed'; publish(true) }
  }

  // ---------- drawing ----------
  function ranked() {
    const s = g.settings, now = Date.now()
    const lastSeen = (uid) => store.byUser(uid).reduce((t, c) => Math.max(t, c.ts), 0)
    let list = [...g.entries.values()].filter((e) =>
      !(s.excludeBlocked && isBlocked(e.uid)) && (!s.activeMinutes || now - lastSeen(e.uid) <= s.activeMinutes * 60000))
    list.sort((a, b) => (a.uid < b.uid ? -1 : 1)) // stable base order for reproducible draws
    return list
  }

  function draw() {
    if (!g || g.phase === 'drawn') return
    clearTimeout(closeTimer)
    const s = g.settings, eligible = ranked()
    const want = s.mode === 'first' ? 1 : s.winners + s.runnersUp
    g.seed = crypto.randomBytes(16).toString('hex')
    g.rerolls = 0
    let chosen
    if (s.mode === 'closest') chosen = [...eligible].sort((a, b) => Math.abs(a.guess - s.target) - Math.abs(b.guess - s.target) || a.firstAt - b.firstAt).slice(0, want)
    else if (s.mode === 'most') chosen = [...eligible].sort((a, b) => b.count - a.count || a.firstAt - b.firstAt).slice(0, want)
    else if (s.mode === 'first' || (s.mode === 'quiz' && s.quizPick === 'fastest')) chosen = [...eligible].sort((a, b) => a.firstAt - b.firstAt).slice(0, want)
    else {
      const pool = eligible.map((e) => ({ e, weight: (s.oneEntry || s.mode === 'quiz' ? 1 : e.count) * (e.member ? s.memberWeight : 1) }))
      chosen = pickMany(pool, want, g.seed + ':0').map((p) => p.e)
    }
    const slots = s.mode === 'first' ? 1 : s.winners
    g.winners = chosen.slice(0, slots).map(asWinner)
    g.runnersUp = chosen.slice(slots).map(asWinner)
    g.phase = 'drawn'; g.drawnAt = Date.now(); g.visible = true
    g.proof = {
      seed: g.seed, entries: eligible.length,
      entriesHash: crypto.createHash('sha256').update(eligible.map((e) => `${e.uid}:${e.count}:${e.member ? 1 : 0}`).join('\n')).digest('hex'),
      method: s.mode === 'raffle' || (s.mode === 'quiz' && s.quizPick === 'random')
        ? 'weighted pick without replacement; r = HMAC-SHA256(seed:0, index)/2^48' : `ordered by ${s.mode === 'closest' ? 'closeness to target' : s.mode === 'most' ? 'number of entries' : 'time of entry'}`,
    }
    armClaims()
    finish()
    publish(true)
  }

  const asWinner = (e) => ({ uid: e.uid, name: e.name, avatar: e.avatar, platform: e.platform, status: 'pending', claimEndsAt: 0, guess: e.guess, count: e.count })

  function armClaims() {
    clearInterval(ticker); ticker = null
    const s = g.settings
    if (!s.claimSeconds) return
    const t = Date.now() + s.claimSeconds * 1000
    g.winners.forEach((w) => { if (w.status === 'pending') w.claimEndsAt = t })
    ticker = setInterval(() => {
      const now = Date.now(); let changed = false
      for (const w of g.winners) {
        if (w.status === 'pending' && w.claimEndsAt && now > w.claimEndsAt) { w.status = 'noshow'; promote(); changed = true }
      }
      if (changed) { finish(); publish(true) }
    }, 1000)
  }
  function promote() { // a winner didn't show: next runner-up steps in
    const next = g.runnersUp.shift()
    if (next) { next.claimEndsAt = g.settings.claimSeconds ? Date.now() + g.settings.claimSeconds * 1000 : 0; g.winners.push(next) }
  }

  function reroll(uid) {
    if (!g || g.phase !== 'drawn') return
    const w = g.winners.find((x) => x.uid === uid && x.status !== 'noshow')
    if (!w) return
    w.status = 'noshow'
    if (g.runnersUp.length) promote()
    else { // nobody queued: draw one more from whoever hasn't won or no-showed
      const used = new Set([...g.winners, ...g.runnersUp].map((x) => x.uid))
      const rest = ranked().filter((e) => !used.has(e.uid))
      g.rerolls++
      const s = g.settings
      const pool = rest.map((e) => ({ e, weight: (s.oneEntry ? 1 : e.count) * (e.member ? s.memberWeight : 1) }))
      const [p] = pickMany(pool, 1, `${g.seed}:${g.rerolls}`)
      if (p) { const nw = asWinner(p.e); if (s.claimSeconds) nw.claimEndsAt = Date.now() + s.claimSeconds * 1000; g.winners.push(nw) }
    }
    finish(); publish(true)
  }

  function finish() { // write the result to the history log (replacing an earlier write of this same giveaway)
    if (!g || g.phase !== 'drawn') return
    log.upsert(g.id, {
      kind: 'giveaway', id: g.id, ts: g.drawnAt, stream: g.stream, title: g.settings.title, mode: g.settings.mode, keywords: g.settings.keywords,
      winners: g.winners.map(({ name, platform, status }) => ({ name, platform, status })),
      runnersUp: g.runnersUp.map(({ name, platform }) => ({ name, platform })),
      entries: g.entries.size, proof: g.proof,
    })
  }

  // ---------- lifecycle ----------
  function open(input) {
    clearTimers()
    const s = cleanSettings(input, settings())
    config.giveaway = s; config.save()
    g = { id: crypto.randomUUID(), phase: 'open', settings: s, entries: new Map(), winners: [], runnersUp: [], startedAt: Date.now(), visible: true, stream: store.streams()[0]?.stream || '', endsAt: 0 }
    if (s.durationSeconds) {
      g.endsAt = Date.now() + s.durationSeconds * 1000
      closeTimer = setTimeout(() => { close(); if (g?.settings.autoDraw) draw() }, s.durationSeconds * 1000)
    }
    publish(true)
  }
  function close() { if (g?.phase === 'open') { clearTimeout(closeTimer); g.phase = 'closed'; g.endsAt = 0; publish(true) } }
  function reset() { clearTimers(); g = null; publish(true) }
  function show(v) { if (g) { g.visible = v; publish(true) } }

  // ---------- views ----------
  const winnerView = (w) => ({ name: w.name, avatar: w.avatar, platform: w.platform, status: w.status, claimEndsAt: w.claimEndsAt, guess: w.guess })
  const view = () => g && ({
    phase: g.phase, title: g.settings.title, mode: g.settings.mode, keywords: g.settings.keywords, match: g.settings.match,
    entries: g.entries.size, endsAt: g.endsAt, drawnAt: g.drawnAt || 0, claimSeconds: g.settings.claimSeconds, target: g.settings.target,
    winners: g.winners.map(winnerView), runnersUp: g.runnersUp.map(winnerView),
  })
  const adminView = () => ({
    settings: settings(), current: g && {
      ...view(), id: g.id, visible: g.visible, proof: g.proof || null,
      entryList: [...g.entries.values()].sort((a, b) => b.count - a.count).slice(0, 300).map(({ name, platform, count, member, guess }) => ({ name, platform, count, member, guess })),
      winnersFull: g.winners.map((w) => ({ uid: w.uid, ...winnerView(w) })),
    },
    history: log.all('giveaway').slice(-10).reverse(),
  })

  let timer = null
  let notify = () => {}
  function publish(now) { // entry counts change fast; coalesce to ~2/s unless it's a real state change
    if (now) { clearTimeout(timer); timer = null; return notify() }
    if (!timer) timer = setTimeout(() => { timer = null; notify() }, 500)
  }

  return {
    DEFAULTS, collect, open, close, draw, reroll, reset, show,
    saveSettings(input) { config.giveaway = cleanSettings(input, settings()); config.save(); publish(true) },
    onChange(fn) { notify = fn },
    overlayState: () => (g && g.visible ? view() : null),
    adminState: adminView,
    stop: clearTimers,
  }
}
module.exports.cleanSettings = cleanSettings
module.exports.pickMany = pickMany
