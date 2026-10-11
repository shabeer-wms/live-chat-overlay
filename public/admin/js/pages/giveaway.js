// Giveaway: run a keyword raffle, first-to-type, closest number, most entries or quiz, and draw winners on stream.
import { api } from '../api.js'
import { h, clear, guard, confirmDialog, copyText, fmtDateTime } from '../dom.js'
import { icon, platformLogo } from '../icons.js'
import { state, subscribe } from '../state.js'
import { field, sw, chipsInput } from '../components.js'

const MODES = {
  raffle: ['Raffle', 'Everyone who types the keyword goes in the draw; winners are picked at random.'],
  first: ['First to type', 'The first person to type the keyword wins instantly.'],
  closest: ['Closest number', 'Viewers guess a number. The guess nearest your target wins.'],
  most: ['Most entries', 'Whoever types the keyword the most times wins.'],
  quiz: ['Quiz answer', 'Anyone who types an accepted answer qualifies; pick one at random or the fastest.'],
}

export default {
  title: 'Giveaway',
  subtitle: 'Pick winners from live chat: by keyword, number or answer. Every draw is recorded so it can be re-checked.',

  mount(root) {
    const base = () => state.server.features.giveaway
    const draft = JSON.parse(JSON.stringify(base().settings))
    const num = (key, min, max) => h('input', { class: 'input', type: 'number', min, max, value: draft[key], oninput: (e) => { draft[key] = Number(e.target.value) || 0 } })
    const check = (key, label) => sw(label, draft[key], (v) => { draft[key] = v })

    // ---------------- setup form ----------------
    const title = h('input', { class: 'input', value: draft.title, maxLength: 80, oninput: (e) => { draft.title = e.target.value } })
    const modeSel = h('select', { class: 'select', onchange: (e) => { draft.mode = e.target.value; paintMode() } },
      Object.entries(MODES).map(([k, [name]]) => h('option', { value: k }, name)))
    modeSel.value = draft.mode
    const modeHelp = h('div', { class: 'help' })
    const kw = chipsInput({ values: draft.keywords, placeholder: 'Type a keyword and press Enter, e.g. !enter', onChange: () => {} })
    const match = h('select', { class: 'select', onchange: (e) => { draft.match = e.target.value } },
      h('option', { value: 'contains' }, 'Comment contains the keyword'), h('option', { value: 'exact' }, 'Comment is exactly the keyword'))
    match.value = draft.match
    const quizPick = h('select', { class: 'select', onchange: (e) => { draft.quizPick = e.target.value } },
      h('option', { value: 'random' }, 'Pick one at random'), h('option', { value: 'fastest' }, 'Fastest correct answer wins'))
    quizPick.value = draft.quizPick

    const oneEntry = check('oneEntry', 'Each person counts once, however often they type it')
    const memberW = field('Tickets for channel members', num('memberWeight', 1, 20), '1 = no bonus. 2 = members count double.')
    const target = field('Target number', num('target', -1e9, 1e9), 'The closest guess wins.')
    const quizField = field('Quiz winner', quizPick)
    function paintMode() {
      const m = draft.mode
      modeHelp.textContent = MODES[m][1]
      oneEntry.hidden = m !== 'raffle'
      memberW.hidden = !(m === 'raffle')
      target.hidden = m !== 'closest'
      quizField.hidden = m !== 'quiz'
    }

    const startBtn = h('button', { class: 'btn primary', onclick: () => guard(async () => { await api.post('/api/giveaway/open', { settings: draft }) }, 'Giveaway started') }, icon('play'), 'Start giveaway')
    const form = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Set up'), h('div', { class: 'right' }, startBtn)),
      h('div', { class: 'card-body stack' },
        field('Title shown on stream', title),
        h('div', { class: 'form-grid' }, field('How is the winner chosen?', modeSel), field('Keyword matching', match)),
        modeHelp,
        field('Keywords' + (draft.mode === 'closest' ? ' (optional)' : ''), kw.el,
          'Not case-sensitive. Several keywords: any one counts. For a quiz these are the accepted answers.'),
        h('div', { class: 'form-grid' },
          field('Winners', num('winners', 1, 50)), field('Runners-up (backups)', num('runnersUp', 0, 50)),
          target, memberW, quizField),
        oneEntry,
        h('div', { class: 'sep' }),
        h('div', { class: 'form-grid' },
          field('Close entries after (seconds)', num('durationSeconds', 0, 86400), '0 = you close it yourself.'),
          field('Winner must reply within (seconds)', num('claimSeconds', 0, 3600), '0 = no claim timer. Otherwise a runner-up takes over.'),
          field('Must have chatted in the last (minutes)', num('activeMinutes', 0, 720), '0 = anyone who entered. Skips people who left.')),
        check('autoDraw', 'Draw automatically when the timer closes entries'),
        check('excludeStaff', 'Exclude the channel owner and moderators'),
        check('excludeBlocked', 'Exclude blocked users')))

    // ---------------- status ----------------
    const status = h('section', { class: 'card' })
    const entriesBox = h('section', { class: 'card' })
    const historyBox = h('section', { class: 'card' })

    const names = (list) => list.map((x) => x.name).join(', ')

    function winnerRow(w, canReroll) {
      const label = w.status === 'claimed' ? ['ok', 'Claimed'] : w.status === 'noshow' ? ['danger', 'No show'] : w.claimEndsAt ? ['warn', 'Waiting for reply'] : ['accent', 'Winner']
      return h('div', { class: 'qrow winner' + (w.status === 'noshow' ? ' dim' : '') },
        platformLogo(w.platform), h('div', { class: 'grow' }, h('b', null, w.name), w.guess != null && h('span', { class: 'faint' }, ` guessed ${w.guess}`)),
        h('span', { class: 'badge ' + label[0] }, label[1]),
        canReroll && w.status !== 'noshow' && h('button', { class: 'btn sm', title: 'This winner did not respond: bring in the next runner-up', onclick: () => guard(() => api.post('/api/giveaway/reroll', { uid: w.uid })) }, icon('refresh'), 'Reroll'))
    }

    function paint() {
      const cur = base().current
      clear(status)
      if (!cur) {
        status.append(h('div', { class: 'card-head' }, h('h2', null, 'Status')),
          h('div', { class: 'empty' }, h('b', null, 'No giveaway running'), 'Set it up on the left and press Start. Entries are counted from the moment you start.'))
        clear(entriesBox).append(); entriesBox.hidden = true
      } else {
        entriesBox.hidden = false
        const phase = { open: ['ok', 'Open for entries'], closed: ['warn', 'Entries closed'], drawn: ['accent', 'Winners drawn'] }[cur.phase]
        const actions = h('div', { class: 'row' })
        if (cur.phase === 'open') actions.append(
          h('button', { class: 'btn', onclick: () => guard(() => api.post('/api/giveaway/close')) }, 'Close entries'),
          h('button', { class: 'btn primary', onclick: () => guard(() => api.post('/api/giveaway/draw')) }, icon('dice'), 'Draw now'))
        if (cur.phase === 'closed') actions.append(h('button', { class: 'btn primary', onclick: () => guard(() => api.post('/api/giveaway/draw')) }, icon('dice'), 'Draw winner' + (cur.winners.length > 1 ? 's' : '')))
        actions.append(
          h('button', { class: 'btn', onclick: () => guard(() => api.post('/api/giveaway/show', { visible: !cur.visible })) }, icon(cur.visible ? 'eyeoff' : 'eye'), cur.visible ? 'Hide from stream' : 'Show on stream'),
          h('button', { class: 'btn danger', onclick: async () => { if (cur.phase !== 'drawn' && !(await confirmDialog({ title: 'End this giveaway?', body: 'Entries so far are discarded.', confirm: 'End giveaway', danger: true }))) return; guard(() => api.post('/api/giveaway/reset')) } }, cur.phase === 'drawn' ? 'Done' : 'End'))
        const clock = h('span', { class: 'accent' })
        status.append(
          h('div', { class: 'card-head' }, h('h2', null, cur.title), h('span', { class: 'badge ' + phase[0] }, phase[1]), h('div', { class: 'right' }, !cur.visible && h('span', { class: 'badge' }, 'Hidden on stream'))),
          h('div', { class: 'card-body stack' },
            h('div', { class: 'stats-inline' },
              h('div', null, h('b', null, cur.entries), h('span', null, 'entries')),
              h('div', null, h('b', null, MODES[cur.mode][0]), h('span', null, 'mode')),
              h('div', null, h('b', null, cur.keywords.join(' / ') || 'any comment'), h('span', null, 'keyword')),
              cur.endsAt ? h('div', null, h('b', null, clock), h('span', null, 'until entries close')) : null),
            actions,
            cur.phase === 'drawn' ? h('div', { class: 'stack', style: { gap: '8px' } },
              h('div', { class: 'label' }, cur.winners.length > 1 ? 'Winners' : 'Winner'),
              ...cur.winnersFull.map((w) => winnerRow(w, true)),
              cur.runnersUp.length ? h('div', { class: 'help' }, 'Runners-up in waiting: ' + names(cur.runnersUp)) : null,
              cur.winners.length === 0 ? h('div', { class: 'faint' }, 'Nobody was eligible. Check the keyword and rules, then start again.') : null,
              proofBox(cur.proof)) : null))
        if (cur.endsAt) { const t = () => { clock.textContent = Math.max(0, Math.ceil((cur.endsAt - Date.now()) / 1000)) + 's' }; t(); clearInterval(paint.t); paint.t = setInterval(t, 500) } else clearInterval(paint.t)

        // entries
        clear(entriesBox).append(
          h('div', { class: 'card-head' }, h('h2', null, 'Entries'), h('span', { class: 'sub' }, cur.entries > cur.entryList.length ? `showing ${cur.entryList.length} of ${cur.entries}` : `${cur.entries}`)),
          cur.entryList.length ? h('div', { class: 'entries' }, cur.entryList.map((e) =>
            h('div', { class: 'qrow' }, platformLogo(e.platform), h('div', { class: 'grow' }, e.name, e.member && h('span', { class: 'badge accent', style: { marginLeft: '6px' } }, 'member')),
              e.guess != null && h('span', { class: 'faint' }, `guess ${e.guess}`), h('span', { class: 'faint' }, `×${e.count}`)))) : h('div', { class: 'empty' }, 'Waiting for the first entry…'))
      }
      // history
      const hist = base().history
      clear(historyBox).append(h('div', { class: 'card-head' }, h('h2', null, 'Past giveaways')),
        hist.length ? h('div', { class: 'card-body stack', style: { gap: '10px' } }, hist.map((e) => h('div', null,
          h('b', null, e.title), h('span', { class: 'faint' }, `  ${MODES[e.mode]?.[0] || e.mode} · ${fmtDateTime(e.ts)} · ${e.entries} entries`),
          h('div', { class: 'muted' }, 'Winner' + (e.winners.length > 1 ? 's' : '') + ': ' + (e.winners.map((w) => w.name + (w.status === 'noshow' ? ' (no show)' : '')).join(', ') || 'none'))))) : h('div', { class: 'empty' }, 'Finished giveaways are listed here.'))
    }

    function proofBox(proof) {
      if (!proof) return null
      const text = `Draw proof\nseed: ${proof.seed}\nentries: ${proof.entries}\nentries hash (sha256): ${proof.entriesHash}\nmethod: ${proof.method}`
      return h('details', { class: 'howto' }, h('summary', null, 'Fair-draw proof'),
        h('pre', { class: 'proof' }, text),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => copyText(text) }, icon('copy'), 'Copy proof')))
    }

    root.append(h('div', { class: 'give-grid' }, form, h('div', { class: 'stack' }, status, entriesBox, historyBox)))
    paintMode(); paint()
    const off = subscribe(paint)
    return () => { off(); clearInterval(paint.t) }
  },
}
