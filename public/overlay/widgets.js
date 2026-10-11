// On-stream widgets: giveaway, poll, goal, timer, word cloud, leaderboard, and paid-comment alerts.
// Loaded by overlay.html after the chat code; listens on the same event stream.
(() => {
  const ov = window.chatOverlay
  if (!ov) return // ?static thumbnails have no live feed
  const wants = ov.wants

  // ---------- tiny DOM helper ----------
  const h = (tag, cls, ...kids) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)))
    return e
  }
  // replaceChildren that skips null/false (otherwise they would print as the text "null")
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false))
  const ROWS = { top: 1, middle: 2, bottom: 3 }, COLS = { left: 1, center: 2, right: 3 }

  // ---------- 3x3 layout ----------
  const root = h('div'); root.id = 'widgets'
  const cells = {}
  for (const [r, ri] of Object.entries(ROWS)) {
    for (const [c, ci] of Object.entries(COLS)) {
      const cell = h('div', `cell r${ri} c${ci}`)
      cell.style.gridRow = ri; cell.style.gridColumn = ci
      cells[`${r}-${c}`] = cells[`${r}-${c}`] || cell
      root.append(cell)
    }
  }
  cells.center = cells['middle-center']
  document.body.append(root)

  let layout = {}
  const DEFAULT_POS = { giveaway: 'center', poll: 'middle-right', goal: 'top-left', timer: 'top-right', wordcloud: 'middle-left', leaderboard: 'top-center', alerts: 'top-center' }
  const cellFor = (kind) => cells[layout[kind]?.position || DEFAULT_POS[kind]] || cells.center

  // ---------- keeping the look in sync with the chosen design ----------
  function look() {
    const s = ov.style || {}
    root.style.fontFamily = s.fontFamily || ''
    root.style.color = s.textColor || '#fff'
    root.style.setProperty('--w-font', Math.max(18, Math.round((s.fontSize || 28) * 0.8)) + 'px')
  }
  ov.on('style', look)

  // ---------- widget registry ----------
  const live = {} // kind -> { el, key }
  const ENTER = [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }]
  const EXIT = [{ opacity: 1 }, { opacity: 0, transform: 'scale(.96)' }]

  function mount(kind, el, cls) {
    el.classList.add('w', cls)
    el.style.setProperty('--w-font', 'inherit')
    cellFor(kind).append(el)
    el.animate(ENTER, { duration: 400, easing: 'cubic-bezier(.22,1.25,.36,1)' })
    return el
  }
  function drop(kind) {
    const w = live[kind]; if (!w) return
    delete live[kind]
    clearInterval(w.tick)
    w.el.animate(EXIT, { duration: 250, fill: 'forwards' }).onfinish = () => w.el.remove()
  }
  // render(state, existing) builds or updates; return the element
  function show(kind, state, cls, render) {
    if (!state || !wants(kind)) return drop(kind)
    let w = live[kind]
    if (!w) { w = live[kind] = { el: mount(kind, h('div'), cls) } }
    render(w, state)
  }
  function relocate() { for (const [kind, w] of Object.entries(live)) cellFor(kind).append(w.el) }

  // ---------- timers ----------
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  const countdown = (w, node, endsAt) => {
    clearInterval(w.tick)
    if (!endsAt) { node.textContent = ''; return }
    const t = () => { node.textContent = mmss(endsAt - Date.now()) }
    t(); w.tick = setInterval(t, 250)
  }

  // ---------- poll ----------
  function poll(w, s) {
    const total = s.total
    const rows = s.options.map((o) => {
      const bar = h('div', 'bar', h('i'))
      requestAnimationFrame(() => { bar.firstChild.style.width = o.percent + '%' })
      return h('div', 'opt' + (o.leading ? ' lead' : ''), h('div', 'row', h('span', null, h('span', 'key', o.key), o.label), h('b', null, `${o.percent}%`)), bar)
    })
    const clock = h('span', 'accent')
    fill(w.el, h('h4', null, s.phase === 'open' ? 'Live poll — type a number to vote' : 'Poll results'), h('div', 'big', s.question), ...rows,
      h('div', 'sub', `${total} vote${total === 1 ? '' : 's'} `, clock))
    countdown(w, clock, s.phase === 'open' ? s.endsAt : 0)
  }

  // ---------- goal ----------
  function goal(w, s) {
    const bar = h('div', 'bar', h('i'))
    requestAnimationFrame(() => { bar.firstChild.style.width = s.percent + '%' })
    const money = (v) => `${s.currency || ''}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    fill(w.el, h('h4', null, s.label), h('div', 'nums', h('span', null, money(s.current)), h('span', 'faint', s.target ? `of ${money(s.target)}` : '')), bar,
      s.supporters.length ? h('div', 'sup', 'Top: ' + s.supporters.map((x) => `${x.name} ${money(x.total)}`).join(' · ')) : null)
  }

  // ---------- timer ----------
  function timer(w, s) {
    const clock = h('div', 'clock')
    w.el.classList.toggle('done', !!s.done)
    fill(w.el, s.label ? h('h4', null, s.label) : null, clock)
    if (s.done) { clearInterval(w.tick); clock.textContent = "Time's up!"; return }
    countdown(w, clock, s.endsAt)
  }

  // ---------- word cloud ----------
  const PALETTE = ['#ffd54a', '#ff8a65', '#4dd0e1', '#a5d6a7', '#f48fb1', '#b39ddb', '#fff176']
  function cloud(w, s) {
    const max = Math.max(1, ...s.words.map((x) => x.n)), min = Math.min(...s.words.map((x) => x.n), max)
    const spans = s.words.slice().sort((a, b) => (a.w < b.w ? -1 : 1)).map((x, i) => {
      const t = max === min ? 0.5 : (x.n - min) / (max - min)
      const e = h('span', null, x.w); e.style.fontSize = (0.8 + t * 1.8).toFixed(2) + 'em'; e.style.color = PALETTE[i % PALETTE.length]
      return e
    })
    fill(w.el, h('h4', null, 'What chat is saying'), spans.length ? h('div', 'words', spans) : h('div', 'sub', 'Waiting for comments…'))
  }

  // ---------- leaderboard ----------
  function board(w, s) {
    const items = s.rows.map((r, i) => h('li', null, h('span', 'rank', i + 1), r.avatar ? Object.assign(h('img'), { src: r.avatar }) : null,
      h('span', 'who', r.name), h('span', 'n', s.by === 'money' ? r.money.toLocaleString(undefined, { maximumFractionDigits: 2 }) : r.count)))
    fill(w.el, h('h4', null, s.by === 'money' ? 'Top supporters' : 'Top chatters'), items.length ? h('ol', null, items) : h('div', 'sub', 'Nobody yet'))
  }

  // ---------- giveaway ----------
  const HOW = {
    raffle: (s) => ['Type ', kws(s), ' in chat to enter'],
    first: (s) => ['First to type ', kws(s), ' wins!'],
    closest: (s) => ['Guess the number', s.keywords.length ? [' and include ', kws(s)] : ''],
    most: (s) => ['Most ', kws(s), ' in chat wins'],
    quiz: (s) => ['Answer in chat: ', kws(s)],
  }
  const kws = (s) => (s.keywords.length ? s.keywords.map((k) => h('span', 'kw', k)) : h('span', 'kw', 'any comment'))
  const lastDraw = { at: 0 }

  function giveaway(w, s) {
    const clock = h('span', 'accent')
    if (s.phase !== 'drawn') {
      clearInterval(w.roll)
      fill(w.el, h('h4', null, s.title), h('div', 'big', ...HOW[s.mode](s)),
        h('div', 'sub', s.phase === 'open' ? `${s.entries} entered ` : `Entries closed · ${s.entries} entered`, s.phase === 'open' ? clock : null))
      countdown(w, clock, s.phase === 'open' ? s.endsAt : 0)
      return
    }
    // drawn: roll through names, then reveal (only when it's a fresh draw, not an update like a claim)
    const reveal = () => {
      clearInterval(w.tick)
      const win = (x) => h('div', 'win ' + x.status, x.avatar ? Object.assign(h('img'), { src: x.avatar }) : null, h('span', 'nm', x.name),
        h('span', 'st', x.status === 'claimed' ? 'claimed ✓' : x.status === 'noshow' ? 'no show' : s.claimSeconds && x.claimEndsAt ? mmss(x.claimEndsAt - Date.now()) : s.mode === 'closest' && x.guess != null ? `guessed ${x.guess}` : 'winner'))
      fill(w.el, h('h4', null, `${s.title} — ${s.winners.length > 1 ? 'winners' : 'winner'}`), ...s.winners.map(win),
        s.runnersUp.length ? h('div', 'runners', 'Runners-up: ' + s.runnersUp.map((r) => r.name).join(', ')) : null)
      if (s.claimSeconds) w.tick = setInterval(() => { if (s.winners.some((x) => x.status === 'pending')) reveal() }, 1000)
    }
    if (lastDraw.at === s.drawnAt) return reveal()
    lastDraw.at = s.drawnAt
    clearInterval(w.roll); clearInterval(w.tick)
    const names = [...s.winners, ...s.runnersUp].map((x) => x.name)
    const roll = h('div', 'roll', '…')
    fill(w.el, h('h4', null, s.title), h('div', 'sub', 'Drawing…'), roll)
    let i = 0, delay = 60
    const step = () => {
      roll.textContent = names.length > 1 ? names[Math.floor(Math.random() * names.length)] : '• • •'
      if (++i > 24) return reveal()
      delay += 7; w.roll = setTimeout(step, delay)
    }
    step()
  }

  // ---------- alerts (queued, one at a time) ----------
  const alerts = []; let alerting = false
  function nextAlert() {
    if (alerting || !alerts.length) return
    alerting = true
    const a = alerts.shift()
    const el = h('div', 'alert', h('div', 'amt', a.amount || ''), h('div', 'who', a.name), a.message ? h('div', 'msg2', a.message) : null,
      a.sticker ? Object.assign(h('img'), { src: a.sticker }) : null)
    el.style.setProperty('--alert', a.color || '#1e88e5')
    mount('alerts', el, 'alert')
    setTimeout(() => {
      el.animate(EXIT, { duration: 250, fill: 'forwards' }).onfinish = () => { el.remove(); alerting = false; nextAlert() }
    }, 6500)
  }

  // ---------- wire events ----------
  const on = (name, fn) => ov.on(name, fn)
  const RENDER = {
    poll: ['poll', poll], giveaway: ['give', giveaway], goal: ['goal', goal], timer: ['timer', timer], wordcloud: ['cloud', cloud], leaderboard: ['lb', board],
  }
  on('widgets', (l) => { layout = l; relocate() })
  on('widget', ({ kind, state }) => { const r = RENDER[kind]; if (r) { if (kind === 'giveaway' && !state) lastDraw.at = 0; show(kind, state, r[0], r[1]) } })
  on('alert', (a) => { if (wants('alerts')) { alerts.push(a); if (alerts.length > 10) alerts.shift(); nextAlert() } })
  look()
})()
