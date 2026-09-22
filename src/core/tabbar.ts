/**
 * Z · 폰 **하단 탭** (2026-09-22 Dave 확정 「B · 하단 탭(내리면 숨음)」 — 떠 있던 독을 대신한다).
 *
 * 🔴 **탭은 «어디로 갈지» 를 늘 보여 주는 자리다.** 그래서 봇 목록만 빼고 늘 떠 있고(Z-3 의 「봇 목록 빼고 늘 띄우기」),
 *    읽어 내려가는 동안에는 **비킨다**(Z-1 의 「스크롤 중엔 뒤가 훤히 보이게」). 독의 «끌어서 옮기기» 는
 *    탭에서 뜻을 잃어 함께 폐기했다 — 탭은 제자리가 약속이다.
 */
/** 이만큼은 움직여야 «내려간다/올라간다» 로 본다 — 손가락 떨림에 탭이 깜빡이면 안 된다 */
export const TAB_DELTA = 6
/** 꼭대기 언저리에서는 늘 보인다 — 맨 위에서 탭이 없으면 «사라졌다» 로 읽힌다 */
export const TAB_TOP = 40

/** 스크롤 한 번에 탭을 보일지 — 내려가면 숨고 올라오면 돌아온다 */
export function tabVisible(prev: boolean, from: number, to: number): boolean {
  if (to <= TAB_TOP) return true
  const d = to - from
  if (Math.abs(d) < TAB_DELTA) return prev
  return d < 0
}

export type TabId = 'chat' | 'doc' | 'todo' | 'files'
/**
 * 지금 어느 탭이 켜져 있나. 할 일과 파일은 **같은 「폴더」 화면의 두 칸**이라 화면만으로는 못 가른다 —
 * 마지막으로 연 칸(`sec`)까지 봐야 한다.
 */
export function tabActive(view: 'list' | 'chat' | 'doc' | 'panel', sec?: string): TabId | null {
  if (view === 'chat') return 'chat'
  if (view === 'doc') return 'doc'
  if (view === 'panel') return sec === 'todo' ? 'todo' : 'files'
  return null
}
