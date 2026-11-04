/**
 * 🔴 연결 지도 — 계산 (LM · 2026-11-04 Dave «모든 단계 한번에»).
 *    11/3 Dave: «폴더·정보 연결을 옵시디언 graph view 처럼 시각화 · 상황판에 더해 지배감·연결감·재활용 · 폴더 봇도 알아서 연결해 쓰게».
 *    목업 `2. Area/제품_FolderBot/03_디자인/2026-11-03_연결-지도-목업/` — 흐름(기본) · 과녁 지도 · 폴더별 목록 · 봇 쪽 카드.
 *
 * 선 네 종류 — 앞의 둘은 사실, 셋째는 사실(모델이 이름을 고르고 호스트가 파일에서 다시 센다), 넷째만 «봇 추측».
 *  - mention  문서 언급 — 한 폴더의 글이 다른 폴더 이름을 적었다(호스트가 md·txt 를 훑는다)
 *  - relay    봇 중계 — 오케스트레이터가 «중계 · A → B» 편지를 썼다(우편함)
 *  - entity   같은 사람·장소 — 두 폴더 파일에 같은 이름이 나온다(모델이 후보를 내고 호스트가 센다)
 *  - similar  비슷한 일 — 모델 추측. 화면·봇 카드에 «봇 추측» 으로 붙는다
 *
 * 🔴 일의 줄기(stem)는 **계산하고 Dave 가 고친다**(11/4 Dave 확정). 계산은 가중 그래프의 모듈성 묶기(Louvain 1단계),
 *    고침은 `LinkEdits` — 이름 바꾸기 · 폴더를 다른 줄기로 옮기기. 묶음이 다시 계산돼도 고친 것이 따라가게
 *    이름은 «그때의 구성원» 과 겹치는 줄기에 붙이고(자카드 ≥ .5), 옮기기는 «닻 폴더» 가 있는 줄기로 붙인다.
 * 🔴 허브(거의 모든 폴더가 이름을 적는 폴더 — 비서실·워크스테이션)는 계산으로 고른다. 줄기·다리 계산에서 빼고 흐리게 그린다.
 * ⚠ 이 파일은 순수 함수만 — 파일 읽기·모델 호출은 `host/links.ts`. 화면 배치(흐름·과녁)도 여기서 계산해 유닛이 잰다.
 */

export type LinkKind = 'mention' | 'relay' | 'entity' | 'similar'
export const LINK_KINDS: LinkKind[] = ['mention', 'relay', 'entity', 'similar']
export const KIND_KO: Record<LinkKind, string> = { mention: '문서 언급', relay: '봇 중계', entity: '같은 사람·장소', similar: '비슷한 일' }
/** 이웃을 고를 때 앞에 둘 차례 — 사람이 행동으로 잇는 것 먼저 */
const PRI: Record<LinkKind, number> = { relay: 0, entity: 1, similar: 2, mention: 3 }

export interface LinkNodeIn {
  /** 볼트 기준 상대 경로 — `1. Projects/2026-11-21_행사-노션-해커톤` */
  id: string
  /** 폴더 이름(basename) */
  name: string
  botId?: string
  /** 봇의 표시 이름(CLAUDE.md display_name) — 있으면 이름표로 쓴다 */
  display?: string
  /** 이번 주(7일) 바뀐 파일 수 */
  act?: number
  /** 가져다 쓸 후보 파일(폴더 기준 상대 경로) — 최근 순 */
  recent?: string[]
  /** 보관 폴더(4. Archive) — 끝난 일. 줄기·다리 계산에는 안 들고, 줄기에 «지난 일» 로 붙는다(11/4 Dave «아카이브된 것들과도 연결 — 정말 중요») */
  past?: boolean
}
export interface LinkNode extends LinkNodeIn {
  label: string
  /** 마감 있는 프로젝트(P) · 상시 영역(A) */
  kind: 'P' | 'A'
  /** 마감일 YYYY-MM-DD — 날이 없으면 그 달 끝 · 해만 있으면 그해 끝 */
  due?: string
  dueExact?: boolean
  act: number
  hub?: boolean
  /** 줄기 번호(stems 의 index) — 줄기 밖이면 없음 */
  stem?: number
  bridge?: boolean
  /** 봇이 줄기에 넣었다 — ai: 모델 판단 · graph: 선이 가장 많이 닿는 줄기 */
  byBot?: 'ai' | 'graph'
}
export interface LinkEdge { a: string; b: string; t: LinkKind; w: number; ev: string; files?: string[]; guess?: boolean; dir?: boolean }
/**
 * 일의 줄기. key 는 줄기 id — 관리 전에는 닻 폴더(가장 많이 이어진 폴더) 경로, 관리 뒤에는 edit.json 의 id.
 * members = 지금 폴더(보관 아님) · past = 보관 폴더(지난 일) · bot = 그중 봇이 넣은 것.
 * fixed = Dave 가 손댄 줄기(이름·구성원을 다시 계산하지 않는다).
 */
export interface Stem { key: string; name: string; line?: string; members: string[]; past: string[]; bot: string[]; fixed: boolean; color: string; named: 'auto' | 'ai' | 'dave'; next?: string }
/** 봇이 줄기에 넣은 것 — «봇이 정리한 것» 목록 */
export interface Placed { folder: string; stem: number; why: string; how: 'ai' | 'graph'; at?: number }
/** 맞는 줄기가 없어 모델이 낸 새 줄기 제안 — Dave 가 받거나 버린다 */
export interface StemProposal { id: string; name: string; line?: string; folders: string[]; why?: string }
export interface Bridge { id: string; path: number; line: string }
export interface Reuse { to: string; from: string; what: string; files: string[]; fact: boolean; act: 'tell' | 'ref' }
export interface LinkMap {
  at: number
  today: string
  nodes: LinkNode[]
  edges: LinkEdge[]
  stems: Stem[]
  bridges: Bridge[]
  iso: string[]
  hubs: string[]
  reuse: Reuse[]
  /** 모델 추측을 마지막으로 받은 때(없으면 null) · 주인 맥 */
  aiAt: number | null
  counts: Record<LinkKind, number>
  /** Dave 가 줄기를 관리하기 시작했다(edit.json 에 줄기 목록이 있다) — 그 뒤로는 줄기를 다시 계산하지 않는다 */
  managed: boolean
  placed: Placed[]
  proposals: StemProposal[]
  /** 모델이 아직 줄기를 판단하지 않은 폴더 — 주인 맥이 이것만 묻는다 */
  undecided: string[]
  /** 보관 폴더 수 · 그중 지도에 붙은(선이 있거나 줄기에 든) 수 */
  past: { total: number; linked: number }
}

/** 모델이 낸 것 — 주인 맥이 볼트 `.folderbot/links/ai.json` 에 둔다 */
export interface LinkAi {
  at: number
  /** 같은 사람·장소 — 호스트가 파일에서 센 수(files)까지 채운 뒤에만 선이 된다 */
  entities: { name: string; folders: string[]; files: Record<string, number> }[]
  similar: { a: string; b: string; why: string; reuse?: string }[]
  stemNames: { members: string[]; name: string; line?: string }[]
  /** 봇이 폴더를 줄기에 넣은 판단 — stem 은 줄기 id, name 은 그때의 이름(id 가 바뀌어도 이름으로 따라간다) */
  place?: { folder: string; stem: string; name: string; why: string; at: number }[]
  /** 모델이 «맞는 줄기 없음» 이라 한 폴더 — 하루 한 번 비운다 */
  placeNone?: string[]
  proposals?: StemProposal[]
}
/** Dave 가 고친 것 — 볼트 `.folderbot/links/edit.json` */
export interface LinkEdits {
  /** 관리 전(옛 판) — 이름은 구성원이 겹치는 줄기에 · 옮기기는 닻 폴더의 줄기로. 관리로 넘어가면 비운다 */
  names: { members: string[]; name: string }[]
  /** 폴더를 닻 폴더가 있는 줄기로 — with 가 null 이면 줄기 밖 */
  moves: { folder: string; with: string | null }[]
  /** 🔴 관리하는 줄기 목록(11/4 Dave «수정/편집/삭제 가능하게 · 이후엔 LLM 이 그에 맞게») — 있으면 줄기를 다시 계산하지 않는다. 차례 = 화면 차례 */
  stems?: { id: string; name: string; line?: string; color?: string; members: string[]; fixed?: boolean }[]
  /** Dave 가 줄기 밖으로 뺀 폴더 — 봇이 다시 넣지 않는다 */
  out?: string[]
  /** 버린 새 줄기 제안(이름) */
  dropped?: string[]
}
export const EMPTY_EDITS: LinkEdits = { names: [], moves: [] }

export const STEM_COLORS = ['#7aa2f7', '#e07fa2', '#4fbfa0', '#b48cf0', '#c9a26b', '#e2a33b', '#5fc4d6', '#a3b86c', '#d98a6c']

