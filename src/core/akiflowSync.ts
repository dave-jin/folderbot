import type { TodoItem } from './types'

/**
 * 🔴 **CK-2 · todo.md ↔ Akiflow 100% 동기화의 판정** (2026-10-16 Dave «추천대로» · 기획안 §3 · 엔진 A «호스트가 계산, 루틴이 손»).
 *
 * «100%» = ① 체크박스 줄 하나 = Akiflow 태스크 하나 ② 제목·설명·완료·마감이 양쪽에서 같다 ③ 어긋나면 조용히 덮지 않고 카드로 묻는다.
 * 짝의 근거는 줄 끝 `<!-- ak:ID -->` 하나다 — 제목이 같다고 짝으로 보지 않는다(같은 일 후보는 사람이 고른다).
 * 판단은 여기(결정론)가 하고, 루틴의 모델은 Akiflow MCP 로 «손» 만 쓴다. 그래서 무엇을 할지가 재현되고 유닛으로 잴 수 있다.
 *
 * ⚠ Akiflow MCP 는 프로젝트를 **만들지 못한다**(list_projects: «Projects and folders themselves cannot be created»). 결정 ③(폴더 = 프로젝트)은
 *   «같은 이름의 프로젝트가 있으면 그리로, 없으면 프로젝트 없이» 로 지킨다 — 출처 줄에 폴더 이름이 늘 남는다.
 * ⚠ 처음 켤 때 이미 있던 봇 줄(`<!-- bot -->`)은 올리지 않는다(`legacy`) — Akiflow 는 Dave 의 실행면이라 봇 줄 수백 개가 쏟아지면 둘 다 못 믿게 된다.
 *   사람이 화면에서 «제안으로 돌리기» 를 누르면 그 줄들이 제안 칸으로 간다.
 */
export type AkMode = 'off' | 'preview' | 'live'
export interface AkPair { rel: string; title: string; desc: string; done: boolean; due: string | null; bot: boolean; syncedAt: number }
export interface AkConflict { id: string; akId: string; rel: string; field: 'title' | 'desc' | 'done'; local: string; remote: string; at: number }
export interface AkPairAsk { id: string; rel: string; title: string; akId: string; remoteTitle: string; at: number }
export interface AkLedger {
  mode: AkMode
  /** 처음 계산한 시각 — 이때 있던 봇 줄은 `legacy` 로 묶인다 */
  startedAt?: number
  /** 폴더별로 처음부터 있던 봇 줄 제목 — 올리지 않는다 */
  legacy: Record<string, string[]>
  pairs: Record<string, AkPair>
  /** 폴더(rel) → Akiflow 프로젝트 id (이름이 맞는 것) */
  projects: Record<string, string>
  /** todo.md 에서 사라진 짝 — ask(카드) · delete(사람이 지우라 함) · keep(Akiflow 에 남김) */
  gone: Record<string, 'ask' | 'delete' | 'keep'>
  conflicts: AkConflict[]
  /** 처음 켤 때 «이미 Akiflow 에 있는 같은 일» 후보 — 사람이 짝짓거나 새로 만들게 한다 */
  pairAsks: AkPairAsk[]
  /** 짝 후보를 고른 줄(새로 만들기로 한 것) — 다시 묻지 않는다 */
  pairDone: string[]
  /** live 로 처음 돈 회차가 Akiflow 를 먼저 훑었나 — 훑기 전에는 만들지 않는다(같은 일 두 벌 방지) */
  scanned?: boolean
  /** todo.md 로 내려받지 않을 Akiflow id — 사람이 «Akiflow 에 남기기» 한 짝 · 만들었는데 줄을 못 찾은 태스크 */
  ignore: string[]
  /** 계획한 회차의 할 일 — 호스트가 재시작해도 결과를 맞출 수 있게 장부에 둔다(최근 5개) */
  runs: Record<string, { at: number; ops: AkOp[] }>
  lastRun?: { at: number; ok: number; fail: number; note?: string }
}
export const emptyLedger = (): AkLedger => ({ mode: 'preview', legacy: {}, pairs: {}, projects: {}, gone: {}, conflicts: [], pairAsks: [], pairDone: [], ignore: [], runs: {} })

