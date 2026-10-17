/**
 * 문서 탭 열기·바꾸기 — 순수 함수(유닛이 잰다 · 화면은 `Doc.tsx` 의 `useDocs`).
 * DA (2026-10-17 Dave «누를 때마다 새 탭») — `multi` 면 늘 고정 탭을 더하고, 아니면(폰) 종전 미리보기 한 장.
 */
export interface DocTab { rel: string; pinned: boolean }
export type TabsSt = { tabs: DocTab[]; active: string | null }
/** 탭 열기 — `multi` 면 늘 새 탭, 아니면 종전 미리보기 한 장 */
export function openTab(s: TabsSt, rel: string, pin: boolean, multi: boolean): TabsSt {
  const has = s.tabs.find((t) => t.rel === rel)
  if (has) return { tabs: pin || multi ? s.tabs.map((t) => (t.rel === rel ? { ...t, pinned: true } : t)) : s.tabs, active: rel }
  if (multi) return { tabs: [...s.tabs, { rel, pinned: true }], active: rel }
  const pv = s.tabs.findIndex((t) => !t.pinned)
  const tabs = pin || pv < 0 ? [...s.tabs, { rel, pinned: pin }] : s.tabs.map((t, i) => (i === pv ? { rel, pinned: false } : t))
  return { tabs, active: rel }
}
/** 지금 탭을 다른 문서로 — 이미 열린 문서면 그 탭으로 간다(같은 문서가 두 탭이 되지 않게) */
export function replaceTab(s: TabsSt, rel: string): TabsSt {
  if (s.tabs.some((t) => t.rel === rel)) return { ...s, active: rel }
  const i = s.tabs.findIndex((t) => t.rel === s.active)
  if (i < 0) return { tabs: [...s.tabs, { rel, pinned: true }], active: rel }
  return { tabs: s.tabs.map((t, j) => (j === i ? { ...t, rel } : t)), active: rel }
}