// ── 이름 ─────────────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?[_ ](.+)$/   // «2026-03 SGI 입학축하금» 처럼 띄어 쓴 옛 보관 폴더도
/** 폴더 이름의 날짜 = 데드라인(볼트 이름 규칙). 날이 없으면 그 달 끝, 달도 없으면 그해 끝 */
export function folderDue(name: string): { due: string; exact: boolean } | null {
  const m = DATE_RE.exec(name)
  if (!m) return null
  const y = +m[1]
  if (m[2] && m[3]) return { due: `${m[1]}-${m[2]}-${m[3]}`, exact: true }
  if (m[2]) { const last = new Date(y, +m[2], 0).getDate(); return { due: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`, exact: false } }
  return { due: `${m[1]}-12-31`, exact: false }
}

/** 이름표 — 날짜·칸 접두(개인_ 등)를 떼고, 짧은 한글 종류 낱말(행사-·강의-)도 뗀다 */
export function labelOf(name: string, display?: string): string {
  if (display && display.trim() && display.trim() !== name) return display.trim()
  let s = name
  const m = DATE_RE.exec(s)
  if (m) s = m[4]
  else if (s.includes('_')) s = s.slice(s.indexOf('_') + 1)
  const parts = s.split('-').filter(Boolean)
  // 남는 이름이 너무 짧으면 떼지 않는다 — «번역체-정리» 가 «정리» 가 됐다(11/4 실측)
  if (parts.length >= 2 && /^[가-힣]{1,3}$/.test(parts[0]) && [...parts.slice(1).join('')].length >= 3) parts.shift()
  return parts.join(' ') || name
}

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/[\s_\-·.()]/g, '')

/**
 * 문서에서 이 폴더를 가리킨다고 볼 글자들 — 폴더 이름 전체 · 날짜를 뗀 꼬리(이름 꼴 `행사-노션-해커톤` 일 때만).
 * 🔴 이름표(«당근메일» · «PARA AI»)는 쓰지 않는다 — 평범한 낱말이라 본문 곳곳에 걸려 거의 모든 폴더가 허브가 됐다(11/4 실측:
 *    선 299 · 허브 12). 사람이 폴더를 가리킬 때는 경로·이름 꼴로 적는다는 가정이다. 네 글자보다 짧은 것은 버린다.
 */
function rawKeys(n: { name: string; label: string }): string[] {
  // 칸·날짜·낱말 이음이 없는 맨 이름(«agents»)은 흔한 낱말이라 쓰지 않는다 — `.claude/agents/` 마다 걸렸다(11/4 실측)
  const out = new Set<string>(/[-_]/.test(n.name) ? [n.name] : [])
  const m = DATE_RE.exec(n.name)
  if (m && /[-_]/.test(m[4])) out.add(m[4])
  return [...out].filter((k) => [...k].length >= 4)
}
/** 폴더마다 찾을 글자 — 여러 폴더에 걸리는 글자는 뺀다(«해커톤» 처럼) */
export function mentionKeys(nodes: { id: string; name: string; label: string }[]): Map<string, string[]> {
  const owner = new Map<string, Set<string>>()
  for (const n of nodes) for (const k of rawKeys(n)) { const s = owner.get(k) ?? new Set(); s.add(n.id); owner.set(k, s) }
  // 한 폴더의 키가 다른 폴더 키의 부분 문자열이면 그 키도 겹친다(«노션-해커톤» ⊂ «2026-11-21_행사-노션-해커톤» 은 같은 폴더라 괜찮다)
  const out = new Map<string, string[]>()
  for (const n of nodes) {
    const ks = rawKeys(n).filter((k) => owner.get(k)!.size === 1 && !nodes.some((o) => o.id !== n.id && rawKeys(o).some((ok) => ok.includes(k))))
    out.set(n.id, ks)
  }
  return out
}

/** 글 안에서 다른 폴더를 몇 번 적었나 — 키마다 센다(같은 폴더의 키 여럿은 가장 많이 걸린 키 하나로) */
export function countMentions(text: string, keys: Map<string, string[]>, self: string): Map<string, number> {
  const out = new Map<string, number>()
  const t = text.normalize('NFC')
  for (const [id, ks] of keys) {
    if (id === self || !ks.length) continue
    let best = 0
    for (const k of ks) { let c = 0, i = t.indexOf(k); while (i >= 0 && c < 50) { c++; i = t.indexOf(k, i + k.length) } if (c > best) best = c }
    if (best) out.set(id, best)
  }
  return out
}

// ── 중계 편지 ───────────────────────────────────────────────────────────────

/** 중계가 아닌 쪽 — 사람·바깥 봇·오케스트레이터는 폴더가 아니다 */
const NOT_FOLDER = /^(오케스트레이터|오케|dave|데이브|할일이|당근이|개발이|grok|볼트\s*운영|사람)$/i
/**
 * «중계 · A → B ( · 설명| — 설명| (설명))» 에서 A 와 B(여럿) — 아니면 null.
 * «중계 답 · …» 은 답이라 세지 않는다(같은 중계를 두 번 세지 않게).
 */
export function parseRelayTitle(title: string): { from: string; to: string[] } | null {
  const m = /^\s*["']?중계\s*·\s*(.+?)\s*(?:→|->)\s*(.+?)["']?\s*$/.exec(title)
  if (!m) return null
  const from = m[1].trim()
  const rest = m[2].split(/\s+·\s+|\s+—\s+|\s+-\s+|\s*\(/)[0].trim()
  const to = rest.split(/[·,]|\s와\s|\s및\s/).map((x) => x.trim()).filter(Boolean)
  return from && to.length ? { from, to } : null
}

/** 편지에 적힌 이름(«GrokBot 서울», «PARA AI», «홈페이지 봇») → 폴더 id. 가장 길게 겹치는 하나 · 애매하면 null */
export function resolveFolder(token: string, nodes: { id: string; name: string; label: string; display?: string }[]): string | null {
  const t0 = token.replace(/\s*폴더\s*봇$|\s*봇$|\s*폴더$/, '').trim()
  if (!t0 || NOT_FOLDER.test(t0)) return null
  const t = norm(t0)
  if (t.length < 2) return null
  const scores: { id: string; score: number }[] = []
  for (const n of nodes) {
    const cands = [n.name, n.label, n.display ?? '', DATE_RE.exec(n.name)?.[4] ?? '', n.name.includes('_') ? n.name.slice(n.name.indexOf('_') + 1) : ''].map(norm).filter((x) => x.length >= 2)
    let score = 0
    for (const c of cands) {
      if (c === t) score = Math.max(score, 1000 + c.length)
      else if (c.includes(t)) score = Math.max(score, t.length * 2 - (c.length - t.length) * 0.1)
      else if (t.includes(c) && c.length >= 3) score = Math.max(score, c.length * 2 - (t.length - c.length) * 0.1)
      else {
        // 낱말 겹침 — «GrokBot 서울» ↔ «행사-GrokBot-해커톤-서울»
        const words = t0.normalize('NFC').toLowerCase().split(/[\s_\-·]+/).filter((w) => w.length >= 2)
        const hit = words.filter((w) => c.includes(norm(w)))
        if (words.length >= 2 && hit.length === words.length) score = Math.max(score, hit.join('').length * 1.5)
      }
    }
    if (score > 0) scores.push({ id: n.id, score })
  }
  scores.sort((a, b) => b.score - a.score)
  const [best, second] = scores
  if (!best) return null
  // 정확히 같은 이름이 아니면, 비슷한 점수의 둘째가 있을 때 애매하다(«해커톤» → 셋)
  if (second && (best.score < 1000 ? second.score >= best.score * 0.75 : second.score >= 1000 && second.score === best.score)) return null
  return best.id
}

// ── 짓기 ─────────────────────────────────────────────────────────────────────

export interface BuildIn {
  nodes: LinkNodeIn[]
  /** 폴더 a 의 글이 폴더 b 를 count 번 적었다 · files 는 a 기준 상대 경로 */
  mentions: { a: string; b: string; count: number; files: string[] }[]
  relays: { a: string; b: string; count: number; ev: string[] }[]
  ai?: LinkAi | null
  edits?: LinkEdits | null
  /** 이미 참조 폴더로 묶인 쌍(봇 id → 볼트 상대 경로) */
  refs?: Record<string, string[]>
  today: string
  now: number
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
export const daysLeft = (n: Pick<LinkNode, 'due'>, today: string): number | null => (n.due ? dayDiff(n.due, today) : null)
/** D-n · 오늘 · 끝남 · 11월(달까지만 아는 마감) · 보관 폴더는 «10/27 끝» · «25년 9월» · «보관» */
export function ddText(n: Pick<LinkNode, 'due' | 'dueExact' | 'kind'> & { past?: boolean }, today: string): string {
  if (n.past) {
    if (!n.due) return '보관'
    const [y, m, d] = n.due.split('-')
    return y === today.slice(0, 4) ? (n.dueExact ? `${+m}/${+d} 끝` : `${+m}월 끝`) : `${+y % 100}년 ${+m}월`
  }
  if (n.kind !== 'P' || !n.due) return '상시'
  const d = dayDiff(n.due, today)
  if (d < 0) return '끝남'
  if (!n.dueExact) { const [y, m] = n.due.split('-'); return y === today.slice(0, 4) ? `${+m}월` : `${+y % 100}년 ${+m}월` }
  return d === 0 ? '오늘' : `D-${d}`
}

const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
const jaccard = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1) }
const WT: Record<LinkKind, (w: number) => number> = { mention: (w) => Math.min(w, 10) / 3, relay: (w) => 2 + w, entity: () => 4, similar: () => 2 }

export function buildLinkMap(inp: BuildIn): LinkMap {
  const today = inp.today
  const nodes: LinkNode[] = inp.nodes.map((n) => {
    const d = folderDue(n.name)
    return { ...n, label: labelOf(n.name, n.display), kind: d ? 'P' : 'A', ...(d ? { due: d.due, dueExact: d.exact } : {}), act: n.act ?? 0 }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const byLabel = new Map<string, string>()
  for (const n of nodes) { byLabel.set(norm(n.label), n.id); byLabel.set(norm(n.name), n.id) }
  const idOf = (s: string): string | null => byId.has(s) ? s : byLabel.get(norm(s)) ?? resolveFolder(s, nodes)

  // 선 — 같은 쌍 같은 종류는 하나로 모은다(언급은 양쪽 방향을 더한다)
  const em = new Map<string, LinkEdge>()
  const put = (e: LinkEdge) => {
    if (e.a === e.b || !byId.has(e.a) || !byId.has(e.b)) return
    const k = `${e.t}:${pairKey(e.a, e.b)}`
    const cur = em.get(k)
    if (!cur) { em.set(k, e); return }
    cur.w += e.w
    if (e.files) cur.files = [...new Set([...(cur.files ?? []), ...e.files])].slice(0, 6)
    if (e.t !== 'mention' && e.ev && !cur.ev.includes(e.ev)) cur.ev = `${cur.ev} · ${e.ev}`.slice(0, 200)
  }
  for (const m of inp.mentions) put({ a: m.a, b: m.b, t: 'mention', w: m.count, ev: '', files: m.files.map((f) => `${m.a}/${f}`).slice(0, 6) })
  for (const r of inp.relays) put({ a: r.a, b: r.b, t: 'relay', w: r.count, ev: r.ev.slice(0, 3).join(' · '), dir: true })
  const ai = inp.ai
  if (ai) {
    for (const en of ai.entities) {
      const ids = en.folders.map(idOf).filter((x): x is string => !!x)
      const counted = ids.filter((id) => (en.files[id] ?? 0) > 0)
      for (let i = 0; i < counted.length; i++) for (let j = i + 1; j < counted.length; j++) {
        const a = counted[i], b = counted[j]
        put({ a, b, t: 'entity', w: 1, ev: `«${en.name}» — 두 폴더에 모두 나옴(파일 ${en.files[a]}·${en.files[b]}개)` })
      }
    }
    for (const s of ai.similar) { const a = idOf(s.a), b = idOf(s.b); if (a && b) put({ a, b, t: 'similar', w: 1, ev: s.why, guess: true }) }
  }
  for (const e of em.values()) if (e.t === 'mention') {
    const fs = (e.files ?? []).map((f) => f.split('/').pop()).slice(0, 2)
    e.ev = `문서에서 ${e.w}번 언급${fs.length ? ` · ${fs.join(', ')}` : ''}`
  }
  const edges = [...em.values()]

  // 허브 — 살아 있는 폴더의 35%(최소 8) 이상이 그 이름을 적는 폴더(비서실·워크스테이션처럼 «다들 가리키는 곳»)
  //        보관 폴더는 허브를 셀 때 빼고(지난 일 아흔 개가 문턱을 끌어올린다) 허브가 되지도 않는다
  const pastSet = new Set(nodes.filter((n) => n.past).map((n) => n.id))
  const nb = new Map<string, Set<string>>()
  for (const e of edges) { (nb.get(e.a) ?? nb.set(e.a, new Set()).get(e.a)!).add(e.b); (nb.get(e.b) ?? nb.set(e.b, new Set()).get(e.b)!).add(e.a) }
  const live = nodes.filter((n) => !n.past && [...(nb.get(n.id) ?? [])].some((o) => !pastSet.has(o))).length
  //        또는 35% 이상의 이름을 적는 폴더(워크스테이션의 규칙 변경 로그처럼 «다들 적어 두는 곳»)
  const inDeg = new Map<string, Set<string>>(), outDeg = new Map<string, Set<string>>()
  for (const m of inp.mentions) if (m.a !== m.b && !pastSet.has(m.a) && !pastSet.has(m.b)) { (inDeg.get(m.b) ?? inDeg.set(m.b, new Set()).get(m.b)!).add(m.a); (outDeg.get(m.a) ?? outDeg.set(m.a, new Set()).get(m.a)!).add(m.b) }
  const cut = Math.max(8, Math.ceil(live * 0.35))
  const hubs = nodes.filter((n) => (inDeg.get(n.id)?.size ?? 0) >= cut || (outDeg.get(n.id)?.size ?? 0) >= cut).map((n) => n.id)
  const hubSet = new Set(hubs)
  for (const n of nodes) if (hubSet.has(n.id)) n.hub = true
  // 지난 일 허브 — 지금 폴더 여럿(다섯 또는 12%)이 적는 보관 폴더(«Note App 선정» 처럼 볼트 전체를 다룬 일). 선은 두되 줄기 넣기·가져다 쓸 것에서 뺀다
  const pastIn = new Map<string, Set<string>>()
  for (const m of inp.mentions) if (m.a !== m.b && pastSet.has(m.b) !== pastSet.has(m.a)) { const [p, o] = pastSet.has(m.b) ? [m.b, m.a] : [m.a, m.b]; (pastIn.get(p) ?? pastIn.set(p, new Set()).get(p)!).add(o) }
  const pastHubCut = Math.max(5, Math.ceil(nodes.filter((n) => !n.past).length * 0.12))
  const pastHub = new Set([...pastIn].filter(([, s]) => s.size >= pastHubCut).map(([p]) => p))
  // 방향이 있는 언급 수 — 지금 일의 글이 지난 일을 적었는가(가져다 쓰는 쪽)
  const said = new Map<string, number>()
  for (const m of inp.mentions) said.set(`${m.a}\u0000${m.b}`, (said.get(`${m.a}\u0000${m.b}`) ?? 0) + m.count)

  // 가중 그래프(허브·보관 폴더 빼고) — 줄기·다리 계산은 지금 폴더끼리만
  const A = new Map<string, Map<string, number>>()
  for (const e of edges) {
    if (hubSet.has(e.a) || hubSet.has(e.b) || pastSet.has(e.a) || pastSet.has(e.b)) continue
    const w = WT[e.t](e.w)
    for (const [x, y] of [[e.a, e.b], [e.b, e.a]] as const) { const m = A.get(x) ?? new Map(); m.set(y, (m.get(y) ?? 0) + w); A.set(x, m) }
  }
  const wdeg = (id: string) => [...(A.get(id)?.values() ?? [])].reduce((s, x) => s + x, 0)
  const edits = inp.edits ?? EMPTY_EDITS
  // 줄기 틀 — 🔴 관리하면(edit.json 에 목록) 그 목록이 곧 줄기다. 아니면 계산(Louvain)하고 옛 고침(이름·옮기기)을 얹는다
  type Def = { id: string; name: string; line?: string; color?: string; members: string[]; fixed: boolean; named: Stem['named'] }
  const managed = !!edits.stems?.length
  let defs: Def[]
  if (managed) {
    defs = edits.stems!.map((s) => ({ id: s.id, name: s.name, ...(s.line ? { line: s.line } : {}), ...(s.color ? { color: s.color } : {}), members: s.members.filter((id) => byId.has(id) && !hubSet.has(id)), fixed: !!s.fixed, named: s.fixed ? 'dave' : 'ai' }))
  } else {
    const comm = louvain(A)
    for (const mv of edits.moves) {
      if (!byId.has(mv.folder)) continue
      if (mv.with === null) comm.set(mv.folder, `solo:${mv.folder}`)
      else if (comm.has(mv.with)) comm.set(mv.folder, comm.get(mv.with)!)
    }
    // 묶음 → 줄기(둘 이상만) · 큰 것부터
    const groups = new Map<string, string[]>()
    for (const [id, c] of comm) { if (c.startsWith('solo:')) continue; groups.set(c, [...(groups.get(c) ?? []), id]) }
    const raw = [...groups.values()].filter((g) => g.length >= 2).map((g) => g.sort((x, y) => wdeg(y) - wdeg(x) || x.localeCompare(y)))
    raw.sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]))
    defs = raw.map((members) => {
      const dave = edits.names.map((x) => ({ x, j: jaccard(x.members, members) })).filter((o) => o.j >= 0.5).sort((p, q) => q.j - p.j)[0]
      const aiN = ai?.stemNames.map((x) => ({ x, j: jaccard(x.members, members) })).filter((o) => o.j >= 0.5).sort((p, q) => q.j - p.j)[0]
      const auto = byId.get(members[0])!.label   // 모델 이름이 오기 전 — 가장 많이 이어진 폴더 이름
      return { id: members[0], members, name: dave ? dave.x.name : aiN ? aiN.x.name : auto, named: dave ? 'dave' : aiN ? 'ai' : 'auto', fixed: !!dave, ...(aiN?.x.line ? { line: aiN.x.line } : {}) }
    })
  }
  // 줄기에 든 폴더(Dave·계산) — 한 폴더는 한 줄기에만. Dave 가 뺀 폴더는 어디에도 안 든다
  const outSet = new Set(edits.out ?? [])
  const at = new Map<string, number>()
  defs.forEach((d, i) => { d.members = d.members.filter((id) => !at.has(id) && !outSet.has(id)); for (const id of d.members) at.set(id, i) })
  // 🔴 나머지는 봇이 넣는다 — 모델 판단(ai.place)이 먼저, 없으면 선이 가장 많이 닿는 줄기(문턱 1.5).
  //    관리 전에는 보관 폴더만(지금 폴더는 계산이 묶는다) · 관리 뒤에는 줄기에 안 든 폴더 모두
  const defIdx = (id: string, name?: string) => { let i = defs.findIndex((d) => d.id === id); if (i < 0 && name) i = defs.findIndex((d) => norm(d.name) === norm(name)); return i }
  const none = new Set(ai?.placeNone ?? [])
  const by = new Map<string, Placed>()
  const undecided: string[] = []
  for (const n of nodes) {
    if (n.hub || at.has(n.id) || outSet.has(n.id) || !(managed || n.past)) continue
    const p = ai?.place?.find((x) => x.folder === n.id)
    const i = p ? defIdx(p.stem, p.name) : -1
    if (p && i >= 0) { by.set(n.id, { folder: n.id, stem: i, why: p.why, how: 'ai', at: p.at }); continue }
    if (none.has(n.id)) continue   // 모델이 «맞는 줄기 없음» — 선으로도 억지로 넣지 않는다
    undecided.push(n.id)
    if (pastHub.has(n.id)) continue   // 지난 일 허브는 선이 너무 많아 선으로는 안 넣는다(모델만)
    const per = new Map<number, { w: number; top: number; ev: string }>()
    for (const e of edges) {
      if (e.a !== n.id && e.b !== n.id) continue
      const o = e.a === n.id ? e.b : e.a; const si = at.get(o)
      if (si === undefined || hubSet.has(o)) continue
      const w = WT[e.t](e.w); const cur = per.get(si) ?? { w: 0, top: 0, ev: '' }
      cur.w += w; if (w > cur.top) { cur.top = w; cur.ev = `${KIND_KO[e.t]} · ${byId.get(o)!.label}` }
      per.set(si, cur)
    }
    const best = [...per.entries()].sort((x, y) => y[1].w - x[1].w || x[0] - y[0])[0]
    // 문턱 — 지금 폴더는 1.5, 보관 폴더는 3(언급 한두 줄로는 안 넣는다 · 모델 판단이 곧 온다)
    if (best && best[1].w >= (n.past ? 3 : 1.5)) by.set(n.id, { folder: n.id, stem: best[0], why: best[1].ev, how: 'graph' })
  }
  const stems: Stem[] = defs.map((d, i) => {
    const all = [...d.members, ...[...by.values()].filter((p) => p.stem === i).map((p) => p.folder)]
    const members = all.filter((id) => !byId.get(id)!.past).sort((x, y) => (at.has(y) ? 1 : 0) - (at.has(x) ? 1 : 0) || wdeg(y) - wdeg(x) || x.localeCompare(y))
    const past = all.filter((id) => byId.get(id)!.past).sort((x, y) => (byId.get(y)!.due ?? '').localeCompare(byId.get(x)!.due ?? '') || x.localeCompare(y))
    const next = members.map((id) => byId.get(id)!).filter((n) => n.kind === 'P' && n.due && dayDiff(n.due, today) >= 0).sort((p, q) => p.due!.localeCompare(q.due!))[0]
    return {
      key: d.id, members, past, bot: all.filter((id) => by.has(id)), fixed: d.fixed, color: d.color ?? STEM_COLORS[i % STEM_COLORS.length],
      name: d.name, named: d.named, ...(d.line ? { line: d.line } : {}),
      ...(next ? { next: `${next.label} ${ddText(next, today)}` } : {}),
    }
  })
  stems.forEach((s, i) => [...s.members, ...s.past].forEach((id) => { byId.get(id)!.stem = i }))
  for (const p of by.values()) byId.get(p.folder)!.byBot = p.how
  const placed = [...by.values()].sort((p, q) => (q.at ?? 0) - (p.at ?? 0) || Number(p.how === 'graph') - Number(q.how === 'graph'))
  const dropped = new Set((edits.dropped ?? []).map(norm))
  const proposals = (ai?.proposals ?? []).filter((p) => !dropped.has(norm(p.name)) && !defs.some((d) => norm(d.name) === norm(p.name)))
    .map((p) => ({ ...p, folders: p.folders.filter((id) => byId.has(id) && !at.has(id) && !outSet.has(id) && !hubSet.has(id)) })).filter((p) => p.folders.length >= 2)

  // 다리 폴더 — 지나가는 길(매개 중심성) 위 넷 · 이웃이 두 줄기 이상에 걸칠 때만
  const bc = betweenness(A)
  const bridges: Bridge[] = [...bc.entries()].filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).flatMap(([id, v]) => {
    const per = new Map<number, number>()
    for (const [o, w] of A.get(id) ?? []) { const si = byId.get(o)?.stem; if (si !== undefined && si !== byId.get(id)!.stem) per.set(si, (per.get(si) ?? 0) + w) }
    const own = byId.get(id)!.stem
    if (per.size < 1 || (own === undefined && per.size < 2)) return []
    // 자기 줄기 + 가장 많이 잇는 남의 줄기 둘까지
    const names = [...(own !== undefined ? [own] : []), ...[...per.entries()].sort((x, y) => y[1] - x[1]).map(([i]) => i)].slice(0, 3).map((i) => stems[i].name)
    return [{ id, path: Math.round(v), line: `${names.join(' · ')} 줄기를 잇는다` }]
  }).slice(0, 4)
  for (const b of bridges) byId.get(b.id)!.bridge = true

  const iso = nodes.filter((n) => !n.past && !nb.has(n.id)).map((n) => n.id)

  // 가져다 쓸 것 — 끝난 일·비슷한 일에서 다가오는 일로 · 중계가 많은 쌍은 참조 폴더로 묶기
  const reuse: Reuse[] = []
  const upcoming = (n: LinkNode) => !n.past && n.kind === 'P' && !!n.due && dayDiff(n.due, today) >= 0
  const ended = (n: LinkNode) => !!n.past || (n.kind === 'P' && !!n.due && dayDiff(n.due, today) < 0)
  // 🔴 같은 사람·장소는 **끝난 일**에서만 가져온다 — 앞선 일이라고 다 쓸 것은 아니다(«천재ADHD ← 오사카 가족» 이 나왔다 · 11/4 실측)
  //    비슷한 일은 마감이 이른 쪽 → 늦은 쪽 한 방향만(양쪽으로 같은 글이 두 번 뜨지 않게). 마감이 없는 쌍은 선만 둔다
  for (const e of edges) {
    if (e.t !== 'entity' && e.t !== 'similar') continue
    const A0 = byId.get(e.a)!, B0 = byId.get(e.b)!
    let pairs: [LinkNode, LinkNode][] = []
    if (e.t === 'entity') pairs = [[A0, B0], [B0, A0]].filter(([T, F]) => upcoming(T) && ended(F)) as [LinkNode, LinkNode][]
    else if (A0.past !== B0.past) { const [F, T] = A0.past ? [A0, B0] : [B0, A0]; if (!T.past && (upcoming(T) || T.kind === 'A')) pairs = [[T, F]] }   // 보관 폴더 → 지금 일(상시 영역 포함)
    else if (A0.due && B0.due && A0.kind === 'P' && B0.kind === 'P') { const [F, T] = A0.due <= B0.due ? [A0, B0] : [B0, A0]; if (upcoming(T)) pairs = [[T, F]] }
    for (const [T, F] of pairs) {
      if (hubSet.has(F.id) || pastHub.has(F.id) || !F.recent?.length) continue
      const done = ended(F)
      const sim = e.t === 'similar' ? ai?.similar.find((x) => [idOf(x.a), idOf(x.b)].sort().join() === [F.id, T.id].sort().join()) : undefined
      reuse.push({ to: T.id, from: F.id, what: sim?.reuse || (e.t === 'entity' ? `${e.ev.split(' — ')[0]} · ${F.label}${done ? '(끝남)' : ''} 문서` : `${F.label} 문서`), files: F.recent.slice(0, 3), fact: e.t !== 'similar', act: 'tell' })
    }
  }
  // 지금 일의 글이 보관 폴더를 두 번 넘게 적었다 — 그 폴더 자료를 가져다 쓰고 있다(사실)
  for (const e of edges) if (e.t === 'mention') {
    const A0 = byId.get(e.a)!, B0 = byId.get(e.b)!
    if (A0.past === B0.past) continue
    const [F, T] = A0.past ? [A0, B0] : [B0, A0]
    const c = said.get(`${T.id}\u0000${F.id}`) ?? 0
    if (c < 2 || T.hub || pastHub.has(F.id) || !F.recent?.length) continue
    reuse.push({ to: T.id, from: F.id, what: `지난 일 ${F.label} — 이 폴더 글이 ${c}번 적음`, files: F.recent.slice(0, 3), fact: true, act: 'tell' })
  }
  for (const e of edges) if (e.t === 'relay' && e.w >= 4) {
    const [x, y] = byId.get(e.a)!.act >= byId.get(e.b)!.act ? [e.a, e.b] : [e.b, e.a]
    const xb = byId.get(x)!.botId
    if (xb && (inp.refs?.[xb] ?? []).includes(y)) continue
    reuse.push({ to: x, from: y, what: `중계 ${e.w}번 — 참조 폴더로 묶으면 직접 읽음`, files: [], fact: true, act: 'ref' })
  }
  // 받는 폴더마다 하나(사실 먼저)
  const seen = new Set<string>()
  const reuseOne = reuse.sort((p, q) => Number(q.fact) - Number(p.fact)).filter((r) => { const k = `${r.to}:${r.act}`; if (seen.has(k)) return false; seen.add(k); return true })

  const counts = { mention: 0, relay: 0, entity: 0, similar: 0 } as Record<LinkKind, number>
  for (const e of edges) counts[e.t]++
  const pastLinked = nodes.filter((n) => n.past && (n.stem !== undefined || [...(nb.get(n.id) ?? [])].some((o) => !pastSet.has(o)))).length
  return { at: inp.now, today, nodes, edges, stems, bridges, iso, hubs, reuse: reuseOne, aiAt: ai?.at ?? null, counts, managed, placed, proposals, undecided, past: { total: pastSet.size, linked: pastLinked } }
}

/** Louvain 1단계(지역 옮기기) — 이름 순서로 돌려 결과가 늘 같다. 이웃이 없는 폴더는 지도에 없다 */
export function louvain(A: Map<string, Map<string, number>>): Map<string, string> {
  const V = [...A.keys()].sort()
  const deg = new Map(V.map((k) => [k, [...A.get(k)!.values()].reduce((s, x) => s + x, 0)]))
  const m2 = [...deg.values()].reduce((s, x) => s + x, 0) || 1
  const comm = new Map(V.map((k) => [k, k]))
  const tot = new Map(V.map((k) => [k, deg.get(k)!]))
  for (let round = 0; round < 30; round++) {
    let moved = false
    for (const k of V) {
      const ck = comm.get(k)!, dk = deg.get(k)!
      tot.set(ck, tot.get(ck)! - dk)
      const links = new Map<string, number>()
      for (const [o, w] of A.get(k)!) { const c = comm.get(o)!; links.set(c, (links.get(c) ?? 0) + w) }
      let best = ck, bestGain = (links.get(ck) ?? 0) - (tot.get(ck) ?? 0) * dk / m2
      for (const [c, l] of [...links.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
        const g = l - (tot.get(c) ?? 0) * dk / m2
        if (g > bestGain + 1e-9) { best = c; bestGain = g }
      }
      tot.set(best, (tot.get(best) ?? 0) + dk)
      if (best !== ck) { comm.set(k, best); moved = true }
    }
    if (!moved) break
  }
  return comm
}

/** Brandes 매개 중심성(가중치 없음) — 무향이라 2로 나눈다 */
export function betweenness(A: Map<string, Map<string, number>>): Map<string, number> {
  const V = [...A.keys()].sort()
  const bc = new Map(V.map((v) => [v, 0]))
  for (const s of V) {
    const S: string[] = []; const P = new Map(V.map((v) => [v, [] as string[]])); const sig = new Map(V.map((v) => [v, 0])); const d = new Map(V.map((v) => [v, -1]))
    sig.set(s, 1); d.set(s, 0)
    const Q = [s]
    for (let qi = 0; qi < Q.length; qi++) {
      const v = Q[qi]; S.push(v)
      for (const w of A.get(v)!.keys()) {
        if (d.get(w)! < 0) { d.set(w, d.get(v)! + 1); Q.push(w) }
        if (d.get(w) === d.get(v)! + 1) { sig.set(w, sig.get(w)! + sig.get(v)!); P.get(w)!.push(v) }
      }
    }
    const de = new Map(V.map((v) => [v, 0]))
    while (S.length) { const w = S.pop()!; for (const v of P.get(w)!) de.set(v, de.get(v)! + sig.get(v)! / sig.get(w)! * (1 + de.get(w)!)); if (w !== s) bc.set(w, bc.get(w)! + de.get(w)!) }
  }
  for (const [k, v] of bc) bc.set(k, v / 2)
  return bc
}

// ── 이웃 · 찾기 · 봇 카드 ─────────────────────────────────────────────────────

export interface Neighbor { id: string; label: string; t: LinkKind; w: number; ev: string; guess?: boolean; kinds: LinkKind[] }
/** 한 폴더의 이웃 — 쌍마다 가장 앞 차례 종류 하나로 · 허브는 뒤로 */
export function neighbors(map: LinkMap, id: string): Neighbor[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const out = new Map<string, Neighbor>()
  for (const e of map.edges) {
    if (e.a !== id && e.b !== id) continue
    const o = e.a === id ? e.b : e.a
    const cur = out.get(o)
    if (cur) cur.kinds = [...new Set([...cur.kinds, e.t])]
    if (!cur || PRI[e.t] < PRI[cur.t] || (e.t === cur.t && e.w > cur.w)) out.set(o, { id: o, label: byId.get(o)?.label ?? o, t: e.t, w: e.w, ev: e.ev, guess: e.guess, kinds: [...new Set([...(cur?.kinds ?? []), e.t])] })
  }
  return [...out.values()].sort((a, b) => Number(!!byId.get(a.id)?.hub) - Number(!!byId.get(b.id)?.hub) || PRI[a.t] - PRI[b.t] || b.w - a.w)
}

/** 폴더 이름·경로·이름표·봇 id 로 노드 찾기 */
export function findNode(map: LinkMap, q: string): LinkNode | null {
  const t = norm(q)
  return map.nodes.find((n) => n.id === q || n.botId === q || norm(n.name) === t || norm(n.label) === t || norm(n.id) === t)
    ?? (() => { const id = resolveFolder(q, map.nodes); return id ? map.nodes.find((n) => n.id === id) ?? null : null })()
}

/** 폴더·사람·주제로 찾기 — 이름표 · 선의 근거 글(사람·장소 이름 포함) · 줄기 이름 */
export function searchLinks(map: LinkMap, q: string, limit = 20): { nodes: { id: string; label: string; why: string }[]; edges: LinkEdge[] } {
  const t = q.normalize('NFC').trim().toLowerCase()
  if (!t) return { nodes: [], edges: [] }
  const hitN = new Map<string, string>()
  for (const n of map.nodes) if (n.label.toLowerCase().includes(t) || n.name.toLowerCase().includes(t)) hitN.set(n.id, '이름')
  for (const s of map.stems) if (s.name.toLowerCase().includes(t)) for (const id of [...s.members, ...s.past]) if (!hitN.has(id)) hitN.set(id, `줄기 «${s.name}»`)
  const edges = map.edges.filter((e) => e.ev.toLowerCase().includes(t))
  for (const e of edges) for (const id of [e.a, e.b]) if (!hitN.has(id)) hitN.set(id, `${KIND_KO[e.t]} — ${e.ev}`)
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  return { nodes: [...hitN.entries()].slice(0, limit).map(([id, why]) => ({ id, label: byId.get(id)?.label ?? id, why: byId.get(id)?.past ? `${why} · 보관(끝난 일)` : why })), edges: edges.slice(0, limit) }
}

/**
 * 봇이 세션을 시작할 때 받는 «이어진 폴더» 카드 — 시스템 프롬프트에 붙는다(목업 화면 3).
 * 없으면 빈 글. 허브는 빼고 여섯까지 · 가져다 쓸 것이 있으면 맨 위.
 */
export function linkCard(map: LinkMap, id: string, max = 6): string {
  const me = map.nodes.find((n) => n.id === id)
  if (!me || me.hub) return ''
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const nb = neighbors(map, id).filter((x) => !byId.get(x.id)?.hub && !byId.get(x.id)?.past).slice(0, max)
  const past = me.past ? [] : pastFor(map, id, 4)
  if (!nb.length && !past.length) return ''
  const lines = ['## 이어진 폴더 (Folder Bot 연결 지도)', `이 폴더(${me.label})와 이어진 다른 폴더다. 다른 폴더는 **읽기만** 한다 — links_get 으로 근거와 파일을, links_read 로 그 폴더 파일을 읽는다. 그 폴더에 쓰거나 그 봇에게 일을 시킬 일이면 orch_ask 로 오케스트레이터에게 부탁한다. «봇 추측» 은 확인한 사실이 아니다.`]
  const st = me.stem !== undefined ? map.stems[me.stem] : null
  if (st) lines.push(`- 일의 줄기: ${st.name}${st.line ? ` — ${st.line}` : ''}`)
  for (const r of map.reuse.filter((r) => r.to === id && r.act === 'tell')) {
    const f = byId.get(r.from)
    lines.push(`- ♻ 가져다 쓸 것 — ${f?.label ?? r.from}: ${r.what}${r.fact ? '' : ' (봇 추측)'}${r.files.length ? ` · ${r.files.map((x) => `\`${r.from}/${x}\``).join(' · ')}` : ''}`)
  }
  for (const x of nb) {
    const n = byId.get(x.id)!
    lines.push(`- ${x.label} (${n.id} · ${ddText(n, map.today)}) — ${KIND_KO[x.t]}: ${x.ev}${x.guess ? ' (봇 추측)' : ''}`)
  }
  if (past.length) {
    lines.push('', '## 지난 일 — 보관 폴더에서 가져다 쓸 것', '끝난 일이라 바꾸지 않는다. links_read 로 읽어 이 폴더 일에 쓴다.')
    for (const p of past) lines.push(`- ${p.label} (${p.id} · ${p.dd}) — ${p.why}${p.guess ? ' (봇 추측)' : ''}${p.files.length ? ` · ${p.files.map((f) => `\`${f}\``).join(' · ')}` : ''}`)
  }
  return lines.join('\n')
}

