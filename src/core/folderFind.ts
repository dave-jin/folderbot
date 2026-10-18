/**
 * 🔴 **DE · 폴더봇 찾기(⌘K) A안 — 맨 위 «최근» 다섯 줄 + 아래 PARA 칸** (2026-10-18 목업 `03_디자인/2026-10-18_폴더찾기-PARA-목업` · 2026-10-19 Dave A 확정).
 *    종전에는 레일 순서 그대로 서서 2. Area 폴더가 1. Projects 폴더와 섞이고, 어제 쓴 폴더가 아래에 묻혔다(스크린샷_002).
 *
 * - **«최근» = 사람이 그 폴더의 세션을 마지막으로 열어 본 시각**(세션 `readAt` 의 가장 큰 값 · 어느 기기에서든).
 *   ⛔ «봇이 마지막으로 대화한 시각» 이 아니다 — 그러면 새벽 루틴이 돈 폴더가 매일 아침 위로 올라와 하던 폴더가 다시 묻힌다.
 * - 오케스트레이터는 늘 맨 위 한 줄. 그 아래 «최근» 칸(최대 5) · 그 아래 PARA 칸(Projects · Area · Resources · Archive · 그 밖).
 * - 최근 칸에 든 폴더는 아래 PARA 칸에서 빠진다 — 두 번 나오지 않는다(목업 A 의 «대가» 로 적힌 그대로).
 * - 칸 안은 최근 순, 한 번도 안 연 폴더는 그 뒤에 원래(레일) 순서대로.
 * - **검색어가 있으면** 칸 머리를 걷고 맞는 순서로 세운다 — 줄 왼쪽의 칸 표식(P·A·R)으로 어느 칸 폴더인지 보인다(화면 몫).
 * - PARA 칸은 `rel` 앞머리에서 읽는다 — 번호는 볼 때마다 바뀌어 왔으므로(2026-09-28 한 칸씩 내림) 낱말(Projects·Area…)로 판정한다.
 *
 * ⚠ 순수 함수 — 화면(`client/Search.tsx`)과 유닛이 같은 판정을 쓴다.
 */
export type Para = 'P' | 'A' | 'R' | 'X'

/** `rel` 의 첫 조각에서 PARA 칸을 읽는다 — «1. Projects/…» → P · «3. Area/…» → A · 그 밖은 null */
export function paraOf(rel: string): Para | null {
  const top = (rel.split('/')[0] ?? '').normalize('NFC').toLowerCase().replace(/^[\d\s._-]+/, '')
  if (/^projects?\b/.test(top)) return 'P'
  if (/^areas?\b/.test(top)) return 'A'
  if (/^resources?\b/.test(top)) return 'R'
  if (/^archives?\b/.test(top)) return 'X'
  return null
}
export const PARA_ORDER: Para[] = ['P', 'A', 'R', 'X']
export const PARA_WORD: Record<Para, string> = { P: 'Projects', A: 'Area', R: 'Resources', X: 'Archive' }

/** 사람이 그 봇의 세션을 마지막으로 열어 본 시각 — 없으면 0 */
export function lastReadOf(sessions: { readAt?: number }[] | undefined): number {
  let t = 0
  for (const x of sessions ?? []) if ((x.readAt ?? 0) > t) t = x.readAt ?? 0
  return t
}

export interface FindBot { id: string; rel: string; section: string; orchestrator: boolean }
export interface FindGroup<B> { key: string; label: string; para: Para | null; bots: B[] }
export const RECENT_N = 5

/**
 * 검색어가 없을 때의 칸 — `[관제] · 최근 · P · A · R · X · 그 밖` 순서. 빈 칸은 뺀다.
 * `bots` 는 레일 순서 그대로 받는다(같은 시각·한 번도 안 연 폴더의 차례).
 */
export function finderGroups<B extends FindBot>(bots: B[], readOf: (id: string) => number, n = RECENT_N): FindGroup<B>[] {
  const orch = bots.filter((b) => b.orchestrator)
  const rest = bots.filter((b) => !b.orchestrator)
  const idx = new Map(rest.map((b, i) => [b.id, i]))
  const byRecent = (a: B, b: B) => (readOf(b.id) - readOf(a.id)) || ((idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0))
  const recent = rest.filter((b) => readOf(b.id) > 0).sort(byRecent).slice(0, n)
  const inRecent = new Set(recent.map((b) => b.id))
  const out: FindGroup<B>[] = []
  if (orch.length) out.push({ key: 'orch', label: '', para: null, bots: orch })
  if (recent.length) out.push({ key: 'recent', label: '최근', para: null, bots: recent })
  const left = rest.filter((b) => !inRecent.has(b.id))
  for (const p of PARA_ORDER) {
    const mine = left.filter((b) => paraOf(b.rel) === p).sort(byRecent)
    if (!mine.length) continue
    // 칸 이름은 볼트의 실제 폴더명 그대로(«1. Projects» · 옛 볼트면 «2. Projects») — 섞여 있으면 가장 많은 것
    out.push({ key: p, label: commonest(mine.map((b) => b.section || b.rel.split('/')[0])) || PARA_WORD[p], para: p, bots: mine })
  }
  const other = left.filter((b) => !paraOf(b.rel)).sort(byRecent)
  if (other.length) out.push({ key: 'other', label: '그 밖', para: null, bots: other })
  return out
}
function commonest(xs: string[]): string {
  const c = new Map<string, number>(); let best = '', bn = 0
  for (const x of xs) { const k = (c.get(x) ?? 0) + 1; c.set(x, k); if (k > bn) { best = x; bn = k } }
  return best
}

/** 폴더명 날짜를 짧게 — 목업의 «1. Projects · 10-17» · «09 마감» */
export function dueShort(due?: { date: string; precision: 'day' | 'month' | 'year' } | null): string {
  if (!due?.date) return ''
  const [y, m, d] = due.date.split('-')
  return due.precision === 'day' ? `${m}-${d}` : due.precision === 'month' ? (m ?? '') : (y ?? '')
}

/** «최근» 시각을 짧게 — 방금 · N분 · N시간(오늘) · 어제 · 요일(이번 주) · M/D */
export function agoShort(t: number, now = Date.now()): string {
  if (!t) return ''
  const diff = now - t
  if (diff < 60_000) return '방금'
  const d = new Date(t), n = new Date(now)
  const day0 = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day0(n) - day0(d)) / 86_400_000)
  if (days <= 0) return diff < 3_600_000 ? `${Math.floor(diff / 60_000)}분` : `${Math.floor(diff / 3_600_000)}시간`
  if (days === 1) return '어제'
  if (days < 7) return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}`
}
