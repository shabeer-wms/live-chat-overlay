// App frame: sidebar, top bar, hash router, and the page lifecycle (mount / cleanup).
import { api } from './api.js'
import { h, clear, copyText, guard } from './dom.js'
import { icon } from './icons.js'
import { state, subscribe, bus, disconnect } from './state.js'
import { statusBadge } from './components.js'

const NAV = [
  ['live', 'Live', 'live'], ['giveaway', 'Giveaway', 'gift'], ['engage', 'Engage', 'engage'], ['automation', 'Automation', 'bot'],
  ['sources', 'Sources', 'plug'], ['design', 'Design', 'palette'],
  ['filters', 'Filters', 'shield'], ['history', 'History', 'history'], ['settings', 'Settings', 'settings'],
]

export function renderShell(root, pages) {
  const title = h('h1')
  const page = h('div', { class: 'page' })
  const banner = h('div', { class: 'callout warn', hidden: true })
  const links = new Map(NAV.map(([id, label, ic]) => [id, h('a', { href: `#/${id}`, 'aria-label': label }, icon(ic, 'lg'), h('span', { class: 'label' }, label))]))
  const queueBadge = h('span', { class: 'badge accent', hidden: true })
  links.get('live').append(queueBadge)

  const yt = h('a', { href: '#/sources', title: 'YouTube' }), fb = h('a', { href: '#/sources', title: 'Facebook' })
  const net = h('span', { class: 'badge warn', hidden: true }, h('span', { class: 'dot' }), 'Reconnecting…')
  // the spotlight can be removed from any page
  const spotChip = h('button', { class: 'btn sm on', hidden: true, title: 'Remove the spotlight from the stream', onclick: () => guard(() => api.post('/api/overlay/unhighlight')) })

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, icon('chat')), 'Chat Overlay'),
    h('nav', { class: 'nav' }, [...links.values()]),
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'nav' }, h('a', { href: '#', onclick: async (e) => { e.preventDefault(); await guard(() => api.post('/api/auth/logout')); disconnect(); location.reload() } }, icon('logout', 'lg'), h('span', { class: 'label' }, 'Sign out')))))
  const top = h('header', { class: 'topbar' }, title, h('div', { class: 'spacer' }), spotChip, net, yt, fb,
    h('button', { class: 'btn sm', title: 'Copy the link to paste into OBS', onclick: () => copyText(location.origin + '/overlay') }, icon('copy'), 'OBS link'))

  root.replaceChildren(h('div', { class: 'shell' }, sidebar, h('div', { class: 'main' }, top, h('div', { class: 'page-wrap' }, banner, page))))

  // ---- live bits in the chrome ----
  function paintChrome() {
    const s = state.server
    const badge = (name, st) => h('span', { class: 'src' }, name, statusBadge(st))
    clear(yt).append(badge('YT', s.sources.youtube.status))
    clear(fb).append(badge('FB', s.sources.facebook.status))
    queueBadge.hidden = !s.queue.length; queueBadge.textContent = s.queue.length
    spotChip.hidden = !s.highlighted
    if (s.highlighted) clear(spotChip).append(icon('zap'), `Spotlight on${s.highlightedComment ? ': ' + s.highlightedComment.name : ''}`, icon('x'))
    banner.hidden = !s.defaultPin
    if (s.defaultPin) clear(banner).append(icon('alert'), h('div', { class: 'grow' }, h('b', null, 'You are using the default PIN. '), 'Choose your own so only you can open this page.'),
      h('a', { class: 'btn sm', href: '#/settings' }, 'Change PIN'))
  }
  const offs = [subscribe(paintChrome), bus.on('connection', (on) => { net.hidden = on })]
  paintChrome()

  // ---- router ----
  let cleanup = null
  function route() {
    const id = location.hash.replace(/^#\//, '') || 'live'
    const mod = pages[id] || pages.live
    const key = pages[id] ? id : 'live'
    cleanup?.(); cleanup = null
    links.forEach((a, k) => a.classList.toggle('active', k === key))
    title.textContent = mod.title
    document.title = `${mod.title} · Chat Overlay`
    clear(page).append(h('div', { class: 'page-head' }, h('p', { class: 'lead' }, mod.subtitle)))
    const body = h('div', { class: 'page-body' })
    page.append(body)
    cleanup = mod.mount(body) || null
    window.scrollTo(0, 0)
  }
  window.addEventListener('hashchange', route)
  route()

  return () => { offs.forEach((o) => o()); window.removeEventListener('hashchange', route); cleanup?.() }
}
