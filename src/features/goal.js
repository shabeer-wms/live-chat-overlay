// Super Chat goal bar + top supporters + on-screen alerts.
module.exports = function createGoal({ config, isBlocked, alert }) {
  let notify = () => {}
  const settings = () => ({ enabled: false, label: 'Goal', target: 100, currency: '', supporters: 3, ...config.goal })
  const state = () => config.goalState || (config.goalState = { total: 0, byUser: {} })

  const matches = (m) => { const c = settings().currency.trim(); return !c || m.money.currency.toLowerCase() === c.toLowerCase() }

  function add(name, platform, amount) {
    const st = state()
    st.total = Math.round((st.total + amount) * 100) / 100
    const u = st.byUser[name] || (st.byUser[name] = { name, platform, total: 0 })
    u.total = Math.round((u.total + amount) * 100) / 100
    config.save(); notify()
  }

  const top = () => Object.values(state().byUser).sort((a, b) => b.total - a.total).slice(0, settings().supporters)
  const view = () => {
    const s = settings(), t = state().total
    return { label: s.label, current: t, target: s.target, percent: s.target > 0 ? Math.min(100, Math.round((t / s.target) * 100)) : 0, currency: s.currency, supporters: top() }
  }

  return {
    collect(m) {
      if (!m.money || m.hidden || isBlocked(m.uid)) return
      if (matches(m)) add(m.name, m.platform, m.money.amount)
      alert({ type: m.money.sticker ? 'sticker' : 'superchat', name: m.name, avatar: m.avatar, amount: m.money.text, message: m.text, color: m.money.color, sticker: m.money.sticker })
    },
    addManual(amount, name = 'Manual') { const a = Number(amount); if (Number.isFinite(a) && a !== 0) add(String(name).slice(0, 40), 'manual', a) },
    saveSettings(input) {
      const s = settings()
      config.goal = {
        enabled: input.enabled ?? s.enabled, label: String(input.label ?? s.label).slice(0, 60),
        target: Math.max(0, Number(input.target) || 0), currency: String(input.currency ?? s.currency).slice(0, 8),
        supporters: Math.min(10, Math.max(0, Math.round(Number(input.supporters ?? s.supporters)) || 0)),
      }
      config.save(); notify()
    },
    reset() { config.goalState = { total: 0, byUser: {} }; config.save(); notify() },
    onChange(fn) { notify = fn },
    overlayState: () => (settings().enabled ? view() : null),
    adminState: () => ({ settings: settings(), ...view() }),
  }
}