export interface AkFile { rel: string; name: string; items: TodoItem[] }
export type AkOp =
  | { op: 'create'; key: string; rel: string; title: string; description: string; links: string[]; deadline?: string; project_id?: string }
  | { op: 'update'; key: string; akId: string; rel: string; title?: string; description?: string; deadline?: string | null; links?: string[] }
  | { op: 'complete'; key: string; akId: string; rel: string }
  | { op: 'delete'; key: string; akId: string; rel: string }
export interface AkPlan { mode: AkMode; ops: AkOp[]; check: string[]; watchProjects: string[]; scanOnly: boolean; legacy: number; proposedSkipped: number; held: number }

export const akKey = (rel: string, title: string) => `${rel}\n${title}`
const strip = (t: string) => t.replace(/^🤖\s*/, '').replace(/\s*—\s*확인 필요$/, '').trim()
const norm = (s: string) => strip(s).normalize('NFC').replace(/\s+/g, ' ').toLowerCase()

/** 볼트 폴더의 Dropbox 웹 주소 — 볼트가 Dropbox 안에 있을 때만(전역 규칙: 파일이 아니라 폴더까지) */
export function folderUrl(vaultAbs: string, rel: string): string | null {
  const i = vaultAbs.indexOf('/Dropbox/'); if (i < 0) return null
  const path = [...vaultAbs.slice(i + '/Dropbox/'.length).split('/'), ...rel.split('/')].filter(Boolean)
  return `https://www.dropbox.com/home/${path.map(encodeURIComponent).join('/')}`
}
/** Akiflow 쪽 제목 — 봇 줄은 `🤖 ` 로 시작한다(전역 규칙: 에이전트가 만든 태스크) */
export const akTitle = (t: { title: string; by: 'me' | 'bot' }) => (t.by === 'bot' ? `🤖 ${t.title}` : t.title)
/** Akiflow 쪽 설명 — 첫 줄 `📍 출처: [폴더](주소) · M/D`, 그 아래 설명 */
export function akDesc(name: string, url: string | null, desc: string, at: Date): string {
  const head = `📍 출처: ${url ? `[${name}](${url})` : `${name} (볼트 todo.md · 링크 없음)`} · ${at.getMonth() + 1}/${at.getDate()}`
  return desc.trim() ? `${head}\n${desc.trim()}` : head
}

/** 처음 계산할 때 — 지금 있는 봇 줄(짝 없음 · 안 끝남 · 제안 아님)을 legacy 로 묶는다 */
export function seedLegacy(ledger: AkLedger, files: AkFile[], now: number): AkLedger {
  if (ledger.startedAt) return ledger
  const legacy: Record<string, string[]> = {}
  for (const f of files) { const l = f.items.filter((t) => t.by === 'bot' && !t.proposed && !t.ak && !t.done).map((t) => t.title); if (l.length) legacy[f.rel] = l }
  return { ...ledger, startedAt: now, legacy }
}

/**
 * 할 일 목록을 계산한다 — 만들기 · 고치기 · 완료 · (사람이 고른) 지우기. 사라진 짝은 `gone` 에 «ask» 로 적어 카드로 띄운다.
 * `check` 는 이번 회차에 Akiflow 쪽 상태를 읽어 올 짝 id(돌아가며 `batch` 개) — 거기서 바뀐 것이 todo.md 로 내려온다.
 */