export interface PastItem { id: string; label: string; dd: string; why: string; guess?: boolean; via: 'link' | 'stem'; files: string[] }
/**
 * 이 폴더가 가져다 쓸 지난 일(보관 폴더) — 선으로 이어진 것 먼저, 모자라면 같은 줄기의 최근에 끝난 일.
 * 화면의 폴더 칸 · 봇 카드 · links_get 이 같은 것을 쓴다.
 */
export function pastFor(map: LinkMap, id: string, max = 4): PastItem[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const me = byId.get(id)
  if (!me) return []
  const out: PastItem[] = []
  for (const x of neighbors(map, id)) {
    const n = byId.get(x.id)
    if (!n?.past) continue
    out.push({ id: n.id, label: n.label, dd: ddText(n, map.today), why: `${KIND_KO[x.t]} — ${x.ev}`, ...(x.guess ? { guess: true } : {}), via: 'link', files: (n.recent ?? []).slice(0, 3) })
  }
  const st = me.stem !== undefined ? map.stems[me.stem] : null
  if (st) for (const pid of st.past) {
    if (out.length >= max) break
    if (out.some((o) => o.id === pid)) continue
    const n = byId.get(pid)!
    out.push({ id: n.id, label: n.label, dd: ddText(n, map.today), why: `같은 줄기 «${st.name}» 의 지난 일`, via: 'stem', files: (n.recent ?? []).slice(0, 3) })
  }
  return out.slice(0, max)
}

