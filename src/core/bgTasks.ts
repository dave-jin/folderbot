/**
 * EA · **맡긴 일의 목록** (2026-11-11 Dave 승인 «맡긴 에이전트를 보고 멈춘다»).
 *
 * 봇이 맡긴 서브에이전트와 뒤에서 도는 셸 명령을 세션마다 한 목록으로 든다. 종전에는 대화 속 카드(`subagent` 줄)가
 * 전부라, 지금 무엇이 몇 개 도는지 보려면 대화를 거슬러 올라가야 했고, 하나만 멈추는 길은 없었다(턴 전체 멈추기뿐).
 *
 * 🔴 **사실은 CLI 가 말해 준다** — CLI 2.1.322 실측(볼트 `07_검증/2026-11-11_실측_CLI-2.1.322-…md`):
 *    `system/task_started` · `task_updated` · `task_notification` · `background_tasks_changed`.
 *    `background_tasks_changed` 는 «지금 뒤에서 도는 것 전체» 를 바뀔 때마다 다시 보낸다 — 이것이 «아직 도는가» 의 정본이다.
 * 🔴 **순수하다** — 호스트(`session.ts`)와 화면이 같은 타입·같은 판정을 쓴다. 시각은 인자로 받는다.
 * ⛔ 화면이 준 글자를 경로에 쓰지 않는다 — 작업 id 는 `validTaskId` 를 통과한 것만 호스트가 받아 쓴다.
 */

export type TaskKind = 'agent' | 'shell' | 'other'
export type TaskStatus = 'run' | 'done' | 'stopped' | 'error'

export interface BgTask {
  /** 줄의 열쇠 — 도구 호출 id(`tool_use_id`)가 있으면 그것, 없으면 `task_id`. 한 번 정하면 안 바뀐다 */
  id: string
  /** CLI 의 `task_id` — 이것이 있어야 하나만 멈출 수 있고(`stop_task`) 기록 파일(`agent-<task_id>.jsonl`)을 찾는다 */
  taskId?: string
  kind: TaskKind
  name: string
  subagentType?: string
  toolUseId?: string
  /** 뒤에서 도는가(`run_in_background`) — 턴이 끝나도 남는다 */
  bg: boolean
  status: TaskStatus
  startedAt: number
  endedAt?: number
  /** 끝난 뒤의 한 줄 — 2000자까지(종전 상한 그대로) */
  summary?: string
  /** 에이전트만 — 도구를 몇 번 썼나 · 마지막으로 한 일 */
  tools?: number
  last?: string
  /** 이 작업이 돈 CLI 세션 id — 되감기로 세션 id 가 갈려도 기록 파일 자리를 잃지 않게 */
  cliSid?: string
}

/** CLI 가 보내는 작업 줄에서 우리가 읽는 칸 */
export interface TaskLine {
  subtype?: string
  task_id?: string
  tool_use_id?: string
  description?: string
  subagent_type?: string
  is_backgrounded?: boolean
  task_type?: string
  status?: string
  summary?: string
  patch?: { status?: string; end_time?: number; is_backgrounded?: boolean }
  tasks?: { task_id?: string; task_type?: string; subagent_type?: string; description?: string }[]
}

/** 끝난 것은 이만큼만 든다 — 도는 것은 수에 상관없이 다 든다 */
export const TASK_HISTORY = 30
export const TASK_SUMMARY_MAX = 2000
const NAME_MAX = 160

/**
 * 작업 id 의 생김새 — 글자·숫자·`_`·`-` 만, 3~80자, 첫 글자는 글자·숫자.
 * ⛔ 점(`.`)·빗금(`/`)·역빗금·공백·`%` 가 들어갈 수 없다 — 이 id 로 파일 이름을 만들기 때문이다(`agent-<id>.jsonl`).
 */
export const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/
export function validTaskId(v: unknown): v is string { return typeof v === 'string' && TASK_ID_RE.test(v) }

export function taskKindOf(taskType: string | undefined): TaskKind {
  if (taskType === 'local_agent' || taskType === 'remote_agent') return 'agent'
  if (taskType === 'local_bash') return 'shell'
  return 'other'
}

