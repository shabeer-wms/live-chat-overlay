// Top chatters of the current stream, counted from the saved comments (so it is full the moment you switch it on).
// "Reset" starts counting again from now.
module.exports = function createLeaderboard({ config, store, isBlocked }) {
  let notify = () => {}, timer = null

  const settings = () => ({ enabled: false, size: 5, by: 'comments', since: 0, ...config.leaderboard })
  const publish = () => { if (!timer) timer = setTimeout(() => { timer = null; notify() }, 1000) }

  function top() {
    const { size, by, since } = settings()
    const stream = store.streams()[0]?.stream // the stream that spoke last
    if (stream === undefined) return []
    const rows = new Map()
    for (const c of store.query({ stream, limit: 1e9 })) {
      if (c.ts < since || c.hidden || c.platform === 'bot' || isBlocked(c.uid)) continue
      const r = rows.get(c.uid) || { name: c.name, avatar: c.avatar, platform: c.platform, count: 0, money: 0 }
      r.count++; r.name = c.name
      if (c.money?.amount) r.money += c.money.amount
      rows.set(c.uid, r)
    }
    return [...rows.values()].filter((r) => (by === 'money' ? r.money > 0 : true))
      .sort((a, b) => (by === 'money' ? b.money - a.money : b.count - a.count) || a.name.localeCompare(b.name))
      .slice(0, size)
  }

  return {
    collect() { if (settings().enabled) publish() },
    saveSettings(input) {
      const s = settings()
      config.leaderboard = {
        enabled: input.enabled ?? s.enabled, by: input.by === 'money' ? 'money' : input.by === 'comments' ? 'comments' : s.by,
        size: Math.min(15, Math.max(3, Math.round(Number(input.size)) || s.size)), since: s.since,
      }
      config.save(); notify()
    },
    reset() { config.leaderboard = { ...settings(), since: Date.now() }; config.save(); notify() },
    onChange(fn) { notify = fn },
    overlayState: () => (settings().enabled ? { by: settings().by, rows: top() } : null),
    adminState: () => ({ settings: settings(), rows: top() }),
    stop() { clearTimeout(timer) },
  }
}
