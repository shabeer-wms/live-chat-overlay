// Filters: automatic rules that keep unwanted comments off the stream. Blocked users live here too.
import { api } from '../api.js'
import { h, clear, guard } from '../dom.js'
import { icon, platformLogo } from '../icons.js'
import { state, patch, subscribe } from '../state.js'
import { saveBar, field, sw, chipsInput } from '../components.js'

const COMMON_BOTS = ['Nightbot', 'StreamElements', 'Streamlabs', 'Moobot', 'Fossabot', 'Wizebot']

export default {
  title: 'Filters',
  subtitle: 'Rules that keep unwanted comments off your stream. They never touch YouTube or Facebook itself.',

  mount(root) {
    const copy = (f) => ({ ...f, words: [...f.words], bots: [...f.bots] })
    const draft = copy(state.server.filters)
    const dirty = () => JSON.stringify(draft) !== JSON.stringify(state.server.filters)
    const changed = () => bar.setDirty(dirty())

    const words = chipsInput({ values: draft.words, placeholder: 'Type a word or phrase and press Enter', onChange: changed })
    const bots = chipsInput({ values: draft.bots, placeholder: 'Bot name, e.g. Nightbot', onChange: changed })
    const maxLen = h('input', { class: 'input', type: 'number', min: 0, max: 2000, value: draft.maxLength, oninput: (e) => { draft.maxLength = Number(e.target.value) || 0; changed() } })
    const links = sw('Hide comments that contain links', draft.links, (v) => { draft.links = v; changed() })
    const staff = sw('Let the channel owner and moderators skip the word, link, length and caps rules', draft.exemptStaff, (v) => { draft.exemptStaff = v; changed() })
    const caps = h('input', { class: 'input', type: 'number', min: 0, max: 100, value: draft.maxCapsPercent, oninput: (e) => { draft.maxCapsPercent = Number(e.target.value) || 0; changed() } })
    const repeats = sw('Hide the same comment repeated by the same person within a minute', draft.blockRepeats, (v) => { draft.blockRepeats = v; changed() })

    const bar = saveBar({
      onSave: async () => {
        const r = await guard(() => api.post('/api/filters', { filters: draft }), 'Filters saved')
        if (r) { patch({ filters: r.filters }); setDraft(r.filters) }
      },
      onRevert: () => setDraft(state.server.filters),
    })
    function setDraft(f) { // update in place so the chip lists keep pointing at the same arrays
      draft.words.splice(0, draft.words.length, ...f.words)
      draft.bots.splice(0, draft.bots.length, ...f.bots)
      Object.assign(draft, { links: f.links, maxLength: f.maxLength, exemptStaff: f.exemptStaff, maxCapsPercent: f.maxCapsPercent, blockRepeats: f.blockRepeats })
      caps.value = draft.maxCapsPercent
      repeats.querySelector('input').checked = draft.blockRepeats
      words.redraw(); bots.redraw()
      maxLen.value = draft.maxLength
      links.querySelector('input').checked = draft.links
      staff.querySelector('input').checked = draft.exemptStaff
      bar.setDirty(dirty())
    }

    // ---- try it ----
    const tText = h('input', { class: 'input', placeholder: 'Type a comment to try…' })
    const tBadge = h('select', { class: 'select', style: { width: '150px' } }, h('option', { value: '' }, 'Regular viewer'), h('option', { value: 'mod' }, 'Moderator'), h('option', { value: 'owner' }, 'Owner'))
    const result = h('div', { class: 'row', style: { minHeight: '24px' } })
    async function test() {
      const r = await guard(() => api.post('/api/filters/test', { text: tText.value, badge: tBadge.value }))
      if (!r) return
      clear(result).append(r.flag ? h('span', { class: 'badge danger' }, `Held back: ${r.flag}`) : h('span', { class: 'badge ok' }, 'Would appear on stream'),
        dirty() ? h('span', { class: 'help' }, 'Tested against the saved rules; apply your changes first to include them.') : null)
    }
    tText.addEventListener('keydown', (e) => e.key === 'Enter' && test())

    // ---- blocked users ----
    const blockedBox = h('div', { class: 'stack', style: { gap: '8px' } })
    function drawBlocked() {
      const list = state.server.blocked
      clear(blockedBox).append(...(list.length ? list.map((b) => h('div', { class: 'qrow' }, platformLogo(b.platform), h('div', { class: 'grow' }, h('b', null, b.name)),
        h('button', { class: 'btn sm', onclick: () => guard(() => api.post('/api/comments/action', { id: 'x', uid: b.uid, action: 'unblock' }), `Unblocked ${b.name}`) }, 'Unblock')))
        : [h('div', { class: 'faint' }, 'No blocked users. Block someone from a comment on the Live page.')]))
    }

    root.append(h('div', { class: 'stack' },
      h('div', { class: 'grid-2' },
        h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Blocked words')),
          h('div', { class: 'card-body stack' }, words.el, h('div', { class: 'help' }, 'Comments containing any of these are held back. Not case-sensitive. Paste a list separated by commas or new lines.'))),
        h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Bots')),
          h('div', { class: 'card-body stack' }, bots.el,
            h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => bots.add(COMMON_BOTS.join(',')) }, 'Add common bots')),
            h('div', { class: 'help' }, 'Comments from these names never appear on stream.')))),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Rules')),
        h('div', { class: 'card-body stack' }, links, repeats,
          h('div', { class: 'form-grid' },
            field('Longest comment to show (characters)', maxLen, '0 means no limit. Longer comments are held back.'),
            field('Hide SHOUTING above this % capitals', caps, '0 turns it off. Only applies to comments with 8+ letters.')), staff)),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Try it'), h('span', { class: 'sub' }, 'see what the saved rules would do')),
        h('div', { class: 'card-body stack' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, tText), tBadge, h('button', { class: 'btn', onclick: test }, 'Test')), result)),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Blocked users'), h('span', { class: 'sub' }, 'never shown on stream')), h('div', { class: 'card-body' }, blockedBox)),
      h('div', { class: 'help' }, 'Held-back comments are still saved in your history, marked “Filtered”. Rules apply to new comments, not ones already received. You can always bring one back with Show on the Live page.')),
      bar.el)

    drawBlocked()
    return subscribe(drawBlocked)
  },
}