/** `task_updated.patch.status` · `task_notification.status` → 우리 상태. 모르는 말은 null(안 바꾼다) */
export function taskStatusOf(raw: string | undefined, final: boolean): TaskStatus | null {
  switch (raw) {
    case 'completed': case 'success': return 'done'
    case 'stopped': case 'killed': case 'cancelled': case 'canceled': return 'stopped'
    case 'failed': case 'error': case 'timeout': return 'error'
    default: return final ? 'error' : null   // 끝을 알리는 줄인데 모르는 말이면 «실패» 쪽이 덜 틀리다(종전 판정 그대로) · 도는 중을 알리는 말이면 안 바꾼다
  }
}

const clip = (s: unknown, n: number): string => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const rowIdOf = (toolUseId: string | undefined, taskId: string | undefined): string | null => (validTaskId(toolUseId) ? toolUseId : validTaskId(taskId) ? taskId : null)

function find(tasks: BgTask[], line: { task_id?: string; tool_use_id?: string }): number {
  if (line.tool_use_id) { const i = tasks.findIndex((t) => t.toolUseId === line.tool_use_id || t.id === line.tool_use_id); if (i >= 0) return i }
  if (line.task_id) { const i = tasks.findIndex((t) => t.taskId === line.task_id || t.id === line.task_id); if (i >= 0) return i }
  return -1
}

/**
 * 끝난 것을 30개로 줄인다 — 도는 것은 다 남기고, 끝난 것은 **늦게 끝난 것부터** 남긴다. 차례(시작한 순서)는 그대로다.
 */
export function capTasks(tasks: BgTask[], max = TASK_HISTORY): BgTask[] {
  const fin = tasks.filter((t) => t.status !== 'run')
  if (fin.length <= max) return tasks
  const keep = new Set([...fin].sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt)).slice(0, max).map((t) => t.id))
  return tasks.filter((t) => t.status === 'run' || keep.has(t.id))
}

/** 한 줄을 넣거나 바꾼다(열쇠는 `id`) — 화면이 `task` 프레임을 받을 때도 같은 함수를 쓴다 */
export function upsertTask(tasks: BgTask[], t: BgTask, max = TASK_HISTORY): BgTask[] {
  const i = tasks.findIndex((x) => x.id === t.id)
  return capTasks(i >= 0 ? [...tasks.slice(0, i), t, ...tasks.slice(i + 1)] : [...tasks, t], max)
}

/**
 * 봇이 에이전트를 부른 순간(`tool_use Agent`) — CLI 의 시작 신호(`task_started`)를 기다리지 않고 줄을 먼저 세운다.
 * ⚠ 시작 신호를 안 주는 판·경로가 있어도 목록에서 빠지지 않게 하려는 것이다. `taskId` 는 신호가 오면 붙는다.
 */
export function startAgentTask(tasks: BgTask[], o: { toolUseId: string; name: string; subagentType?: string; bg?: boolean; cliSid?: string | null }, now: number): { tasks: BgTask[]; task: BgTask | null } {
  if (!validTaskId(o.toolUseId)) return { tasks, task: null }
  // 같은 호출 id 가 도는 중이면 그대로 둔다 — 끝난 줄에 같은 id 가 또 오면(재시도) 새로 시작한 것이다
  if (tasks.some((t) => t.id === o.toolUseId && t.status === 'run')) return { tasks, task: null }
  const task: BgTask = { id: o.toolUseId, toolUseId: o.toolUseId, kind: 'agent', name: clip(o.name, NAME_MAX) || '서브에이전트', ...(o.subagentType ? { subagentType: clip(o.subagentType, 60) } : {}), bg: !!o.bg, status: 'run', startedAt: now, tools: 0, ...(o.cliSid ? { cliSid: o.cliSid } : {}) }
  return { tasks: upsertTask(tasks, task), task }
}

