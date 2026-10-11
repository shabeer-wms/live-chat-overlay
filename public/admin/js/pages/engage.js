// Engage: poll, timer, goal bar, word cloud, leaderboard, and where each one sits on screen.
import { api } from '../api.js'
import { h, clear, guard, toast } from '../dom.js'
import { icon } from '../icons.js'
import { state, subscribe } from '../state.js'
import { field, sw, segmented } from '../components.js'

const POSITIONS = [['top-left', 'Top left'], ['top-center', 'Top centre'], ['top-right', 'Top right'], ['middle-left', 'Middle left'], ['center', 'Centre'],
  ['middle-right', 'Middle right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom centre'], ['bottom-right', 'Bottom right']]

const card = (title, ...kids) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title)), h('div', { class: 'card-body stack' }, kids))
const money = (v, cur = '') => cur + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })

export default {
  title: 'Engage',
  subtitle: 'Interactive widgets for your stream: polls, countdowns, goals, word cloud and top chatters.',

  mount(root) {
    const F = () => state.server.features
    const post = (url, body) => guard(() => api.post(url, body))
    // settings endpoints take { settings: {...} }; this also confirms with a toast so a save is never silent
    const save = (url, settings) => guard(() => api.post(url, { settings }), 'Saved')

    // ---------------- poll ----------------
    const ps = JSON.parse(JSON.stringify(F().poll.settings))
    const question = h('input', { class: 'input', value: ps.question, maxLength: 140, oninput: (e) => { ps.question = e.target.value } })
    const optBox = h('div', { class: 'stack', style: { gap: '8px' } })
    function drawOpts() {
      clear(optBox).append(...ps.options.map((o, i) => h('div', { class: 'row', style: { flexWrap: 'nowrap', marginTop: 0 } },
        h('input', { class: 'input', style: { width: '72px' }, value: o.key, maxLength: 12, title: 'What viewers type', oninput: (e) => { o.key = e.target.value } }),
        h('input', { class: 'input grow', value: o.label, maxLength: 60, placeholder: `Option ${i + 1}`, oninput: (e) => { o.label = e.target.value } }),
        h('button', { class: 'btn icon ghost', title: 'Remove', disabled: ps.options.length <= 2, onclick: () => { ps.options.splice(i, 1); drawOpts() } }, icon('x')))))
      if (ps.options.length < 8) optBox.append(h('div', null, h('button', { class: 'btn sm', onclick: () => { ps.options.push({ key: String(ps.options.length + 1), label: '' }); drawOpts() } }, icon('plus'), 'Add option')))
    }
    const pollSecs = h('input', { class: 'input', type: 'number', min: 0, max: 86400, value: ps.seconds, oninput: (e) => { ps.seconds = Number(e.target.value) || 0 } })
    const pollLive = h('div', { class: 'stack', style: { gap: '8px' } })
    const pollCard = card('Poll',
      field('Question', question), field('Options', optBox, 'Viewers vote by typing the key on the left as their whole comment.'),
      field('Close automatically after (seconds)', pollSecs, '0 = you close it.'),
      sw('Let viewers change their vote', ps.allowChange, (v) => { ps.allowChange = v }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => post('/api/poll/open', { settings: ps }) }, icon('play'), 'Start poll'),
        h('button', { class: 'btn', onclick: () => post('/api/poll/close') }, 'Close voting'),
        h('button', { class: 'btn ghost', onclick: () => post('/api/poll/reset') }, 'Clear from screen')),
      pollLive)
    function paintPoll() {
      const c = F().poll.current
      clear(pollLive).append(...(c ? [
        h('div', { class: 'label' }, `${c.phase === 'open' ? 'Voting open' : 'Final result'} · ${c.total} vote${c.total === 1 ? '' : 's'}`),
        ...c.options.map((o) => h('div', null, h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: 0 } }, h('span', null, `${o.key}  ${o.label}`, o.leading ? ' ★' : ''), h('b', null, `${o.percent}% (${o.votes})`)),
          h('div', { class: 'meter' }, h('i', { style: { width: o.percent + '%' } }))))] : []))
    }

    // ---------------- timer ----------------
    const tLabel = h('input', { class: 'input', placeholder: 'e.g. Break ends in', maxLength: 60 })
    const tMin = h('input', { class: 'input', type: 'number', min: 0, max: 1440, value: 5 })
    const tSec = h('input', { class: 'input', type: 'number', min: 0, max: 59, value: 0 })
    const tNow = h('div', { class: 'help' })
    const timerCard = card('Countdown',
      h('div', { class: 'form-grid' }, field('Label', tLabel), field('Minutes', tMin), field('Seconds', tSec)),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => post('/api/timer/start', { seconds: (Number(tMin.value) || 0) * 60 + (Number(tSec.value) || 0), label: tLabel.value }) }, icon('clock'), 'Start countdown'),
        h('button', { class: 'btn', onclick: () => post('/api/timer/stop') }, 'Stop and hide')), tNow)

    // ---------------- goal ----------------
    const gs = JSON.parse(JSON.stringify(F().goal.settings))
    const goalNow = h('div', { class: 'stack', style: { gap: '8px' } })
    const addAmt = h('input', { class: 'input', type: 'number', placeholder: 'Amount, e.g. 50' })
    const addName = h('input', { class: 'input', placeholder: 'From (optional)' })
    const goalCard = card('Super Chat goal',
      sw('Show the goal bar on stream', gs.enabled, (v) => { gs.enabled = v; post('/api/goal/settings', { settings: gs }) }),
      h('div', { class: 'form-grid' },
        field('Label', h('input', { class: 'input', value: gs.label, maxLength: 60, oninput: (e) => { gs.label = e.target.value } })),
        field('Target amount', h('input', { class: 'input', type: 'number', min: 0, value: gs.target, oninput: (e) => { gs.target = Number(e.target.value) || 0 } })),
        field('Currency symbol to count', h('input', { class: 'input', value: gs.currency, maxLength: 8, placeholder: '$', oninput: (e) => { gs.currency = e.target.value } }), 'Matches the symbol on Super Chats, e.g. $ or ₹. Empty counts all.'),
        field('Top supporters shown', h('input', { class: 'input', type: 'number', min: 0, max: 10, value: gs.supporters, oninput: (e) => { gs.supporters = Number(e.target.value) || 0 } }))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => post('/api/goal/settings', { settings: gs }) }, 'Save goal')),
      h('div', { class: 'sep' }),
      goalNow,
      h('div', { class: 'row' }, h('div', { class: 'grow' }, addAmt), h('div', { class: 'grow' }, addName),
        h('button', { class: 'btn', onclick: () => { post('/api/goal/add', { amount: Number(addAmt.value), name: addName.value || 'Manual' }); addAmt.value = '' } }, icon('plus'), 'Add amount')),
      h('div', { class: 'help' }, 'Super Chats from YouTube count automatically. Use “Add amount” for other support, such as Facebook Stars.'),
      h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => post('/api/goal/reset') }, 'Reset total')))
    function paintGoal() {
      const g = F().goal
      clear(goalNow).append(h('div', { class: 'label' }, `${money(g.current, g.currency)} of ${money(g.target, g.currency)} · ${g.percent}%`),
        h('div', { class: 'meter' }, h('i', { style: { width: g.percent + '%' } })),
        g.supporters.length ? h('div', { class: 'help' }, 'Top: ' + g.supporters.map((s) => `${s.name} ${money(s.total, g.currency)}`).join(', ')) : null)
    }

    // ---------------- word cloud + leaderboard ----------------
    const ws = { ...F().wordcloud.settings }
    const cloudNow = h('div', { class: 'chips' })
    const cloudCard = card('Word cloud',
      sw('Show the word cloud on stream', ws.enabled, (v) => { ws.enabled = v; save('/api/wordcloud/settings', ws) }),
      h('div', { class: 'form-grid' },
        field('Look back (minutes)', h('input', { class: 'input', type: 'number', min: 1, max: 240, value: ws.minutes, oninput: (e) => { ws.minutes = Number(e.target.value) || 10 } })),
        field('Words shown', h('input', { class: 'input', type: 'number', min: 5, max: 60, value: ws.max, oninput: (e) => { ws.max = Number(e.target.value) || 30 } }))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => save('/api/wordcloud/settings', ws) }, 'Save'),
        h('button', { class: 'btn', onclick: () => post('/api/wordcloud/reset') }, 'Start fresh')), cloudNow)
    const ls = { ...F().leaderboard.settings }
    const boardNow = h('div', { class: 'stack', style: { gap: '6px' } })
    const byMoney = segmented([['comments', 'Most comments'], ['money', 'Most Super Chat']], ls.by, (v) => { ls.by = v })
    const boardCard = card('Top chatters',
      sw('Show the leaderboard on stream', ls.enabled, (v) => { ls.enabled = v; save('/api/leaderboard/settings', ls) }),
      h('div', { class: 'form-grid' }, field('Rank by', byMoney),
        field('People shown', h('input', { class: 'input', type: 'number', min: 3, max: 15, value: ls.size, oninput: (e) => { ls.size = Number(e.target.value) || 5 } }))),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => save('/api/leaderboard/settings', ls) }, 'Save'),
        h('button', { class: 'btn', onclick: () => post('/api/leaderboard/reset') }, 'Reset counts')), boardNow)
    function paintLists() {
      const w = F().wordcloud, b = F().leaderboard
      clear(cloudNow).append(...(w.words.length ? w.words.slice(0, 20).map((x) => h('span', { class: 'chip', style: { paddingRight: '10px' } }, `${x.w} · ${x.n}`)) : [h('span', { class: 'faint' }, 'No words yet.')]))
      clear(boardNow).append(...(b.rows.length ? b.rows.map((r, i) => h('div', { class: 'row', style: { marginTop: 0 } }, h('b', null, i + 1), h('span', { class: 'grow' }, r.name),
        h('span', { class: 'faint' }, b.settings.by === 'money' ? money(r.money) : `${r.count} comments`))) : [h('span', { class: 'faint' }, 'Nobody yet.')]))
    }

    // ---------------- widget positions ----------------
    const pos = JSON.parse(JSON.stringify(F().widgets))
    const LABEL = { giveaway: 'Giveaway', poll: 'Poll', goal: 'Goal bar', timer: 'Countdown', wordcloud: 'Word cloud', leaderboard: 'Leaderboard', alerts: 'Super Chat alerts' }
    const posCard = card('Where things appear',
      h('div', { class: 'form-grid' }, Object.keys(LABEL).map((k) => {
        const sel = h('select', { class: 'select', onchange: () => { pos[k].position = sel.value } }, POSITIONS.map(([v, t]) => h('option', { value: v }, t)))
        sel.value = pos[k]?.position || 'center'
        return field(LABEL[k], sel)
      })),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => post('/api/widgets', { widgets: pos }) }, 'Save positions')),
      h('div', { class: 'help' }, 'Chat stays at the bottom and the spotlight at the top (set under Design). Pick spots that do not collide on your scene.'))

    function paintTimer() {
      const t = F().timer.current
      tNow.textContent = t ? (t.done ? 'Time is up.' : `Running: ${t.label || 'countdown'}`) : ''
    }
    const paintAll = () => { paintPoll(); paintGoal(); paintLists(); paintTimer() }

    root.append(h('div', { class: 'grid-2' }, pollCard, h('div', { class: 'stack' }, timerCard, goalCard)),
      h('div', { class: 'grid-2', style: { marginTop: '16px' } }, cloudCard, boardCard), h('div', { style: { marginTop: '16px' } }, posCard))
    drawOpts(); paintAll()
    return subscribe(paintAll)
  },
}