export function planSync(files: AkFile[], ledger: AkLedger, o: { vaultAbs: string; now: number; batch?: number; offset?: number }): { plan: AkPlan; ledger: AkLedger } {
  const at = new Date(o.now)
  const ops: AkOp[] = []
  let legacyN = 0, proposedN = 0, held = 0
  const seen = new Set<string>(), changed: string[] = []
  const gone = { ...ledger.gone }
  const titleHeld = new Set(ledger.conflicts.map((c) => c.akId))
  const askTitles = new Set(ledger.pairAsks.map((a) => akKey(a.rel, a.title)))
  for (const f of files) {
    const url = folderUrl(o.vaultAbs, f.rel)
    const legacy = new Set(ledger.legacy[f.rel] ?? [])
    for (const t of f.items) {
      if (t.proposed) { if (!t.done) proposedN++; continue }
      if (t.ak) {
        seen.add(t.ak)
        const p = ledger.pairs[t.ak]; if (!p) continue
        const due = t.due ?? null
        if (t.done && !p.done) { ops.push({ op: 'complete', key: t.ak, akId: t.ak, rel: f.rel }); continue }
        if (t.title !== p.title || t.desc !== p.desc || due !== p.due || (t.by === 'bot') !== p.bot) {
          changed.push(t.ak)
          // ⚠ 제목이 양쪽에서 다르게 바뀐 짝(카드)은 사람이 고를 때까지 제목을 밀지 않는다
          const title = (t.title !== p.title || (t.by === 'bot') !== p.bot) && !titleHeld.has(t.ak)
          const op = { op: 'update' as const, key: t.ak, akId: t.ak, rel: f.rel, ...(title ? { title: akTitle(t) } : {}), ...(t.desc !== p.desc ? { description: akDesc(f.name, url, t.desc, at), links: url ? [url] : [] } : {}), ...(due !== p.due ? { deadline: due } : {}) }
          if (Object.keys(op).length > 4) ops.push(op)
        }
        continue
      }
      if (t.done) continue
      if (t.by === 'bot' && legacy.has(t.title)) { legacyN++; continue }
      const key = akKey(f.rel, t.title)
      if (askTitles.has(key)) { held++; continue }
      ops.push({ op: 'create', key, rel: f.rel, title: akTitle(t), description: akDesc(f.name, url, t.desc, at), links: url ? [url] : [], ...(t.due ? { deadline: t.due } : {}), ...(ledger.projects[f.rel] ? { project_id: ledger.projects[f.rel] } : {}) })
    }
  }
  for (const [id, p] of Object.entries(ledger.pairs)) {
    if (seen.has(id)) continue
    if (!gone[id]) gone[id] = 'ask'
    if (gone[id] === 'delete') ops.push({ op: 'delete', key: id, akId: id, rel: p.rel })
  }
  const live = Object.keys(ledger.pairs).filter((id) => seen.has(id))
  const batch = o.batch ?? 20, off = live.length ? (o.offset ?? 0) % live.length : 0
  // todo.md 에서 바뀐 짝은 늘 먼저 읽는다 — 밀기 전에 Akiflow 쪽도 바뀌었는지 봐야 «조용히 덮지 않는다» 가 지켜진다
  const check = [...new Set([...changed, ...[...live.slice(off), ...live.slice(0, off)].slice(0, batch)])]
  const scanOnly = ledger.mode === 'live' && !ledger.scanned
  const watchProjects = [...new Set(Object.values(ledger.projects))]
  return { plan: { mode: ledger.mode, ops: scanOnly ? [] : ops, check, watchProjects, scanOnly, legacy: legacyN, proposedSkipped: proposedN, held }, ledger: { ...ledger, gone } }
}

/** 폴더 이름과 Akiflow 프로젝트 이름 맞추기 — «📁 제품_FolderBot (Work)» 처럼 아이콘·폴더 꼬리가 붙어 온다 */
export function mapProjects(files: { rel: string; name: string }[], projects: { id: string; name: string }[]): Record<string, string> {
  const clean = (s: string) => s.normalize('NFC').replace(/\s*\([^)]*\)\s*$/, '').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase()
  const by = new Map(projects.map((p) => [clean(p.name), p.id]))
  const out: Record<string, string> = {}
  for (const f of files) { const id = by.get(clean(f.name)) ?? by.get(clean(f.rel.split('/').pop() ?? '')); if (id) out[f.rel] = id }
  return out
}

export interface AkRemote { id: string; title: string; description?: string; done: boolean; deadline?: string | null; project_id?: string | null }
export type AkLocalFix =
  | { kind: 'title'; rel: string; akId: string; title: string; mine?: boolean }
  | { kind: 'done'; rel: string; akId: string }
  | { kind: 'due'; rel: string; akId: string; due: string | null }
  | { kind: 'add'; rel: string; akId: string; title: string; due: string | null }

/**
 * Akiflow 쪽에서 바뀐 것 → todo.md 로 내릴 것. 한쪽만 바뀌었으면 그쪽을 따르고, 양쪽이 다르게 바뀐 제목은 카드로 묻는다.
 * 완료·마감은 «나중에 바뀐 쪽» — 여기서는 todo.md 가 짝 이후 그대로면 Akiflow 를 따르고, todo.md 도 바뀌었으면 push(planSync)가 이긴다.
 * Dave 가 Akiflow 에서 `🤖` 를 지우면 그 줄은 Dave 것이 된다(`mine`).
 * 짝이 없는 태스크가 연결된 프로젝트에 있으면 그 폴더에 Dave 줄로 들어온다(`add`).
 */
