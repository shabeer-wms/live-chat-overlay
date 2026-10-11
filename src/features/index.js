// Everything that reacts to chat beyond showing it: giveaway, poll, goal, word cloud, leaderboard, timer, commands.
const createGiveaway = require('./giveaway')
const createPoll = require('./poll')
const createWordcloud = require('./wordcloud')
const createLeaderboard = require('./leaderboard')
const createGoal = require('./goal')
const createTimer = require('./timer')
const createCommands = require('./commands')

const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
const DEFAULT_POSITION = { giveaway: 'center', poll: 'middle-right', goal: 'top-left', timer: 'top-right', wordcloud: 'middle-left', leaderboard: 'top-center', alerts: 'top-center' }

module.exports = function createFeatures({ config, store, hub, log, overlay }) {
  const isBlocked = (uid) => config.isBlocked(uid)
  const common = { config, store, log, isBlocked }

  const say = (text) => overlay.push({ id: 'bot-' + Date.now() + Math.random().toString(36).slice(2, 6), platform: 'bot', name: 'Bot', avatar: '', parts: [{ text }], badge: 'bot' })
  const alert = (a) => hub.overlay.emit('alert', a)

  const mods = {
    giveaway: createGiveaway(common),
    poll: createPoll(common),
    wordcloud: createWordcloud(common),
    leaderboard: createLeaderboard(common),
    goal: createGoal({ ...common, alert }),
    timer: createTimer(),
  }
  const commands = createCommands({ config, say })

  for (const [kind, m] of Object.entries(mods)) {
    m.onChange(() => {
      hub.overlay.emit('widget', { kind, state: m.overlayState() })
      hub.admin.emit('feature', { kind, state: m.adminState() })
    })
  }

  const KINDS = [...Object.keys(mods), 'alerts']
  const widgetsView = () => Object.fromEntries(KINDS.map((k) => [k, { position: config.widgets?.[k]?.position || DEFAULT_POSITION[k] }]))

  return {
    mods, commands,
    // every real viewer comment passes through here once
    collect(m) {
      if (m.platform === 'bot') return
      mods.giveaway.collect(m)
      mods.poll.vote(m)
      mods.wordcloud.collect(m)
      mods.leaderboard.collect(m)
      mods.goal.collect(m)
      commands.handle(m)
    },
    widgetsView,
    setChatHidden(hidden) { // hide / show the chat list on stream (widgets and spotlight stay)
      config.display = { ...config.display, chatHidden: !!hidden }
      config.save()
      hub.overlay.emit('display', config.display)
      hub.admin.emit('display', config.display)
    },
    saveWidgets(input = {}) {
      config.widgets = Object.fromEntries(KINDS.map((k) => {
        const p = input[k]?.position
        return [k, { position: POSITIONS.includes(p) ? p : config.widgets?.[k]?.position || DEFAULT_POSITION[k] }]
      }))
      config.save()
      hub.overlay.emit('widgets', widgetsView())
    },
    // frames a newly opened overlay needs to show what's currently active
    hello: () => [['widgets', widgetsView()], ...Object.entries(mods).map(([kind, m]) => ['widget', { kind, state: m.overlayState() }]).filter(([, w]) => w.state)],
    states: () => ({
      ...Object.fromEntries(Object.entries(mods).map(([k, m]) => [k, m.adminState()])),
      commands: commands.list(), widgets: widgetsView(),
    }),
    start() { mods.wordcloud.start() },
    stop() { Object.values(mods).forEach((m) => m.stop?.()) },
  }
}
module.exports.POSITIONS = POSITIONS