/**
 * CLI 의 작업 줄 하나를 목록에 반영한다. 바뀐 줄만 `changed` 로 돌려준다(호스트가 그것만 화면에 보낸다).
 *
 * 🔴 `background_tasks_changed` 가 «아직 도는가» 의 정본이다 — 우리가 «도는 중» 으로 든 **백그라운드** 작업이 그 목록에 없으면
 *    끝난 것으로 닫는다(끝 알림을 놓쳐도 영영 «도는 중» 으로 남지 않게). 목록에만 있는 작업은 새로 세운다.
 * ⚠ 앞에서 도는 것(턴 안의 서브에이전트)은 그 목록에 없다 — 그래서 `bg` 인 것만 닫는다.
 * ⚠ 닫은 뒤에 끝 알림(`task_notification`)이 오면 그 말이 이긴다(멈춘 것인지 끝난 것인지는 알림이 안다).
 */
export function applyTaskLine(tasks: BgTask[], line: TaskLine, now: number, cliSid?: string | null): { tasks: BgTask[]; changed: BgTask[] } {
  const out = [...tasks]; const changed: BgTask[] = []
  const put = (i: number, t: BgTask) => { out[i] = t; changed.push(t) }
  if (line.subtype === 'background_tasks_changed') {
    const live = (line.tasks ?? []).filter((x) => validTaskId(x.task_id))
    const ids = new Set(live.map((x) => x.task_id as string))
    for (let i = 0; i < out.length; i++) {
      const t = out[i]
      if (t.status === 'run' && t.bg && t.taskId && !ids.has(t.taskId)) put(i, { ...t, status: 'done', endedAt: now })
      else if (t.status === 'run' && !t.bg && t.taskId && ids.has(t.taskId)) put(i, { ...t, bg: true })   // 돌던 것을 뒤로 보냈다
    }
    for (const x of live) {
      if (out.some((t) => t.taskId === x.task_id || t.id === x.task_id)) continue
      const t: BgTask = { id: x.task_id as string, taskId: x.task_id as string, kind: taskKindOf(x.task_type), name: clip(x.description, NAME_MAX) || '뒤에서 도는 일', ...(x.subagent_type ? { subagentType: clip(x.subagent_type, 60) } : {}), bg: true, status: 'run', startedAt: now, ...(cliSid ? { cliSid } : {}) }
      out.push(t); changed.push(t)
    }
    return { tasks: changed.length ? capTasks(out) : tasks, changed }
  }
  if (line.subtype !== 'task_started' && line.subtype !== 'task_updated' && line.subtype !== 'task_notification') return { tasks, changed }
  const i = find(out, line)
  if (line.subtype === 'task_started') {
    const taskId = validTaskId(line.task_id) ? line.task_id : undefined
    if (i < 0) {
      const id = rowIdOf(line.tool_use_id, line.task_id); if (!id) return { tasks, changed }
      const t: BgTask = { id, ...(taskId ? { taskId } : {}), kind: taskKindOf(line.task_type), name: clip(line.description, NAME_MAX) || '뒤에서 도는 일', ...(line.subagent_type ? { subagentType: clip(line.subagent_type, 60) } : {}), ...(validTaskId(line.tool_use_id) ? { toolUseId: line.tool_use_id } : {}), bg: !!line.is_backgrounded, status: 'run', startedAt: now, ...(cliSid ? { cliSid } : {}) }
      out.push(t); changed.push(t)
      return { tasks: capTasks(out), changed }
    }
    const t = out[i]
    const kind = taskKindOf(line.task_type)
    put(i, { ...t, ...(taskId ? { taskId } : {}), kind: kind === 'other' ? t.kind : kind, ...(line.subagent_type && !t.subagentType ? { subagentType: clip(line.subagent_type, 60) } : {}), bg: t.bg || !!line.is_backgrounded, ...(cliSid && !t.cliSid ? { cliSid } : {}) })
    return { tasks: out, changed }
  }
  if (i < 0) return { tasks, changed }
  const t = out[i]
  if (line.subtype === 'task_updated') {
    const st = taskStatusOf(line.patch?.status, false)
    const next: BgTask = { ...t }
    if (line.patch?.is_backgrounded && !t.bg) next.bg = true
    if (st && t.status === 'run') { next.status = st; next.endedAt = now }
    if (next.bg !== t.bg || next.status !== t.status) put(i, next)
    return { tasks: changed.length ? capTasks(out) : tasks, changed }
  }
  // task_notification — 진짜 끝. 이미 닫아 둔 줄이어도 상태와 요약은 이 줄이 정한다
  const st = taskStatusOf(line.status, true) ?? 'error'
  const keepStopped = t.status === 'stopped' && st !== 'done'   // 사람이 멈춘 것을 «실패» 로 덮지 않는다
  put(i, { ...t, status: keepStopped ? 'stopped' : st, endedAt: t.endedAt ?? now, ...(line.summary ? { summary: String(line.summary).slice(0, TASK_SUMMARY_MAX) } : {}) })
  return { tasks: capTasks(out), changed }
}

