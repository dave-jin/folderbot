import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { type AkFile, type AkLedger, type AkMode, type AkOp, type AkRemote, REOPEN, akKey, dueCandidates, emptyLedger, mapProjects, pairCandidates, planSync, pullRemote, seedLegacy } from '../core/akiflowSync'
import { addLine, editLine, parseTodo, setDueLine, setMetaLine, toggleAndMove } from '../core/todo'
import type { Bot, RoutineDef } from '../core/types'
import { atomicWrite } from './paths'
import { readTodo, todoPath } from './todoStore'

/**
 * 🔴 **CK-2 · Akiflow 동기화 — 호스트 몫** (2026-10-16 Dave «추천대로» · 엔진 A).
 * 짝 장부(`.folderbot/akiflow-sync.json`)를 들고, 할 일 목록을 계산해(`core/akiflowSync`) 루틴에 건네고(`akiflow_sync_plan`),
 * 루틴이 Akiflow MCP 로 실행한 결과를 받아(`akiflow_sync_ack`) todo.md 에 짝 표식을 달고 Akiflow 쪽 변화를 내린다.
 * 🔴 **처음은 미리보기다** — 만들 목록만 화면에 보여 주고 Akiflow 는 건드리지 않는다. 사람이 설정에서 [켜기] 해야 루틴이 생기고 실제로 쓴다(기획안 §11).
 * 대상은 레일에 선 봇 폴더의 todo.md 다(오케스트레이터 제외).
 */
export const AK_ROUTINE = 'Akiflow 동기화'
export const AK_PROMPT = `Akiflow 동기화 회차다. 무엇을 할지는 호스트가 정했다 — 너는 Akiflow MCP 로 손만 쓴다. 판단해서 더하거나 빼지 않는다.
1. Akiflow list_projects 를 불러 [{id, name}] 을 모은다.
2. mcp__folderbot__akiflow_sync_plan 을 projects 와 함께 부른다(remote 는 주지 않는다). mode 가 live 가 아니면 마지막 줄을 «결과: skip — 미리보기 모드» 로 쓰고 끝낸다.
3. 받은 check 의 id 마다 get_task 로 읽어 {id, title, description, done, deadline, project_id} 를 모은다. scanOnly 이거나 watchProjects 가 있으면 list_tasks(inbox·someday)와 get_schedule(오늘부터 30일)에서 project_id 가 watchProjects 에 있는 태스크(scanOnly 면 전부)도 같은 꼴로 모은다. 이것이 remote 다.
4. akiflow_sync_plan 을 remote 와 함께 한 번 더 부른다 — 이번에는 runId 와 ops 가 온다.
5. ops 를 차례로 실행한다. create → create_task(title, description, links, deadline, status: "inbox", project_id 가 있으면 그것) · update → edit_task(task_id: akId, 준 필드만) · complete → complete_task(akId) · delete → delete_task(akId). 각 결과를 {key, ok, akId(만든 태스크 id), error} 로 모은다.
6. mcp__folderbot__akiflow_sync_ack 를 {runId, results} 로 한 번 부른다.
7. 마지막 줄에 «결과: ok» 를 쓴다(실패가 있으면 «결과: fail — 몇 건 · 첫 오류»).`

export class AkiflowSync {
  private offset = 0
  constructor(private root: string, private bots: () => Bot[], private onTodo: (botId: string) => void, private onWrite: (botId: string, title: string) => void = () => {}) {}
  file(): string { return join(this.root, '.folderbot', 'akiflow-sync.json') }
  load(): AkLedger {
    try { return { ...emptyLedger(), ...(JSON.parse(readFileSync(this.file(), 'utf8')) as Partial<AkLedger>) } } catch { return emptyLedger() }
  }
  save(l: AkLedger): void { const f = this.file(); mkdirSync(dirname(f), { recursive: true }); atomicWrite(f, JSON.stringify(l, null, 1)) }
  private folders(): (AkFile & { botId: string; abs: string })[] {
    return this.bots().filter((b) => !b.orchestrator && existsSync(todoPath(b.abs))).map((b) => ({ rel: b.rel, name: basename(b.rel), items: readTodo(b.abs), botId: b.id, abs: b.abs }))
  }
  private ledger(): AkLedger { const files = this.folders(); const l = this.load(); if (l.startedAt) return l; const s = seedLegacy(l, files, Date.now()); this.save(s); return s }

