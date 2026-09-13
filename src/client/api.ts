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

/**
 * SSE — fetch 로 읽어 토큰이 URL 에 남지 않게. 끊기면 재접속.
 *
 * 🔴 **«조용히 죽은 줄» 을 스스로 알아챈다.** 폰(iOS)은 화면을 잠그거나 다른 앱에 갔다 오면 이 스트림이
 *    **오류도 종료도 없이 멈춘다** — 읽기는 영원히 기다리고, 화면은 붙어 있다고 믿는다(맥에서는 이 일이
 *    안 생겨 폰만 조용히 낡았다). 그래서 호스트가 8초마다 보내는 박동(`: hb`)을 **마지막으로 받은 시각**
 *    으로 재고, 30초 넘게 아무것도 안 오면 끊고 다시 붙는다.
 * ⚠ 호스트의 박동 주기를 늘리면 이 문턱도 함께 늘려야 한다 — 한쪽만 바꾸면 멀쩡한 줄을 계속 끊는다.
 */
const HB_DEAD_MS = 30_000
export function connectEvents(onFrame: (f: Frame) => void, onStatus: (s: 'on' | 'off') => void): () => void {
  let stop = false; let ctl: AbortController | null = null; let backoff = 500; let lastAt = Date.now()
  const run = async () => {
    while (!stop) {
      ctl = new AbortController()
      try {
        const r = await fetch('/api/events', { headers: { authorization: `Bearer ${token()}` }, signal: ctl.signal })
        if (r.status === 401) { setToken(''); window.dispatchEvent(new Event('fb:authlost')); return }
        if (!r.ok || !r.body) throw new Error('sse')
        onStatus('on'); backoff = 500; lastAt = Date.now()
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
        for (;;) {
          const { value, done } = await reader.read(); if (done) break
          lastAt = Date.now()                       // 박동이든 프레임이든 «살아 있다» 는 증거다
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
  const kick = () => { backoff = 500; lastAt = Date.now(); ctl?.abort() }
  const onVis = () => { if (document.visibilityState === 'visible') kick() }
  const watchdog = window.setInterval(() => { if (!stop && Date.now() - lastAt > HB_DEAD_MS) kick() }, 10_000)
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('online', kick)
  return () => {
    stop = true; ctl?.abort(); window.clearInterval(watchdog)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('online', kick)
  }
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
