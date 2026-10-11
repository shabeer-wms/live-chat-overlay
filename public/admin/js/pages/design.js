// Design: pick a look in one click, or tune every detail with a live preview.
import { api } from '../api.js'
import { h, clear, guard, promptDialog, confirmDialog } from '../dom.js'
import { icon } from '../icons.js'
import { state, patch } from '../state.js'
import { saveBar, field, sw, segmented } from '../components.js'
import { DESIGNS, FONTS, ANIMATIONS, SAMPLES } from '../designs.js'

const SPOT_KEYS = ['spotSize', 'spotPosition', 'spotSeconds', 'spotMark']
const sameLook = (a, b) => Object.keys(b).every((k) => a[k] === b[k])

// draw a style into an overlay iframe (the overlay page exposes applyStyle/addMessage/showSpot)
function paintFrame(frame, style, { spot = false } = {}) {
  const w = frame.contentWindow
  if (!w?.applyStyle) return
  w.applyStyle(style)
  w.document.getElementById('list').replaceChildren()
  SAMPLES.slice(0, spot ? 3 : 2).forEach((m) => w.addMessage({ ...m, replay: true }))
  w.showSpot(spot ? { ...SAMPLES[0], id: 'spot-demo', parts: [{ text: 'This is how a highlighted comment looks.' }] } : null)
}

