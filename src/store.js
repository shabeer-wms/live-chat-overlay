// Persistent comment memory: every comment seen is kept in data/comments.json.
const fs = require('node:fs')
const path = require('node:path')

const MAX = 20000 // oldest un-starred comments are dropped beyond this

module.exports = function createStore(dir) {
  const file = path.join(dir, 'comments.json')
  let list = []
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  const byId = new Map(list.map((c) => [c.id, c]))

  let timer
  function flush() {
    clearTimeout(timer)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file + '.tmp', JSON.stringify(list))
    fs.renameSync(file + '.tmp', file)
  }
  const save = () => { clearTimeout(timer); timer = setTimeout(flush, 800) }
  process.on('exit', () => { try { if (timer) flush() } catch {} })

  return {
    flush,
    get: (id) => byId.get(id),
    add(c) { // false if this id was already stored (reconnect replays)
      if (byId.has(c.id)) return false
      list.push(c); byId.set(c.id, c)
      if (list.length > MAX) {
        const i = list.findIndex((x) => !x.starred)
        if (i >= 0) byId.delete(list.splice(i, 1)[0].id)
      }
      save()
      return true
    },
    patch(id, fields) { const c = byId.get(id); if (c) { Object.assign(c, fields); save() } return c },
    remove(id) {
      const c = byId.get(id)
      if (!c) return false
      list.splice(list.indexOf(c), 1); byId.delete(id); save()
      return true
    },
    clear(stream) {
      list = stream ? list.filter((c) => c.stream !== stream) : []
      byId.clear(); list.forEach((c) => byId.set(c.id, c)); save()
    },
    query({ stream, platform, limit = 1000 } = {}) {
      const out = list.filter((c) => (!stream || c.stream === stream) && (!platform || c.platform === platform))
      return out.slice(-limit)
    },
    byUser: (uid) => list.filter((c) => c.uid === uid),
    prune(olderThanMs, stream) { // forget old, un-starred comments; returns how many went
      const before = list.length
      list = list.filter((c) => c.starred || c.ts >= olderThanMs || (stream && c.stream !== stream))
      byId.clear(); list.forEach((c) => byId.set(c.id, c)); save()
      return before - list.length
    },
    count: () => list.length,
    streams() {
      const s = new Map()
      for (const c of list) {
        const x = s.get(c.stream) || { stream: c.stream, count: 0, first: c.ts, last: c.ts }
        x.count++; x.last = c.ts; s.set(c.stream, x)
      }
      return [...s.values()].sort((a, b) => b.last - a.last)
    },
    csv(stream) {
      const esc = (v) => {
        v = String(v ?? '')
        if (/^[=+\-@\t\r]/.test(v)) v = "'" + v // stop spreadsheet formula injection
        return '"' + v.replace(/"/g, '""') + '"'
      }
      const rows = this.query({ stream, limit: MAX }).map((c) =>
        [new Date(c.ts).toISOString(), c.platform, c.stream, c.name, c.badge, c.text, c.starred ? 'yes' : '', c.hidden ? 'yes' : ''].map(esc).join(','))
      return ['time,platform,stream,name,badge,comment,starred,hidden', ...rows].join('\n')
    },
  }
}
