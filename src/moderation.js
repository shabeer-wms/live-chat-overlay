// Auto-filters. Returns why a comment should be held back from the overlay, or '' if it's fine.
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|tv|me|co|ly|xyz|info|app|dev)\b)/i

module.exports = function check(c, f, ctx = {}) {
  if (f.bots.some((b) => b.toLowerCase() === c.name.toLowerCase())) return 'bot'
  if (f.exemptStaff && (c.badge === 'owner' || c.badge === 'mod')) return ''
  const text = c.text.toLowerCase()
  if (f.words.some((w) => w && text.includes(w.toLowerCase()))) return 'blocked word'
  if (f.links && LINK.test(c.text)) return 'link'
  if (f.maxLength > 0 && c.text.length > f.maxLength) return 'too long'
  if (f.maxCapsPercent > 0) {
    const letters = c.text.replace(/[^\p{L}]/gu, '')
    if (letters.length >= 8 && (letters.replace(/[^\p{Lu}]/gu, '').length / letters.length) * 100 > f.maxCapsPercent) return 'caps'
  }
  if (f.blockRepeats && ctx.last && ctx.last.text === c.text && c.ts - ctx.last.ts < 60000) return 'repeat'
  return ''
}
