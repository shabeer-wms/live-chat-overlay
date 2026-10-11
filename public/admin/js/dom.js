// Tiny DOM toolkit: h() builds elements, toast() and confirmDialog() are the only global UI.
import { icon } from './icons.js'

// h('button', { class: 'btn', onclick }, 'Save', icon('check'))
export function h(tag, props, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k in el) el[k] = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  append(el, kids)
  return el
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue
    el.append(k.nodeType ? k : document.createTextNode(String(k)))
  }
  return el
}
export const clear = (el) => { el.replaceChildren(); return el }

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const fmtDateTime = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

let toastBox
export function toast(message, kind = 'ok') {
  toastBox ||= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }))
  const t = toastBox.appendChild(h('div', { class: 'toast ' + (kind === 'error' ? 'error' : '') }, kind === 'error' ? icon('alert') : icon('check'), message))
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 2600)
}
// Copy to the clipboard. The modern API only exists on HTTPS or localhost, so over a plain
// http://192.168.x.x address we fall back to the selection trick, and finally show the text.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return toast('Copied') }
  } catch {}
  const ta = h('textarea', { value: text, readOnly: true, style: { position: 'fixed', top: '0', left: '0', opacity: '0' } })
  document.body.append(ta)
  ta.focus(); ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch {}
  ta.remove()
  if (ok) return toast('Copied')
  const input = h('input', { class: 'input mono', value: text, readOnly: true, onfocus: (e) => e.target.select() })
  const dlg = h('dialog', null,
    h('div', { class: 'dlg-body' }, h('h3', null, 'Copy this link'), h('p', { class: 'muted' }, 'Your browser blocked copying. Select it and press Ctrl+C (Cmd+C).'), input),
    h('div', { class: 'dlg-foot' }, h('button', { class: 'btn primary', onclick: () => dlg.close() }, 'Done')))
  dlg.addEventListener('close', () => dlg.remove())
  document.body.append(dlg); dlg.showModal(); input.select()
}

// promise-based confirm: await confirmDialog({ title, body, confirm, danger })
export function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', null,
      h('div', { class: 'dlg-body' }, h('h3', null, title), body && h('p', { class: 'muted' }, body)),
      h('div', { class: 'dlg-foot' },
        h('button', { class: 'btn', onclick: () => dlg.close('no') }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'solid-danger' : 'primary'), onclick: () => dlg.close('yes') }, confirm)))
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove() })
    document.body.append(dlg)
    dlg.showModal()
  })
}

// run an async action, toast any error
export async function guard(fn, okMessage) {
  try { const r = await fn(); if (okMessage) toast(okMessage); return r }
  catch (e) { toast(e.message || 'Something went wrong', 'error') }
}

// promise-based text prompt: const name = await promptDialog({ title, label, confirm }) -> string or null
export function promptDialog({ title, label, value = '', confirm = 'OK', placeholder = '' }) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', value, placeholder, maxLength: 30 })
    const dlg = h('dialog', null,
      h('form', { method: 'dialog', onsubmit: () => { dlg.returnValue = 'yes' } },
        h('div', { class: 'dlg-body' }, h('h3', null, title), h('label', { class: 'label' }, label), input),
        h('div', { class: 'dlg-foot' },
          h('button', { class: 'btn', type: 'button', onclick: () => dlg.close('no') }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, confirm))))
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes' && input.value.trim() ? input.value.trim() : null); dlg.remove() })
    document.body.append(dlg)
    dlg.showModal(); input.focus()
  })
}
