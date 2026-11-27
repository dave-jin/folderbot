/**
 * DW · **문서마다 읽던 자리를 기억한다** (2026-11-27 Dave: *«현재 보고 있는 문서만 기억하는것이 아니라 보고 있는 문서의
 *    줄 위치까지 기억해서 다시 돌아왔을때 같은 영역이 보여졌으면 좋겠어»*).
 *    종전엔 탭(어느 문서)은 기억했지만 편집기가 문서마다 새로 떠서(`key` = 봇+파일) 돌아오면 늘 맨 위였다.
 *
 * - 마크다운(편집기)은 **줄 번호 + 그 줄 안의 글자 위치**로 남긴다 — 글자 크기·창 폭·그림 높이가 바뀌어도 같은 글이 맨 위에 온다.
 *   픽셀로 남기면 폭이 바뀐 다음 판에서 엉뚱한 곳이 보인다.
 * - 원문(textarea)·읽기 전용 글은 픽셀(`y`)로 남긴다 — 줄바꿈이 없는 원문이라 거의 같다.
 * - 맨 위(줄 1 · 0px)면 지운다 — 기본값이 곧 맨 위다.
 * - 이 기기에만 둔다(`localStorage`) · 문서가 많아지면 오래 안 본 것부터 버린다(`CAP`).
 * ⛔ PDF·html 은 못 한다 — 둘 다 격리된 틀(iframe) 안이라 바깥에서 스크롤을 읽을 수 없다.
 */
export type DocPos = { l: number; c?: number } | { y: number }
type Rec = DocPos & { t: number }

export const DOCPOS_KEY = 'fb:docpos'
export const CAP = 300

type Store = Pick<Storage, 'getItem' | 'setItem'>
const ls = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

function readAll(s: Store | null): Record<string, Rec> {
  if (!s) return {}
  try { const j = JSON.parse(s.getItem(DOCPOS_KEY) ?? '{}'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {} } catch { return {} }
}

/** 봇+파일 → 기억한 자리(없으면 undefined) */
export function readPos(key: string, s: Store | null = ls()): DocPos | undefined {
  const r = readAll(s)[key]
  if (!r) return undefined
  if (typeof (r as { l?: unknown }).l === 'number' && (r as { l: number }).l >= 1) { const x = r as { l: number; c?: number }; return x.c ? { l: x.l, c: x.c } : { l: x.l } }
  if (typeof (r as { y?: unknown }).y === 'number' && (r as { y: number }).y > 0) return { y: (r as { y: number }).y }
  return undefined
}

/** 자리를 남긴다 — 맨 위면 지운다 · 넘치면 오래된 것부터 버린다 */
export function writePos(key: string, p: DocPos | null, s: Store | null = ls(), now = Date.now()): void {
  if (!s) return
  const all = readAll(s)
  const top = !p || ('l' in p ? p.l <= 1 && !p.c : p.y <= 0)
  if (top) { if (!(key in all)) return; delete all[key] }
  else all[key] = { ...('l' in p ? (p.c ? { l: p.l, c: p.c } : { l: p.l }) : { y: Math.round(p.y) }), t: now }
  const ks = Object.keys(all)
  if (ks.length > CAP) ks.sort((a, b) => (all[a].t ?? 0) - (all[b].t ?? 0)).slice(0, ks.length - CAP).forEach((k) => { delete all[k] })
  try { s.setItem(DOCPOS_KEY, JSON.stringify(all)) } catch { /* 가득 차도 화면은 그대로 */ }
}
