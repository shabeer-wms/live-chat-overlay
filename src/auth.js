// One admin PIN (6 digits, default 123456), scrypt-hashed, with cookie sessions that survive restarts.
// A 6-digit PIN is a small space, so wrong guesses lock the caller out for longer and longer.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const WEEK = 7 * 864e5
const DEFAULT_PIN = '123456'
const isPin = (v) => /^\d{6}$/.test(String(v))
const hash = (pin, salt) => crypto.scryptSync(pin, salt, 64).toString('hex')
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex')

module.exports = function createAuth(config, dir) {
  const file = path.join(dir, 'sessions.json')
  let sessions = {} // sha256(token) -> expiry ms (tokens themselves are never stored)
  try { sessions = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  const persist = () => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(sessions), { mode: 0o600 })
  }

  function setPin(pin, isDefault) {
    const salt = crypto.randomBytes(16).toString('hex')
    config.admin = { pin: true, isDefault, salt, hash: hash(pin, salt) }
    config.save()
  }
  // first run, or an older username/password login from before PINs existed: start from the default PIN
  if (!config.admin?.pin) { setPin(DEFAULT_PIN, true); console.log(`Admin PIN is the default (${DEFAULT_PIN}). Change it in Settings.`) }

  const pinOk = (pin) => isPin(pin) && crypto.timingSafeEqual(Buffer.from(hash(String(pin), config.admin.salt), 'hex'), Buffer.from(config.admin.hash, 'hex'))

  const tokenOf = (req) => /(?:^|; )sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]
  const cookie = (t, maxAge) => `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`
  function startSession() {
    const t = crypto.randomBytes(32).toString('hex')
    sessions[sha(t)] = Date.now() + WEEK
    persist()
    return cookie(t, WEEK / 1000)
  }
  function isAuthed(req) {
    const t = tokenOf(req)
    const exp = t && sessions[sha(t)]
    if (!exp) return false
    if (exp < Date.now()) { delete sessions[sha(t)]; persist(); return false }
    return true
  }

  // lockout: 5 wrong guesses -> 1 min, then it doubles each further miss (max 1 h)
  const failures = new Map() // ip -> { n, until }
  const lock = (ip) => { const f = failures.get(ip); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0 }
  function miss(ip) {
    const n = (failures.get(ip)?.n || 0) + 1
    failures.set(ip, { n, until: n >= 5 ? Date.now() + Math.min(36e5, 6e4 * 2 ** (n - 5)) : 0 })
  }

  return {
    isAuthed,
    isDefaultPin: () => !!config.admin.isDefault,

    login(pin, ip) {
      const wait = lock(ip)
      if (wait) return { status: 429, error: `too many wrong PINs, try again in ${wait}s` }
      if (!pinOk(pin)) { miss(ip); return { status: 401, error: 'wrong PIN' } }
      failures.delete(ip)
      return { cookie: startSession() }
    },
    logout(req) {
      const t = tokenOf(req)
      if (t) { delete sessions[sha(t)]; persist() }
      return cookie('', 0)
    },
    changePin(current, next, ip) {
      const wait = lock(ip)
      if (wait) return { status: 429, error: `too many wrong PINs, try again in ${wait}s` }
      if (!pinOk(current)) { miss(ip); return { status: 403, error: 'current PIN is wrong' } }
      if (!isPin(next)) return { status: 400, error: 'the new PIN must be exactly 6 digits' }
      setPin(String(next), String(next) === DEFAULT_PIN)
      sessions = {} // sign every device out, then keep this one in
      return { cookie: startSession() }
    },
    logoutEverywhere() { sessions = {}; persist(); return cookie('', 0) },
  }
}
module.exports.DEFAULT_PIN = DEFAULT_PIN
