// Turn a Super Chat label like "$5.00", "₹1,00,000.00", "€5,00" or "CA$1,000.50" into { amount, currency }.
module.exports = function parseMoney(text) {
  const s = String(text || '').trim()
  const run = s.match(/\d[\d.,\s]*/)
  if (!run) return null
  const digits = run[0].replace(/\s/g, '').replace(/[.,]+$/, '')
  const sep = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','))
  // the last . or , is a decimal point only when 1-2 digits follow it
  const amount = sep >= 0 && digits.length - sep - 1 <= 2
    ? parseFloat(digits.slice(0, sep).replace(/[.,]/g, '') + '.' + digits.slice(sep + 1))
    : parseFloat(digits.replace(/[.,]/g, ''))
  if (!Number.isFinite(amount)) return null
  return { amount, currency: s.replace(run[0], '').replace(/\s/g, ''), text: s }
}
