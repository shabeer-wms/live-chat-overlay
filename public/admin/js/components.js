// Reusable pieces shared by several pages.
import { h, clear } from './dom.js'
import { icon, platformLogo } from './icons.js'
import { fmtTime } from './dom.js'

const STATUS = { live: ['ok', 'Live'], connecting: ['warn', 'Connecting'], off: ['', 'Off'], ended: ['', 'Ended'] }
export function statusBadge(status = 'off') {
  const [kind, label] = STATUS[status] || (status.startsWith('error') ? ['danger', 'Error'] : ['', status])
  return h('span', { class: 'badge ' + kind, title: status }, h('span', { class: 'dot' }), label)
}

// comment text with emoji images, no HTML injection
export function commentBody(c) {
  const parts = (c.parts?.length ? c.parts : [{ text: c.text }]).map((p) =>
    p.img ? h('img', { src: p.img, alt: '', class: 'emoji' }) : document.createTextNode(p.text))
  if (c.money?.sticker) parts.push(h('img', { src: c.money.sticker, alt: 'sticker', class: 'emoji', style: { height: '2.6em' } }))
  return parts
}

export function avatar(c, size = 32) {
  return c.avatar
    ? h('img', { class: 'avatar', src: c.avatar, alt: '', width: size, height: size, loading: 'lazy', referrerPolicy: 'no-referrer' })
    : h('div', { class: 'avatar ph', style: { width: size + 'px', height: size + 'px' } }, (c.name || '?').slice(0, 1).toUpperCase())
}

// One comment row. `opts`: selected, focused, highlighted, queued, compact
export function commentRow(c, opts = {}) {
  const held = c.hidden || c.blocked
  const row = h('div', {
    class: ['crow', opts.highlighted && 'live', held && 'dim', opts.selected && 'selected', opts.focused && 'focus'].filter(Boolean).join(' '),
    dataset: { id: c.id },
  })
  row.append(
    h('label', { class: 'sel', title: 'Select' }, h('input', { type: 'checkbox', checked: !!opts.selected, dataset: { sel: '1' } })),
    avatar(c),
    h('div', { class: 'cbody' },
      h('div', { class: 'cmeta' },
        platformLogo(c.platform),
        h('b', { class: 'cname' }, c.name),
        c.badge && h('span', { class: 'badge accent' }, c.badge),
        c.money && h('span', { class: 'badge', style: { background: c.money.color || 'var(--accent)', color: '#fff', borderColor: 'transparent' } }, c.money.text || c.money.amount),
        c.question && !c.answered && h('span', { class: 'badge warn' }, icon('help'), 'Question'),
        c.answered && h('span', { class: 'badge ok' }, icon('check'), 'Answered'),
        h('span', { class: 'faint small' }, fmtTime(c.ts)),
        opts.highlighted && h('span', { class: 'badge accent' }, icon('zap'), 'Spotlight'),
        opts.queued > 0 && h('span', { class: 'badge warn' }, `Queue #${opts.queued}`),
        c.starred && h('span', { class: 'badge warn' }, icon('star'), 'Starred'),
        c.flag && h('span', { class: 'badge danger', title: 'Held back by your filters' }, `Filtered: ${c.flag}`),
        c.hidden && !c.flag && h('span', { class: 'badge' }, 'Hidden'),
        c.blocked && h('span', { class: 'badge danger' }, 'Blocked'),
      ),
      h('div', { class: 'ctext' }, commentBody(c))),
    commentActions(c, opts))
  return row
}

function commentActions(c, opts) {
  const b = (act, ic, title, cls = '') => h('button', { class: 'btn sm icon ' + cls, title, 'aria-label': title, dataset: { act } }, icon(ic))
  return h('div', { class: 'cacts' },
    b(opts.highlighted ? 'unhighlight' : 'highlight', 'zap', opts.highlighted ? 'Remove spotlight' : 'Spotlight (Enter)', opts.highlighted ? 'on' : ''),
    b(opts.queued ? 'unqueue' : 'queue', 'queue', opts.queued ? 'Remove from queue' : 'Add to queue (Q)', opts.queued ? 'on' : ''),
    b('show', 'play', 'Show on screen (Space)'),
    b(c.starred ? 'unstar' : 'star', 'star', c.starred ? 'Unstar (S)' : 'Star (S)', c.starred ? 'on' : ''),
    c.question && b(c.answered ? 'unanswer' : 'answer', 'check', c.answered ? 'Mark as not answered (A)' : 'Mark as answered (A)', c.answered ? 'on' : ''),
    b(c.hidden ? 'unhide' : 'hide', c.hidden ? 'eye' : 'eyeoff', c.hidden ? 'Unhide (H)' : 'Hide from screen (H)'),
    b(c.blocked ? 'unblock' : 'block', 'ban', c.blocked ? 'Unblock user (B)' : 'Block user (B)', 'danger'),
    b('delete', 'trash', 'Delete from memory (Del)', 'danger'))
}

// "Unsaved changes" bar. setDirty(true) shows it.
export function saveBar({ onSave, onRevert, label = 'You have unsaved changes' }) {
  const save = h('button', { class: 'btn primary sm' }, 'Apply changes')
  const el = h('div', { class: 'savebar', hidden: true }, h('span', { class: 'grow' }, label),
    h('button', { class: 'btn sm', onclick: onRevert }, 'Revert'), save)
  save.addEventListener('click', async () => { save.disabled = true; try { await onSave() } finally { save.disabled = false } })
  return { el, setDirty: (d) => { el.hidden = !d } }
}

export function field(label, control, help) {
  return h('div', { class: 'field' }, h('label', null, label), control, help && h('div', { class: 'help' }, help))
}
export function sw(label, checked, onchange) {
  return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), h('span', null, label))
}
export function segmented(options, value, onpick) {
  const wrap = h('div', { class: 'segmented', role: 'group' })
  const paint = (v) => wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === v))
  for (const [v, label] of options) wrap.append(h('button', { dataset: { v }, onclick: () => { paint(v); onpick(v) } }, label))
  paint(value)
  wrap.set = paint
  return wrap
}

// a list of short strings you add with Enter / comma / paste
export function chipsInput({ values, placeholder, onChange }) {
  const box = h('div', { class: 'chips' })
  const input = h('input', { class: 'input', placeholder })
  const draw = () => clear(box).append(...values.map((v, i) =>
    h('span', { class: 'chip' }, v, h('button', { title: 'Remove', onclick: () => { values.splice(i, 1); draw(); onChange() } }, icon('x')))))
  const add = (raw) => {
    const items = String(raw).split(/[\n,]/).map((x) => x.trim()).filter((x) => x && !values.some((v) => v.toLowerCase() === x.toLowerCase()))
    if (items.length) { values.push(...items); draw(); onChange() }
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); input.value = '' } })
  input.addEventListener('paste', (e) => { e.preventDefault(); add(e.clipboardData.getData('text')) })
  input.addEventListener('blur', () => { add(input.value); input.value = '' })
  draw()
  return { el: h('div', { class: 'stack', style: { gap: '10px' } }, input, box), add, redraw: draw }
}

