// Automation: chat commands, auto-queue rules, slow mode, read-aloud and the remote link for Stream Deck.
import { api } from '../api.js'
import { h, clear, guard, copyText, confirmDialog } from '../dom.js'
import { icon } from '../icons.js'
import { state } from '../state.js'
import { field, sw, chipsInput } from '../components.js'

const card = (title, sub, ...kids) => h('section', { class: 'card' },
  h('div', { class: 'card-head' }, h('h2', null, title), sub && h('span', { class: 'sub' }, sub)), h('div', { class: 'card-body stack' }, kids))

const REMOTE_ACTIONS = [
  ['next', 'Spotlight the next queued comment'], ['unhighlight', 'Remove the spotlight'], ['clear', 'Clear the chat from the screen'],
  ['giveaway/open', 'Start a giveaway with the saved settings'], ['giveaway/close', 'Close giveaway entries'], ['giveaway/draw', 'Draw the giveaway winners'], ['giveaway/reset', 'Remove the giveaway'],
  ['poll/open', 'Start the poll with the saved settings'], ['poll/close', 'Close voting'], ['poll/reset', 'Remove the poll'],
  ['chat/hide', 'Hide the chat list on stream'], ['chat/show', 'Show the chat list again'], ['chat/toggle', 'Hide or show the chat list'],
  ['timer/stop', 'Stop the countdown'], ['goal/reset', 'Reset the goal total'], ['mode/auto', 'Switch to Auto mode'], ['mode/manual', 'Switch to Manual mode'],
]

export default {
  title: 'Automation',
  subtitle: 'Let the app answer, queue and pace things for you.',

  mount(root) {
    const s = state.server

    // ---------------- commands ----------------
    const cmds = JSON.parse(JSON.stringify(s.features.commands))
    const cmdBox = h('div', { class: 'stack', style: { gap: '8px' } })
    function drawCmds() {
      clear(cmdBox).append(...cmds.map((c, i) => h('div', { class: 'row', style: { flexWrap: 'nowrap', marginTop: 0 } },
        h('input', { class: 'input', style: { width: '130px' }, value: c.trigger, placeholder: '!rules', maxLength: 30, oninput: (e) => { c.trigger = e.target.value } }),
        h('input', { class: 'input grow', value: c.response, placeholder: 'What appears on stream', maxLength: 300, oninput: (e) => { c.response = e.target.value } }),
        h('input', { class: 'input', style: { width: '84px' }, type: 'number', min: 0, max: 3600, value: c.cooldown ?? 15, title: 'Seconds before it can trigger again', oninput: (e) => { c.cooldown = Number(e.target.value) || 0 } }),
        h('button', { class: 'btn icon ghost', title: 'Remove', onclick: () => { cmds.splice(i, 1); drawCmds() } }, icon('x')))))
      if (!cmds.length) cmdBox.append(h('div', { class: 'faint' }, 'No commands yet.'))
    }
    const commands = card('Chat commands', 'viewers type a command, the reply shows on stream',
      h('div', { class: 'help' }, 'Columns: command · reply · cooldown in seconds. Replies appear in the chat list as “Bot”. They are not posted back to YouTube or Facebook.'),
      cmdBox,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { cmds.push({ trigger: '', response: '', cooldown: 15 }); drawCmds() } }, icon('plus'), 'Add command'),
        h('button', { class: 'btn primary', onclick: () => guard(() => api.post('/api/commands', { commands: cmds }), 'Commands saved') }, 'Save commands')))

    // ---------------- auto-queue ----------------
    const aq = JSON.parse(JSON.stringify(s.autoQueue))
    const kw = chipsInput({ values: aq.keywords, placeholder: 'Type a word, e.g. shoutout, and press Enter', onChange: () => {} })
    const queueCard = card('Auto-queue', 'line up the right comments without watching chat',
      field('Queue comments that contain', kw.el, 'Any of these words. They wait in the queue on the Live page until you spotlight them.'),
      sw('Super Chats and Super Stickers', aq.superChats, (v) => { aq.superChats = v }),
      sw('Channel members', aq.members, (v) => { aq.members = v }),
      sw('Questions (a “?” or starting with !ask)', aq.questions, (v) => { aq.questions = v }),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => guard(() => api.post('/api/rules', { autoQueue: aq }), 'Rules saved') }, 'Save rules')))

    // ---------------- display ----------------
    const dp = { ...s.display }
    const displayCard = card('Pacing and voice', 'keep fast chat readable',
      field('Slow mode: show at most one comment every (seconds)',
        h('input', { class: 'input', type: 'number', min: 0, max: 120, value: dp.slowSeconds, oninput: (e) => { dp.slowSeconds = Number(e.target.value) || 0 } }),
        '0 shows everything immediately. Extra comments wait their turn (up to 50).'),
      sw('Read the spotlighted comment aloud', dp.speak, (v) => { dp.speak = v }),
      h('div', { class: 'help' }, 'Uses the voice built into the browser that shows the overlay. OBS’s built-in browser may have no voice installed; test it before going live.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => guard(() => api.post('/api/rules', { display: dp }), 'Saved') }, 'Save')))

    // ---------------- remote ----------------
    const remoteBox = h('div', { class: 'stack', style: { gap: '6px' } })
    function drawRemote() {
      const key = state.server.remoteKey
      clear(remoteBox).append(...REMOTE_ACTIONS.map(([a, d]) => {
        const url = `${location.origin}/remote/${key}/${a}`
        return h('div', { class: 'qrow' }, h('div', { class: 'grow' }, h('b', null, a), h('div', { class: 'faint small' }, d)),
          h('button', { class: 'btn sm', onclick: () => copyText(url) }, icon('copy'), 'Copy link'))
      }))
    }
    const remote = card('Remote control', 'Stream Deck, hotkey apps, phones',
      h('div', { class: 'help' }, 'Each link runs one action when opened (a GET or POST). In Stream Deck use the “Website” action set to run in the background. Treat the links like a password.'),
      remoteBox,
      h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmDialog({ title: 'Make a new remote key?', body: 'Every existing remote link stops working.', confirm: 'New key', danger: true }))) return
        const r = await guard(() => api.post('/api/remote/regenerate'), 'New remote key created')
        if (r) { state.server.remoteKey = r.remoteKey; drawRemote() }
      } }, icon('refresh'), 'Make a new key')))

    drawCmds(); drawRemote()
    root.append(h('div', { class: 'stack' }, commands, h('div', { class: 'grid-2' }, queueCard, displayCard), remote))
  },
}
