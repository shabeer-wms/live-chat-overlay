// Small HTTP helpers: JSON replies, body parsing, safe static files, security headers.
const fs = require('node:fs')
const path = require('node:path')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}
const CSP = {
  admin: "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
  // the overlay is one self-contained page that OBS loads, so it keeps its inline script/style
  overlay: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src https: data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'",
}
const BASE = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store' }

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function send(res, code, body, type = 'application/json', headers = {}) {
  res.writeHead(code, { 'Content-Type': type, ...BASE, ...headers })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}

function readJson(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let b = ''
    req.on('data', (c) => { b += c; if (b.length > limit) { reject(new HttpError(413, 'too large')); req.destroy() } })
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { reject(new HttpError(400, 'bad json')) } })
  })
}

// serve `rel` from `root`; false if it isn't a file inside root
function serveStatic(res, root, rel, kind) {
  const file = path.resolve(root, rel)
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', kind ? { 'Content-Security-Policy': CSP[kind] } : {})
  return true
}

module.exports = { send, readJson, serveStatic, HttpError }
