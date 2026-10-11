// Smoke test: npm test  (throwaway data dir; never touches data/)
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const createApp = require('./server')
const { videoId } = require('./src/sources')
const { cleanStyle, cleanFilters } = require('./src/routes')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatoverlay-'))

// pure helpers
assert.equal(videoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1'), 'dQw4w9WgXcQ')
assert.equal(videoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
assert.equal(videoId('nope'), undefined)
assert.equal(cleanStyle({ fontSize: 9999, animation: 'evil', nameColor: 'red', junk: 1 }).fontSize, 160, 'style clamped')
assert.equal(cleanStyle({ animation: 'evil' }).animation, 'slide', 'enum falls back')
assert.equal(cleanStyle({ nameColor: 'red' }).nameColor, '#ffd54a', 'bad colour falls back')
assert.ok(!('junk' in cleanStyle({ junk: 1 })), 'unknown keys dropped')
assert.deepEqual(cleanFilters({ words: [' a ', 'a', '', 'b'], maxLength: -5 }).words, ['a', 'b'])

const app = createApp(dir)
const { server } = app
app.listen(0).on('listening', async () => { // the real startup path
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (method, p, body, cookie) => fetch(base + p, {
    method, headers: { 'Content-Type': 'application/json', Cookie: cookie || '' }, body: body ? JSON.stringify(body) : undefined,
  })

  // ---- auth: 6-digit PIN, default 123456 ----
  assert.equal((await call('GET', '/api/state')).status, 401, 'state needs login')
  assert.equal((await call('GET', '/api/auth/me').then((x) => x.json())).defaultPin, true, 'starts on the default PIN')
  assert.equal((await call('POST', '/api/auth/login', { pin: '12345' })).status, 401, 'short PIN rejected')
  assert.equal((await call('POST', '/api/auth/login', { pin: 'abcdef' })).status, 401, 'non-digits rejected')
  const r = await call('POST', '/api/auth/login', { pin: '123456' })
  assert.equal(r.status, 200, 'default PIN works')
  let cookie = r.headers.get('set-cookie').split(';')[0]
  const sessionsFile = fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8')
  assert.ok(sessionsFile.length > 10 && !sessionsFile.includes(cookie.slice(4)), 'sessions stored hashed')

  const get = (p) => call('GET', p, null, cookie).then((x) => x.json())
  const post = (p, b) => call('POST', p, b, cookie)
  const act = (id, action) => post('/api/comments/action', { id, action })
  const comments = async () => (await get('/api/comments')).comments

  // collect overlay events while something happens
  const listen = async (ms, doThing) => {
    const c = new AbortController(); let got = ''
    const res = await fetch(base + '/events', { signal: c.signal })
    const reader = (async () => { try { for await (const ch of res.body) got += Buffer.from(ch) } catch {} })()
    await new Promise((x) => setTimeout(x, 100)); await doThing(); await new Promise((x) => setTimeout(x, ms))
    c.abort(); await reader; return got
  }

  // ---- overlay stream + comment memory ----
  let ev = await listen(200, () => post('/api/overlay/test', { platform: 'facebook', text: 'hi' }))
  assert.ok(ev.includes('event: style') && ev.includes('event: message') && ev.includes('"hi"'), 'new comment reaches overlay')
  const first = (await comments()).find((c) => c.text === 'hi')
  assert.ok(first && first.stream === 'test', 'comment remembered')

  // ---- operations ----
  ev = await listen(200, () => act(first.id, 'highlight'))
  assert.ok(ev.includes('event: highlight'), 'highlight reaches overlay')
  assert.equal((await get('/api/state')).highlighted, first.id)
  ev = await listen(200, () => act(first.id, 'hide'))
  assert.ok(ev.includes('event: remove'), 'hide removes from overlay')
  assert.equal((await get('/api/state')).highlighted, null, 'hide clears highlight')
  await act(first.id, 'star')
  assert.equal((await comments()).find((c) => c.id === first.id).starred, true)

  // queue: spotlight them one at a time
  await post('/api/overlay/test', { text: 'q1' }); await post('/api/overlay/test', { text: 'q2' })
  const all = await comments()
  const id1 = all.find((c) => c.text === 'q1').id, id2 = all.find((c) => c.text === 'q2').id
  await post('/api/comments/action', { ids: [id1, id2], action: 'queue' })
  assert.deepEqual((await get('/api/state')).queue, [id1, id2], 'queued in order')
  await post('/api/overlay/next', {})
  let st = await get('/api/state')
  assert.equal(st.highlighted, id1)
  assert.deepEqual(st.queue, [id2], 'next spotlights the first queued')

  // manual mode: stored but not shown until chosen
  await post('/api/mode', { mode: 'manual' })
  ev = await listen(250, () => post('/api/overlay/test', { text: '=1+1' }))
  assert.ok(!ev.includes('=1+1'), 'manual mode holds new comments back')
  const held = (await comments()).find((c) => c.text === '=1+1')
  assert.ok(held, 'held comment still stored')
  ev = await listen(200, () => act(held.id, 'show'))
  assert.ok(ev.includes('=1+1'), 'show sends it to the overlay')
  const csv = await call('GET', '/api/comments/export?format=csv', null, cookie).then((x) => x.text())
  assert.ok(csv.startsWith('time,platform') && csv.includes('"\'=1+1"'), 'csv escapes formulas')

  // filters hold comments back automatically
  await post('/api/mode', { mode: 'auto' })
  await post('/api/filters', { filters: { words: ['spamword'], links: true, maxLength: 0, bots: [], exemptStaff: true } })
  ev = await listen(250, async () => { await post('/api/overlay/test', { text: 'buy SPAMWORD now' }); await post('/api/overlay/test', { text: 'see www.example.com' }) })
  assert.ok(!ev.includes('SPAMWORD') && !ev.includes('example.com'), 'filtered comments stay off the overlay')
  assert.deepEqual((await comments()).filter((c) => c.flag).map((c) => c.flag).sort(), ['blocked word', 'link'])

  // block
  await act(held.id, 'block')
  assert.equal((await comments()).find((c) => c.id === held.id).blocked, true, 'user blocked')
  ev = await listen(250, () => post('/api/overlay/test', { text: 'from blocked' }))
  assert.ok(!ev.includes('from blocked'), 'blocked user never reaches overlay')
  await post('/api/comments/action', { uid: (await get('/api/state')).blocked[0].uid, action: 'unblock', id: held.id })
  assert.equal((await get('/api/state')).blocked.length, 0, 'unblock works')

  // bulk + delete + unknowns
  await post('/api/comments/action', { ids: [id1, id2], action: 'delete' })
  assert.ok(!(await comments()).some((c) => c.id === id1 || c.id === id2), 'bulk delete works')
  assert.equal((await act('nope', 'show')).status, 400, 'unknown comment rejected')
  assert.equal((await act(held.id, 'explode')).status, 400, 'unknown action rejected')

  // retention keeps starred comments
  const before = (await comments()).length
  const pruned = await (await post('/api/comments/prune', { days: 0 })).json()
  assert.equal(pruned.removed, before - 1, 'prune keeps starred')

  // ---- settings ----
  await post('/api/style', { style: { fontSize: 40, animation: 'pop' } })
  st = await get('/api/state')
  assert.equal(st.style.fontSize, 40); assert.equal(st.style.animation, 'pop')

  // ---- PIN change + lockout + hardening ----
  assert.equal((await post('/api/auth/pin', { current: '000000', next: '654321' })).status, 403, 'wrong current PIN')
  assert.equal((await post('/api/auth/pin', { current: '123456', next: '12ab56' })).status, 400, 'new PIN must be 6 digits')
  const pw = await post('/api/auth/pin', { current: '123456', next: '654321' })
  assert.equal(pw.status, 200)
  assert.equal((await call('GET', '/api/state', null, cookie)).status, 401, 'old sessions signed out after PIN change')
  cookie = pw.headers.get('set-cookie').split(';')[0]
  assert.equal((await call('GET', '/api/state', null, cookie)).status, 200, 'new session works')
  assert.equal((await call('GET', '/api/auth/me').then((x) => x.json())).defaultPin, false, 'default flag cleared')
  assert.equal((await call('POST', '/api/auth/login', { pin: '123456' })).status, 401, 'old PIN no longer works')
  for (let i = 0; i < 4; i++) await call('POST', '/api/auth/login', { pin: '000000' })
  assert.equal((await call('POST', '/api/auth/login', { pin: '654321' })).status, 429, 'locked out after repeated wrong PINs')
  assert.equal((await fetch(base + '/admin/../src/auth.js')).status, 404, 'no path traversal')
  assert.equal((await fetch(base + '/admin/%2e%2e/server.js')).status, 404, 'no encoded traversal')
  assert.ok((await fetch(base + '/overlay')).headers.get('content-security-policy'), 'CSP on pages')

  // ---- persistence: a second app on the same dir sees everything ----
  app.store.flush()
  const again = createApp(dir)
  assert.ok(again.store.count() >= 1, 'comments persisted')
  assert.equal(again.config.style.fontSize, 40, 'settings persisted')
  assert.equal(again.auth.isDefaultPin(), false, 'PIN persisted')
  console.log('ok')
  process.exit(0)
})
