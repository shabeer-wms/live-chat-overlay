// Generates build/icon.png (app icon) and electron/tray*.png (tray icons). No dependencies.
// Run: node scripts/make-icon.js
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// shapes in a 0..1 unit square
const inRound = (x, y, x0, y0, x1, y1, r) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const inTri = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const d = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  const d1 = d(x, y, ax, ay, bx, by), d2 = d(x, y, bx, by, cx, cy), d3 = d(x, y, cx, cy, ax, ay)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
const bubble = (x, y) => inRound(x, y, 0.22, 0.27, 0.78, 0.67, 0.11) || inTri(x, y, [0.30, 0.64], [0.30, 0.80], [0.46, 0.64])
const dots = (x, y) => [0.37, 0.5, 0.63].some((cx) => (x - cx) ** 2 + (y - 0.47) ** 2 <= 0.036 ** 2)

// colour modes: app = blue tile + white bubble; mono = black bubble, dots cut out (macOS template)
const BLUE = [0x3b, 0x5b, 0xdb], WHITE = [255, 255, 255], BLACK = [0, 0, 0]
const app = (x, y) => (!inRound(x, y, 0.06, 0.06, 0.94, 0.94, 0.2) ? null : bubble(x, y) && !dots(x, y) ? WHITE : BLUE)
const color = (x, y) => (bubble(x, y) ? (dots(x, y) ? BLUE : WHITE) : null)
const tile = (x, y) => (!inRound(x, y, 0.0, 0.0, 1, 1, 0.2) ? null : color(x, y) || BLUE)
const mono = (x, y) => (bubble(x, y) && !dots(x, y) ? BLACK : null)

function render(size, fn, ss = 3) {
  const out = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = fn((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++ }
    }
    const o = (py * size + px) * 4, n = ss * ss
    if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = Math.round(255 * a / n) }
  }
  return out
}

const root = path.join(__dirname, '..')
const write = (rel, size, fn) => { fs.writeFileSync(path.join(root, rel), png(size, render(size, fn))); console.log('wrote', rel) }
fs.mkdirSync(path.join(root, 'build'), { recursive: true })
write('build/icon.png', 1024, app)
write('electron/tray.png', 64, tile) // Windows/Linux (downscaled by Electron)
write('electron/trayTemplate.png', 22, mono) // macOS template image (auto-tinted)
write('electron/trayTemplate@2x.png', 44, mono)