/** 볼트 `links.md` — 할일이·사람이 읽는 요약(가져다 쓸 것 · 줄기 · 다리) */
export function renderLinksMd(map: LinkMap, host: string): string {
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const L = (id: string) => byId.get(id)?.label ?? id
  const out = [`# 연결 지도`, '', `> ${new Date(map.at).toISOString().slice(0, 16).replace('T', ' ')} · ${host} · 폴더 ${map.nodes.length} · 줄기 ${map.stems.length} · 선 ${map.edges.length}(문서 언급 ${map.counts.mention} · 봇 중계 ${map.counts.relay} · 같은 사람·장소 ${map.counts.entity} · 비슷한 일 ${map.counts.similar})`, '']
  if (map.reuse.length) {
    out.push('## ♻ 가져다 쓸 수 있어요', '')
    for (const r of map.reuse) out.push(`- **${L(r.to)}** ← ${L(r.from)} · ${r.what}${r.fact ? '' : ' (봇 추측)'}`)
    out.push('')
  }
  out.push('## 일의 줄기', '')
  for (const s of map.stems) out.push(`- **${s.name}** (${s.members.length}${s.past.length ? ` · 지난 일 ${s.past.length}` : ''})${s.next ? ` · 다음 ${s.next}` : ''}${s.line ? ` — ${s.line}` : ''} · ${s.members.map(L).join(', ')}${s.past.length ? ` · 지난 일: ${s.past.slice(0, 6).map(L).join(', ')}${s.past.length > 6 ? ' …' : ''}` : ''}`)
  if (map.bridges.length) { out.push('', '## 다리 폴더', ''); for (const b of map.bridges) out.push(`- **${L(b.id)}** — ${b.line}`) }
  return out.join('\n') + '\n'
}

