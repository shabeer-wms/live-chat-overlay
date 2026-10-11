// Feature tests: giveaway, poll, goal, commands, filters, queue rules, slow mode, summary, backup, remote, profiles.
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const createApp = require('./server')
const { pickMany, cleanSettings } = require('./src/features/giveaway')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatoverlay-feat-'))

// pure: weighted pick is reproducible and honours weights
const pool = ['a', 'b', 'c', 'd', 'e'].map((uid) => ({ uid, weight: 1 }))
assert.deepEqual(pickMany(pool, 3, 'seed:0').map((p) => p.uid), pickMany(pool, 3, 'seed:0').map((p) => p.uid), 'same seed, same winners')
assert.equal(new Set(pickMany(pool, 5, 'x').map((p) => p.uid)).size, 5, 'no repeats')
const heavy = Array.from({ length: 200 }, (_, i) => pickMany([{ uid: 'big', weight: 99 }, { uid: 'small', weight: 1 }], 1, 's' + i)[0].uid)
assert.ok(heavy.filter((u) => u === 'big').length > 170, 'weights matter')
assert.equal(cleanSettings({ winners: 9999, mode: 'evil' }).winners, 50, 'settings clamped')
assert.equal(cleanSettings({ mode: 'evil' }).mode, 'raffle', 'mode falls back')