export default {
  title: 'Design',
  subtitle: 'How comments look on stream. Pick a design, then fine-tune if you like.',

  mount(root) {
    let profile = '' // '' = the default look; otherwise the name of a saved look for another OBS scene
    const styleOf = () => (profile ? state.server.profiles[profile] : state.server.style) || state.server.style
    let draft = { ...styleOf() }
    const setters = [] // each control registers how to show a draft value

    // ---------- gallery ----------
    const gallery = h('div', { class: 'designs' })
    const thumbs = DESIGNS.map((d) => {
      const frame = h('iframe', { src: '/overlay?static', title: d.name, tabIndex: -1 })
      frame.addEventListener('load', () => paintFrame(frame, { ...styleOf(), ...d.style }))
      const card = h('button', { class: 'design', onclick: () => choose(d) }, h('div', { class: 'thumb' }, frame), h('b', null, d.name), h('span', { class: 'faint small' }, d.note))
      gallery.append(card)
      const box = card.querySelector('.thumb')
      new ResizeObserver(() => { const k = box.clientWidth / 900; frame.style.transform = `scale(${k})` }).observe(box)
      return { d, card }
    })
    async function choose(d) {
      draft = { ...d.style, ...Object.fromEntries(SPOT_KEYS.map((k) => [k, draft[k]])) } // a look change keeps your spotlight settings
      await apply(`Applied “${d.name}”`)
    }

    async function apply(message) { // save the draft; the server returns the cleaned style it stored
      const r = await guard(() => api.post('/api/style', { style: draft, profile }), message)
      if (r) { patch({ style: r.style, profiles: r.profiles }); draft = { ...styleOf() } }
      sync()
    }

    // ---------- controls ----------
    function bind(key, make) { // make(value, set) -> control element; set(v) updates the draft
      const set = (v) => { draft[key] = v; changed() }
      const { el, show } = make(draft[key], set)
      setters.push(() => show(draft[key]))
      return el
    }
    const range = (key, label, min, max, unit = '') => field(label, bind(key, (v, set) => {
      const input = h('input', { type: 'range', min, max, value: v }), out = h('output', null, v + unit)
      input.addEventListener('input', () => { out.textContent = input.value + unit; set(Number(input.value)) })
      return { el: h('div', { class: 'range-row' }, input, out), show: (x) => { input.value = x; out.textContent = x + unit } }
    }))
    const color = (key, label) => field(label, bind(key, (v, set) => {
      const input = h('input', { class: 'input', type: 'color', value: v, oninput: () => set(input.value) })
      return { el: input, show: (x) => { input.value = x } }
    }))
    const select = (key, label, options, help) => field(label, bind(key, (v, set) => {
      const el = h('select', { class: 'select', onchange: () => set(el.value) }, options.map(([val, text]) => h('option', { value: val }, text)))
      el.value = v
      return { el, show: (x) => { el.value = x } }
    }), help)
    const number = (key, label, min, max, help) => field(label, bind(key, (v, set) => {
      const el = h('input', { class: 'input', type: 'number', min, max, value: v, oninput: () => set(Number(el.value) || 0) })
      return { el, show: (x) => { el.value = x } }
    }), help)
    const toggle = (key, label) => bind(key, (v, set) => {
      const el = sw(label, v, set)
      return { el, show: (x) => { el.querySelector('input').checked = x } }
    })
    const seg = (key, label, options) => field(label, bind(key, (v, set) => {
      const el = segmented(options, v, set)
      return { el, show: (x) => el.set(x) }
    }))

    const group = (title, ...kids) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title)), h('div', { class: 'card-body' }, h('div', { class: 'form-grid' }, kids)))
    const css = bind('customCss', (v, set) => {
      const el = h('textarea', { class: 'textarea', rows: 6, spellcheck: false, placeholder: '.msg { border-left: 4px solid red; }', oninput: () => set(el.value) }, v)
      return { el, show: (x) => { el.value = x } }
    })

    const controls = h('div', { class: 'stack' },
      group('Text',
        select('fontFamily', 'Font', FONTS), range('fontSize', 'Size', 14, 80, 'px'),
        color('textColor', 'Text colour'), color('nameColor', 'Name colour')),
      group('Box', color('bgColor', 'Background'), range('bgOpacity', 'Opacity', 0, 100, '%'), range('radius', 'Corner radius', 0, 60, 'px')),
      group('Motion',
        select('animation', 'Entrance', ANIMATIONS), select('animationOut', 'Exit', ANIMATIONS),
        range('maxMessages', 'Messages on screen', 1, 12), number('fadeSeconds', 'Fade out after (seconds)', 0, 600, '0 keeps them until pushed off by newer ones.')),
      group('Layout',
        seg('position', 'Chat position', [['bottom', 'Bottom'], ['top', 'Top']]),
        select('layout', 'Message layout', [['inline', 'Inline: name, then text'], ['stacked', 'Stacked: name above'], ['card', 'Card: big avatar'], ['chip', 'Chip: name as a tag'], ['compact', 'Compact: dense lines']]),
        seg('boxWidth', 'Box width', [['fit', 'Fit the text'], ['full', 'Full width']]),
        seg('align', 'Align boxes', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]),
        range('maxWidth', 'Longest box (wraps to more lines)', 20, 100, '%'),
        h('div', { class: 'stack', style: { gap: '10px' } }, toggle('showAvatar', 'Show profile picture'), toggle('showPlatform', 'Show YouTube / Facebook logo'),
          toggle('showName', 'Show the name'), toggle('showBadges', 'Show role badges (owner, mod, member)'), toggle('showTime', 'Show the time')),
        select('nameColorBy', 'Name colour', [['fixed', 'One colour (set under Text)'], ['role', 'By role: owner, mod, member'], ['platform', 'By platform']])),
      group('Spotlight (highlighted comment)',
        range('spotSize', 'Text size', 24, 120, 'px'), seg('spotPosition', 'Position', [['top', 'Top'], ['center', 'Center']]),
        number('spotSeconds', 'Auto-remove after (seconds)', 0, 600, '0 keeps it until you remove it.'),
        toggle('spotMark', 'Highlight the text (marker effect) and mark it in the chat list')),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Custom CSS'), h('span', { class: 'sub' }, 'advanced')),
        h('div', { class: 'card-body stack', style: { gap: '8px' } }, css,
          h('div', { class: 'help' }, 'Classes: ', h('code', null, '.msg'), ' ', h('code', null, '.name'), ' ', h('code', null, '.body'), ' ', h('code', null, '.avatar'), ' ', h('code', null, '.logo'), ' ', h('code', null, '.spotcard'), '. Platform: ', h('code', null, '.msg.youtube'), ' ', h('code', null, '.msg.facebook'), '.'))))

    // ---------- preview ----------
    const pframe = h('iframe', { src: '/overlay?static', title: 'Preview', tabIndex: -1 })
    const stage = h('div', { class: 'stage' }, pframe)
    pframe.addEventListener('load', redraw)
    const fit = new ResizeObserver(() => requestAnimationFrame(() => { const s = stage.clientWidth / 1280; pframe.style.transform = `scale(${s})`; stage.style.height = `${720 * s}px` }))
    fit.observe(stage)
    function redraw() { paintFrame(pframe, draft, { spot: true }) }
    function play() { // show the real entrance / exit motion
      const w = pframe.contentWindow
      w.applyStyle(draft); w.document.getElementById('list').replaceChildren(); w.showSpot(null)
      SAMPLES.forEach((m, i) => setTimeout(() => w.addMessage({ ...m, id: 'p' + Date.now() + i }), 300 + i * 900))
      setTimeout(() => w.showSpot({ ...SAMPLES[0], id: 'spot-' + Date.now(), parts: [{ text: 'This is how a highlighted comment looks.' }] }), 300 + SAMPLES.length * 900)
      setTimeout(() => w.showSpot(null), 300 + SAMPLES.length * 900 + 2500)
    }
    const preview = h('section', { class: 'card sticky' },
      h('div', { class: 'card-head' }, h('h2', null, 'Preview'), h('div', { class: 'right' }, h('button', { class: 'btn sm', onclick: play }, icon('play'), 'Play animation'))),
      h('div', { class: 'card-body' }, stage))

    // ---------- dirty tracking ----------
    const bar = saveBar({
      onSave: () => apply('Design applied'),
      onRevert: () => { draft = { ...styleOf() }; sync() },
    })
    const isDirty = () => Object.keys(draft).some((k) => draft[k] !== styleOf()[k])
    function changed() { bar.setDirty(isDirty()); redraw(); markActive() }
    function markActive() { thumbs.forEach(({ d, card }) => card.classList.toggle('active', sameLook(styleOf(), d.style))) }
    function sync() { setters.forEach((fn) => fn()); bar.setDirty(isDirty()); redraw(); markActive() }

    // ---------- looks for different OBS scenes ----------
    const profSel = h('select', { class: 'select', 'aria-label': 'Look to edit', onchange: () => { profile = profSel.value; draft = { ...styleOf() }; drawProfiles(); sync() } })
    const profHelp = h('div', { class: 'help' })
    const delBtn = h('button', { class: 'btn danger sm', onclick: async () => {
      if (!(await confirmDialog({ title: `Delete “${profile}”?`, body: 'Browser sources using this look fall back to the default look.', confirm: 'Delete', danger: true }))) return
      const r = await guard(() => api.post('/api/profiles/delete', { name: profile }))
      if (r) { patch({ profiles: r.profiles }); profile = ''; draft = { ...styleOf() }; drawProfiles(); sync() }
    } }, 'Delete this look')
    function drawProfiles() {
      const names = Object.keys(state.server.profiles)
      profSel.replaceChildren(h('option', { value: '' }, 'Default look'), ...names.map((n) => h('option', { value: n }, n)))
      profSel.value = profile
      delBtn.hidden = !profile
      profHelp.textContent = profile
        ? `For OBS scenes that use  /overlay?profile=${encodeURIComponent(profile)}  (build the link under Settings).`
        : 'Used by the normal /overlay link. Add another look to give a different OBS scene its own style.'
    }
    const profileCard = h('section', { class: 'card' }, h('div', { class: 'card-body row', style: { marginTop: 0 } },
      h('span', { class: 'label' }, 'Editing'), profSel,
      h('button', { class: 'btn sm', onclick: async () => {
        const name = await promptDialog({ title: 'New look for another scene', label: 'Name (letters, numbers, spaces)', confirm: 'Create', placeholder: 'e.g. Interview' })
        if (!name) return
        const r = await guard(() => api.post('/api/style', { style: draft, profile: name }), `Created “${name}”`)
        if (r) { patch({ profiles: r.profiles }); profile = name; drawProfiles(); sync() }
      } }, icon('plus'), 'New look'), delBtn, profHelp))

    root.append(
      profileCard,
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Designs'), h('span', { class: 'sub' }, 'Click one to apply it to your stream right away')), h('div', { class: 'card-body' }, gallery)),
      h('div', { class: 'design-grid' }, controls, preview), bar.el)
    drawProfiles(); sync()
    return () => fit.disconnect()
  },
}