// ── 화면 배치 ───────────────────────────────────────────────────────────────

export type FlowRange = 'month' | '10w' | 'year'
export interface FlowItem { id: string; x: number; y: number; kind: 'P' | 'A'; lane: number }
export interface FlowLayout {
  width: number; height: number
  lanes: { name: string; color: string; y: number; h: number; stem: number | null }[]
  ticks: { x: number; label: string }[]
  todayX: number; soon: [number, number]; laterX: number; areaX: number
  items: FlowItem[]
  paths: { a: string; b: string; t: LinkKind; d: string; guess?: boolean; dir?: boolean }[]
}
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/**
 * 흐름(B · 기본 보기) — 가로 = 마감 날짜, 줄 = 일의 줄기. 왼쪽 칸 = 그 줄기의 상시 영역(프로젝트와 많이 이어진 셋).
 * 끝난 프로젝트는 2주 안 것만 흐리게 남긴다(가져다 쓸 원천이라).
 */
export function flowLayout(map: LinkMap, range: FlowRange = '10w', show: Set<LinkKind> = new Set(LINK_KINDS)): FlowLayout {
  const today = map.today
  const span = range === 'month' ? 35 : range === 'year' ? 365 : 70
  const d0 = addDays(today, -5), d1 = addDays(today, span)
  const GX = 190, X0 = 214, X1 = 900, XL = 950, W = 1120
  const xd = (d: string) => (d > d1 ? XL : X0 + Math.max(0, dayDiff(d, d0)) / dayDiff(d1, d0) * (X1 - X0))
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const vis = (n: LinkNode) => !n.hub && !n.past && (n.kind === 'A' || (n.due && dayDiff(n.due, today) >= -14))   // 보관 폴더는 흐름에 안 그린다(과녁 바깥 고리 · 목록 «지난 일»)
  const projOf = (si: number | null) => map.nodes.filter((n) => vis(n) && n.kind === 'P' && (n.stem ?? null) === si)
  const linkedP = (id: string) => neighbors(map, id).filter((x) => byId.get(x.id)?.kind === 'P').length
  const laneDefs: { name: string; color: string; stem: number | null }[] = map.stems.map((s, i) => ({ name: s.name, color: s.color, stem: i }))
  if (projOf(null).length) laneDefs.push({ name: '줄기 밖', color: '#8a8f98', stem: null })
  const lanes: FlowLayout['lanes'] = []; const items: FlowItem[] = []
  let y = 50
  laneDefs.forEach((ld, li) => {
    const ps = projOf(ld.stem).sort((a, b) => a.due!.localeCompare(b.due!) || a.label.localeCompare(b.label))
    const rows: number[] = []; const place = new Map<string, number>()
    for (const p of ps) {
      const x = xd(p.due!), w = 34 + [...p.label].length * 10.5 + 40
      let ri = rows.findIndex((end) => x > end + 6)
      if (ri < 0) { rows.push(x + w); ri = rows.length - 1 } else rows[ri] = x + w
      place.set(p.id, ri)
    }
    const areas = ld.stem === null ? [] : map.stems[ld.stem].members.map((id) => byId.get(id)!).filter((n) => n.kind === 'A' && vis(n))
      .sort((a, b) => linkedP(b.id) - linkedP(a.id) || b.act - a.act).slice(0, 3)
    const nrows = Math.max(rows.length, areas.length, 1), h = nrows * 28 + 14
    lanes.push({ ...ld, y, h })
    for (const p of ps) items.push({ id: p.id, x: xd(p.due!), y: y + 18 + place.get(p.id)! * 28, kind: 'P', lane: li })
    areas.forEach((a, i) => items.push({ id: a.id, x: GX - 8, y: y + 18 + i * 28, kind: 'A', lane: li }))
    y += h
  })
  const pos = new Map(items.map((it) => [it.id, it]))
  const paths: FlowLayout['paths'] = []
  for (const e of [...map.edges].sort((p, q) => PRI[q.t] - PRI[p.t])) {
    if (!show.has(e.t)) continue
    let a = pos.get(e.a), b = pos.get(e.b)
    if (!a || !b) continue
    if (e.t === 'mention' && e.w < 3) continue
    if (a.kind === 'A' && b.kind === 'A') continue
    let [ia, ib] = [e.a, e.b]
    if (a.kind === 'A' || (b.kind === 'P' && a.x > b.x)) { [a, b] = [b, a]; [ia, ib] = [ib, ia] }
    const x1 = a.x + (a.kind === 'A' ? 4 : 0), x2 = b.x + (b.kind === 'A' ? 4 : 0)
    const mx = (x1 + x2) / 2, bend = a.y === b.y ? -26 : 0
    paths.push({ a: ia, b: ib, t: e.t, d: `M${x1.toFixed(0)},${a.y} C${mx.toFixed(0)},${a.y + bend} ${mx.toFixed(0)},${b.y + bend} ${x2.toFixed(0)},${b.y}`, ...(e.guess ? { guess: true } : {}), ...(e.dir ? { dir: true } : {}) })
  }
  const ticks: FlowLayout['ticks'] = []
  const step = range === 'year' ? 30 : 7
  for (let d = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7)); d <= addDays(d1, -3); d = addDays(d, step)) {
    if (d < d0) continue
    ticks.push({ x: xd(d), label: `${+d.slice(5, 7)}/${+d.slice(8, 10)}` })
  }
  return { width: W, height: y + 10, lanes, ticks, todayX: xd(today), soon: [xd(today), xd(addDays(today, 14))], laterX: XL - 30, areaX: GX, items, paths }
}

