// Light / dark / follow-the-system, remembered per browser.
const KEY = 'overlay-admin-theme'
export const getTheme = () => { try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' } }
export function setTheme(t) {
  try { t === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t) } catch {}
  applyTheme()
}
export function applyTheme() {
  const t = getTheme()
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}
