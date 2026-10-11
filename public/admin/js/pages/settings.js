// Settings: OBS link, security, appearance.
import { api } from '../api.js'
import { h, clear, guard, copyText, confirmDialog, toast } from '../dom.js'
import { icon } from '../icons.js'
import { state, patch } from '../state.js'
import { field, segmented } from '../components.js'
import { getTheme, setTheme } from '../theme.js'

const pinInput = (label, autocomplete) => {
  const el = h('input', { class: 'input mono', type: 'password', inputMode: 'numeric', maxLength: 6, pattern: '[0-9]{6}', autocomplete, placeholder: '6 digits' })
  el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 6) })
  return { el, field: field(label, el) }
}

export default {
  title: 'Settings',
  subtitle: 'The link for OBS, your PIN, and how this page looks.',

  mount(root) {
    // ---- OBS ----
    const url = location.origin + '/overlay'
    const obs = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'OBS link')),
      h('div', { class: 'card-body stack' },
        h('div', { class: 'row' }, h('input', { class: 'input mono grow', readOnly: true, value: url, onfocus: (e) => e.target.select() }),
          h('button', { class: 'btn primary', onclick: () => copyText(url) }, icon('copy'), 'Copy')),
        h('ol', { class: 'steps' },
          h('li', null, 'In OBS, add a ', h('b', null, 'Browser'), ' source to your scene.'),
          h('li', null, 'Paste the link above as the URL.'),
          h('li', null, 'Set width and height to your canvas, usually ', h('b', null, '1920 × 1080'), '. Leave the custom CSS box in OBS empty.'),
          h('li', null, 'If you edit your design and OBS looks stale, right-click the source and choose Refresh cache of current page.')),
        h('div', { class: 'help' }, 'OBS must run on the same computer as this app, unless you have put it behind HTTPS. Then use that address instead.')))

    // ---- link builder: one browser source per scene / per widget ----
    const PARTS = [['chat', 'Chat'], ['spotlight', 'Spotlight'], ['giveaway', 'Giveaway'], ['poll', 'Poll'], ['goal', 'Goal bar'], ['timer', 'Countdown'], ['wordcloud', 'Word cloud'], ['leaderboard', 'Leaderboard'], ['alerts', 'Alerts']]
    const chosen = new Set(PARTS.map(([k]) => k))
    const prof = h('select', { class: 'select', onchange: build }, h('option', { value: '' }, 'Default look'), ...Object.keys(state.server.profiles).map((n) => h('option', { value: n }, n)))
    const out = h('input', { class: 'input mono', readOnly: true, onfocus: (e) => e.target.select() })
    const boxes = PARTS.map(([k, label]) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { e.target.checked ? chosen.add(k) : chosen.delete(k); build() } }), h('span', null, label)))
    function build() {
      const q = new URLSearchParams()
      if (prof.value) q.set('profile', prof.value)
      if (chosen.size && chosen.size < PARTS.length) q.set('show', [...chosen].join(','))
      out.value = location.origin + '/overlay' + (q.toString() ? '?' + q : '')
    }
    const builder = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Link builder'), h('span', { class: 'sub' }, 'one browser source per scene or widget')),
      h('div', { class: 'card-body stack' },
        h('div', { class: 'help' }, 'Tick only what this OBS source should draw. Use several sources to place chat and widgets on different scenes, or give a scene its own look.'),
        field('Look', prof), h('div', { class: 'form-grid' }, boxes),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, out), h('button', { class: 'btn primary', onclick: () => copyText(out.value) }, icon('copy'), 'Copy'))))
    build()

    // ---- backup ----
    const withSecrets = h('input', { type: 'checkbox' })
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = ''
      if (!f) return
      let bundle
      try { bundle = JSON.parse(await f.text()) } catch { return toast('That file is not valid JSON', 'error') }
      if (!(await confirmDialog({ title: 'Restore this backup?', body: 'Settings are replaced by the backup. Comments from the file are added to the ones you already have. Your PIN does not change.', confirm: 'Restore' }))) return
      const r = await guard(() => api.post('/api/restore', { bundle }))
      if (r) { toast(`Restored. ${r.comments} comments added.`); setTimeout(() => location.reload(), 900) }
    } })
    const backup = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Backup and restore')),
      h('div', { class: 'card-body stack' },
        h('div', { class: 'help' }, 'One file with your looks, filters, commands, goal, giveaway history and every saved comment. Your PIN is never included.'),
        h('label', { class: 'switch' }, withSecrets, h('span', null, 'Include the Facebook token (keep the file private)')),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: '#', onclick: (e) => { e.currentTarget.href = '/api/backup' + (withSecrets.checked ? '?secrets=1' : '') }, download: '' }, icon('download'), 'Download backup'),
          h('button', { class: 'btn', onclick: () => file.click() }, icon('upload'), 'Restore from file'), file)))

    // ---- PIN ----
    const cur = pinInput('Current PIN', 'current-password'), next = pinInput('New PIN', 'new-password'), again = pinInput('New PIN again', 'new-password')
    const warn = h('div', { class: 'callout warn', hidden: !state.server.defaultPin }, icon('alert'), h('div', null, h('b', null, 'You are using the default PIN.'), ' Anyone who can open this page can get in. Choose your own PIN below.'))
    async function changePin() {
      if (next.el.value !== again.el.value) return toast('The new PINs do not match', 'error')
      const r = await guard(() => api.post('/api/auth/pin', { current: cur.el.value, next: next.el.value }), 'PIN changed. Other devices were signed out.')
      if (r) { cur.el.value = next.el.value = again.el.value = ''; patch({ defaultPin: false }); warn.hidden = true }
    }
    async function signOutEverywhere() {
      if (await confirmDialog({ title: 'Sign out on every device?', body: 'You will need your PIN again, here too.', confirm: 'Sign out everywhere' })) {
        await guard(() => api.post('/api/auth/logout-all')); location.reload()
      }
    }
    const security = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'PIN')),
      h('div', { class: 'card-body stack' }, warn,
        h('div', { class: 'form-grid' }, cur.field, next.field, again.field),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: changePin }, 'Change PIN'),
          h('button', { class: 'btn', onclick: signOutEverywhere }, icon('logout'), 'Sign out everywhere')),
        h('div', { class: 'help' }, 'Too many wrong PINs lock the page for a while, so guessing is not practical. Keep the app off the public internet unless it sits behind HTTPS.')))

    // ---- appearance ----
    const look = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Appearance')),
      h('div', { class: 'card-body' }, field('Theme', segmented([['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']], getTheme(), setTheme), 'Only changes this admin page, not your stream overlay.')))

    root.append(h('div', { class: 'stack', style: { maxWidth: '760px' } }, obs, builder, security, backup, look))
  },
}