export interface TargetPoint { id: string; x: number; y: number; r: number; ring: number }
export interface TargetLayout { size: number; c: number; rings: { r: number; label: string }[]; points: TargetPoint[]; sectors: { stem: number; a0: number; a1: number; lx: number; ly: number; anchor: 'start' | 'end' | 'middle' }[] }
/** 과녁의 고리 — 0 = 7일 안(가운데) · 1 = 한 달 안 · 2 = 그 뒤 · 3 = 상시 영역 · 4 = 끝난 일 */
export function ringOf(n: LinkNode, today: string): number {
  if (n.past) return 4
  if (n.kind === 'A' || !n.due) return 3
  const d = dayDiff(n.due, today)
  return d < 0 ? 4 : d <= 7 ? 0 : d <= 31 ? 1 : 2
}
export const RING_KO = ['7일 안', '한 달 안', '그 뒤', '상시 영역', '끝난 일 · 지난 일(보관)']
/**
 * 과녁 지도(A · 11/4 «지도 탭은 과녁 지도로») — 가운데 = 급함, 방향 = 일의 줄기.
 * 줄기마다 구성원 수만큼 부채꼴을 나눠 갖고, 줄기 밖 폴더는 남은 부채꼴에 둔다. 허브는 그리지 않는다.
 */
