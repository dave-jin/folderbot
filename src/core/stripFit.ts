/**
 * 세션 줄 — 한 줄에 몇 개를 세울지 가른다 (2026-11-13 Dave 카드 «가 — ＋N 목록»).
 *
 * 채팅 머리줄 아래의 세션 줄은 늘 한 줄이다. 다 안 들어가면 들어가는 만큼만 세우고 나머지는 «＋N» 단추의 목록으로 보낸다.
 * 순서는 바꾸지 않는다 — 다만 지금 보는 세션은 늘 보여야 하므로, 가려질 자리에 있으면 보이는 마지막 자리와 바꾼다.
 * 폭은 화면이 재서 넘긴다(순수 함수 · 유닛 `test/unit/stripFit.test.ts`).
 */
export type StripDot = 'wait' | 'run' | 'unread' | ''

/**
 * 보일 탭의 인덱스(오름차순).
 * @param widths 탭마다의 폭(탭 사이 틈 포함)
 * @param avail 탭을 세울 수 있는 폭(＋ 단추는 이미 뺀 값)
 * @param moreW «＋N» 단추의 폭 — 가려지는 탭이 있을 때만 자리를 쓴다
 * @param active 지금 보는 탭의 인덱스(없으면 -1)
 */
export function fitTabs(widths: readonly number[], avail: number, moreW: number, active: number): number[] {
  const n = widths.length
  if (!n) return []
  let sum = 0
  for (const w of widths) sum += w
  if (sum <= avail) return widths.map((_, i) => i)
  const room = avail - moreW
  const out: number[] = []
  let used = 0
  for (let i = 0; i < n; i++) {
    if (used + widths[i] > room) break
    used += widths[i]; out.push(i)
  }
  if (active >= 0 && active < n && !out.includes(active)) {
    // 지금 보는 탭이 들어갈 때까지 뒤에서부터 뺀다 — 하나도 안 남아도 지금 보는 탭은 세운다
    while (out.length && used + widths[active] > room) used -= widths[out.pop() as number]
    out.push(active)
  }
  if (!out.length) out.push(active >= 0 && active < n ? active : 0)
  return out.sort((a, b) => a - b)
}

const RANK: Record<StripDot, number> = { wait: 3, run: 2, unread: 1, '': 0 }
/** 가려진 세션들의 상태에서 단추에 켤 점 하나 — 내 답 기다림 › 일하는 중 › 안 읽음 */
export function hiddenDot(states: readonly StripDot[]): StripDot {
  let best: StripDot = ''
  for (const s of states) if (RANK[s] > RANK[best]) best = s
  return best
}