const app = createApp(dir)
app.listen(0, '127.0.0.1').on('listening', async () => {
  const base = `http://127.0.0.1:${app.server.address().port}`
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '123456' }) })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const call = (method, p, body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined })
  const post = async (p, b) => (await call('POST', p, b || {})).json()
  const get = async (p) => (await call('GET', p)).json()

  let n = 0
  const say = (name, text, extra = {}) => app.chat.ingest({
    platform: 'youtube', stream: 'yt:test', id: 'c' + ++n, authorId: 'id-' + name, name, avatar: '', parts: [{ text }], badge: '', ...extra,
  })
  const G = app.features.mods.giveaway
  const gState = async () => (await get('/api/state')).features.giveaway

  // ---- giveaway: raffle ----
  await post('/api/giveaway/open', { settings: { mode: 'raffle', keywords: ['!enter'], winners: 2, runnersUp: 1, excludeStaff: true } })
  say('u1', 'i want in !enter'); say('u1', '!ENTER again'); say('u2', '!enter'); say('u3', '!enter'); say('u4', '!enter'); say('u5', '!enter')
  say('nokey', 'hello there'); say('boss', '!enter', { badge: 'owner' }); say('mod', '!enter', { badge: 'mod' })
  await post('/api/comments/action', { id: 'c6', action: 'block' }) // u5 gets blocked after entering
  let s = await gState()
  assert.equal(s.current.phase, 'open')
  await sleep(600)
  s = await gState()
  assert.equal(s.current.entries, 5, 'keyword matched, case-insensitive, staff counted out (u5 removed later at draw)')
  await post('/api/giveaway/draw')
  s = await gState()
  assert.equal(s.current.phase, 'drawn')
  assert.equal(s.current.winners.length, 2)
  assert.equal(s.current.runnersUp.length, 1)
  const names = [...s.current.winners, ...s.current.runnersUp].map((w) => w.name)
  assert.equal(new Set(names).size, 3, 'three different people')
  assert.ok(!names.includes('u5') && !names.includes('boss') && !names.includes('mod') && !names.includes('nokey'), 'excluded people never win')
  assert.ok(s.current.proof.seed && s.current.proof.entriesHash, 'fair-draw proof saved')
  // re-derive the winners from the saved seed
  const eligible = ['u1', 'u2', 'u3', 'u4'].map((u) => ({ uid: 'youtube:id-' + u, weight: 1 })).sort((a, b) => (a.uid < b.uid ? -1 : 1))
  assert.deepEqual(pickMany(eligible, 3, s.current.proof.seed + ':0').map((p) => p.uid.replace('youtube:id-', '')), names, 'draw is reproducible from seed')
  // reroll a winner: runner-up steps in
  const first = s.current.winnersFull[0]
  await post('/api/giveaway/reroll', { uid: first.uid })
  s = await gState()
  assert.equal(s.current.winners.find((w) => w.name === first.name).status, 'noshow')
  assert.equal(s.current.winners.filter((w) => w.status !== 'noshow').length, 2, 'runner-up promoted')
  assert.ok((await get('/api/state')).features.giveaway.history.length >= 1, 'result logged')

  // ---- giveaway: first, closest, most ----
  await post('/api/giveaway/open', { settings: { mode: 'first', keywords: ['bingo'], match: 'exact' } })
  say('x1', 'bingo!'); say('x2', 'bingo'); say('x3', 'bingo')
  s = await gState()
  assert.equal(s.current.phase, 'drawn'); assert.equal(s.current.winners[0].name, 'x2', 'first exact match wins')
  await post('/api/giveaway/open', { settings: { mode: 'closest', keywords: [], target: 50, winners: 1, runnersUp: 0 } })
  say('g1', 'maybe 40'); say('g2', 'i say 52'); say('g3', '70'); say('g4', 'no number')
  await post('/api/giveaway/draw')
  s = await gState()
  assert.equal(s.current.winners[0].name, 'g2', 'closest number wins')
  await post('/api/giveaway/open', { settings: { mode: 'most', keywords: ['gg'], match: 'contains', winners: 1, runnersUp: 0 } })
  say('m1', 'gg'); say('m2', 'gg'); say('m2', 'gg gg'); say('m1', 'nothing')
  await post('/api/giveaway/draw')
  s = await gState()
  assert.equal(s.current.winners[0].name, 'm2', 'most entries wins')

  // ---- giveaway: claim timeout promotes the runner-up ----
  await post('/api/giveaway/open', { settings: { mode: 'raffle', keywords: ['!win'], match: 'contains', winners: 1, runnersUp: 1, claimSeconds: 2 } })
  say('k1', '!win'); say('k2', '!win')
  await post('/api/giveaway/draw')
  s = await gState()
  const firstWinner = s.current.winners[0].name
  await sleep(3300) // first window ends ~2-3s; the promoted runner-up then gets a fresh 2s
  s = await gState()
  assert.equal(s.current.winners.find((w) => w.name === firstWinner).status, 'noshow', 'unclaimed winner times out')
  assert.equal(s.current.winners.length, 2, 'runner-up took over')
  const second = s.current.winners.find((w) => w.status === 'pending').name
  say(second, 'thanks, here!')
  s = await gState()
  assert.equal(s.current.winners.find((w) => w.name === second).status, 'claimed', 'reply claims the prize')
  await post('/api/giveaway/reset')

  // ---- poll ----
  await post('/api/poll/open', { settings: { question: 'Pick', options: [{ key: '1', label: 'Red' }, { key: '2', label: 'Blue' }, { key: 'c', label: 'Green' }], seconds: 0 } })
  say('p1', '1'); say('p2', '2'); say('p3', '2'); say('p4', 'C'); say('p1', '2'); say('p5', 'vote 2'); say('p6', 'maybe')
  await sleep(500)
  let poll = (await get('/api/state')).features.poll.current
  assert.equal(poll.total, 5, 'one vote per person, changes allowed')
  assert.equal(poll.options.find((o) => o.key === '2').votes, 4)
  await post('/api/poll/close')
  poll = (await get('/api/state')).features.poll
  assert.equal(poll.current.options.find((o) => o.label === 'Blue').leading, true)
  assert.equal(poll.history.length, 1, 'poll result logged')

  // ---- goal + alerts ----
  await post('/api/goal/settings', { settings: { enabled: true, label: 'Goal', target: 100, currency: '$' } })
  say('rich', 'for you!', { money: { amount: 25, currency: '$', text: '$25.00', color: '#ff0000' } })
  say('euro', 'hello', { money: { amount: 10, currency: '€', text: '€10.00', color: '#00ff00' } })
  let goal = (await get('/api/state')).features.goal
  assert.equal(goal.current, 25, 'only the matching currency counts'); assert.equal(goal.percent, 25)
  await post('/api/goal/add', { amount: 10, name: 'Stars' })
  goal = (await get('/api/state')).features.goal
  assert.equal(goal.current, 35); assert.equal(goal.supporters[0].name, 'rich')

  // ---- leaderboard: counted from saved comments, so it is full as soon as it is enabled ----
  await post('/api/leaderboard/settings', { settings: { enabled: false, size: 3, by: 'comments' } })
  let lb = (await get('/api/state')).features.leaderboard
  assert.equal(lb.rows.length, 3, 'rows exist even before it is switched on')
  const topName = lb.rows[0].name
  assert.ok(lb.rows[0].count >= lb.rows[1].count, 'ranked by comments')
  assert.equal(app.features.mods.leaderboard.overlayState(), null, 'hidden on stream while disabled')
  await post('/api/leaderboard/settings', { settings: { enabled: true, size: 3, by: 'comments' } })
  assert.equal(app.features.mods.leaderboard.overlayState().rows[0].name, topName, 'shown once enabled')
  await post('/api/leaderboard/settings', { settings: { enabled: true, size: 3, by: 'money' } })
  lb = (await get('/api/state')).features.leaderboard
  assert.equal(lb.rows[0].name, 'rich', 'money ranking')
  await post('/api/leaderboard/reset', {})
  assert.equal((await get('/api/state')).features.leaderboard.rows.length, 0, 'reset starts counting from now')
  await post('/api/leaderboard/settings', { settings: { enabled: false, size: 5, by: 'comments' } })

  // ---- queue auto-play: each queued comment is spotlighted for N seconds, then the next ----
  await post('/api/rules', { display: { slowSeconds: 0, speak: false, autoplayQueue: true, queueSeconds: 2 } })
  say('ap1', 'first up'); say('ap2', 'second up')
  const idOf = async (name) => (await get('/api/comments?stream=yt:test&limit=5000')).comments.find((c) => c.name === name).id
  await post('/api/comments/action', { ids: [await idOf('ap1'), await idOf('ap2')], action: 'queue' })
  let ap = await get('/api/state')
  assert.equal(ap.highlightedComment.name, 'ap1', 'auto-play starts at once')
  await sleep(2600)
  ap = await get('/api/state')
  assert.equal(ap.highlightedComment.name, 'ap2', 'then moves to the next after the set seconds')
  await sleep(2600)
  ap = await get('/api/state')
  assert.equal(ap.highlighted, null, 'and finishes when the queue is empty')
  await post('/api/rules', { display: { slowSeconds: 0, speak: false, autoplayQueue: false, queueSeconds: 8 } })

  // ---- commands ----
  await post('/api/commands', { commands: [{ trigger: '!rules', response: 'Be kind.', cooldown: 60 }] })
  say('v1', '!rules please')
  say('v2', '!rules')
  const botMsgs = app.overlay.hello().filter(([e, d]) => e === 'message' && d.platform === 'bot')
  assert.equal(botMsgs.length, 1, 'command replies once, then cools down')
  assert.equal(botMsgs[0][1].parts[0].text, 'Be kind.')

  // ---- extra filters ----
  await post('/api/filters', { filters: { words: [], bots: [], links: false, maxLength: 0, exemptStaff: true, maxCapsPercent: 60, blockRepeats: true } })
  say('c1', 'THIS IS ALL SHOUTING TEXT')
  say('c2', 'same text here'); say('c2', 'same text here')
  const comments = (await get('/api/comments?stream=yt:test')).comments
  assert.equal(comments.find((c) => c.text.startsWith('THIS IS')).flag, 'caps')
  assert.deepEqual(comments.filter((c) => c.name === 'c2').map((c) => c.flag), ['', 'repeat'])

  // ---- auto-queue + questions ----
  await post('/api/rules', { autoQueue: { keywords: ['shoutout'], superChats: true, members: false, questions: true }, display: { slowSeconds: 0, speak: false } })
  say('q1', 'what is your favourite game?')
  say('q2', 'please give a SHOUTOUT to my friend')
  say('q3', 'a normal comment')
  say('big', 'thank you', { money: { amount: 5, currency: '$', text: '$5.00', color: '#00bfa5' } })
  const st = await get('/api/state')
  const queuedNames = st.queueComments.map((c) => c.name)
  assert.deepEqual(queuedNames.sort(), ['big', 'q1', 'q2'], 'questions, keywords and super chats are queued')
  const qId = comments.length && (await get('/api/comments?stream=yt:test')).comments.find((c) => c.name === 'q1').id
  assert.ok(await call('POST', '/api/comments/action', { id: qId, action: 'answer' }).then((r) => r.ok), 'answer action')

  // ---- slow mode ----
  await post('/api/overlay/clear')
  await post('/api/rules', { display: { slowSeconds: 1, speak: false } })
  await sleep(1100) // let the slow-mode window from earlier comments pass
  say('s1', 'first message'); say('s2', 'second message'); say('s3', 'third message')
  assert.equal(app.overlay.hello().filter(([e]) => e === 'message').length, 1, 'slow mode shows one at a time')
  await sleep(2300)
  assert.equal(app.overlay.hello().filter(([e]) => e === 'message').length, 3, 'the rest follow')
  await post('/api/rules', { display: { slowSeconds: 0, speak: false } })

  // ---- summary ----
  const sum = await get('/api/summary?stream=yt:test')
  assert.ok(sum.comments > 20 && sum.chatters > 10)
  assert.equal(sum.money.$.total, 30, 'money totalled per currency')
  assert.equal(sum.giveaways.length >= 4 && sum.polls.length === 1, true)
  assert.ok(sum.topChatters[0].comments >= 2)

  // ---- backup + restore ----
  const backupRes = await call('GET', '/api/backup')
  const bundle = JSON.parse(await backupRes.text())
  assert.equal(bundle.app, 'chat-overlay'); assert.ok(!JSON.stringify(bundle).includes(app.config.admin.hash), 'PIN hash never exported')
  assert.ok(!('token' in bundle.settings.facebook), 'no token by default')
  const before = (await get('/api/comments?limit=5000')).comments.length
  await post('/api/comments/clear', {})
  assert.equal((await get('/api/comments?limit=5000')).comments.length, 0)
  const rr = await post('/api/restore', { bundle })
  assert.equal(rr.comments, before, 'comments restored')
  assert.equal((await post('/api/restore', { bundle: { app: 'other' } })).error, 'not a Chat Overlay backup file')

  // ---- remote ----
  const key = (await get('/api/state')).remoteKey
  assert.match(key, /^[0-9a-f]{36}$/)
  assert.equal((await fetch(`${base}/remote/${key}/clear`)).status, 200)
  assert.equal((await fetch(`${base}/remote/${key}/nope`)).status, 404)
  assert.equal((await fetch(`${base}/remote/${'0'.repeat(36)}/clear`)).status, 403)
  assert.equal((await fetch(`${base}/remote/${key}/mode/manual`, { method: 'POST' })).status, 200)
  assert.equal((await get('/api/state')).mode, 'manual')
  await post('/api/mode', { mode: 'auto' })

  // ---- profiles ----
  await post('/api/style', { style: { fontSize: 55, animation: 'pop' }, profile: 'Scene 2' })
  assert.equal((await post('/api/style', { style: {}, profile: '<bad>' })).error, 'profile names use letters, numbers, spaces, - and _ (max 30)')
  const ctl = new AbortController()
  const res = await fetch(base + '/events?profile=' + encodeURIComponent('Scene 2'), { signal: ctl.signal })
  let seen = ''
  for await (const ch of res.body) { seen += Buffer.from(ch); if (seen.includes('event: widgets')) break }
  ctl.abort()
  assert.ok(seen.includes('"fontSize":55'), 'overlay gets its profile style')
  assert.ok(seen.includes('event: widgets') && seen.includes('"giveaway"'), 'widget layout sent to overlay')

  // static assets for overlay widgets are served
  assert.equal((await fetch(base + '/overlay/widgets.js')).status, 200, 'overlay widget script served')

  app.features.stop()
  console.log('features ok')
  process.exit(0)
})
