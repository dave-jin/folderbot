import type { Frame } from '../core/types'

const KEY = 'folderbot:token'
export function token(): string { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
export function setToken(t: string): void { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY) } catch { /* */ } }

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg) } }

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api${path}`, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` }, body: opts.body ? JSON.stringify(opts.body) : undefined })
  if (r.status === 401) { setToken(''); window.dispatchEvent(new Event('fb:authlost')) }
  const text = await r.text()
  let j: unknown = null
  try { j = text ? JSON.parse(text) : null } catch { j = null }
  if (!r.ok) throw new ApiError(r.status, (j as { error?: string })?.error ?? `HTTP ${r.status}`)
  return j as T
}

/** SSE — fetch 로 읽어 토큰이 URL 에 남지 않게. 끊기면 재접속. */
export function connectEvents(onFrame: (f: Frame) => void, onStatus: (s: 'on' | 'off') => void): () => void {
  let stop = false; let ctl: AbortController | null = null; let backoff = 500
  const run = async () => {
    while (!stop) {
      ctl = new AbortController()
      try {
        const r = await fetch('/api/events', { headers: { authorization: `Bearer ${token()}` }, signal: ctl.signal })
        if (r.status === 401) { setToken(''); window.dispatchEvent(new Event('fb:authlost')); return }
        if (!r.ok || !r.body) throw new Error('sse')
        onStatus('on'); backoff = 500
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
        for (;;) {
          const { value, done } = await reader.read(); if (done) break
          buf += dec.decode(value, { stream: true })
          let i
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
            for (const line of chunk.split('\n')) if (line.startsWith('data: ')) { try { onFrame(JSON.parse(line.slice(6))) } catch { /* */ } }
          }
        }
      } catch { /* reconnect */ }
      onStatus('off')
      if (stop) return
      await new Promise((r) => setTimeout(r, backoff)); backoff = Math.min(backoff * 2, 10000)
    }
  }
  void run()
  const kick = () => { backoff = 500; ctl?.abort() }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick() })
  window.addEventListener('online', kick)
  return () => { stop = true; ctl?.abort() }
}

export async function subscribePush(vapidPublic: string, device: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const perm = await Notification.requestPermission(); if (perm !== 'granted') return false
    const key = Uint8Array.from(atob(vapidPublic.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await api('/push/subscribe', { body: { sub: sub.toJSON(), device } })
    return true
  } catch { return false }
}

export async function uploadFile(botId: string, file: File): Promise<{ rel: string; abs: string; size: number }> {
  const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file) })
  return api(`/bots/${botId}/upload`, { body: { name: file.name, data } })
}