  /** 화면 — 지금 모드 · 셈 · 만들 목록 앞 40개 · 카드(사라진 짝 · 어긋남 · 같은 일 후보) */
  status() {
    const l = this.ledger(); const files = this.folders()
    const { plan } = planSync(files, l, { vaultAbs: this.root, now: Date.now() })
    const n = (k: AkOp['op']) => plan.ops.filter((o) => o.op === k).length
    const legacyN = Object.values(l.legacy).reduce((a, x) => a + x.length, 0)
    return {
      mode: l.mode, pairs: Object.keys(l.pairs).length, folders: files.length,
      counts: { create: n('create'), update: n('update'), complete: n('complete'), delete: n('delete') },
      legacy: legacyN, legacyLeft: plan.legacy, proposed: plan.proposedSkipped, held: plan.held,
      preview: plan.ops.slice(0, 40).map((o) => ({ op: o.op, rel: o.rel, title: 'title' in o && o.title ? o.title : o.key.split('\n').pop() ?? '', deadline: 'deadline' in o ? o.deadline ?? null : null })),
      gone: Object.entries(l.gone).filter(([, v]) => v === 'ask').map(([id]) => ({ akId: id, rel: l.pairs[id]?.rel ?? '', title: l.pairs[id]?.title ?? '' })),
      conflicts: l.conflicts, pairAsks: l.pairAsks, lastRun: l.lastRun ?? null, routine: this.routineOn(),
      dueCands: (() => { const all = dueCandidates(files, l.dueSkip ?? []); return { n: all.length, list: all.slice(0, 30) } })(),
    }
  }
  routineOn = (): boolean => false

  setMode(mode: AkMode): AkLedger { const l = this.ledger(); l.mode = mode; this.save(l); return l }

  /**
   * 루틴 — 두 걸음이다. 🔴 **읽고 나서 민다** — 밀기 전에 Akiflow 쪽 변화를 먼저 받아야 양쪽이 다르게 고친 제목이 카드가 되고 조용히 덮이지 않는다(리뷰 10/16).
   *  ① `remote` 없이 부르면 읽을 것만 준다(`phase: 'read'` · check · watchProjects). `projects` 를 주면 폴더 ↔ 프로젝트를 이름으로 맞춘다.
   *  ② 읽은 태스크를 `remote` 로 주면 그것을 todo.md 로 내린 뒤 이번 회차의 ops 와 runId 를 준다(`phase: 'push'`).
   */
  plan(projects?: { id: string; name: string }[], remote?: AkRemote[]) {
    let l = this.ledger(); const files = this.folders()
    if (projects?.length) { l = { ...l, projects: mapProjects(files, projects) }; this.save(l) }
    if (remote === undefined) {
      const r = planSync(files, l, { vaultAbs: this.root, now: Date.now(), offset: this.offset })
      this.offset += r.plan.check.length
      this.save(r.ledger)
      return { phase: 'read' as const, mode: r.plan.mode, check: r.plan.check, watchProjects: r.plan.watchProjects, scanOnly: r.plan.scanOnly, ops: [] as AkOp[] }
    }
    const pulled = this.pull(l, files, remote); l = pulled.ledger
    const r = planSync(this.folders(), l, { vaultAbs: this.root, now: Date.now() })
    const runId = `ak_${Date.now().toString(36)}`
    const runs = Object.fromEntries([...Object.entries(r.ledger.runs ?? {}), [runId, { at: Date.now(), ops: r.plan.ops }]].slice(-5))
    this.save({ ...r.ledger, runs })
    return { phase: 'push' as const, runId, pulled: pulled.n, ...r.plan, check: [] as string[] }
  }
  /** Akiflow 쪽 변화를 todo.md 로 — 켠 첫 회차는 «같은 일» 후보만 만들고 아무것도 내리지 않는다 */
  private pull(l: AkLedger, files: (AkFile & { botId: string; abs: string })[], remote: AkRemote[]): { ledger: AkLedger; n: number } {
    const first = l.mode === 'live' && !l.scanned
    if (first) l = { ...l, pairAsks: [...l.pairAsks, ...pairCandidates(files, l, remote, Date.now())], scanned: true }
    const pr = pullRemote(files, l, remote, Date.now(), { allowAdd: l.mode === 'live' && !first }); l = pr.ledger
    for (const fx of pr.fixes) {
      const f = files.find((x) => x.rel === fx.rel); if (!f) continue
      const p = todoPath(f.abs); let md = readFileSync(p, 'utf8')
      if (fx.kind === 'add') md = addLine(md, fx.title, fx.desc ?? '', 'me', '', { ak: fx.akId, ...(fx.due ? { due: fx.due } : {}) })
      else {
        const t = parseTodo(md).find((x) => x.ak === fx.akId); if (!t) continue
        if (fx.kind === 'title') { md = editLine(md, t.line, fx.title, t.desc); if (fx.mine) md = setMetaLine(md, t.line, { by: 'me' }) }
        else if (fx.kind === 'done') md = toggleAndMove(md, t.line, true)
        else if (fx.kind === 'undone') md = toggleAndMove(md, t.line, false)
        else if (fx.kind === 'desc') md = editLine(md, t.line, t.title, fx.desc)
        else if (fx.kind === 'due') md = setDueLine(md, t.line, fx.due)
      }
      atomicWrite(p, md); this.onWrite(f.botId, fx.kind === 'add' || fx.kind === 'title' ? fx.title : ''); this.onTodo(f.botId)
    }
    this.save(l)
    return { ledger: l, n: pr.fixes.length }
  }

