/**
 * S · 「내가 읽었나」 (2026-09-21 Dave: *«답변이 완료된 것 중에 내가 읽은 것과 읽지 않은 것을 구분하는 게 안 되네»*).
 *
 * 🔴 **끝난 것과 내가 본 것은 다르다.** 종전에는 턴이 끝나면 전부 같은 초록 배지라, 방금 온 답과 어제 읽고 닫은 답이
 *    한 화면에서 똑같이 보였다. 알림(🔔)만으로는 못 갈랐다 — 알림은 «왔다» 를 세고 «봤다» 를 안 센다(실제로 50 이 쌓였다).
 * 🔴 **판정은 두 시각의 크기 비교 하나다** — 마지막으로 **봇이 낸 말**의 시각(`lastReplyAt`)과 내가 **읽은 지점**(`readAt`).
 *    상태(running·done)와 섞지 않는다: 상태는 «지금 무엇을 하나» 고 이건 «내가 봤나» 다. 섞으면 일하는 중에도 안 읽음이 켜진다.
 * ⚠ 읽음은 **기기별이 아니라 볼트에 적는다** — Dave 는 한 사람이고 폰에서 읽은 것이 맥에서 다시 «안 읽음» 이면 표식을 못 믿는다.
 */

/** 이 세션에 내가 아직 안 본 답이 있나 — 답이 한 번도 없으면(새 세션) 안 읽음이 아니다 */
export function sessionUnread(lastReplyAt?: number, readAt?: number): boolean {
  if (!lastReplyAt) return false
  return lastReplyAt > (readAt ?? 0)
}

/** 폴더(봇) 단위 — 세션 중 하나라도 안 읽음이면 그 폴더는 안 읽음 */
export function botUnread(sessions: { lastReplyAt?: number; readAt?: number }[]): boolean {
  return sessions.some((x) => sessionUnread(x.lastReplyAt, x.readAt))
}
/** 폴더 안에서 안 읽은 세션 수 — 배지 숫자가 필요해지면 이걸 쓴다(지금 화면은 켜짐/꺼짐만 쓴다) */
export function unreadCount(sessions: { lastReplyAt?: number; readAt?: number }[]): number {
  return sessions.filter((x) => sessionUnread(x.lastReplyAt, x.readAt)).length
}

/**
 * 지금 «읽음» 을 적어도 되나 (2026-09-21 Dave 확정: *«맨 아래까지 봤을 때»*).
 * ⛔ **세션을 연 것만으로는 읽음이 아니다** — 긴 답의 앞머리만 보고 나가도 읽음이 되면 표식이 거짓말을 한다.
 * ⛔ **스트리밍 중에는 적지 않는다** — 글이 계속 자라 `lastReplyAt` 이 뒤로 가므로, 적어 봐야 다음 조각에 다시 안 읽음이 된다.
 *    턴이 끝나고도 맨 아래에 있으면 그때 한 번 적는다(화면이 다시 부른다).
 * ⚠ 이미 읽은 것에는 다시 적지 않는다 — 세션을 열 때마다 쓰면 볼트에 쓸데없는 쓰기가 쌓인다.
 */
export function shouldMarkRead(o: { atBottom: boolean; streaming: boolean; lastReplyAt?: number; readAt?: number }): boolean {
  if (!o.atBottom || o.streaming) return false
  return sessionUnread(o.lastReplyAt, o.readAt)
}

/**
 * 🔴 **AN · 안 읽음 링은 「네가 볼 차례」일 때만 두른다** (2026-09-24 Dave: *«주황색 표시, 즉 안읽은게 있지만
 *    끝나지 않은 상태에서는 더블링이 나오면 안돼 … 그냥 진행 중일때는 주황색 원닷으로만 가자»* ·
 *    범위 확인 답: *«초록 + 노랑 + 빨강 처럼 **사람 확인이 필요한 모든 경우**에 링이 필요해»*).
 *
 * 배지는 두 겹이다 — 꽉 찬 원(안) + 안 읽었을 때 더해지는 얇은 링(밖). 종전에는 **상태와 무관하게** 안 읽기만 하면
 * 링을 둘러서, 봇이 한창 돌고 있는 주황에도 링이 생겼다. 그 링은 「가서 봐라」는 뜻인데 그때는 볼 것이 없다.
 *
 * ⚠ 색 목록으로 적지 않는다 — **「사람 차례인가」** 하나로 가른다. 색이 바뀌어도 규칙은 안 낡는다.
 *   · 볼 차례다 → `done`(끝남) · `wait`(네 차례) · `error`(오류) · 배지 없음(쉬는 중인데 안 읽은 답이 있다 = 끝난 것)
 *   · 아직 도는 중 → `work`(봇이 일하는 중) · `hold`(남을 기다리는 중) → **원닷 하나만**
 */
export type BotMood = 'idle' | 'work' | 'hold' | 'wait' | 'done' | 'sleep' | 'error'
const RUNNING: BotMood[] = ['work', 'hold']
export function unreadRing(mood: BotMood): boolean {
  return !RUNNING.includes(mood)
}

/**
 * 🔴 **AU · 배지는 「무슨 일이 있을 때」만 뜬다** (2026-09-25 Dave 승인: *«기다리는 중이 아니고 읽지 않은 상태가
 *    아닌 경우에는 닷 자체를 없애고 싶어 … 끝난 화면에 초록색 배지를 없애줘 … 링이 다 있으니깐 현재 작업 중인
 *    링이 뭔지 너무 헷갈려»*).
 * 종전에는 **끝났고 이미 읽은** 봇에도 초록 닷이 남아, 화면에 닷이 너무 많았다. 그 사이에서 정작 **지금 돌고
 * 있는 주황 닷**(숨쉬는 것)이 묻혔다.
 * ⇒ 닷을 그리는 경우는 둘뿐이다 — ① 지금 돌고 있거나 누군가를 기다린다(`work`·`hold`·`wait`·`error`)
 *    ② 읽을 것이 남았다. 끝났고 봤으면(`done`) · 시작 안 했으면(`idle`) · 잠들었으면(`sleep`) **아무것도 없다.**
 * ⚠ 노랑(네 차례)·빨강(오류)은 읽은 뒤에도 남긴다 — 끝난 게 아니라 **멈춰서 사람을 기다리는** 상태다(Dave 승인안).
 */
const LIVE: BotMood[] = ['work', 'hold', 'wait', 'error']
export function badgeOn(mood: BotMood, unread: boolean): boolean {
  return unread || LIVE.includes(mood)
}

/* ── 레일 «상태» 정렬 차례 (App 레일·폰 홈이 같이 쓴다) ── */
/**
 * 🔴 **AZ · 「대기」(hold — 다른 에이전트·도구를 기다리는 중)가 빠져 있었다** (2026-09-25 Dave: *«'대기' 항목은 맨 밑으로 보내지 말고
 *    '유휴' 항목보다는 위에»*). 표에 없는 갈래는 `?? 9` 로 맨 뒤에 섰다 — 바로 위 경고가 말한 그 사고다. 대기는 아직 끝나지 않은 일이라
 *    일하는 중 바로 뒤에 둔다. 유휴(idle)·절전(sleep)이 맨 뒤다. ⚠ 새 갈래를 만들면 `core/unread` 의 `BotMood` 와 이 표를 함께 늘린다
 */
export const MOOD_RANK: Record<BotMood, number> = { wait: 0, work: 1, hold: 2, error: 3, done: 4, idle: 5, sleep: 6 }
