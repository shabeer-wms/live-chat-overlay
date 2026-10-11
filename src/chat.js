// The comment pipeline: every incoming comment is normalised, filtered, remembered, then (maybe) shown.
// Operator actions on stored comments live here too.
const crypto = require('node:crypto')
const check = require('./moderation')

const https = (u) => (/^https:\/\//.test(u || '') ? u : '')
const isQuestion = (t) => /^!ask\b/i.test(t) || (t.includes('?') && t.length >= 8)

module.exports = function createChat({ config, store, hub, overlay, features }) {
  const isBlocked = (uid) => config.isBlocked(uid)
  const view = (c) => ({ ...c, blocked: isBlocked(c.uid) })
  const changed = (id) => { const c = store.get(id); if (c) hub.admin.emit('comment', view(c)) }
  const lastByUser = new Map() // uid -> { text, ts }, for the repeat filter

  function cleanMoney(mo) {
    if (!mo) return undefined
    const out = {
      amount: Number(mo.amount) > 0 ? Number(mo.amount) : 0,
      currency: String(mo.currency || '').slice(0, 8), text: String(mo.text || '').slice(0, 24),
      color: /^#[0-9a-f]{6}$/i.test(mo.color) ? mo.color : '', sticker: https(mo.sticker),
    }
    return out.amount > 0 || out.text ? out : undefined
  }

  function ingest(m) {
    m.id = m.id || crypto.randomUUID()
    m.ts = Date.now()
    m.avatar = https(m.avatar)
    m.parts = m.parts.map((p) => (p.img ? { img: https(p.img) } : { text: String(p.text ?? '') })).filter((p) => p.img !== '')
    m.text = m.parts.map((p) => p.text || '').join('').trim()
    m.uid = m.platform + ':' + (m.authorId || m.name)
    delete m.authorId
    m.money = cleanMoney(m.money)
    if (!m.money) delete m.money
    m.starred = false
    m.answered = false
    m.question = isQuestion(m.text)
    m.flag = check(m, config.filters, { last: lastByUser.get(m.uid) }) // why it was auto-held, if it was
    m.hidden = !!m.flag
    if (!store.add(m)) return // already seen (reconnect replay)
    lastByUser.set(m.uid, { text: m.text, ts: m.ts })
    hub.admin.emit('comment', view(m))
    features.collect(m)

    const blocked = isBlocked(m.uid)
    if (config.mode === 'auto' && !m.hidden && !blocked) overlay.push(m)
    if (!m.hidden && !blocked && wantsQueue(m)) overlay.queueAdd(m.id)
  }

  function wantsQueue(m) {
    const a = config.autoQueue, t = m.text.toLowerCase()
    return (a.superChats && m.money) || (a.members && m.badge === 'member') || (a.questions && m.question)
      || a.keywords.some((k) => k && t.includes(k.toLowerCase()))
  }

  // one action on one comment; returns false for an unknown comment or action
  function act(id, action) {
    const c = store.get(id)
    if (!c) return false
    switch (action) {
      case 'show': store.patch(id, { hidden: false, flag: '' }); overlay.push(c); break
      case 'highlight': store.patch(id, { hidden: false, flag: '' }); overlay.highlight(id); break
      case 'unhighlight': if (overlay.state().highlighted === id) overlay.highlight(null); break
      case 'queue': overlay.queueAdd(id); return true
      case 'unqueue': overlay.unqueue(id); return true
      case 'star': case 'unstar': store.patch(id, { starred: action === 'star' }); break
      case 'answer': case 'unanswer': store.patch(id, { answered: action === 'answer' }); break
      case 'hide': store.patch(id, { hidden: true }); overlay.unpush(id); break
      case 'unhide': store.patch(id, { hidden: false, flag: '' }); break
      case 'delete': overlay.unpush(id); store.remove(id); hub.admin.emit('removed', { id }); return true
      case 'block':
        if (!isBlocked(c.uid)) { config.blocked.push({ uid: c.uid, name: c.name, platform: c.platform }); config.save() }
        store.byUser(c.uid).forEach((x) => overlay.unpush(x.id))
        hub.admin.emit('refresh', {})
        return true
      case 'unblock': return unblock(c.uid)
      default: return false
    }
    changed(id)
    return true
  }
  function unblock(uid) {
    config.blocked = config.blocked.filter((b) => b.uid !== uid)
    config.save()
    hub.admin.emit('refresh', {})
    return true
  }

  return { ingest, act, unblock, view, isBlocked }
}