  /** 루틴의 결과 — 만든 태스크 id 를 줄에 단다. 줄을 못 찾은 태스크는 다시 내려받지 않게 `ignore` 에 적고 셈에 남긴다 */
  ack(runId: string, results: { key: string; ok: boolean; akId?: string; error?: string }[], remote: AkRemote[] = []) {
    let l = this.load()
    const ops = l.runs?.[runId]?.ops ?? []
    const touched = new Set<string>()
    let ok = 0, fail = 0, orphan = 0
    const byRel = new Map(this.folders().map((f) => [f.rel, f]))
    for (const res of results) {
      // 계획 기록을 잃었어도(밀려난 회차) 만들기의 열쇠는 «폴더\n제목» 이라 줄을 찾아 짝을 달 수 있다
      const last = res.key.split('\n').pop() ?? ''
      const op = ops.find((o) => o.key === res.key) ?? (res.key.includes('\n') && res.ok && res.akId ? { op: 'create' as const, key: res.key, rel: res.key.split('\n')[0], title: '', description: '', links: [], ...(last.startsWith(REOPEN) ? { replaces: last.slice(REOPEN.length) } : {}) } : undefined)
      if (!op) { if (res.ok && res.akId) { l.ignore = [...(l.ignore ?? []), res.akId]; orphan++ } continue }
      if (!res.ok) { fail++; continue }
      ok++
      const f = byRel.get(op.rel)
      if (op.op === 'create' && res.akId) {
        const title = op.key.split('\n').pop()!
        const p = f ? todoPath(f.abs) : ''; const md = f ? readFileSync(p, 'utf8') : ''
        // 다시 연 줄은 옛 짝 표식을 달고 있다 — 그 표식을 새 태스크로 바꾼다(옛 태스크는 Akiflow 에 끝난 기록으로 남는다)
        // ⚠ 다시 연 줄을 ack 전에 또 끝냈어도 새 태스크를 단다 — 짝을 «열림» 으로 적어 두면 다음 회차가 완료를 보낸다(Akiflow 에 열린 고아가 안 남게)
        const t = f ? parseTodo(md).find((x) => (op.replaces ? x.ak === op.replaces : x.title === title && !x.ak && !x.done)) : undefined
        if (op.replaces && t) { delete l.pairs[op.replaces]; l.ignore = [...(l.ignore ?? []), op.replaces] }
        if (!f || !t) { l.ignore = [...(l.ignore ?? []), res.akId]; orphan++; continue }
        atomicWrite(p, setMetaLine(md, t.line, { ak: res.akId })); touched.add(f.botId)
        l.pairs[res.akId] = { rel: op.rel, title: t.title, desc: t.desc, done: false, due: t.due ?? null, bot: t.by === 'bot', syncedAt: Date.now() }
      } else if ((op.op === 'update' || op.op === 'complete') && f) {
        const t = f.items.find((x) => x.ak === op.akId); if (!t) continue
        const prev = l.pairs[op.akId]
        // 제목을 밀지 않은 짝(카드 대기)은 짝 기록의 제목을 그대로 둔다 — 고르기 전에 비교가 사라지지 않게
        l.pairs[op.akId] = { rel: op.rel, title: op.op === 'update' && !op.title && prev ? prev.title : t.title, desc: t.desc, done: t.done, due: t.due ?? null, bot: t.by === 'bot', syncedAt: Date.now() }
      } else if (op.op === 'delete') { delete l.pairs[op.akId]; delete l.gone[op.akId] }
    }
    if (l.runs?.[runId]) { const { [runId]: _done, ...rest } = l.runs; l.runs = rest }
    this.save(l)
    let pulled = 0
    if (remote.length) { pulled = this.pull(l, this.folders(), remote).n; l = this.load() }
    l.lastRun = { at: Date.now(), ok, fail, note: `${pulled}건 내려옴${orphan ? ` · 줄을 못 찾은 태스크 ${orphan}개(Akiflow 에만 있음)` : ''}` }
    this.save(l)
    for (const b of touched) this.onTodo(b)
    return { ok, fail, orphan, pulled, pairAsks: l.pairAsks.length, conflicts: l.conflicts.length }
  }

