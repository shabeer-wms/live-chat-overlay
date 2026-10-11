// API for the engagement features, automation rules, summary, backup/restore and the remote.
const crypto = require('node:crypto')
const { POSITIONS } = require('./features')

const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d }
const strs = (a, max = 50, len = 100) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x).trim().slice(0, len)).filter(Boolean))].slice(0, max)

module.exports = function featureRoutes({ config, hub, store, overlay, chat, features, log, route, need, ok, state, helpers }) {
  const { mods, commands } = features
  const { giveaway, poll, wordcloud, leaderboard, goal, timer } = mods

  // ---- giveaway ----
  route('POST', '/api/giveaway/settings', true, ({ body }) => { giveaway.saveSettings(body.settings || {}); return state() })
  route('POST', '/api/giveaway/open', true, ({ body }) => { giveaway.open(body.settings || {}); return state() })
  route('POST', '/api/giveaway/close', true, () => { giveaway.close(); return state() })
  route('POST', '/api/giveaway/draw', true, () => { giveaway.draw(); return state() })
  route('POST', '/api/giveaway/reroll', true, ({ body }) => { giveaway.reroll(String(body.uid)); return state() })
  route('POST', '/api/giveaway/reset', true, () => { giveaway.reset(); return state() })
  route('POST', '/api/giveaway/show', true, ({ body }) => { giveaway.show(!!body.visible); return state() })

  // ---- poll ----
  route('POST', '/api/poll/settings', true, ({ body }) => { poll.saveSettings(body.settings || {}); return state() })
  route('POST', '/api/poll/open', true, ({ body }) => { poll.open(body.settings || {}); return state() })
  route('POST', '/api/poll/close', true, () => { poll.close(); return state() })
  route('POST', '/api/poll/reset', true, () => { poll.reset(); return state() })

  // ---- goal, timer, word cloud, leaderboard ----
  route('POST', '/api/goal/settings', true, ({ body }) => { goal.saveSettings(body.settings || {}); return state() })
  route('POST', '/api/goal/add', true, ({ body }) => { goal.addManual(body.amount, body.name); return state() })
  route('POST', '/api/goal/reset', true, () => { goal.reset(); return state() })
  route('POST', '/api/timer/start', true, ({ body }) => { need(timer.start(body.seconds, body.label), 400, 'seconds must be between 1 and 86400'); return state() })
  route('POST', '/api/timer/stop', true, () => { timer.stop(); return state() })
  route('POST', '/api/wordcloud/settings', true, ({ body }) => { wordcloud.saveSettings(body.settings || {}); return state() })
  route('POST', '/api/wordcloud/reset', true, () => { wordcloud.reset(); return state() })
  route('POST', '/api/leaderboard/settings', true, ({ body }) => { leaderboard.saveSettings(body.settings || {}); return state() })
  route('POST', '/api/leaderboard/reset', true, () => { leaderboard.reset(); return state() })

  // ---- chat commands, on-screen widget positions ----
  route('POST', '/api/commands', true, ({ body }) => {
    const list = (Array.isArray(body.commands) ? body.commands : []).map((c) => ({
      trigger: String(c.trigger || '').trim().toLowerCase().slice(0, 30), response: String(c.response || '').trim().slice(0, 300),
      cooldown: num(c.cooldown ?? 15, 0, 3600, 15),
    })).filter((c) => c.trigger && c.response).slice(0, 50)
    commands.save(list)
    return state()
  })
  route('POST', '/api/widgets', true, ({ body }) => { features.saveWidgets(body.widgets || {}); return state() })

  // ---- automation: slow mode, read-aloud, auto-queue rules ----
  route('POST', '/api/rules', true, ({ body }) => {
    if (body.display) {
      const d = body.display
      config.display = {
        ...config.display, slowSeconds: num(d.slowSeconds, 0, 120, 0), speak: !!d.speak,
        ...(d.autoplayQueue !== undefined ? { autoplayQueue: !!d.autoplayQueue } : {}),
        ...(d.queueSeconds !== undefined ? { queueSeconds: num(d.queueSeconds, 2, 600, 8) } : {}),
      }
      hub.overlay.emit('display', config.display)
      hub.admin.emit('display', config.display)
    }
    if (body.autoQueue) {
      const a = body.autoQueue
      config.autoQueue = { keywords: strs(a.keywords, 30), superChats: !!a.superChats, members: !!a.members, questions: !!a.questions }
    }
    config.save()
    return state()
  })

  // ---- looks for different OBS scenes ----
  route('POST', '/api/profiles/delete', true, ({ body }) => {
    delete config.profiles[String(body.name)]
    config.save(); hub.admin.emit('refresh', {})
    return state()
  })

  // ---- summary of a stream ----
  function summary(stream) {
    const list = store.query({ stream, limit: 1e9 })
    const people = new Map(), money = {}, perMinute = new Map()
    for (const c of list) {
      const p = people.get(c.uid) || { name: c.name, platform: c.platform, comments: 0, money: 0 }
      p.comments++
      if (c.money?.amount) {
        p.money += c.money.amount
        const m = money[c.money.currency || '?'] || (money[c.money.currency || '?'] = { total: 0, count: 0 })
        m.total = Math.round((m.total + c.money.amount) * 100) / 100; m.count++
      }
      people.set(c.uid, p)
      const minute = Math.floor(c.ts / 60000)
      perMinute.set(minute, (perMinute.get(minute) || 0) + 1)
    }
    const peak = [...perMinute].sort((a, b) => b[1] - a[1])[0]
    const events = log.all().filter((e) => !stream || e.stream === stream)
    return {
      stream, comments: list.length, chatters: people.size,
      first: list[0]?.ts || 0, last: list[list.length - 1]?.ts || 0,
      busiestMinute: peak ? { at: peak[0] * 60000, comments: peak[1] } : null,
      topChatters: [...people.values()].sort((a, b) => b.comments - a.comments).slice(0, 10),
      questions: { total: list.filter((c) => c.question).length, answered: list.filter((c) => c.answered).length },
      starred: list.filter((c) => c.starred).length, heldBack: list.filter((c) => c.flag).length,
      money, topSupporters: [...people.values()].filter((p) => p.money > 0).sort((a, b) => b.money - a.money).slice(0, 10),
      giveaways: events.filter((e) => e.kind === 'giveaway'), polls: events.filter((e) => e.kind === 'poll'),
    }
  }
  route('GET', '/api/summary', true, ({ url }) => summary(url.searchParams.get('stream') || (store.streams()[0]?.stream ?? '')))

  // ---- backup / restore ----
  route('GET', '/api/backup', true, ({ url }) => {
    const secrets = url.searchParams.get('secrets') === '1'
    const settings = Object.fromEntries(['style', 'profiles', 'filters', 'blocked', 'mode', 'display', 'autoQueue', 'commands', 'widgets', 'giveaway', 'poll', 'wordcloud', 'leaderboard', 'goal', 'goalState', 'youtube']
      .filter((k) => config[k] !== undefined).map((k) => [k, config[k]]))
    settings.facebook = { videoId: config.facebook.videoId, ...(secrets ? { token: config.facebook.token } : {}) }
    const bundle = { app: 'chat-overlay', version: 1, exportedAt: new Date().toISOString(), settings, comments: store.query({ limit: 1e9 }), events: log.all() }
    return { raw: JSON.stringify(bundle), type: 'application/json', headers: { 'Content-Disposition': `attachment; filename="chat-overlay-backup-${new Date().toISOString().slice(0, 10)}.json"` } }
  })
  route('POST', '/api/restore', true, ({ body }) => {
    const b = body.bundle
    need(b && b.app === 'chat-overlay' && b.version === 1, 400, 'not a Chat Overlay backup file')
    const s = b.settings || {}
    if (s.style) config.style = helpers.cleanStyle(s.style)
    if (s.profiles && typeof s.profiles === 'object') {
      config.profiles = Object.fromEntries(Object.entries(s.profiles).filter(([k]) => /^[\w -]{1,30}$/.test(k)).slice(0, 20).map(([k, v]) => [k, helpers.cleanStyle(v)]))
    }
    if (s.filters) config.filters = helpers.cleanFilters(s.filters)
    if (Array.isArray(s.blocked)) config.blocked = s.blocked.filter((x) => x && x.uid).slice(0, 5000).map((x) => ({ uid: String(x.uid), name: String(x.name || ''), platform: String(x.platform || '') }))
    if (s.mode === 'auto' || s.mode === 'manual') config.mode = s.mode
    if (s.display) config.display = { ...config.display, slowSeconds: num(s.display.slowSeconds, 0, 120, 0), speak: !!s.display.speak, autoplayQueue: !!s.display.autoplayQueue, queueSeconds: num(s.display.queueSeconds, 2, 600, 8) }
    if (s.autoQueue) config.autoQueue = { keywords: strs(s.autoQueue.keywords, 30), superChats: !!s.autoQueue.superChats, members: !!s.autoQueue.members, questions: !!s.autoQueue.questions }
    if (Array.isArray(s.commands)) commands.save(s.commands)
    if (s.widgets) features.saveWidgets(s.widgets)
    for (const k of ['giveaway', 'poll']) if (s[k]) mods[k].saveSettings(s[k])
    for (const k of ['wordcloud', 'leaderboard', 'goal']) if (s[k]) mods[k].saveSettings(s[k])
    if (s.youtube?.input) config.youtube.input = String(s.youtube.input)
    if (s.facebook?.videoId) config.facebook.videoId = String(s.facebook.videoId)
    if (s.facebook?.token) config.facebook.token = String(s.facebook.token)
    config.save()

    let added = 0
    for (const c of (Array.isArray(b.comments) ? b.comments : []).slice(0, 100000)) {
      if (!c || typeof c.id !== 'string' || typeof c.text !== 'string' || !c.uid) continue
      const ok2 = store.add({
        id: c.id, platform: String(c.platform || 'youtube'), stream: String(c.stream || ''), uid: String(c.uid), name: String(c.name || ''),
        avatar: /^https:\/\//.test(c.avatar || '') ? c.avatar : '', parts: Array.isArray(c.parts) ? c.parts.slice(0, 50) : [{ text: c.text }],
        text: c.text.slice(0, 1000), badge: String(c.badge || ''), ts: Number(c.ts) || Date.now(),
        starred: !!c.starred, hidden: !!c.hidden, flag: String(c.flag || ''), question: !!c.question, answered: !!c.answered,
        ...(c.money ? { money: c.money } : {}),
      })
      if (ok2) added++
    }
    if (Array.isArray(b.events)) log.merge(b.events.filter((e) => e && typeof e.id === 'string' && Number.isFinite(e.ts)))
    store.flush()
    hub.overlay.emit('style', { profile: '', style: config.style })
    hub.overlay.emit('display', config.display)
    hub.admin.emit('refresh', {})
    return { ok: true, comments: added }
  }, { bodyLimit: 100 * 1024 * 1024 })

  // ---- remote: /remote/<key>/<action> for Stream Deck, hotkey apps, phones ----
  const ACTIONS = {
    next: () => overlay.next(), clear: () => overlay.clear(), unhighlight: () => overlay.highlight(null),
    'giveaway/open': () => giveaway.open({}), 'giveaway/close': () => giveaway.close(), 'giveaway/draw': () => giveaway.draw(), 'giveaway/reset': () => giveaway.reset(),
    'poll/open': () => poll.open({}), 'poll/close': () => poll.close(), 'poll/reset': () => poll.reset(),
    'timer/stop': () => timer.stop(), 'goal/reset': () => goal.reset(),
    'chat/hide': () => features.setChatHidden(true), 'chat/show': () => features.setChatHidden(false), 'chat/toggle': () => features.setChatHidden(!config.display.chatHidden),
    'mode/auto': () => { config.mode = 'auto'; config.save(); hub.admin.emit('mode', { mode: 'auto' }) },
    'mode/manual': () => { config.mode = 'manual'; config.save(); hub.admin.emit('mode', { mode: 'manual' }) },
  }
  const newKey = () => crypto.randomBytes(18).toString('hex')
  route('POST', '/api/remote/regenerate', true, () => { config.remoteKey = newKey(); config.save(); return state() })

  return {
    summary, actions: Object.keys(ACTIONS),
    remote(key, action) { // returns true if it ran, false for a bad key, null for an unknown action
      const a = Buffer.from(String(key)), b = Buffer.from(config.remoteKey || '')
      if (!config.remoteKey || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
      if (!ACTIONS[action]) return null
      ACTIONS[action](); return true
    },
    ensureKey() { if (!config.remoteKey) { config.remoteKey = newKey(); config.save() } },
  }
}
