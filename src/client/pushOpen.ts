/**
 * 🔴 DK · **폰 푸시를 누르면 그 세션으로 간다** (2026-10-26 Dave: «모바일에서 알림을 클릭했을 때 해당 섹션으로 바로 이동하지 않는 버그»).
 *
 * 종전에는 서비스 워커가 `client.navigate('/#bot=…&s=…')` 로 주소만 바꿨다. iOS 홈 화면 앱에서는 이게 안 된다 —
 *   ① 뒤에 떠 있던 앱은 `navigate()` 가 «navigate failed» 로 떨어져 보던 화면 그대로 열린다(WebKit 263687)
 *   ② 닫혀 있던 앱은 `openWindow(url)` 의 해시를 버리고 첫 화면(루트)으로 뜬다
 *   ③ 알림으로 막 뜬 창은 잠깐 메시지를 못 받는다(WebKit 252544) — postMessage 만으로도 못 막는다
 * ⇒ 워커는 «어디로» 를 **캐시 저장소 한 칸**(`fb-open`)에 적어 두고, 화면은 앞에 나올 때마다(첫 로드·보임·포커스·pageshow·메시지)
 *    그 칸을 **한 번 꺼내 지우고** 그리로 간다. 캐시 저장소는 워커와 화면이 같이 보는 자리라 앱이 닫혀 있었어도 남는다.
 * ⚠ 5분이 지난 칸은 버린다 — 한참 뒤 앱을 열었는데 옛 알림 자리로 끌려가면 안 된다.
 * ⚠ 이름은 `public/sw.js` 와 같아야 한다(워커는 이 파일을 못 가져온다).
 */
export const OPEN_CACHE = 'fb-open'
export const OPEN_KEY = '/__fb-open'
export const OPEN_TTL_MS = 5 * 60_000

export interface PushTarget { botId: string; sessionId?: string; at: number }

/** 칸 내용이 쓸 만한가 — 폴더가 있고 5분 안 */
export function freshTarget(d: unknown, now = Date.now()): PushTarget | null {
  const t = d as Partial<PushTarget> | null
  if (!t || typeof t.botId !== 'string' || !t.botId) return null
  if (typeof t.at !== 'number' || now - t.at > OPEN_TTL_MS || t.at - now > 60_000) return null
  return { botId: t.botId, ...(t.sessionId ? { sessionId: String(t.sessionId) } : {}), at: t.at }
}

/** 칸을 꺼내고 지운다 — 없거나 낡았으면 null */
export async function takePushOpen(): Promise<PushTarget | null> {
  if (typeof caches === 'undefined') return null
  try {
    const c = await caches.open(OPEN_CACHE)
    const r = await c.match(OPEN_KEY)
    if (!r) return null
    await c.delete(OPEN_KEY)
    return freshTarget(await r.json())
  } catch { return null }
}

/** 메시지로 먼저 받았으면 칸은 지운다(같은 자리로 두 번 안 간다) */
export function dropPushOpen(): void {
  if (typeof caches === 'undefined') return
  void caches.open(OPEN_CACHE).then((c) => c.delete(OPEN_KEY)).catch(() => undefined)
}

/**
 * 화면 쪽 — 앞에 나올 때마다 칸을 확인한다. 돌려주는 함수로 떼어 낸다.
 * `go` 는 매번 최신 것을 부르도록 함수로 받는다.
 */
export function watchPushOpen(go: () => (botId: string, sid?: string) => void): () => void {
  let busy = false
  const pull = () => {
    if (busy) return
    busy = true
    void takePushOpen().then((t) => { busy = false; if (t) go()(t.botId, t.sessionId) })
  }
  const onMsg = (e: MessageEvent) => {
    const t = freshTarget(e.data?.type === 'fb:open' ? e.data : null)
    if (!t) return
    dropPushOpen(); go()(t.botId, t.sessionId)
  }
  const onVis = () => { if (document.visibilityState === 'visible') pull() }
  pull()
  const late = window.setTimeout(pull, 1500)   // 닫혀 있던 앱 — 워커가 칸을 적는 것보다 화면이 먼저 뜰 수 있다
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
  sw?.addEventListener('message', onMsg)
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('focus', pull)
  window.addEventListener('pageshow', pull)
  return () => {
    window.clearTimeout(late)
    sw?.removeEventListener('message', onMsg)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', pull)
    window.removeEventListener('pageshow', pull)
  }
}