export function pullRemote(files: AkFile[], ledger: AkLedger, remote: AkRemote[], now: number, o: { allowAdd?: boolean } = {}): { fixes: AkLocalFix[]; ledger: AkLedger } {
  // ⚠ 짝 없는 태스크를 줄로 내리지 않는 경우 — 첫 훑기 회차(같은 일 후보를 먼저 묻는다) · 사람이 남기라 한 짝 · 못 단 태스크 · 후보 카드가 걸린 것
  const noAdd = new Set([...(ledger.ignore ?? []), ...Object.keys(ledger.gone), ...ledger.pairAsks.map((a) => a.akId)])
  const fixes: AkLocalFix[] = []
  const pairs = { ...ledger.pairs }; const conflicts = [...ledger.conflicts]
  const local = new Map<string, { rel: string; t: TodoItem }>()
  for (const f of files) for (const t of f.items) if (t.ak) local.set(t.ak, { rel: f.rel, t })
  const relOfProject = new Map(Object.entries(ledger.projects).map(([rel, id]) => [id, rel]))
  for (const r of remote) {
    const p = pairs[r.id]
    if (!p) {
      const rel = r.project_id ? relOfProject.get(r.project_id) : undefined
      if (!rel || r.done || !o.allowAdd || noAdd.has(r.id)) continue
      const title = strip(r.title)
      fixes.push({ kind: 'add', rel, akId: r.id, title, due: r.deadline ?? null })
      pairs[r.id] = { rel, title, desc: '', done: false, due: r.deadline ?? null, bot: false, syncedAt: now }
      continue
    }
    const l = local.get(r.id); if (!l) continue
    const rt = strip(r.title), lt = l.t.title
    const next = { ...p, syncedAt: now }
    const mine = p.bot && !/^🤖/.test(r.title.trim())
    if (rt !== p.title || mine) {
      if (lt === p.title) { fixes.push({ kind: 'title', rel: l.rel, akId: r.id, title: rt, ...(mine ? { mine: true } : {}) }); next.title = rt; if (mine) next.bot = false }
      else if (lt !== rt && !conflicts.some((c) => c.akId === r.id && c.field === 'title')) conflicts.push({ id: `c_${r.id.slice(0, 8)}_${now.toString(36)}`, akId: r.id, rel: l.rel, field: 'title', local: lt, remote: rt, at: now })
    }
    if (r.done && !p.done && !l.t.done) { fixes.push({ kind: 'done', rel: l.rel, akId: r.id }); next.done = true }
    const rd = r.deadline ?? null
    if (rd !== p.due && (l.t.due ?? null) === p.due) { fixes.push({ kind: 'due', rel: l.rel, akId: r.id, due: rd }); next.due = rd }
    pairs[r.id] = next
  }
  return { fixes, ledger: { ...ledger, pairs, conflicts } }
}

/** 처음 켤 때 — 만들려던 줄과 제목이 같은 Akiflow 태스크가 있으면 «같은 일?» 카드로 묻는다(자동으로 짝짓지 않는다) */
export function pairCandidates(files: AkFile[], ledger: AkLedger, remote: AkRemote[], now: number): AkPairAsk[] {
  const byTitle = new Map<string, AkRemote>()
  for (const r of remote) if (!ledger.pairs[r.id] && !r.done) byTitle.set(norm(r.title), r)
  const done = new Set(ledger.pairDone), have = new Set(ledger.pairAsks.map((a) => akKey(a.rel, a.title)))
  const out: AkPairAsk[] = []
  for (const f of files) {
    const legacy = new Set(ledger.legacy[f.rel] ?? [])
    for (const t of f.items) {
      if (t.ak || t.done || t.proposed || (t.by === 'bot' && legacy.has(t.title))) continue
      const k = akKey(f.rel, t.title); if (done.has(k) || have.has(k)) continue
      const r = byTitle.get(norm(t.title)); if (!r) continue
      out.push({ id: `p_${r.id.slice(0, 8)}_${out.length}`, rel: f.rel, title: t.title, akId: r.id, remoteTitle: r.title, at: now })
    }
  }
  return out
}