export function targetLayout(map: LinkMap, size = 640, withPast = true): TargetLayout {
  const c = size / 2, R = [0.16, 0.34, 0.5, 0.66, 0.82].map((x) => x * size / 2 * 1.1)
  // 보관 폴더는 줄기에 들었거나 지금 폴더와 이어진 것만 — 가장 바깥 고리에 작게
  const pastIds = new Set(map.nodes.filter((n) => n.past).map((n) => n.id))
  const linkedPast = new Set<string>()
  for (const e of map.edges) if (pastIds.has(e.a) !== pastIds.has(e.b)) linkedPast.add(pastIds.has(e.a) ? e.a : e.b)
  const pastNb = (id: string) => linkedPast.has(id)
  const shown = map.nodes.filter((n) => !n.hub && (n.past ? withPast && (n.stem !== undefined || pastNb(n.id)) : !map.iso.includes(n.id)))
  const shownSet = new Set(shown.map((n) => n.id))
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const groups: { stem: number; ids: LinkNode[] }[] = map.stems.map((s, i) => ({ stem: i, ids: [...s.members, ...s.past].filter((id) => shownSet.has(id)).map((id) => byId.get(id)!) }))
  const loose = shown.filter((n) => n.stem === undefined)
  if (loose.length) groups.push({ stem: -1, ids: loose })
  // 부채꼴 크기 — 지난 일은 0.35 로 센다(서른 개 보관된 강의 줄기가 판을 다 먹지 않게)
  const wOf = (g: { ids: LinkNode[] }) => Math.max(g.ids.reduce((s, n) => s + (n.past ? 0.35 : 1), 0), 1)
  const total = groups.reduce((s, g) => s + wOf(g), 0) || 1
  const points: TargetPoint[] = []; const sectors: TargetLayout['sectors'] = []
  let a = -Math.PI / 2
  for (const g of groups) {
    const span = 2 * Math.PI * wOf(g) / total
    const a0 = a, a1 = a + span
    const ids = [...g.ids].sort((p, q) => ringOf(p, map.today) - ringOf(q, map.today) || (p.due ?? '').localeCompare(q.due ?? '') || p.label.localeCompare(q.label))
    ids.forEach((n, i) => {
      const ring = ringOf(n, map.today)
      const t = ids.length === 1 ? 0.5 : (i + 0.5) / ids.length
      const ang = a0 + span * (0.08 + 0.84 * t)
      const band = ring === 0 ? R[0] * 0.5 : R[ring] - R[ring - 1]
      const rr = (ring === 0 ? R[0] * 0.55 : (R[ring - 1] + R[ring]) / 2) + ((i % 3) - 1) * band * 0.28   // 같은 고리 안에서 세 겹으로 엇갈려 이름이 덜 겹친다
      points.push({ id: n.id, x: c + rr * Math.cos(ang), y: c + rr * Math.sin(ang), r: n.past ? 3 : Math.min(18, 4.5 + Math.sqrt(n.act) * 0.8), ring })
    })
    const mid = (a0 + a1) / 2, lr = R[4] + 22
    const lx = c + lr * Math.cos(mid), ly = c + lr * Math.sin(mid)
    if (g.stem >= 0) sectors.push({ stem: g.stem, a0, a1, lx, ly, anchor: Math.abs(Math.cos(mid)) < 0.3 ? 'middle' : Math.cos(mid) > 0 ? 'start' : 'end' })
    a = a1
  }
  return { size, c, rings: R.map((r, i) => ({ r, label: RING_KO[i] })), points, sectors }
}

export interface ListRow { id: string; nb: Neighbor[]; reuse: Reuse | null }
/** 폴더별 목록(C) — 다음 2주 마감 · 그 뒤 마감 · 상시 영역(이번 주 움직인 순 · 이웃 셋 이상) */
export function listSections(map: LinkMap, sort: 'due' | 'act' | 'reuse' = 'due'): { title: string; rows: ListRow[]; past?: boolean }[] {
  const today = map.today
  const row = (n: LinkNode): ListRow => ({ id: n.id, nb: neighbors(map, n.id).filter((x) => !map.hubs.includes(x.id)), reuse: map.reuse.find((r) => r.to === n.id) ?? null })
  let P = map.nodes.filter((n) => !n.past && n.kind === 'P' && n.due && dayDiff(n.due, today) >= 0 && !n.hub)
  let Ar = map.nodes.filter((n) => !n.past && n.kind === 'A' && !n.hub && neighbors(map, n.id).length >= 1)
  if (sort === 'reuse') { const has = new Set(map.reuse.map((r) => r.to)); P = P.filter((n) => has.has(n.id)); Ar = Ar.filter((n) => has.has(n.id)) }
  if (sort === 'act') {
    const all = [...P, ...Ar].sort((a, b) => b.act - a.act || a.label.localeCompare(b.label))
    return [{ title: '이번 주 움직인 순', rows: all.map(row) }]
  }
  P.sort((a, b) => a.due!.localeCompare(b.due!))
  const soon = P.filter((n) => dayDiff(n.due!, today) <= 14), later = P.filter((n) => dayDiff(n.due!, today) > 14)
  Ar.sort((a, b) => b.act - a.act || a.label.localeCompare(b.label))
  // 지난 일(보관) — 줄기에 들었거나 지금 폴더와 이어진 것 · 줄기 차례 → 최근에 끝난 순(화면은 접어 둔다)
  const live = new Set(map.nodes.filter((n) => !n.past).map((n) => n.id))
  const past = map.nodes.filter((n) => n.past && (n.stem !== undefined || neighbors(map, n.id).some((x) => live.has(x.id))))
    .sort((a, b) => (a.stem ?? 999) - (b.stem ?? 999) || (b.due ?? '').localeCompare(a.due ?? '') || a.label.localeCompare(b.label))
  return [{ title: '다음 2주 마감', rows: soon.map(row) }, { title: '그 뒤 마감', rows: later.map(row) }, { title: '상시 영역 · 이번 주 움직인 순', rows: Ar.map(row) }, { title: '지난 일 · 보관', rows: past.map(row), past: true }].filter((s) => s.rows.length)
}

// ── 모델 프롬프트 · 답 읽기 ───────────────────────────────────────────────────

export const LINK_AI_SYSTEM = '너는 폴더 요약들을 읽고 폴더 사이의 연결을 JSON 하나로 답하는 도구다. JSON 객체 하나만 답한다.'
/** 폴더 요약(이름표 · 목표 · readme 앞부분 · 최근 파일 이름)으로 같은 사람·장소 후보와 비슷한 일을 묻는다 */
export function linkAiPrompt(digest: { label: string; text: string }[]): string {
  return [
    '아래는 한 사람의 업무 폴더 요약이다. 두 가지를 찾아라.',
    '1) people_places: 둘 이상의 폴더에 함께 나오는 **고유한** 사람 이름·회사·장소·행사장(예: «서울 AI 허브», «이슬기»). 흔한 낱말(AI·강의·해커톤·Dave·진대연)은 빼라. 폴더는 이름표를 그대로 적는다.',
    '2) similar: 같은 종류의 일을 해서 한쪽 자료를 다른 쪽이 가져다 쓸 만한 폴더 쌍. why 는 한 줄(«둘 다 3시간 실무 강의 커리큘럼을 만드는 중»), reuse 는 가져다 쓸 것 한 줄(없으면 빈 글).',
    '«(보관)» 은 끝난 일이다. 보관 폴더와 지금 폴더 사이의 비슷한 일을 특히 찾아라(지난 자료를 가져다 쓰려는 것이다). 보관 폴더끼리의 쌍은 넣지 마라.',
    '확실하지 않으면 넣지 마라. people_places 는 20개, similar 는 30개까지.',
    '답 모양: {"people_places":[{"name":"…","folders":["이름표","이름표"]}],"similar":[{"a":"이름표","b":"이름표","why":"…","reuse":"…"}]}',
    '',
    ...digest.map((d) => `### ${d.label}\n${d.text}`),
  ].join('\n')
}
export function parseLinkAi(out: string): { people: { name: string; folders: string[] }[]; similar: { a: string; b: string; why: string; reuse?: string }[] } | null {
  const m = /\{[\s\S]*\}/.exec(out)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { people_places?: unknown; similar?: unknown }
    const people = (Array.isArray(j.people_places) ? j.people_places : []).flatMap((x) => {
      const o = x as { name?: unknown; folders?: unknown }
      const name = typeof o.name === 'string' ? o.name.trim() : ''
      const folders = Array.isArray(o.folders) ? o.folders.filter((f): f is string => typeof f === 'string') : []
      return name.length >= 2 && folders.length >= 2 ? [{ name: name.slice(0, 40), folders: folders.slice(0, 8) }] : []
    }).slice(0, 30)
    const similar = (Array.isArray(j.similar) ? j.similar : []).flatMap((x) => {
      const o = x as { a?: unknown; b?: unknown; why?: unknown; reuse?: unknown }
      return typeof o.a === 'string' && typeof o.b === 'string' && typeof o.why === 'string' ? [{ a: o.a, b: o.b, why: o.why.slice(0, 120), ...(typeof o.reuse === 'string' && o.reuse.trim() ? { reuse: o.reuse.slice(0, 120) } : {}) }] : []
    }).slice(0, 30)
    return { people, similar }
  } catch { return null }
}

export const STEM_AI_SYSTEM = '너는 폴더 묶음마다 짧은 이름을 붙이는 도구다. JSON 객체 하나만 답한다.'
export function stemNamePrompt(stems: { members: string[] }[]): string {
  return [
    '아래는 한 사람의 업무 폴더를 연결로 묶은 «일의 줄기» 들이다. 줄기마다 이름(한글 8자 이내 · 예: «해커톤·행사», «기업 강의», «이네이트 브랜드», «돈·정산»)과 이 줄기가 하는 일 한 줄(30자 이내)을 붙여라.',
    '답 모양: {"stems":[{"i":0,"name":"…","line":"…"}]}',
    '',
    ...stems.map((s, i) => `${i}: ${s.members.join(', ')}`),
  ].join('\n')
}
export function parseStemNames(out: string, n: number): { i: number; name: string; line?: string }[] {
  const m = /\{[\s\S]*\}/.exec(out)
  if (!m) return []
  try {
    const j = JSON.parse(m[0]) as { stems?: unknown }
    return (Array.isArray(j.stems) ? j.stems : []).flatMap((x) => {
      const o = x as { i?: unknown; name?: unknown; line?: unknown }
      return typeof o.i === 'number' && o.i >= 0 && o.i < n && typeof o.name === 'string' && o.name.trim() ? [{ i: o.i, name: o.name.trim().slice(0, 16), ...(typeof o.line === 'string' && o.line.trim() ? { line: o.line.trim().slice(0, 60) } : {}) }] : []
    })
  } catch { return [] }
}

// ── 줄기 관리(Dave) ─────────────────────────────────────────────────────────