/**
 * 워커가 죽었거나 호스트가 다시 떴다 — «도는 중» 으로 남은 줄을 닫는다. 워커가 없으면 그 작업도 없다.
 * ⛔ 이것이 없으면 호스트를 다시 켠 뒤 죽은 작업이 영영 «도는 중» 으로 남는다(2026-09-13 «실행 중 · 도구 42회» 와 같은 고장).
 */
export function closeRunningTasks(tasks: BgTask[], now: number, note: string): { tasks: BgTask[]; changed: BgTask[] } {
  const changed: BgTask[] = []
  const out = tasks.map((t) => { if (t.status !== 'run') return t; const n: BgTask = { ...t, status: 'stopped', endedAt: now, summary: t.summary || note }; changed.push(n); return n })
  return { tasks: changed.length ? capTasks(out) : tasks, changed }
}

/** 화면의 두 묶음 — «도는 중» 은 시작한 순서대로, «끝남» 은 방금 끝난 것이 위로 */
export function groupTasks(tasks: readonly BgTask[]): { running: BgTask[]; finished: BgTask[] } {
  const running = tasks.filter((t) => t.status === 'run').sort((a, b) => a.startedAt - b.startedAt)
  const finished = tasks.filter((t) => t.status !== 'run').sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
  return { running, finished }
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { run: '도는 중', done: '끝남', stopped: '멈춤', error: '실패' }
export const TASK_KIND_LABEL: Record<TaskKind, string> = { agent: '에이전트', shell: '명령', other: '작업' }

/** 「1분 5초」 — 끝난 줄에 걸린 시간을 적는다. 1초 미만은 «1초 미만» */
export function taskTook(t: Pick<BgTask, 'startedAt' | 'endedAt'>, now: number): string {
  const ms = Math.max(0, (t.endedAt ?? now) - t.startedAt)
  const s = Math.floor(ms / 1000); if (s < 1) return '1초 미만'
  const m = Math.floor(s / 60); const h = Math.floor(m / 60)
  return h ? `${h}시간 ${m % 60}분` : m ? `${m}분 ${s % 60}초` : `${s}초`
}

/** 지금 멈출 수 있나 — 도는 중이고 CLI 의 작업 id 를 안다 */
export function canStopTask(t: Pick<BgTask, 'status' | 'taskId'>): boolean { return t.status === 'run' && !!t.taskId }

/* ── 서브에이전트가 쓴 글 (CLI 기록 파일에서) ─────────────────────────────────────────────────
   기록은 JSONL 이다. `type:"assistant"` 줄의 `message.content` 에서 `text` 블록만 모은다.
   파일이 수 MB 라서 통째로 읽지 않는다 — 호스트가 조각으로 읽어 `LineCutter` 에 넣고, 모은 글은 `TextTail` 이 끝에서부터 상한까지만 든다. */

/** 기록 한 줄(JSON 글자) → 그 줄의 글 블록들. 글이 아닌 줄·깨진 줄은 빈 배열 */
export function assistantTextsOf(raw: string): string[] {
  if (!raw || raw.length < 20 || !raw.includes('"assistant"')) return []
  let o: { type?: string; message?: { content?: unknown } }
  try { o = JSON.parse(raw) } catch { return [] }
  if (!o || o.type !== 'assistant') return []
  const c = o.message?.content
  if (typeof c === 'string') return c.trim() ? [c] : []
  if (!Array.isArray(c)) return []
  const out: string[] = []
  for (const b of c as { type?: string; text?: unknown }[]) if (b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push(b.text)
  return out
}

/**
 * 조각으로 들어오는 글을 줄로 자른다. 🔴 **한 줄이 `maxLine` 을 넘으면 그 줄은 버린다** — 큰 도구 결과가 한 줄에 수 MB 로
 * 실려 오는데, 그것을 통째로 쥐면 «상한 없이 메모리에 올리는» 것과 같다. 넘친 줄은 다음 줄바꿈까지 흘려 보낸다.
 */
export class LineCutter {
  private buf = ''
  private skipping = false
  /** 버린 줄 수 */
  dropped = 0
  constructor(private maxLine = 1_000_000) {}
  push(chunk: string): string[] {
    const out: string[] = []
    let from = 0
    for (;;) {
      const nl = chunk.indexOf('\n', from)
      if (nl < 0) {
        if (!this.skipping) { this.buf += chunk.slice(from); if (this.buf.length > this.maxLine) { this.buf = ''; this.skipping = true; this.dropped++ } }
        return out
      }
      if (this.skipping) this.skipping = false   // 버리던 줄이 여기서 끝난다
      else {
        const line = this.buf + chunk.slice(from, nl)
        if (line.length > this.maxLine) this.dropped++; else if (line) out.push(line)
      }
      this.buf = ''; from = nl + 1
    }
  }
  /** 파일 끝 — 줄바꿈 없이 남은 마지막 줄 */
  end(): string[] { const l = this.skipping ? '' : this.buf; this.buf = ''; this.skipping = false; return l ? [l] : [] }
}

/**
 * 끝에서부터 상한까지만 드는 글 묶음 — 개수(`maxCount`)와 글자 수(`maxChars`) 둘 다 넘지 않는다.
 * ⚠ 앞을 버리고 **끝을 남긴다** — 서브에이전트의 마지막 글이 곧 결과다. 한 덩이가 상한보다 크면 그 덩이의 끝만 남긴다.
 */
export class TextTail {
  private q: string[] = []
  private chars = 0
  private cut = false
  /** 지금까지 본 글 덩이 수(버린 것 포함) */
  total = 0
  constructor(private maxCount = 200, private maxChars = 400_000) {}
  push(text: string): void {
    this.total++
    let t = text
    if (t.length > this.maxChars) { t = '…' + t.slice(t.length - this.maxChars + 1); this.cut = true }
    this.q.push(t); this.chars += t.length
    while (this.q.length > this.maxCount || (this.chars > this.maxChars && this.q.length > 1)) { this.chars -= (this.q.shift() as string).length; this.cut = true }
  }
  result(): { texts: string[]; total: number; truncated: boolean } { return { texts: [...this.q], total: this.total, truncated: this.cut } }
}

/** 카드에 보일 결과 앞머리 — 600자(또는 12줄)까지. 넘치면 `more` 가 참이고 화면이 «전체 보기» 를 붙인다 */
export const RESULT_PREVIEW = 600
export function resultPreview(text: string | undefined, max = RESULT_PREVIEW, maxLines = 12): { text: string; more: boolean } {
  const full = (text ?? '').trim()
  let cut = full.length > max ? full.slice(0, max) : full
  const lines = cut.split('\n')
  if (lines.length > maxLines) cut = lines.slice(0, maxLines).join('\n')
  const more = cut.length < full.length
  return { text: more ? cut.replace(/\s+$/, '') + '…' : cut, more }
}

/** 에이전트 도구 결과의 꼬리(`agentId: …`)에서 작업 id 를 읽는다 — 시작 신호를 못 받은 경로의 보험 */
export function agentIdIn(text: string | undefined): string | undefined {
  const m = /(?:^|\n)\s*agentId:\s*([A-Za-z0-9][A-Za-z0-9_-]{2,79})\b/.exec(text ?? '')
  return m && validTaskId(m[1]) ? m[1] : undefined
}
