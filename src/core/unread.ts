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
