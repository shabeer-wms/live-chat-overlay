// Live: the working screen. Comment feed on the left, what's on stream on the right.
import { api } from '../api.js'
import { h, clear, debounce, guard, toast, confirmDialog, fmtDateTime } from '../dom.js'
import { icon } from '../icons.js'
import { state, subscribe, bus } from '../state.js'
import { commentRow, commentBody, avatar, segmented } from '../components.js'

const SHOW = 150 // rows drawn at once; search and filters reach the rest
const SHORTCUTS = [
  ['J / K  or  ↓ / ↑', 'Move through comments'], ['Enter', 'Spotlight the comment'], ['Q', 'Add to / remove from queue'],
  ['N', 'Spotlight next in queue'], ['Space', 'Show on screen'], ['S', 'Star'], ['A', 'Mark question answered'], ['H', 'Hide / unhide'], ['B', 'Block / unblock user'],
  ['Delete', 'Delete from memory'], ['X', 'Select / unselect'], ['P', 'Pause / resume the feed'], ['C', 'Hide / show the chat on stream'], ['/', 'Search'], ['Esc', 'Remove spotlight, clear selection'],
]

export default {
  title: 'Live',
  subtitle: 'Moderate comments and choose what appears on stream.',

  mount(root) {
    let comments = [] // chronological, current scope
    let streams = []
    let scope = 'latest' // 'latest' | 'all' | a stream id
    let paused = false
    let pending = [] // arrivals held back while paused
    let focusId = null
    const selected = new Set()
    const filter = { text: '', platform: '', show: 'all' }

    const streamKey = () => (scope === 'latest' ? streams[0]?.stream || '' : scope === 'all' ? '' : scope)

    // ---------------- layout ----------------
    const search = h('input', { class: 'input', placeholder: 'Search name or comment   ( / )', oninput: debounce((e) => { filter.text = e.target.value.trim().toLowerCase(); drawList() }, 120) })
    const platformSel = h('select', { class: 'select', onchange: (e) => { filter.platform = e.target.value; drawList() } },
      h('option', { value: '' }, 'All platforms'), h('option', { value: 'youtube' }, 'YouTube'), h('option', { value: 'facebook' }, 'Facebook'))
    const showSel = h('select', { class: 'select', onchange: (e) => { filter.show = e.target.value; drawList() } },
      h('option', { value: 'all' }, 'All comments'), h('option', { value: 'held' }, 'Held / hidden'), h('option', { value: 'starred' }, 'Starred'), h('option', { value: 'questions' }, 'Open questions'), h('option', { value: 'paid' }, 'Super Chats'), h('option', { value: 'queued' }, 'In queue'))
    const streamSel = h('select', { class: 'select', 'aria-label': 'Stream', onchange: (e) => { scope = e.target.value; load() } })
    const pauseBtn = h('button', { class: 'btn', onclick: () => togglePause() })
    const stats = h('div', { class: 'stats' })
    // shown while the pointer holds the list still and new comments wait
    const newPill = h('button', { class: 'btn sm primary newpill', hidden: true, onclick: () => drawList(true) })
    const bulk = h('div', { class: 'bulk', hidden: true })
    const list = h('div', { class: 'clist2' })
    const more = h('div', { class: 'help', style: { padding: '8px 16px' } })

    const feedCard = h('section', { class: 'card feed' },
      h('div', { class: 'card-head' }, h('h2', null, 'Comments'), h('span', { class: 'sub', id: 'live-sub' }),
        h('div', { class: 'right' }, streamSel, pauseBtn,
          h('button', { class: 'btn icon', title: 'Keyboard shortcuts ( ? )', onclick: showShortcuts }, icon('help')))),
      h('div', { class: 'toolbar2' }, h('div', { class: 'search grow' }, icon('search'), search), platformSel, showSel),
      stats, bulk, newPill, list, more)

    // monitor: the real overlay page, scaled to fit, so what you see is what OBS gets
    const frame = h('iframe', { src: '/overlay', title: 'Overlay preview', tabIndex: -1 })
    const monitor = h('div', { class: 'monitor' }, frame)
    const fit = new ResizeObserver(() => requestAnimationFrame(() => {
      const s = monitor.clientWidth / 1920
      frame.style.transform = `scale(${s})`
      monitor.style.height = `${1080 * s}px`
    }))
    fit.observe(monitor)

    const modeSeg = segmented([['auto', 'Auto'], ['manual', 'Manual']], state.server.mode, (mode) => guard(() => api.post('/api/mode', { mode })))
    const modeHelp = h('div', { class: 'help' })
    // hide / show the whole chat list on stream (widgets and the spotlight stay)
    const chatBtn = h('button', { class: 'btn', onclick: () => guard(() => api.post('/api/overlay/chat', { hidden: !state.server.display.chatHidden })) })
    const paintChatBtn = () => {
      const hidden = state.server.display.chatHidden
      clear(chatBtn).append(icon(hidden ? 'eye' : 'eyeoff'), hidden ? 'Show chat' : 'Hide chat')
      chatBtn.classList.toggle('on', hidden)
      chatBtn.title = hidden ? 'Chat is hidden on stream. Click to show it again ( C )' : 'Hide the chat list on stream, keeping widgets and the spotlight ( C )'
    }
    const screenCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'On stream'), h('div', { class: 'right' }, modeSeg)),
      h('div', { class: 'card-body stack', style: { gap: '12px' } }, monitor, modeHelp,
        h('div', { class: 'row' },
          chatBtn,
          h('button', { class: 'btn', onclick: () => guard(() => api.post('/api/overlay/clear')) }, icon('broom'), 'Clear screen'),
          h('button', { class: 'btn', onclick: () => guard(() => api.post('/api/overlay/test', { text: 'This is a test comment 👋' })) }, icon('chat'), 'Send test'),
          h('button', { class: 'btn', title: 'Preview how a paid comment and its alert look', onclick: () => guard(() => api.post('/api/overlay/test', { text: 'Thanks for the great show!', paid: true })) }, icon('star'), 'Test Super Chat'))))

    // play the queue on its own: each queued comment is spotlighted for N seconds, then the next
    const autoSw = h('input', { type: 'checkbox', onchange: () => saveQueuePlay() })
    const autoSecs = h('input', { class: 'input', type: 'number', min: 2, max: 600, style: { width: '84px' }, onchange: () => saveQueuePlay() })
    function saveQueuePlay() {
      guard(() => api.post('/api/rules', { display: { ...state.server.display, autoplayQueue: autoSw.checked, queueSeconds: Number(autoSecs.value) || 8 } }))
    }
    const queuePlay = h('div', { class: 'row', style: { marginTop: 0 } },
      h('label', { class: 'switch' }, autoSw, h('span', null, 'Play the queue automatically, each for')),
      autoSecs, h('span', { class: 'muted' }, 'seconds'))
    const spotBox = h('div'), queueBox = h('div'), nextBtn = h('button', { class: 'btn primary', onclick: () => guard(() => api.post('/api/overlay/next')) }, icon('next'), 'Next in queue')
    const spotCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Spotlight'), h('div', { class: 'right' }, nextBtn)),
      h('div', { class: 'card-body stack', style: { gap: '12px' } }, spotBox, h('div', { class: 'sep' }), h('div', { class: 'label' }, 'Queue'), queueBox, queuePlay))

    root.append(h('div', { class: 'live-grid' }, feedCard, h('div', { class: 'stack' }, screenCard, spotCard)))

    // ---------------- data ----------------
    async function load() {
      const head = await api.get('/api/comments?limit=1') // just the stream list
      streams = head.streams
      if (scope !== 'latest' && scope !== 'all' && !streams.some((s) => s.stream === scope)) scope = 'latest'
      const r = await api.get('/api/comments?stream=' + encodeURIComponent(streamKey()) + '&limit=1000')
      comments = r.comments; pending = []
      selected.clear()
      drawStreamSelect(); drawList(); drawStats(); updatePause()
    }
    function drawStreamSelect() {
      streamSel.replaceChildren(
        h('option', { value: 'latest' }, streams[0] ? `Latest stream · ${streamName(streams[0])}` : 'Latest stream'),
        h('option', { value: 'all' }, 'All streams'),
        ...streams.map((s) => h('option', { value: s.stream }, `${streamName(s)} · ${s.count} · ${fmtDateTime(s.last)}`)))
      streamSel.value = scope
    }
    const streamName = (s) => { const [k, id] = s.stream.split(':'); return k === 'yt' ? 'YouTube ' + id : k === 'fb' ? 'Facebook ' + id : 'Test' }

    const offs = [
      bus.on('comment', (c) => {
        if (!streams.some((s) => s.stream === c.stream)) return load()
        const key = streamKey(); if (key && c.stream !== key) return
        const i = comments.findIndex((x) => x.id === c.id)
        if (i >= 0) comments[i] = c
        else if (paused) { pending.push(c); updatePause(); return }
        else { comments.push(c); if (comments.length > 1500) comments.shift() }
        schedule()
      }),
      bus.on('removed', ({ id }) => { comments = comments.filter((c) => c.id !== id); pending = pending.filter((c) => c.id !== id); selected.delete(id); schedule() }),
      bus.on('refresh', load),
      subscribe(() => { drawSpot(); drawMode(); schedule() }),
    ]
    let queued = false
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; drawList(); drawStats() }) } }

    // ---------------- drawing ----------------
    function visible() {
      const queue = state.server.queue
      return comments.filter((c) =>
        (!filter.platform || c.platform === filter.platform) &&
        (!filter.text || c.name.toLowerCase().includes(filter.text) || c.text.toLowerCase().includes(filter.text)) &&
        (filter.show === 'all' || (filter.show === 'held' && (c.hidden || c.blocked)) || (filter.show === 'starred' && c.starred) || (filter.show === 'questions' && c.question && !c.answered) || (filter.show === 'paid' && c.money) || (filter.show === 'queued' && queue.includes(c.id)))
      ).reverse() // newest first
    }
    // Rows are kept and updated in place (never wiped and rebuilt), so a button under the pointer
    // is never replaced between press and release. While the pointer is over the list, new comments
    // wait (shown as a "N new" pill) so rows don't slide away under it.
    const rowEls = new Map() // id -> { el, sig }
    let hovering = false
    const sigOf = (c, o) => [c.hidden, c.starred, c.flag, c.blocked, c.answered, c.question, c.text, o.selected, o.highlighted, o.queued].join('|')
    function drawList(flush = false) {
      const rows = visible(), hi = state.server.highlighted, queue = state.server.queue
      if (!rows.some((c) => c.id === focusId)) focusId = rows[0]?.id || null
      const shown = rows.slice(0, SHOW)
      const ids = new Set(shown.map((c) => c.id))
      const hold = hovering && !flush
      let held = 0
      const want = hold ? shown.filter((c) => rowEls.has(c.id) || (held++, false)) : shown

      list.querySelector('.empty')?.remove()
      for (const [id, r] of rowEls) if (!ids.has(id)) { r.el.remove(); rowEls.delete(id) }
      want.forEach((c, i) => {
        const o = { selected: selected.has(c.id), focused: c.id === focusId, highlighted: c.id === hi, queued: queue.indexOf(c.id) + 1 }
        const sig = sigOf(c, o)
        let r = rowEls.get(c.id)
        if (!r) { r = { el: commentRow(c, o), sig }; rowEls.set(c.id, r) }
        else if (r.sig !== sig) { const next = commentRow(c, o); r.el.replaceWith(next); r.el = next; r.sig = sig }
        const at = list.children[i]
        if (at !== r.el) list.insertBefore(r.el, at || null) // only moves what is out of place
      })
      if (!want.length && !held) list.append(emptyState())
      markFocus(false)

      newPill.hidden = !held
      newPill.textContent = `${held} new comment${held === 1 ? '' : 's'}: move the pointer away or click`
      more.textContent = rows.length > SHOW ? `Showing the newest ${SHOW} of ${rows.length}. Search or filter to narrow down.` : ''
      document.getElementById('live-sub').textContent = `${comments.length} stored`
      drawBulk()
    }
    list.addEventListener('mouseenter', () => { hovering = true })
    list.addEventListener('mouseleave', () => { hovering = false; drawList() })
    function emptyState() {
      if (comments.length) return h('div', { class: 'empty' }, h('b', null, 'No comments match'), 'Try clearing the search or filters.')
      return h('div', { class: 'empty' }, h('b', null, 'No comments yet'),
        'Connect a stream under ', h('a', { href: '#/sources' }, 'Sources'), ', or press “Send test” to see how it works.')
    }
    function drawStats() {
      const now = Date.now(), recent = comments.filter((c) => c.ts > now - 5 * 60000).length
      const held = comments.filter((c) => c.hidden || c.blocked).length
      const stat = (label, value) => h('div', { class: 'stat' }, h('b', null, value), h('span', null, label))
      clear(stats).append(stat('comments', comments.length), stat('per minute', (recent / 5).toFixed(1)),
        stat('chatters', new Set(comments.map((c) => c.uid)).size), stat('held back', held))
    }
    function drawBulk() {
      bulk.hidden = !selected.size
      if (!selected.size) return
      const b = (label, act, ic, cls = '') => h('button', { class: 'btn sm ' + cls, onclick: () => run(act, [...selected]) }, icon(ic), label)
      clear(bulk).append(h('b', null, `${selected.size} selected`), b('Queue', 'queue', 'queue'), b('Star', 'star', 'star'), b('Hide', 'hide', 'eyeoff'),
        b('Delete', 'delete', 'trash', 'danger'),
        h('button', { class: 'btn sm ghost', onclick: () => { selected.clear(); drawList() } }, 'Clear selection'),
        h('button', { class: 'btn sm ghost', onclick: () => { visible().slice(0, SHOW).forEach((c) => selected.add(c.id)); drawList() } }, 'Select all shown'))
    }
    function drawSpot() {
      const s = state.server
      const c = s.highlightedComment
      clear(spotBox).append(c
        ? h('div', { class: 'spot-now' }, avatar(c, 40),
          h('div', { class: 'grow' }, h('b', null, c.name), h('div', { class: 'ctext' }, commentBody(c))),
          h('button', { class: 'btn sm', onclick: () => guard(() => api.post('/api/overlay/unhighlight')) }, icon('x'), 'Remove'))
        : h('div', { class: 'faint' }, 'Nothing in the spotlight. Press ', h('span', { class: 'kbd' }, 'Enter'), ' on a comment to feature it.'))
      clear(queueBox).append(...(s.queueComments.length
        ? s.queueComments.map((q, i) => h('div', { class: 'qrow' }, h('span', { class: 'qn' }, i + 1),
          h('div', { class: 'grow qtext' }, h('b', null, q.name + ' '), q.text),
          h('button', { class: 'btn sm icon ghost', title: 'Spotlight now', onclick: () => run('highlight', [q.id]) }, icon('zap')),
          h('button', { class: 'btn sm icon ghost', title: 'Remove from queue', onclick: () => run('unqueue', [q.id]) }, icon('x'))))
        : [h('div', { class: 'faint' }, 'Empty. Press ', h('span', { class: 'kbd' }, 'Q'), ' on comments to line them up.')]))
      nextBtn.disabled = !s.queueComments.length
    }
    function drawMode() {
      paintChatBtn()
      autoSw.checked = !!state.server.display.autoplayQueue
      if (document.activeElement !== autoSecs) autoSecs.value = state.server.display.queueSeconds || 8
      modeSeg.set(state.server.mode)
      modeHelp.textContent = state.server.mode === 'auto'
        ? 'Auto: every new comment appears on stream unless a filter or block holds it back.'
        : 'Manual: nothing appears until you press Show or Spotlight on a comment.'
    }
    function updatePause() {
      clear(pauseBtn).append(icon(paused ? 'play' : 'pause'), paused ? `Resume${pending.length ? ` (${pending.length} new)` : ''}` : 'Pause')
      pauseBtn.classList.toggle('on', paused)
    }
    function togglePause() {
      paused = !paused
      if (!paused) { comments.push(...pending); pending = []; schedule() }
      updatePause()
    }

    // ---------------- actions ----------------
    async function run(action, ids) {
      if (!ids.length) return
      const many = ids.length > 1
      if (action === 'delete' && !(await confirmDialog({ title: many ? `Delete ${ids.length} comments?` : 'Delete this comment?', body: 'It leaves memory and the overlay for good.', confirm: 'Delete', danger: true }))) return
      if (action === 'block') {
        const c = comments.find((x) => x.id === ids[0])
        if (!(await confirmDialog({ title: `Block ${c?.name || 'this user'}?`, body: 'Their comments will never appear on the overlay. They are not blocked on YouTube or Facebook.', confirm: 'Block', danger: true }))) return
      }
      await guard(() => api.post('/api/comments/action', { ids, action }))
      if (action === 'delete') ids.forEach((id) => selected.delete(id))
    }
    const current = () => comments.find((c) => c.id === focusId)

    list.addEventListener('click', (e) => {
      const row = e.target.closest('.crow'); if (!row) return
      const id = row.dataset.id
      if (e.target.matches('input[data-sel]')) {
        e.target.checked ? selected.add(id) : selected.delete(id)
        row.classList.toggle('selected', e.target.checked); drawBulk(); return
      }
      focusId = id; markFocus(false)
      const btn = e.target.closest('button[data-act]')
      if (btn) run(btn.dataset.act, [id])
    })
    function markFocus(scroll = true) {
      list.querySelectorAll('.crow.focus').forEach((r) => r.classList.remove('focus'))
      const r = list.querySelector(`.crow[data-id="${CSS.escape(focusId || '')}"]`)
      r?.classList.add('focus'); if (scroll) r?.scrollIntoView({ block: 'nearest' })
    }
    function showShortcuts() {
      const dlg = h('dialog', null,
        h('div', { class: 'dlg-body' }, h('h3', null, 'Keyboard shortcuts'),
          h('div', { class: 'shortcuts' }, SHORTCUTS.flatMap(([k, d]) => [h('span', { class: 'kbd' }, k), h('span', null, d)]))),
        h('div', { class: 'dlg-foot' }, h('button', { class: 'btn primary', onclick: () => dlg.close() }, 'Done')))
      dlg.addEventListener('close', () => dlg.remove()); document.body.append(dlg); dlg.showModal()
    }

    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) { if (e.key === 'Escape') e.target.blur(); return }
      if (document.querySelector('dialog[open]')) return
      const rows = visible().slice(0, SHOW)
      const idx = rows.findIndex((c) => c.id === focusId), cur = current()
      const go = (i) => { focusId = rows[Math.max(0, Math.min(rows.length - 1, i))]?.id; markFocus() }
      const queue = state.server.queue
      switch (e.key) {
        case 'j': case 'ArrowDown': e.preventDefault(); return go(idx + 1)
        case 'k': case 'ArrowUp': e.preventDefault(); return go(idx - 1)
        case 'Enter': if (cur) run(state.server.highlighted === cur.id ? 'unhighlight' : 'highlight', [cur.id]); return
        case 'q': if (cur) run(queue.includes(cur.id) ? 'unqueue' : 'queue', [cur.id]); return
        case ' ': e.preventDefault(); if (cur) run('show', [cur.id]); return
        case 's': if (cur) run(cur.starred ? 'unstar' : 'star', [cur.id]); return
        case 'a': if (cur?.question) run(cur.answered ? 'unanswer' : 'answer', [cur.id]); return
        case 'h': if (cur) run(cur.hidden ? 'unhide' : 'hide', [cur.id]); return
        case 'b': if (cur) run(cur.blocked ? 'unblock' : 'block', [cur.id]); return
        case 'Delete': case 'Backspace': if (cur) run('delete', [cur.id]); return
        case 'x': if (cur) { selected.has(cur.id) ? selected.delete(cur.id) : selected.add(cur.id); drawList() } return
        case 'n': guard(() => api.post('/api/overlay/next')); return
        case 'c': guard(() => api.post('/api/overlay/chat', { hidden: !state.server.display.chatHidden })); return
        case 'p': return togglePause()
        case '/': e.preventDefault(); return search.focus()
        case '?': return showShortcuts()
        case 'Escape': if (state.server.highlighted) guard(() => api.post('/api/overlay/unhighlight')); else if (selected.size) { selected.clear(); drawList() }
      }
    }
    document.addEventListener('keydown', onKey)
    const tick = setInterval(drawStats, 10000) // "per minute" decays even when quiet

    drawSpot(); drawMode(); updatePause()
    load().catch((e) => toast(e.message, 'error'))

    return () => { offs.forEach((o) => o()); document.removeEventListener('keydown', onKey); clearInterval(tick); fit.disconnect() }
  },
}
