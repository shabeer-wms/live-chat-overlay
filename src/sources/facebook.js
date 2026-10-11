// Facebook Live comments via the Graph API streaming endpoint.
// Needs the access token of the Page that owns the live video.
function create({ config, ingest, setStatus }) {
  let abort = null
  const stop = () => { abort?.abort(); abort = null; setStatus('off') }

  async function start() {
    stop()
    const { videoId, token } = config.facebook
    if (!videoId || !token) return setStatus('error: need a live video ID and a Page access token')
    const ctl = (abort = new AbortController())
    setStatus('connecting')
    const url = `https://streaming-graph.facebook.com/${encodeURIComponent(videoId)}/live_comments` +
      `?access_token=${encodeURIComponent(token)}&comment_rate=one_per_two_seconds&fields=from{name,id,picture},message,created_time`
    while (!ctl.signal.aborted) {
      try {
        const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'text/event-stream' } })
        if (!res.ok) {
          setStatus(`error: ${res.status} ${(await res.text()).slice(0, 200)}`)
          if (res.status >= 400 && res.status < 500) return // bad token / id: don't hammer
        } else {
          setStatus('live')
          let buf = ''
          for await (const chunk of res.body) {
            buf += Buffer.from(chunk).toString('utf8')
            let i
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, i); buf = buf.slice(i + 2)
              const line = frame.split('\n').find((l) => l.startsWith('data: '))
              if (!line) continue
              try {
                const c = JSON.parse(line.slice(6))
                if (!c.message) continue
                ingest({
                  platform: 'facebook', id: c.id, stream: 'fb:' + videoId, authorId: c.from?.id,
                  name: c.from?.name || 'Facebook user',
                  avatar: c.from?.picture?.data?.url || '',
                  parts: [{ text: c.message }], badge: '',
                })
              } catch {}
            }
          }
        }
      } catch (e) {
        if (ctl.signal.aborted) return
        setStatus(`error: ${e.message}`)
      }
      await new Promise((r) => setTimeout(r, 3000)) // stream ended: reconnect
    }
  }
  return { start, stop, configured: () => !!(config.facebook.videoId && config.facebook.token) }
}
module.exports = { create }
