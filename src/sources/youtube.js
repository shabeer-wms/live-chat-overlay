// YouTube live chat via the `youtube-chat` package (reads the public chat page; no API key, no quota).
const { LiveChat } = require('youtube-chat')
const parseMoney = require('../money')

const videoId = (input) => {
  const s = String(input).trim()
  return /^[\w-]{11}$/.test(s) ? s : /(?:v=|youtu\.be\/|live\/)([\w-]{11})/.exec(s)?.[1]
}

function create({ config, ingest, setStatus }) {
  let chat = null
  const stop = () => { chat?.stop(); chat = null; setStatus('off') }

  async function start() {
    stop()
    const liveId = videoId(config.youtube.input)
    if (!liveId) return setStatus('error: need a video URL or 11-character video ID')
    setStatus('connecting')
    const c = (chat = new LiveChat({ liveId }))
    c.on('chat', (m) => ingest({
      platform: 'youtube', id: m.id, stream: 'yt:' + liveId,
      authorId: m.author.channelId,
      name: m.author.name,
      avatar: m.author.thumbnail?.url || '',
      parts: m.message.map((p) => ('text' in p ? { text: p.text } : { img: p.url })),
      badge: m.isOwner ? 'owner' : m.isModerator ? 'mod' : m.isMembership ? 'member' : '',
      // Super Chat / Super Sticker: the library gives the amount as a label like "$5.00"
      money: m.superchat && { ...parseMoney(m.superchat.amount), text: m.superchat.amount, color: m.superchat.color, sticker: m.superchat.sticker?.url },
    }))
    c.on('error', (e) => setStatus(`error: ${e.message || e}`))
    c.on('end', () => { if (chat === c) setStatus('ended') })
    try {
      const ok = await c.start()
      if (chat === c) setStatus(ok ? 'live' : 'error: stream not found, or it is not live')
    } catch (e) { setStatus(`error: ${e.message}`) }
  }
  return { start, stop, configured: () => !!config.youtube.input }
}
module.exports = { create, videoId }
