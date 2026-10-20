/**
 * 🔴 **J-4 · 문서 창 열기는 «한 번 흘리는 신호» 가 아니라 «남는 요청» 이다** (2026-10-21 Dave: *«10장짜리 덱을 만들어 문서 창에
 *    띄웠습니다 — 이렇게 나오는데 실제로 해당 문서가 안 띄워져 있어»*).
 *
 * 전에는 `rondo_open` 이 `doc` 신호를 한 번 흘리고 끝났다. 화면이 그 순간 **다른 봇을 보고 있었거나**(그림 그리는 몇 분 동안
 * 다른 폴더로 가는 게 보통이다) **연결이 잠깐 끊겼으면** 신호는 버려지는데, 봇에게는 «열었어요» 가 돌아가 봇이 사람에게 거짓말을 했다.
 *
 * 그래서 호스트가 세션마다 마지막 열기 요청을 남기고(`SessionInfo.docReq`), 화면은 그 봇을 볼 때마다
 * **이 기기가 아직 안 연 것 중 가장 새것**을 연다. 한 기기에서 한 번만 연다(닫은 창을 다시 열지 않게) · 오래된 것은 열지 않는다.
 *
 * ⚠ 순수 함수 — 화면(`client/App.tsx`)과 유닛이 같은 판정을 쓴다.
 */
export interface DocReq {
  /** 호스트가 요청을 받은 시각 — 같은 세션의 요청을 가르는 열쇠 */
  at: number
  rel: string
  action: 'open' | 'reveal'
  /** 그 세션의 턴 시각 — 한 턴에 한 번만 연다 */
  turn: number
  /** J-3 · 요청이 온 기기(`host` 또는 기기 이름) — 비었으면 어느 기기든 */
  device?: string
}

/** 이만큼 지난 요청은 뒤늦게 열지 않는다 — 한참 뒤 그 봇에 갔는데 옛 문서가 튀어나오면 그것도 엉뚱하다 */
export const DOC_REPLAY_MS = 30 * 60_000

export const docKey = (sid: string, r: Pick<DocReq, 'at'>): string => `${sid}:${r.at}`

/**
 * 이 기기가 지금 열어야 할 요청 — 봇의 세션들 중 «열기» · 이 기기 몫 · 아직 안 연 것 · 30분 안 · 가장 새것 하나.
 * `me` 는 이 화면의 기기(호스트면 `host`).
 */
export function pendingDoc(
  sessions: ReadonlyArray<{ id: string; docReq?: DocReq }>,
  me: string,
  seen: (key: string) => boolean,
  now = Date.now(),
): { sid: string; req: DocReq } | null {
  let best: { sid: string; req: DocReq } | null = null
  for (const x of sessions) {
    const r = x.docReq
    if (!r || r.action !== 'open') continue
    if (r.device && r.device !== me) continue
    if (now - r.at > DOC_REPLAY_MS) continue
    if (seen(docKey(x.id, r))) continue
    if (!best || r.at > best.req.at) best = { sid: x.id, req: r }
  }
  return best
}