  /** 처음부터 있던 봇 줄을 «제안» 으로 돌린다 — 사람이 화면에서 누른다 */
  legacyToProposed(): number {
    const l = this.ledger(); let n = 0
    for (const f of this.folders()) {
      const want = new Set(l.legacy[f.rel] ?? []); if (!want.size) continue
      const p = todoPath(f.abs); let md = readFileSync(p, 'utf8')
      for (const t of parseTodo(md)) if (t.by === 'bot' && !t.proposed && !t.ak && !t.done && want.has(t.title)) { md = setMetaLine(md, t.line, { proposed: true }); n++ }
      atomicWrite(p, md); this.onTodo(f.botId)
    }
    l.legacy = {}; this.save(l); return n
  }
  /** CK-1 · 마감 후보 고르기 — [마감으로] 는 그 줄에 `📅` 를 붙이고, [아님] 은 다시 묻지 않게 적어 둔다. 줄이 그새 바뀌었으면 손대지 않는다 */
  dueCand(rel: string, line: number, title: string, date: string | null): boolean {
    const l = this.load()
    if (!date) { l.dueSkip = [...new Set([...(l.dueSkip ?? []), akKey(rel, title)])]; this.save(l); return true }
    const f = this.folders().find((x) => x.rel === rel); if (!f) return false
    const p = todoPath(f.abs); const md = readFileSync(p, 'utf8')
    const t = parseTodo(md).find((x) => x.line === line && x.title === title && !x.done); if (!t) return false
    atomicWrite(p, setDueLine(md, t.line, date)); this.onTodo(f.botId); return true
  }
  /** 카드 고르기 — 사라진 짝 지우기/남기기 · 어긋난 제목 고르기 · 같은 일 짝짓기/새로 만들기 */
  resolve(kind: 'gone' | 'conflict' | 'pair', id: string, choice: string): void {
    const l = this.load()
    if (kind === 'gone') { if (choice === 'delete') l.gone[id] = 'delete'; else { l.gone[id] = 'keep'; delete l.pairs[id]; l.ignore = [...(l.ignore ?? []), id] } }
    if (kind === 'conflict') {
      const c = l.conflicts.find((x) => x.id === id); if (!c) return
      l.conflicts = l.conflicts.filter((x) => x.id !== id)
      const p = l.pairs[c.akId]
      if (p && choice === 'local' && c.field === 'title') p.title = c.remote   // 다음 계획에서 todo.md 제목으로 Akiflow 를 고친다
      if (p && choice === 'local' && c.field === 'desc') p.desc = c.remote   // 다음 계획에서 todo.md 설명으로 Akiflow 를 고친다
      if (p && choice === 'remote') {
        const f = this.folders().find((x) => x.rel === c.rel); const t = f?.items.find((x) => x.ak === c.akId)
        if (f && t) { const pth = todoPath(f.abs); atomicWrite(pth, editLine(readFileSync(pth, 'utf8'), t.line, c.field === 'desc' ? t.title : c.remote, c.field === 'desc' ? c.remote : t.desc)); this.onTodo(f.botId) }
        if (c.field === 'desc') p.desc = c.remote; else p.title = c.remote
      }
    }
    if (kind === 'pair') {
      const a = l.pairAsks.find((x) => x.id === id); if (!a) return
      l.pairAsks = l.pairAsks.filter((x) => x.id !== id)
      if (choice === 'pair') {
        const f = this.folders().find((x) => x.rel === a.rel); const t = f?.items.find((x) => x.title === a.title && !x.ak)
        if (f && t) {
          const pth = todoPath(f.abs); atomicWrite(pth, setMetaLine(readFileSync(pth, 'utf8'), t.line, { ak: a.akId })); this.onTodo(f.botId)
          // 짝 직후 한 번은 todo.md 쪽으로 Akiflow 를 맞춘다(제목의 🤖·출처 줄) — 짝 기록은 비교가 일어나게 비워 둔다
          l.pairs[a.akId] = { rel: a.rel, title: a.remoteTitle, desc: '', done: false, due: null, bot: false, syncedAt: Date.now() }
        }
      } else l.pairDone = [...l.pairDone, akKey(a.rel, a.title)]
    }
    this.save(l)
  }
  // Akiflow MCP 쓰기가 손이라 묻지 않고 돈다 — 무엇을 쓸지는 호스트가 정한다
  routineDef(): RoutineDef { return { name: AK_ROUTINE, cron: '*/15 * * * *', prompt: AK_PROMPT, approve: 'always', push: false, retry: false } }
}
