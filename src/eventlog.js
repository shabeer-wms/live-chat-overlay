// Finished giveaways and polls, kept for the stream summary. data/events.json, newest last.
const fs = require('node:fs')
const path = require('node:path')
const MAX = 1000

module.exports = function createEventLog(dir) {
  const file = path.join(dir, 'events.json')
  let list = []
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  const save = () => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file + '.tmp', JSON.stringify(list))
    fs.renameSync(file + '.tmp', file)
  }
  return {
    add(ev) { list.push({ ts: Date.now(), ...ev }); if (list.length > MAX) list.shift(); save() },
    upsert(id, ev) { // replace an earlier write of the same event (e.g. a giveaway after a reroll)
      const i = list.findIndex((e) => e.id === id)
      if (i >= 0) list[i] = { ...list[i], ...ev }; else list.push({ ts: Date.now(), ...ev })
      save()
    },
    all: (kind) => (kind ? list.filter((e) => e.kind === kind) : list.slice()),
    merge(events) { // used by restore: skip ones already present
      const seen = new Set(list.map((e) => e.id))
      for (const e of events) if (e && e.id && !seen.has(e.id)) list.push(e)
      list.sort((a, b) => a.ts - b.ts); save()
    },
  }
}
