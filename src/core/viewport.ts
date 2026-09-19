/**
 * 🔴 **뷰포트 앵커 — 한 함수** (I-2 · O · P-4 · 2026-09-19). iOS Safari 는 키보드가 뜨면 **시각 뷰포트만** 줄인다.
 * 그래서 «지금 보이는 만큼» 은 언제나 visualViewport 이고, 루트를 거기에 맞추는 계산은 여기 한 곳이다 —
 * 세 군데가 따로 구현되면 하나 고칠 때마다 나머지가 깨진다.
 *
 * 입력: 입력 중이냐(editing) · 시각 뷰포트(height·offsetTop) · 창 높이(innerHeight) · 문서가 밀렸나(scrollY)
 * 출력: 루트에 줄 CSS 변수(없으면 지운다) · 문서를 0 으로 되돌려야 하나
 */
export interface VV { height: number; offsetTop: number }
export interface ViewportPlan { vars: { vvh: string; vvt: string; kbh: string } | null; open: boolean; resetScroll: boolean }
export function planViewport(editing: boolean, vv: VV, innerHeight: number, scrollY: number): ViewportPlan {
  const open = editing
  const vars = open ? { vvh: `${Math.round(vv.height)}px`, vvt: `${Math.round(vv.offsetTop)}px`, kbh: `${Math.max(0, Math.round(innerHeight - vv.offsetTop - vv.height))}px` } : null
  // P-4 · 문서가 밀렸으면(고무줄로 당겨져 scrollY > 0) 되돌린다 — 보험이지 주 대책이 아니다(주 대책은 html/body overflow:hidden)
  return { vars, open, resetScroll: scrollY > 0 }
}
/** 계획을 문서에 적용한다 — DOM 을 만지는 유일한 곳 */
export function applyViewport(plan: ViewportPlan, st: { setProperty: (k: string, v: string) => void; removeProperty: (k: string) => void }, scrollTo: (x: number, y: number) => void): void {
  if (plan.vars) { st.setProperty('--vvh', plan.vars.vvh); st.setProperty('--vvt', plan.vars.vvt); st.setProperty('--kbh', plan.vars.kbh) }
  else { st.removeProperty('--vvh'); st.removeProperty('--vvt'); st.removeProperty('--kbh') }
  if (plan.resetScroll || !plan.open) scrollTo(0, 0)
}
