// History: every comment ever saved. Search it, export it, clean it up.
import { api } from '../api.js'
import { h, clear, debounce, guard, toast, confirmDialog, fmtDateTime } from '../dom.js'
import { icon } from '../icons.js'
import { bus, state, subscribe } from '../state.js'
import { commentRow } from '../components.js'

const PAGE = 100

export default {
  title: 'History',
  subtitle: 'Everything that has been said in your streams, kept on this computer.',

  mount(root) {
    let all = [], streams = [], page = 0
    const selected = new Set()
    const f = { stream: '', platform: '', show: 'all', text: '' }

    const streamSel = h('select', { class: 'select', 'aria-label': 'Stream', onchange: (e) => { f.stream = e.target.value; load() } })
    const platformSel = h('select', { class: 'select', onchange: (e) => { f.platform = e.target.value; page = 0; draw() } },
      h('option', { value: '' }, 'All platforms'), h('option', { value: 'youtube' }, 'YouTube'), h('option', { value: 'facebook' }, 'Facebook'))
    const showSel = h('select', { class: 'select', onchange: (e) => { f.show = e.target.value; page = 0; draw() } },
      h('option', { value: 'all' }, 'Everything'), h('option', { value: 'starred' }, 'Starred'), h('option', { value: 'filtered' }, 'Filtered by rules'),
      h('option', { value: 'hidden' }, 'Hidden'), h('option', { value: 'blocked' }, 'From blocked users'))
    const search = h('input', { class: 'input', placeholder: 'Search name or comment', oninput: debounce((e) => { f.text = e.target.value.trim().toLowerCase(); page = 0; draw() }, 150) })

    const summary = h('span', { class: 'sub' })
    const bulk = h('div', { class: 'bulk', hidden: true })
    const list = h('div', { class: 'clist2 tall' })
    const pager = h('div', { class: 'row', style: { padding: '10px 16px', justifyContent: 'space-between' } })

    // ---- summary of the selected stream (or the latest one) ----
    const summaryBox = h('section', { class: 'card' })
    async function loadSummary() {
      const r = await api.get('/api/summary?stream=' + encodeURIComponent(f.stream))
      const stat = (label, value) => h('div', null, h('b', null, value), h('span', null, label))
      const paid = Object.entries(r.money).map(([c, m]) => `${c || '?'}${m.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${m.count})`).join(' · ') || 'none'
      const when = r.first ? `${fmtDateTime(r.first)} to ${fmtDateTime(r.last)}` : 'no comments yet'
      clear(summaryBox).append(
        h('div', { class: 'card-head' }, h('h2', null, 'Stream summary'), h('span', { class: 'sub' }, r.stream ? `${r.stream} · ${when}` : when)),
        h('div', { class: 'card-body stack' },
          h('div', { class: 'stats-inline' }, stat('comments', r.comments), stat('chatters', r.chatters), stat('questions', `${r.questions.answered}/${r.questions.total} answered`),
            stat('starred', r.starred), stat('held back', r.heldBack), stat('paid', paid),
            r.busiestMinute ? stat('busiest minute', `${r.busiestMinute.comments} at ${fmtDateTime(r.busiestMinute.at)}`) : null),
          r.topChatters.length ? h('div', null, h('div', { class: 'label' }, 'Top chatters'), h('div', { class: 'chips', style: { marginTop: '6px' } }, r.topChatters.slice(0, 8).map((p) => h('span', { class: 'chip', style: { paddingRight: '10px' } }, `${p.name} · ${p.comments}`)))) : null,
          r.giveaways.length ? h('div', null, h('div', { class: 'label' }, 'Giveaways'), r.giveaways.map((g) => h('div', null, `${g.title}: `, g.winners.map((w) => w.name).join(', ') || 'no winner'))) : null,
          r.polls.length ? h('div', null, h('div', { class: 'label' }, 'Polls'), r.polls.map((p) => h('div', null, `${p.question}: `, p.options.map((o) => `${o.label} ${o.percent}%`).join(', ')))) : null))
    }

    const exportLink = (fmt) => h('a', { class: 'btn sm', href: `/api/comments/export?format=${fmt}&stream=${encodeURIComponent(f.stream)}`, download: '' }, icon('download'), fmt.toUpperCase())
    const exportRow = h('div', { class: 'row' })

    const filtered = () => all.filter((c) =>
      (!f.platform || c.platform === f.platform) &&
      (!f.text || c.name.toLowerCase().includes(f.text) || c.text.toLowerCase().includes(f.text)) &&
      (f.show === 'all' || (f.show === 'starred' && c.starred) || (f.show === 'filtered' && c.flag) || (f.show === 'hidden' && c.hidden) || (f.show === 'blocked' && c.blocked))
    ).reverse()

    async function load() {
      const r = await api.get('/api/comments?stream=' + encodeURIComponent(f.stream) + '&limit=5000')
      all = r.comments; streams = r.streams; page = 0; selected.clear()
      streamSel.replaceChildren(h('option', { value: '' }, `All streams · ${streams.reduce((n, s) => n + s.count, 0)}`),
        ...streams.map((s) => { const [k, id] = s.stream.split(':'); return h('option', { value: s.stream }, `${k === 'yt' ? 'YouTube ' + id : k === 'fb' ? 'Facebook ' + id : 'Test'} · ${s.count} · ${fmtDateTime(s.last)}`) }))
      streamSel.value = f.stream
      clear(exportRow).append(exportLink('csv'), exportLink('json'))
      draw()
      loadSummary().catch(() => {})
    }
    function draw() {
      const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PAGE))
      page = Math.min(page, pages - 1)
      summary.textContent = `${rows.length} comment${rows.length === 1 ? '' : 's'}`
      clear(list).append(...(rows.length
        ? rows.slice(page * PAGE, page * PAGE + PAGE).map((c) => commentRow(c, { selected: selected.has(c.id), highlighted: c.id === state.server.highlighted, queued: state.server.queue.indexOf(c.id) + 1 }))
        : [h('div', { class: 'empty' }, h('b', null, all.length ? 'No comments match' : 'Nothing saved yet'), all.length ? 'Try other filters.' : 'Comments are saved here as they arrive.')]))
      clear(pager).append(
        h('span', { class: 'faint small' }, rows.length ? `Page ${page + 1} of ${pages}` : ''),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', disabled: page === 0, onclick: () => { page--; draw(); list.scrollTop = 0 } }, 'Newer'),
          h('button', { class: 'btn sm', disabled: page >= pages - 1, onclick: () => { page++; draw(); list.scrollTop = 0 } }, 'Older')))
      drawBulk(rows)
    }
    function drawBulk(rows = filtered()) {
      bulk.hidden = !selected.size
      if (!selected.size) return
      const b = (label, act, ic, cls = '') => h('button', { class: 'btn sm ' + cls, onclick: () => run(act, [...selected]) }, icon(ic), label)
      clear(bulk).append(h('b', null, `${selected.size} selected`), b('Star', 'star', 'star'), b('Unstar', 'unstar', 'star'), b('Hide', 'hide', 'eyeoff'), b('Delete', 'delete', 'trash', 'danger'),
        h('button', { class: 'btn sm ghost', onclick: () => { selected.clear(); draw() } }, 'Clear selection'),
        h('button', { class: 'btn sm ghost', onclick: () => { rows.slice(page * PAGE, page * PAGE + PAGE).forEach((c) => selected.add(c.id)); draw() } }, 'Select this page'))
    }
    async function run(action, ids) {
      if (action === 'delete' && !(await confirmDialog({ title: `Delete ${ids.length} comment${ids.length > 1 ? 's' : ''}?`, body: 'This cannot be undone.', confirm: 'Delete', danger: true }))) return
      await guard(() => api.post('/api/comments/action', { ids, action }))
      if (action === 'delete') { all = all.filter((c) => !ids.includes(c.id)); ids.forEach((i) => selected.delete(i)); draw() }
    }
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.crow'); if (!row) return
      const id = row.dataset.id
      if (e.target.matches('input[data-sel]')) { e.target.checked ? selected.add(id) : selected.delete(id); row.classList.toggle('selected', e.target.checked); drawBulk(); return }
      const btn = e.target.closest('button[data-act]'); if (!btn) return
      run(btn.dataset.act, [id]) // the button already carries the resolved action (star vs unstar, etc.)
    })

    // ---- data management ----
    async function prune(days) {
      const ok = await confirmDialog({ title: `Delete comments older than ${days} days?`, body: 'Starred comments are kept. This cannot be undone.', confirm: 'Delete', danger: true })
      if (!ok) return
      const r = await guard(() => api.post('/api/comments/prune', { days, stream: f.stream }))
      if (r) toast(`Removed ${r.removed} comment${r.removed === 1 ? '' : 's'}`)
    }
    async function wipe() {
      const scope = f.stream ? 'this stream' : 'every stream'
      if (await confirmDialog({ title: `Delete all comments in ${scope}?`, body: 'Starred comments too. This cannot be undone.', confirm: 'Delete everything', danger: true }))
        await guard(() => api.post('/api/comments/clear', { stream: f.stream }), 'History cleared')
    }
    const pruneSel = h('select', { class: 'select', style: { width: '170px' } }, [7, 30, 90, 365].map((d) => h('option', { value: d }, `older than ${d} days`)))

    root.append(h('div', { class: 'stack' },
      summaryBox,
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Comments'), summary, h('div', { class: 'right' }, exportRow)),
        h('div', { class: 'toolbar2' }, h('div', { class: 'search grow' }, icon('search'), search), streamSel, platformSel, showSel),
        bulk, list, pager),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Clean up')),
        h('div', { class: 'card-body stack' },
          h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Delete comments'), pruneSel,
            h('button', { class: 'btn danger', onclick: () => prune(Number(pruneSel.value)) }, icon('trash'), 'Delete'),
            h('span', { class: 'faint small' }, f.stream ? 'in the selected stream' : 'in all streams')),
          h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: wipe }, icon('trash'), 'Delete everything…'),
            h('span', { class: 'faint small' }, 'Starred comments survive the age-based delete, not this.'))))))

    const off = bus.on('refresh', load)
    let lastSpot = state.server.highlighted
    const offState = subscribe(() => { if (state.server.highlighted !== lastSpot) { lastSpot = state.server.highlighted; draw() } }) // spotlight changed
    load().catch((e) => toast(e.message, 'error'))
    return () => { off(); offState() }
  },
}
