// What the OBS overlay is showing right now: recent messages, the highlighted comment, and the queue.
module.exports = function createOverlay({ config, store, hub }) {
  let backlog = [] // last messages, so a refreshed OBS source isn't empty
  let highlighted = null // id of the comment in the spotlight
  let queue = [] // ids waiting for the spotlight
  let spotTimer
  let slowQueue = [], slowTimer = null, lastShown = 0 // slow mode: at most one comment per N seconds

  const pick = ({ id, platform, name, avatar, parts, badge, money, ts }) => ({ id, platform, name, avatar, parts, badge, ts, ...(money ? { money } : {}) })
  const queued = () => queue.map((id) => store.get(id)).filter(Boolean)
  const sendQueue = () => hub.admin.emit('queue', { ids: queue, comments: queued() })

  function show(m) {
    const o = pick(m)
    backlog.push(o)
    if (backlog.length > 30) backlog.shift()
    lastShown = Date.now()
    hub.overlay.emit('message', o)
  }
  function drain() {
    if (slowTimer || !slowQueue.length) return
    const wait = Math.max(0, lastShown + config.display.slowSeconds * 1000 - Date.now())
    if (!wait) { show(slowQueue.shift()); return drain() } // nothing recent: show right away
    slowTimer = setTimeout(() => { slowTimer = null; drain() }, wait)
  }

  const api = {
    push(m) { // put a comment on screen
      if (!config.display.slowSeconds || m.platform === 'bot') return show(m)
      slowQueue.push(m)
      if (slowQueue.length > 50) slowQueue.shift()
      drain()
    },
    unpush(id) { // take a comment off screen (and out of the spotlight / queue)
      backlog = backlog.filter((m) => m.id !== id)
      slowQueue = slowQueue.filter((m) => m.id !== id)
      hub.overlay.emit('remove', { id })
      if (highlighted === id) api.highlight(null)
      api.unqueue(id)
    },
    highlight(id) {
      clearTimeout(spotTimer)
      const c = id && store.get(id)
      highlighted = c ? id : null
      hub.overlay.emit('highlight', c ? pick(c) : null)
      hub.admin.emit('highlight', { id: highlighted, comment: c || null })
      if (c) api.unqueue(id)
      // how long it stays: the design's "auto-remove" time, or the queue's seconds-per-comment when auto-play is on
      const auto = config.display.autoplayQueue
      const secs = config.style.spotSeconds > 0 ? config.style.spotSeconds : auto ? config.display.queueSeconds : 0
      if (c && secs > 0) spotTimer = setTimeout(() => { if (auto && queue.length) api.next(); else api.highlight(null) }, secs * 1000)
    },
    queueAdd(id) {
      if (store.get(id) && !queue.includes(id) && id !== highlighted) {
        queue.push(id); sendQueue()
        if (config.display.autoplayQueue && !highlighted) api.next() // nothing on screen: start playing
      }
    },
    unqueue(id) { if (queue.includes(id)) { queue = queue.filter((x) => x !== id); sendQueue() } },
    next() { // spotlight the next queued comment
      while (queue.length) { const id = queue[0]; if (store.get(id)) return api.highlight(id); queue.shift() }
      sendQueue()
    },
    clear() { backlog = []; slowQueue = []; hub.overlay.emit('clear', {}) },
    state: () => ({ highlighted, queue, highlightedComment: (highlighted && store.get(highlighted)) || null, queueComments: queued() }),
    styleFor: (profile) => (profile && config.profiles[profile]) || config.style,
    // frames a freshly opened overlay page needs to catch up
    hello(profile = '') {
      const hc = highlighted && store.get(highlighted)
      return [['style', { profile, style: api.styleFor(profile) }], ['display', config.display],
        ...backlog.map((m) => ['message', { ...m, replay: true }]), ...(hc ? [['highlight', pick(hc)]] : [])]
    },
  }
  return api
}
