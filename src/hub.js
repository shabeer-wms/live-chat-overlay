// Server-sent-event channels: `overlay` = OBS pages, `admin` = open admin tabs.
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function channel() {
  const clients = new Set()
  return {
    emit(event, data) { const f = frame(event, data); for (const res of clients) res.write(f) },
    // attach a request as a subscriber; `hello` frames are sent first
    subscribe(req, res, hello = []) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(': hi\n\n')
      for (const [e, d] of hello) res.write(frame(e, d))
      clients.add(res)
      const ka = setInterval(() => res.write(': ka\n\n'), 25000) // keeps proxies from idling the stream out
      req.on('close', () => { clearInterval(ka); clients.delete(res) })
    },
  }
}

module.exports = () => ({ overlay: channel(), admin: channel() })
