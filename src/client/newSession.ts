import type { Bot, SessionInfo, Vendor } from '../core/types'
import type { StateShape } from './store'
import { api, markCreating } from './api'

/**
 * 🔴 **BO · 새 세션은 화면이 먼저 연다** (2026-10-08 Dave: «원격에서 '새 세션'을 열면 채팅 창이 열릴 때까지 딜레이가 생기네»).
 *
 * 종전에는 `POST 만들기 → /state 전체 다시 읽기 → 그 세션으로` 를 **차례로 다 기다린 뒤에야** 화면이 바뀌었다.
 * 호스트가 잠깐 멈춘 순간(사용량 훑기 2.5초 — BO ①)이나 폰의 느린 줄에서는 누르고 나서 아무 반응이 없었다.
 * 이제 id 를 화면이 정하고 ⓐ 임시 세션을 목록 맨 위에 ⓑ 빈 대화를 깔고 ⓒ 그 세션으로 **먼저 간다.** 만들기는 뒤에서 보낸다.
 * - `/state` 전체 다시 읽기는 뺐다 — 목록은 호스트가 보내는 `sessions` 프레임이 갱신하고, 그 사이는 임시 세션이 붙든다(`store.tsx` withGhosts).
 * - 만들기가 끝나기 전에 그 세션으로 가는 요청(첫 메시지 등)은 `api()` 가 기다렸다 보낸다(`markCreating`).
 * - 실패하면 임시 세션을 걷고 **원래 보던 세션으로** 돌아가 이유를 알린다. 입력하던 글은 세션마다 초안으로 남는다.
 * ⚠ id 형식은 호스트와 같다(`s_` + base36). 호스트가 형식·중복을 다시 본다(`SessionManager.acceptId`).
 */
export function newSessionId(): string { return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}` }

export interface StartOpts {
  bot: Bot
  name: string
  vendor?: Vendor
  defaults: StateShape['defaults']
  dispatch: (a: { type: 'ghost'; info: SessionInfo } | { type: 'unghost'; id: string }) => void
  go: (botId: string, sid?: string) => void
  /** 실패하면 돌아갈 세션 */
  prev?: string
  say: (m: string) => void
  /** 만들기가 끝난 뒤(성공) — 모델 목록 다시 보기 같은 뒷일 */
  after?: () => void
}

/** @returns 새 세션 id — 화면은 이미 그 세션에 가 있다 */
export function startSession(o: StartOpts): string {
  const id = newSessionId(); const now = Date.now()
  const vendor: Vendor = o.vendor ?? o.bot.vendor ?? 'claude'
  const d = vendor === 'codex' ? o.defaults.codex : o.defaults
  const info: SessionInfo = { id, botId: o.bot.id, name: o.name, vendor, state: 'idle', cliSessionId: null, createdAt: now, lastActivity: now, alive: false, hibernated: false, pending: [], bg: 0, model: d?.model || undefined, effort: d?.effort || undefined, permissionMode: vendor === 'codex' ? undefined : o.defaults.permissionMode }
  o.dispatch({ type: 'ghost', info })
  o.go(o.bot.id, id)
  const req = api<SessionInfo>(`/bots/${o.bot.id}/sessions`, { body: { id, name: o.name, ...(o.vendor ? { vendor: o.vendor } : {}) } })
  markCreating(id, req)
  req.then((got) => { if (got?.id === id) o.dispatch({ type: 'ghost', info: got }); o.after?.() }, (e: Error) => {
    o.dispatch({ type: 'unghost', id })
    // 그새 다른 세션으로 옮겨 갔으면 끌어오지 않는다 — 아직 이 세션을 보고 있을 때만 되돌린다
    if (decodeURIComponent(location.hash).includes(id)) o.go(o.bot.id, o.prev)
    o.say(`새 세션을 못 만들었어요 — ${e.message}`)
  })
  return id
}
