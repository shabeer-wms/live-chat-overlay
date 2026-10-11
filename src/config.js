// Settings persisted to data/config.json (mode 600: holds the password hash and Facebook token).
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_STYLE = {
  fontSize: 28, fontFamily: '-apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  textColor: '#ffffff', nameColor: '#ffd54a',
  bgColor: '#000000', bgOpacity: 55, radius: 12,
  maxMessages: 6, fadeSeconds: 0, animation: 'slide', animationOut: 'fade',
  showAvatar: true, showPlatform: true, position: 'bottom', customCss: '',
  boxWidth: 'fit', align: 'left', // fit: each box is as wide as its text; full: boxes span the overlay
  maxWidth: 60, // longest a box may grow, as % of the overlay width; longer comments wrap onto more lines
  layout: 'inline', // how a message is arranged: inline | stacked (name above) | card (big avatar) | chip (name pill) | compact
  showName: true, showBadges: true, showTime: false, // which parts of each message are drawn
  nameColorBy: 'fixed', // fixed | role (owner / mod / member colours) | platform
  spotSize: 44, spotPosition: 'top', spotSeconds: 0, // highlighted-comment spotlight
  spotMark: true, // highlighter-pen effect behind the spotlight text, and a mark on that comment in the chat list
}

const DEFAULT_FILTERS = {
  words: [], // hide comments containing any of these (case-insensitive)
  links: false, // hide comments containing links
  maxLength: 0, // hide comments longer than this (0 = off)
  bots: [], // hide comments from these names
  exemptStaff: true, // owner / moderators skip the word, link and length rules
  maxCapsPercent: 0, // hide SHOUTING: more than this % capitals (0 = off)
  blockRepeats: false, // hide the same text repeated by the same person within a minute
}

module.exports = function createConfig(dir) {
  const file = path.join(dir, 'config.json')
  const config = {
    admin: null, // { username, salt, hash }
    youtube: { input: '' },
    facebook: { videoId: '', token: '' },
    style: { ...DEFAULT_STYLE },
    filters: { ...DEFAULT_FILTERS },
    mode: 'auto', // auto: new comments go on screen; manual: operator picks
    blocked: [], // [{ uid, name, platform }]
    display: { slowSeconds: 0, speak: false, chatHidden: false, autoplayQueue: false, queueSeconds: 8 }, // slowSeconds: at most one comment per N seconds; chatHidden: hide the chat list; autoplayQueue: spotlight queued comments one after another, queueSeconds each
    autoQueue: { keywords: [], superChats: false, members: false, questions: false }, // put matching comments in the queue
    commands: [], // [{ trigger, response, cooldown }]
    widgets: {}, // { giveaway: { position }, ... }
    profiles: {}, // named looks for different OBS scenes: { name: style }
    remoteKey: '', // secret for /remote/<key>/<action> (Stream Deck etc.)
  }
  try { Object.assign(config, JSON.parse(fs.readFileSync(file, 'utf8'))) } catch {}
  config.style = { ...DEFAULT_STYLE, ...config.style }
  config.filters = { ...DEFAULT_FILTERS, ...config.filters }
  config.blocked ||= []
  config.display = { slowSeconds: 0, speak: false, chatHidden: false, autoplayQueue: false, queueSeconds: 8, ...config.display }
  config.autoQueue = { keywords: [], superChats: false, members: false, questions: false, ...config.autoQueue }

  // non-enumerable so JSON.stringify(config) stays pure data
  Object.defineProperty(config, 'save', {
    value() {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file + '.tmp', JSON.stringify(config, null, 2), { mode: 0o600 })
      fs.renameSync(file + '.tmp', file)
    },
  })
  Object.defineProperty(config, 'isBlocked', { value: (uid) => config.blocked.some((b) => b.uid === uid) })
  return config
}
module.exports.DEFAULT_STYLE = DEFAULT_STYLE
module.exports.DEFAULT_FILTERS = DEFAULT_FILTERS
