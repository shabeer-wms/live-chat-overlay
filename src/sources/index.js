// All chat sources, with one status table the admin can show.
const youtube = require('./youtube')
const facebook = require('./facebook')

module.exports = function createSources({ config, chat, hub }) {
  const status = { youtube: 'off', facebook: 'off' }
  const setter = (name) => (v) => {
    if (status[name] === v) return
    status[name] = v
    console.log(`[${name}] ${v}`)
    hub.admin.emit('status', status)
  }
  const sources = {
    youtube: youtube.create({ config, ingest: chat.ingest, setStatus: setter('youtube') }),
    facebook: facebook.create({ config, ingest: chat.ingest, setStatus: setter('facebook') }),
  }
  return {
    status,
    names: Object.keys(sources),
    start: (n) => sources[n]?.start(),
    stop: (n) => sources[n]?.stop(),
    startConfigured() { for (const s of Object.values(sources)) if (s.configured()) s.start() },
  }
}
module.exports.videoId = youtube.videoId
