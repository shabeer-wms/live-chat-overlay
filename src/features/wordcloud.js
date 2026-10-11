// Word cloud: the most-used words in recent chat.
const STOP = new Set(('a an and are as at be but by for from has have he her him his how i if in into is it its just me my of on or our so that the their them then there these they this to too up us was we were what when where which who why will with would you your yours im dont cant didnt its thats lol yes yeah ok okay not no so very get got can could should do does did been being than also all any more some out about like one').split(' '))

module.exports = function createWordcloud({ config }) {
  let seen = [] // { ts, words[] }
  let notify = () => {}, interval = null, last = ''

  const settings = () => ({ enabled: false, minutes: 10, max: 30, ...config.wordcloud })
  const words = (text) => (text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[\p{L}\p{N}']{3,}/gu) || []).filter((w) => !STOP.has(w) && !/^\d+$/.test(w))

  function top() {
    const { minutes, max } = settings(), since = Date.now() - minutes * 60000
    seen = seen.filter((x) => x.ts >= since)
    const n = new Map()
    for (const x of seen) for (const w of x.words) n.set(w, (n.get(w) || 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max).map(([w, c]) => ({ w, n: c }))
  }
  function sync() {
    clearInterval(interval); interval = null
    if (settings().enabled) interval = setInterval(() => { const j = JSON.stringify(top()); if (j !== last) { last = j; notify() } }, 3000)
    last = ''; notify()
  }

  return {
    collect(m) { if (settings().enabled && !m.hidden && m.text && m.platform !== 'bot') { const w = words(m.text); if (w.length) seen.push({ ts: m.ts, words: w }) } },
    saveSettings(input) {
      const n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d }
      const s = settings()
      config.wordcloud = { enabled: input.enabled ?? s.enabled, minutes: n(input.minutes, 1, 240, s.minutes), max: n(input.max, 5, 60, s.max) }
      config.save(); sync()
    },
    reset() { seen = []; last = ''; notify() },
    onChange(fn) { notify = fn },
    overlayState: () => (settings().enabled ? { words: top() } : null),
    adminState: () => ({ settings: settings(), words: top() }),
    start: sync,
    stop() { clearInterval(interval) },
  }
}
