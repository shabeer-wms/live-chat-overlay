// Thin fetch wrapper. A 401 anywhere means the session is gone, so tell the app.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('auth:lost'))
    throw new ApiError(res.status, data.error || res.statusText)
  }
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
}
