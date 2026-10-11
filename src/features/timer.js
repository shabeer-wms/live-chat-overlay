// Countdown shown on stream.
module.exports = function createTimer() {
  let t = null, notify = () => {}, doneTimer = null
  const clear = () => { clearTimeout(doneTimer); doneTimer = null }
  return {
    start(seconds, label = '') {
      const s = Math.round(Number(seconds))
      if (!(s > 0 && s <= 86400)) return false
      clear()
      t = { label: String(label).slice(0, 60), endsAt: Date.now() + s * 1000, seconds: s }
      doneTimer = setTimeout(() => { if (t) { t.done = true; notify(); doneTimer = setTimeout(() => { t = null; notify() }, 10000) } }, s * 1000)
      notify(); return true
    },
    stop() { clear(); t = null; notify() },
    onChange(fn) { notify = fn },
    overlayState: () => t && { ...t },
    adminState: () => ({ current: t && { ...t } }),
  }
}
