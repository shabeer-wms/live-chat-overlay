// PIN screen: six digit boxes, submits itself when the last digit is typed.
import { api } from './api.js'
import { h } from './dom.js'
import { icon } from './icons.js'

export function renderLogin(root, onSuccess) {
  const err = h('div', { class: 'pin-err', role: 'alert' })
  const boxes = Array.from({ length: 6 }, (_, i) => h('input', {
    class: 'pin-box', type: 'password', inputMode: 'numeric', maxLength: 1, autocomplete: 'off', 'aria-label': `Digit ${i + 1}`,
  }))
  const row = h('div', { class: 'pin-row' }, boxes)
  let busy = false

  const pin = () => boxes.map((b) => b.value).join('')
  const reset = () => { boxes.forEach((b) => (b.value = '')); boxes[0].focus() }

  async function submit() {
    if (busy) return
    busy = true; err.textContent = ''
    try {
      await api.post('/api/auth/login', { pin: pin() })
      onSuccess()
    } catch (e) {
      err.textContent = e.message
      row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake')
      reset()
    } finally { busy = false }
  }

  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      b.value = b.value.replace(/\D/g, '').slice(0, 1)
      if (b.value && i < 5) boxes[i + 1].focus()
      if (pin().length === 6) submit()
    })
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus() }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus()
      if (e.key === 'ArrowRight' && i < 5) boxes[i + 1].focus()
    })
    b.addEventListener('paste', (e) => {
      e.preventDefault()
      const digits = (e.clipboardData.getData('text').match(/\d/g) || []).slice(0, 6)
      digits.forEach((d, j) => (boxes[j].value = d))
      if (digits.length === 6) submit(); else boxes[Math.min(digits.length, 5)].focus()
    })
  })

  root.replaceChildren(h('main', { class: 'login' },
    h('div', { class: 'login-card card' },
      h('div', { class: 'brand-mark big' }, icon('chat', 'lg')),
      h('h1', null, 'Chat Overlay'),
      h('p', { class: 'muted' }, 'Enter your 6-digit PIN'),
      row, err)))
  boxes[0].focus()
}
