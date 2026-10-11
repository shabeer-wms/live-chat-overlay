// Chat commands: when a viewer types a trigger like !rules, the reply appears on stream.
module.exports = function createCommands({ config, say }) {
  const last = new Map() // trigger -> last used ms
  const clean = (list) => (Array.isArray(list) ? list : []).map((c) => ({
    trigger: String(c.trigger || '').trim().toLowerCase().slice(0, 30),
    response: String(c.response || '').trim().slice(0, 300),
    cooldown: Math.min(3600, Math.max(0, Math.round(Number(c.cooldown ?? 15)) || 0)),
  })).filter((c) => c.trigger && c.response).slice(0, 50)

  return {
    handle(m) {
      if (m.platform === 'bot' || m.hidden || !m.text) return
      const first = m.text.trim().split(/\s+/)[0].toLowerCase()
      const c = (config.commands || []).find((x) => x.trigger === first)
      if (!c) return
      const now = Date.now()
      if (now - (last.get(c.trigger) || 0) < c.cooldown * 1000) return
      last.set(c.trigger, now)
      say(c.response)
    },
    save(list) { config.commands = clean(list); config.save() },
    list: () => config.commands || [],
  }
}
module.exports.clean = null