/**
 * 🔴 줄기 관리 한 번(11/4 Dave «수정/편집/삭제 가능하게 · 이후엔 LLM 이 그에 맞게 정리»).
 * 처음 손대는 순간 지금 화면의 줄기 목록을 edit.json 으로 옮긴다(관리 시작) — 그 뒤로 줄기는 다시 계산하지 않는다.
 * 봇이 넣은 폴더(지난 일 포함)는 목록에 안 옮긴다 — 봇 판단으로 남아 다음 판단 때 다시 정리된다.
 * - add: 폴더를 이 줄기로(다른 줄기·«줄기 밖» 에서 빠진다) · out: 줄기 밖으로(봇이 다시 넣지 않는다) · auto: 봇에게 맡기기
 * - delete: 줄기를 지우면 그 폴더들은 봇이 남은 줄기로 다시 나눈다
 */
export type StemOp =
  | { op: 'rename'; stem: string; name: string }
  | { op: 'line'; stem: string; line: string }
  | { op: 'add'; stem: string; folder: string }
  | { op: 'out'; folder: string }
  | { op: 'auto'; folder: string }
  | { op: 'order'; ids: string[] }
  | { op: 'merge'; from: string; into: string; name?: string }
  | { op: 'delete'; stem: string }
  | { op: 'create'; name: string; folders?: string[] }
  | { op: 'accept'; proposal: string }
  | { op: 'drop'; proposal: string }
  | { op: 'reset' }
/** 줄기 모양을 바꾸는 손질 — 봇 판단을 처음부터 다시 받는다 */
export const RESHAPE_OPS = new Set<StemOp['op']>(['create', 'merge', 'delete', 'accept'])

type EStem = NonNullable<LinkEdits['stems']>[number]
export function materializeEdits(map: LinkMap, e: LinkEdits): LinkEdits {
  if (e.stems?.length) return { names: [], moves: [], stems: e.stems.map((s) => ({ ...s, members: [...s.members] })), out: [...(e.out ?? [])], dropped: [...(e.dropped ?? [])] }
  const stems: EStem[] = map.stems.map((s) => ({ id: s.key, name: s.name, ...(s.line ? { line: s.line } : {}), color: s.color, members: [...s.members, ...s.past].filter((id) => !s.bot.includes(id)), ...(s.named === 'dave' ? { fixed: true } : {}) }))
  // 옛 판에서 «줄기 밖으로» 옮긴 폴더는 그대로 밖
  const out = [...new Set([...(e.out ?? []), ...e.moves.filter((m) => m.with === null).map((m) => m.folder)])]
  return { names: [], moves: [], stems, out, dropped: [...(e.dropped ?? [])] }
}
const cleanName = (s: string, max = 24) => { const v = s.replace(/\s+/g, ' ').trim().slice(0, max); if (!v) throw new Error('이름이 비었어요'); return v }

export function applyStemOp(map: LinkMap, edits: LinkEdits, op: StemOp, now = Date.now()): LinkEdits {
  if (op.op === 'reset') return { ...EMPTY_EDITS }
  if (op.op === 'drop') { const p = map.proposals.find((x) => x.id === op.proposal); if (!p) throw new Error('그 제안을 못 찾았어요'); return { ...edits, dropped: [...new Set([...(edits.dropped ?? []), p.name])] } }
  const e = materializeEdits(map, edits)
  const S = e.stems!
  const known = new Set(map.nodes.map((n) => n.id))
  const find = (id: string) => { const s = S.find((x) => x.id === id); if (!s) throw new Error('그 줄기를 못 찾았어요 — 지도를 다시 열어 주세요'); return s }
  const pull = (folder: string) => { for (const s of S) if (s.members.includes(folder)) { s.members = s.members.filter((x) => x !== folder); s.fixed = true } e.out = (e.out ?? []).filter((x) => x !== folder) }
  const need = (folder: string) => { if (!known.has(folder)) throw new Error('지도에 없는 폴더예요'); if (map.hubs.includes(folder)) throw new Error('허브 폴더(다들 가리키는 곳)는 줄기에 넣지 않아요') }
  const color = () => STEM_COLORS.find((c) => !S.some((s) => s.color === c)) ?? STEM_COLORS[S.length % STEM_COLORS.length]
  const nid = () => { let i = 0, id = ''; do id = `s-${now.toString(36)}${i ? `-${i}` : ''}`, i++; while (S.some((s) => s.id === id)); return id }
  switch (op.op) {
    case 'rename': { const s = find(op.stem); s.name = cleanName(op.name); s.fixed = true; break }
    case 'line': { const s = find(op.stem); const l = op.line.replace(/\s+/g, ' ').trim().slice(0, 60); if (l) s.line = l; else delete s.line; s.fixed = true; break }
    case 'add': { need(op.folder); const s = find(op.stem); pull(op.folder); s.members.push(op.folder); s.fixed = true; break }
    case 'out': { need(op.folder); pull(op.folder); e.out = [...(e.out ?? []), op.folder]; break }
    case 'auto': { pull(op.folder); break }
    case 'order': { const rank = new Map(op.ids.map((id, i) => [id, i])); e.stems = [...S].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)); break }
    case 'merge': {
      if (op.from === op.into) throw new Error('같은 줄기끼리는 합칠 수 없어요')
      const a = find(op.from), b = find(op.into)
      b.members = [...new Set([...b.members, ...a.members])]; if (op.name?.trim()) b.name = cleanName(op.name)
      if (!b.line && a.line) b.line = a.line
      b.fixed = true; e.stems = S.filter((s) => s !== a); break
    }
    case 'delete': { const s = find(op.stem); e.stems = S.filter((x) => x !== s); break }
    case 'create': {
      const name = cleanName(op.name)
      if (S.some((s) => norm(s.name) === norm(name))) throw new Error(`«${name}» 줄기가 이미 있어요`)
      const folders = (op.folders ?? []).filter((f) => known.has(f) && !map.hubs.includes(f))
      for (const f of folders) pull(f)
      S.push({ id: nid(), name, color: color(), members: folders, fixed: true }); break
    }
    case 'accept': {
      const p = map.proposals.find((x) => x.id === op.proposal); if (!p) throw new Error('그 제안을 못 찾았어요')
      let name = cleanName(p.name); if (S.some((s) => norm(s.name) === norm(name))) name = `${name} 2`
      for (const f of p.folders) pull(f)
      S.push({ id: nid(), name, ...(p.line ? { line: p.line } : {}), color: color(), members: p.folders.filter((f) => known.has(f)), fixed: true }); break
    }
  }
  if (!e.stems?.length) throw new Error('줄기가 하나는 있어야 해요 — 모두 되돌리려면 «모두 봇 계산으로 되돌리기» 를 누르세요')
  return e
}

// ── 봇이 줄기에 넣기(모델) ───────────────────────────────────────────────────

export const PLACE_AI_SYSTEM = '너는 폴더를 사람이 정한 «일의 줄기» 에 나눠 넣는 도구다. JSON 객체 하나만 답한다.'
/** Dave 의 줄기 목록(이름 · 한 줄 · 든 폴더 예시)을 기준으로, 아직 안 든 폴더를 넣게 한다 */
export function placePrompt(stems: { name: string; line?: string; examples: string[] }[], folders: { label: string; past: boolean; text: string }[]): string {
  return [
    '아래는 한 사람이 자기 일을 나눈 «일의 줄기» 목록이다. 이 사람의 나눔 기준을 따라, 그 아래 폴더를 하나씩 맞는 줄기에 넣어라.',
    '- 줄기 이름과 이미 든 폴더(예시)를 보고 기준을 읽어라. 기준을 새로 만들지 마라.',
    '- 맞는 줄기가 없으면 stem 을 "" 로 둬라. 억지로 넣지 마라.',
    '- 맞는 줄기가 없는 폴더 둘 이상이 같은 종류의 일이면 new 에 새 줄기를 제안해라(이름 한글 8자 이내 · line 30자 이내).',
    '- «(보관)» 은 끝난 일이다. 끝난 일도 같은 기준으로 넣는다 — 나중에 비슷한 일을 할 때 가져다 쓰려는 것이다.',
    '- why 는 20자 이내. 폴더는 아래 이름표를 그대로 적는다.',
    '답 모양: {"place":[{"folder":"이름표","stem":"줄기 이름","why":"…"}],"new":[{"name":"…","line":"…","folders":["이름표","이름표"]}]}',
    '',
    '## 줄기',
    ...stems.map((s) => `- ${s.name}${s.line ? ` — ${s.line}` : ''}${s.examples.length ? ` · 든 폴더: ${s.examples.join(', ')}` : ''}`),
    '',
    '## 넣을 폴더',
    ...folders.map((f) => `### ${f.label}${f.past ? ' (보관)' : ''}\n${f.text}`),
  ].join('\n')
}
export function parsePlace(out: string): { place: { folder: string; stem: string; why: string }[]; fresh: { name: string; line?: string; folders: string[] }[] } | null {
  const m = /\{[\s\S]*\}/.exec(out)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { place?: unknown; new?: unknown }
    const place = (Array.isArray(j.place) ? j.place : []).flatMap((x) => {
      const o = x as { folder?: unknown; stem?: unknown; why?: unknown }
      return typeof o.folder === 'string' && o.folder.trim() ? [{ folder: o.folder.trim(), stem: typeof o.stem === 'string' ? o.stem.trim() : '', why: typeof o.why === 'string' ? o.why.trim().slice(0, 60) : '' }] : []
    })
    const fresh = (Array.isArray(j.new) ? j.new : []).flatMap((x) => {
      const o = x as { name?: unknown; line?: unknown; folders?: unknown }
      const folders = Array.isArray(o.folders) ? o.folders.filter((f): f is string => typeof f === 'string') : []
      return typeof o.name === 'string' && o.name.trim() && folders.length >= 2 ? [{ name: o.name.trim().slice(0, 16), ...(typeof o.line === 'string' && o.line.trim() ? { line: o.line.trim().slice(0, 60) } : {}), folders: folders.slice(0, 20) }] : []
    }).slice(0, 5)
    return { place, fresh }
  } catch { return null }
}
