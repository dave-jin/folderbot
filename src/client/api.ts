import type { Frame } from '../core/types'

const KEY = 'folderbot:token'
export function token(): string { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
export function setToken(t: string): void { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY) } catch { /* */ } }

export class ApiError extends Error { constructor(public status: number, msg: string, public data?: unknown) { super(msg) } }

/**
 * BO · 아직 호스트에 만들어지는 중인 세션 — 화면은 «＋ 새 세션» 을 누르는 순간 그 세션으로 먼저 간다(`newSession.ts`).
 * 그 세션으로 가는 요청(첫 메시지·모델 바꾸기…)은 만들기가 끝날 때까지 **여기서 기다렸다** 나간다 — 부르는 곳마다
 * 기다리게 하면 한 곳을 빠뜨리는 순간 404 가 난다. 만들기가 실패해도 기다림은 풀린다(그 요청은 호스트가 거절한다).
 */
const creating = new Map<string, Promise<unknown>>()
export function markCreating(sid: string, p: Promise<unknown>): void {
  const done = p.then(() => {}, () => {}).finally(() => { if (creating.get(sid) === done) creating.delete(sid) })
  creating.set(sid, done)
}
export function isCreating(sid: string): boolean { return creating.has(sid) }
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const m = /^\/sessions\/(s_[a-z0-9]+)/.exec(path); const wait = m ? creating.get(m[1]) : undefined
  if (wait) await wait
  const r = await fetch(`/api${path}`, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` }, body: opts.body ? JSON.stringify(opts.body) : undefined })
  if (r.status === 401) { setToken(''); window.dispatchEvent(new Event('fb:authlost')) }
  const text = await r.text()
  let j: unknown = null
  try { j = text ? JSON.parse(text) : null } catch { j = null }
  if (!r.ok) throw new ApiError(r.status, (j as { error?: string })?.error ?? `HTTP ${r.status}`, j)
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
  let stop = false; let ctl: AbortController | null = null; let backoff = 500; let lastAt = Date.now(); let now = false
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
      // CF-1 · 화면이 돌아왔거나 망이 붙었으면(kick) 기다리지 않고 바로 붙는다 — 오류 재시도에만 늘어나는 대기를 쓴다(종전엔 늘 0.5초)
      const wait = now ? 0 : backoff; now = false
      await new Promise((r) => setTimeout(r, wait)); if (wait) backoff = Math.min(backoff * 2, 10000)
    }
  }
  void run()
  const kick = () => { backoff = 500; now = true; lastAt = Date.now(); ctl?.abort() }
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

/**
 * CF-④ · 폰 푸시 켜기. 종전엔 무엇이 막혀도 «실패» 한 마디였고, 맥미니에 HTTPS 가 없어 구독이 한 번도 안 생긴 것을 몇 주 몰랐다.
 *   이제 막힌 까닭을 돌려준다. ⚠ 클릭 핸들러에서 곧바로 부른다 — iOS 는 `requestPermission` 이 사용자 제스처 안이어야 해서
 *   그 앞에 다른 await(종전 `serviceWorker.ready`)를 두지 않는다.
 */
export type PushWhy = 'ok' | 'insecure' | 'not-installed' | 'unsupported' | 'denied' | 'no-sw' | 'error'
export async function subscribePush(vapidPublic: string, device: string): Promise<PushWhy> {
  if (!window.isSecureContext) return 'insecure'
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  if (/iPhone|iPad/.test(navigator.userAgent) && !standalone) return 'not-installed'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  try {
    const perm = await Notification.requestPermission()   // 첫 await — 제스처 안
    if (perm !== 'granted') return 'denied'
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
    if (!reg) return 'no-sw'
    const key = vapidKey(vapidPublic)
    let sub = await reg.pushManager.getSubscription()
    if (sub && !sameKey(sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null }   // 호스트 키가 바뀌었다 — 옛 구독은 403 만 받는다
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await api('/push/subscribe', { body: { sub: sub.toJSON(), device } })
    return 'ok'
  } catch { return 'error' }
}
/** 버튼에 쓸 말 — 사람이 다음에 무엇을 하면 되는지까지 */
export const pushWhyText: Record<PushWhy, string> = {
  ok: '푸시 켜짐',
  insecure: 'HTTPS 주소(…ts.net)로 열어야 켤 수 있어요',
  'not-installed': '공유 › 홈 화면에 추가한 아이콘으로 열어 주세요',
  unsupported: '이 브라우저는 푸시를 못 받아요',
  denied: '알림이 거절돼 있어요 — 설정 › 알림에서 허용',
  'no-sw': '서비스 워커가 안 떠요 — 새로 고침 뒤 다시',
  error: '구독 실패 — 다시 눌러 주세요',
}
/** 앱을 열 때마다 — 이미 허용된 기기면 구독을 호스트에 다시 알린다(addSub 는 같은 endpoint 를 덮는다). 호스트가 잃은 구독이 스스로 돌아온다 */
export async function resyncPush(vapidPublic: string, device: string): Promise<void> {
  try {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted' || !vapidPublic) return
    const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription()
    if (!sub || !sameKey(sub.options.applicationServerKey, vapidKey(vapidPublic))) return
    await api('/push/subscribe', { body: { sub: sub.toJSON(), device } })
  } catch { /* 다음에 열 때 다시 */ }
}
const vapidKey = (b64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return true   // 브라우저가 키를 안 알려 주면 비교를 못 한다 — 그대로 쓴다
  const x = new Uint8Array(a); return x.length === b.length && x.every((v, i) => v === b[i])
}

export async function uploadFile(botId: string, file: File, onProgress?: (pct: number) => void): Promise<{ rel: string; abs: string; size: number }> {
  const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file) })
  // N-3 · 진행 링 — fetch 는 올리는 진행을 못 주므로 XHR. 같은 JSON 몸통·같은 헤더
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('POST', `/api/bots/${botId}/upload`)
    x.setRequestHeader('content-type', 'application/json'); const t = token(); if (t) x.setRequestHeader('authorization', `Bearer ${t}`)
    x.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    x.onload = () => { try { const j = JSON.parse(x.responseText || '{}'); if (x.status >= 200 && x.status < 300) res(j); else rej(new Error(j.error || `upload ${x.status}`)) } catch (e) { rej(e as Error) } }
    x.onerror = () => rej(new Error('올리기 실패')); x.send(JSON.stringify({ name: file.name, data }))
  })
}
