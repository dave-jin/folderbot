import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshTarget, OPEN_CACHE, OPEN_KEY, OPEN_TTL_MS } from '../../src/client/pushOpen'

/** DK · 폰 푸시를 누르면 그 세션으로 (2026-10-26 Dave «알림을 클릭했을 때 해당 섹션으로 바로 이동하지 않는 버그») */
const T = 1_000_000_000

describe('freshTarget', () => {
  it('폴더가 있고 5분 안이면 쓴다', () => {
    expect(freshTarget({ botId: 'b1', sessionId: 's1', at: T }, T + 1000)).toEqual({ botId: 'b1', sessionId: 's1', at: T })
    expect(freshTarget({ botId: 'b1', sessionId: '', at: T }, T)).toEqual({ botId: 'b1', at: T })
  })
  it('낡았거나 폴더가 없으면 버린다', () => {
    expect(freshTarget({ botId: 'b1', at: T }, T + OPEN_TTL_MS + 1)).toBeNull()
    expect(freshTarget({ at: T }, T)).toBeNull()
    expect(freshTarget(null, T)).toBeNull()
    expect(freshTarget({ botId: 'b1' }, T)).toBeNull()
  })
})

/** 서비스 워커를 가짜 `self` 위에서 돌린다 — iOS 처럼 navigate 가 실패해도 칸·메시지·포커스로 가야 한다 */
function runSw(clients: { navigate?: () => Promise<unknown>; focus: () => Promise<unknown>; postMessage: (m: unknown) => void }[]) {
  const src = readFileSync(join(__dirname, '../../src/client/public/sw.js'), 'utf8')
  const handlers: Record<string, (e: unknown) => void> = {}
  const store = new Map<string, string>()
  const opened: string[] = []
  const fake = {
    addEventListener: (n: string, f: (e: unknown) => void) => { handlers[n] = f },
    clients: { matchAll: async () => clients, openWindow: async (u: string) => { opened.push(u) }, claim: async () => {} },
    registration: { showNotification: async () => {} },
    skipWaiting: () => {},
  }
  const caches = { open: async (name: string) => ({ put: async (k: string, r: Response) => { store.set(`${name}|${k}`, await r.text()) } }) }
  new Function('self', 'caches', 'Response', src)(fake, caches, Response)
  return { handlers, store, opened }
}
async function click(h: Record<string, (e: unknown) => void>, data: unknown) {
  let p: Promise<unknown> = Promise.resolve()
  h.notificationclick({ notification: { data, close: () => {} }, waitUntil: (x: Promise<unknown>) => { p = x } })
  await p
}

describe('sw.js notificationclick', () => {
  it('떠 있는 앱 — 칸에 적고 메시지를 보내고 앞으로 올린다(navigate 는 안 쓴다)', async () => {
    const got: unknown[] = []; let focused = 0, navigated = 0
    const { handlers, store } = runSw([{ navigate: async () => { navigated++; throw new TypeError('navigate failed') }, focus: async () => { focused++ }, postMessage: (m) => got.push(m) }])
    await click(handlers, { botId: 'b1', sessionId: 's1' })
    const saved = JSON.parse(store.get(`${OPEN_CACHE}|${OPEN_KEY}`)!)
    expect(saved).toMatchObject({ botId: 'b1', sessionId: 's1' })
    expect(got[0]).toMatchObject({ type: 'fb:open', botId: 'b1', sessionId: 's1' })
    expect(focused).toBe(1); expect(navigated).toBe(0)
  })
  it('닫혀 있던 앱 — 칸에 적고 새 창을 연다', async () => {
    const { handlers, store, opened } = runSw([])
    await click(handlers, { botId: 'b 1', sessionId: 's1' })
    expect(store.has(`${OPEN_CACHE}|${OPEN_KEY}`)).toBe(true)
    expect(opened).toEqual(['/#bot=b%201&s=s1'])
  })
  it('폴더 없는 알림은 칸을 안 남긴다', async () => {
    const { handlers, store, opened } = runSw([])
    await click(handlers, {})
    expect(store.size).toBe(0); expect(opened).toEqual(['/'])
  })
})
