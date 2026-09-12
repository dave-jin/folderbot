import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { transition, shouldNotify } from '../core/stateMachine'
import { assistantText, itemId, toolSummary, touchedPath, type StreamLine } from '../core/chat'
import type { Bot, ChatItem, PermissionMode, PermissionRequest, SessionInfo, SessionState } from '../core/types'
import { atomicWrite, dataDir, ensureDir } from './paths'

/** 워커 env — 중첩 마커를 지우고, 설정된 장기 토큰이 있으면 넣는다 */
let oauthToken = ''
export function setOauthToken(t: string | undefined): void { oauthToken = (t ?? '').trim() }
export function cleanClaudeEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT)/.test(k)) delete env[k]
  if (oauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken
  // GUI 앱(Electron)에서 띄우면 셸 PATH 가 없다 — claude 가 부르는 node·git 이 보이게
  env.PATH = [env.PATH, '/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`].filter(Boolean).join(':')
  return env
}
export const AUTH_ERROR = /Failed to authenticate|Not logged in|Please run \/login|Login expired|OAuth session expired|Invalid authentication|authentication_error/i

export function claudeBin(override?: string): string {
  if (process.env.FOLDERBOT_CLI_BIN) return process.env.FOLDERBOT_CLI_BIN
  if (override) return override
  for (const p of [join(homedir(), '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']) if (existsSync(p)) return p
  return 'claude'
}

/** `~/.claude/projects/<slug>/<sid>.jsonl` 이 있는가 — 없으면 --resume 을 붙이지 않는다(무한 재시도 사고 방지) */
export function transcriptExists(cwd: string, sid: string): boolean {
  const roots = [process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, 'projects') : join(homedir(), '.claude', 'projects')]
  for (const base of roots) {
    if (!existsSync(base)) continue
    const slugs = new Set<string>()
    for (const form of [cwd, cwd.normalize('NFC'), cwd.normalize('NFD')]) slugs.add(form.replace(/[^a-zA-Z0-9]/g, '-'))
    for (const s of slugs) if (existsSync(join(base, s, `${sid}.jsonl`))) return true
    // 교차 디렉터리 조회(신형 CLI) — 전체 훑기
    try {
      for (const d of readdirSync(base)) if (existsSync(join(base, d, `${sid}.jsonl`))) return true
    } catch { /* skip */ }
  }
  return false
}

export interface SpawnSpec {
  cwd: string
  resume?: string | null
  permissionMode?: PermissionMode
  addDirs?: string[]
  mcpConfig?: string
  model?: string
  effort?: string
  name?: string
  appendSystemPrompt?: string
  bin?: string
}

/** Claude Code 상주 워커 (stream-json, 다중 턴, stdio 권한) */
export class ClaudeWorker extends EventEmitter {
  proc: ChildProcessWithoutNullStreams
  cliSessionId: string | null
  lastError = ''
  pending = new Map<string, PermissionRequest>()
  private deferredAsks = new Set<string>()
  private stderrBuf = ''

  constructor(spec: SpawnSpec) {
    super()
    this.cliSessionId = spec.resume ?? null
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-prompt-tool', 'stdio']
    if (spec.permissionMode && spec.permissionMode !== 'default') args.push('--permission-mode', spec.permissionMode)
    for (const d of spec.addDirs ?? []) args.push('--add-dir', d)
    if (spec.mcpConfig) args.push('--mcp-config', spec.mcpConfig)
    if (spec.model) args.push('--model', spec.model)
    if (spec.effort) args.push('--effort', spec.effort)
    if (spec.name) args.push('--name', spec.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60))
    if (spec.appendSystemPrompt) args.push('--append-system-prompt', spec.appendSystemPrompt)
    args.push('--settings', JSON.stringify({ crossSessionInbound: 'accept' }))
    if (spec.resume && transcriptExists(spec.cwd, spec.resume)) args.push('--resume', spec.resume)
    this.proc = spawn(claudeBin(spec.bin), args, { cwd: spec.cwd, env: cleanClaudeEnv() })
    this.proc.stderr.on('data', (d: Buffer) => { this.stderrBuf = (this.stderrBuf + d.toString()).slice(-4000); this.lastError = this.stderrBuf })
    this.proc.stdin.on('error', (e: Error) => { this.lastError = e.message })
    const rl = createInterface({ input: this.proc.stdout })
    rl.on('line', (raw) => this.onLine(raw))
    this.proc.on('exit', (code, signal) => this.emit('exit', code, signal, this.lastError))
    this.proc.on('error', (err) => { this.lastError = err.message; this.emit('exit', 1, null, err.message) })
  }
  private onLine(raw: string): void {
    let line: StreamLine & { request_id?: string; request?: Record<string, unknown>; response?: Record<string, unknown> }
    try { line = JSON.parse(raw) } catch { return }
    if (line.type === 'control_request') {
      const req = (line.request ?? {}) as Record<string, unknown>
      if (req.subtype === 'can_use_tool' && line.request_id) {
        const p: PermissionRequest = { requestId: line.request_id, toolName: String(req.tool_name ?? 'tool'), displayName: String(req.display_name ?? req.tool_name ?? 'tool'), description: String(req.description ?? ''), input: (req.input ?? {}) as Record<string, unknown>, suggestions: (req.permission_suggestions as unknown[]) ?? [], ask: req.tool_name === 'AskUserQuestion' }
        this.pending.set(p.requestId, p)
        this.emit('permission', p)
      }
      return
    }
    if (line.type === 'control_response') return
    if (line.session_id) this.cliSessionId = line.session_id
    if (line.type === 'result' && line.stop_reason === 'tool_deferred' && line.deferred_tool_use?.name === 'AskUserQuestion' && line.deferred_tool_use.id) {
      const d = line.deferred_tool_use
      const p: PermissionRequest = { requestId: d.id!, toolName: 'AskUserQuestion', displayName: 'AskUserQuestion', description: '', input: d.input ?? {}, suggestions: [], ask: true }
      this.deferredAsks.add(p.requestId); this.pending.set(p.requestId, p)
      this.emit('permission', p)
      return
    }
    this.emit('line', line)
  }
  private write(o: unknown): boolean {
    if (this.proc.exitCode !== null || this.proc.signalCode !== null || !this.proc.stdin.writable) return false
    try { this.proc.stdin.write(JSON.stringify(o) + '\n'); return true } catch { return false }
  }
  send(text: string): boolean {
    return this.write({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })
  }
  respondPermission(requestId: string, allow: boolean, always = false): void {
    const p = this.pending.get(requestId); this.pending.delete(requestId)
    if (this.deferredAsks.delete(requestId)) {
      this.write({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: requestId, is_error: true, content: '사용자가 질문을 취소했습니다. 반복하지 말고 진행하세요.' }] } })
      return
    }
    const inner = allow ? { behavior: 'allow', updatedInput: p?.input ?? {}, ...(always && p && p.suggestions.length ? { updatedPermissions: p.suggestions } : {}) } : { behavior: 'deny', message: '사용자가 Folder Bot 에서 거부했습니다' }
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: inner } })
  }
  respondAsk(requestId: string, answers: Record<string, string>): void {
    const p = this.pending.get(requestId); this.pending.delete(requestId)
    if (this.deferredAsks.delete(requestId)) {
      this.write({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: requestId, content: JSON.stringify(answers) }] } })
      return
    }
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { behavior: 'allow', updatedInput: { ...(p?.input ?? {}), answers } } } })
  }
  interrupt(): void { this.write({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } }) }
  kill(): void { try { this.proc.kill('SIGTERM') } catch { /* */ } setTimeout(() => { try { this.proc.kill('SIGKILL') } catch { /* */ } }, 4000).unref() }
  get alive(): boolean { return this.proc.exitCode === null && this.proc.signalCode === null }
}

/** 세션 하나의 정본 (호스트가 소유) */
export interface SessionRec {
  id: string
  botId: string
  name: string
  cwd: string
  cliSessionId: string | null
  state: SessionState
  createdAt: number
  lastActivity: number
  items: ChatItem[]
  lastError?: string
  routine?: string
  permissionMode?: PermissionMode
  model?: string
  effort?: string
  activity?: string
  turnStartedAt?: number
}

export interface ManagerEvents {
  state: (s: SessionRec, prev: SessionState, notify: boolean) => void
  chat: (sessionId: string, item: ChatItem, replace: boolean) => void
  activity: (s: SessionRec) => void
  permission: (s: SessionRec, req: PermissionRequest) => void
  sessions: (botId: string) => void
  files: (botId: string) => void
}

export class SessionManager extends EventEmitter {
  private recs = new Map<string, SessionRec>()
  private workers = new Map<string, ClaudeWorker>()
  private streaming = new Map<string, ChatItem & { kind: 'assistant' }>()
  private dir = ensureDir(join(dataDir(), 'sessions'))
  idleTtlMs = 60 * 60 * 1000
  mcpUrl: (sid: string, botId: string) => string | undefined = () => undefined
  systemPromptFor: (bot: Bot) => string = () => ''
  bin?: string
  /** 새 세션이 물려받는 기본값 — 기존 세션은 만들 때의 값을 유지한다 */
  defaults: { model?: string; effort?: string } = {}

  constructor() {
    super()
    for (const f of readdirSync(this.dir).filter((f) => f.endsWith('.json'))) {
      try {
        const r = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as SessionRec
        if (r.state === 'running' || r.state === 'awaiting_input') r.state = 'idle' // 호스트가 다시 뜨면 워커는 없다
        this.recs.set(r.id, r)
      } catch { /* skip */ }
    }
    setInterval(() => this.reclaim(), 60_000).unref()
  }

  list(botId?: string): SessionInfo[] {
    return [...this.recs.values()].filter((r) => !botId || r.botId === botId).sort((a, b) => b.lastActivity - a.lastActivity).map((r) => this.info(r))
  }
  info(r: SessionRec): SessionInfo {
    const w = this.workers.get(r.id)
    return { id: r.id, botId: r.botId, name: r.name, state: r.state, cliSessionId: r.cliSessionId, createdAt: r.createdAt, lastActivity: r.lastActivity, alive: !!w?.alive, hibernated: !w && !!r.cliSessionId, pending: w ? [...w.pending.values()] : [], lastError: r.lastError, routine: r.routine, activity: r.activity, turnStartedAt: r.turnStartedAt, model: r.model, effort: r.effort }
  }
  get(id: string): SessionRec | undefined { return this.recs.get(id) }
  items(id: string): ChatItem[] { return this.recs.get(id)?.items ?? [] }

  create(bot: Bot, name: string, opts: { permissionMode?: PermissionMode; model?: string; effort?: string; routine?: string } = {}): SessionRec {
    const id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const r: SessionRec = { id, botId: bot.id, name, cwd: bot.repo ?? bot.abs, cliSessionId: null, state: 'idle', createdAt: Date.now(), lastActivity: Date.now(), items: [], routine: opts.routine, permissionMode: opts.permissionMode, model: opts.model ?? this.defaults.model, effort: opts.effort ?? this.defaults.effort }
    this.recs.set(id, r)
    this.persist(r)
    this.emit('sessions', bot.id)
    return r
  }
  remove(id: string): void {
    this.workers.get(id)?.kill(); this.workers.delete(id)
    const r = this.recs.get(id); this.recs.delete(id)
    try { const f = join(this.dir, `${id}.json`); if (existsSync(f)) atomicWrite(f, JSON.stringify({ ...r, deleted: true })) } catch { /* */ }
    if (r) this.emit('sessions', r.botId)
  }
  rename(id: string, name: string): void { const r = this.recs.get(id); if (!r) return; r.name = name; this.persist(r); this.emit('sessions', r.botId) }

  private persist(r: SessionRec): void {
    const slim = { ...r, items: r.items.slice(-1500) }
    atomicWrite(join(this.dir, `${r.id}.json`), JSON.stringify(slim))
  }
  private push(r: SessionRec, item: ChatItem, replace = false): void {
    if (replace) {
      const i = r.items.findIndex((x) => x.id === item.id)
      if (i >= 0) r.items[i] = item; else r.items.push(item)
    } else r.items.push(item)
    r.lastActivity = Date.now()
    this.emit('chat', r.id, item, replace)
  }
  private setState(r: SessionRec, ev: Parameters<typeof transition>[1]): void {
    const prev = r.state
    const next = transition(prev, ev)
    if (next === prev) return
    r.state = next
    this.persist(r)
    this.emit('state', r, prev, shouldNotify(prev, next))
  }

  /** 워커 확보 — 없으면 (같은 cli 세션 id 로) 띄운다 */
  ensureWorker(r: SessionRec, bot: Bot): ClaudeWorker {
    const existing = this.workers.get(r.id)
    if (existing?.alive) return existing
    const w = new ClaudeWorker({ cwd: r.cwd, resume: r.cliSessionId, permissionMode: r.permissionMode, addDirs: bot.repo ? [bot.abs] : undefined, mcpConfig: this.mcpUrl(r.id, bot.id), model: r.model, effort: r.effort, name: `${bot.name}-${r.name}`, appendSystemPrompt: this.systemPromptFor(bot) || undefined, bin: this.bin })
    this.workers.set(r.id, w)
    w.on('line', (line: StreamLine) => this.onLine(r, line))
    w.on('permission', (p: PermissionRequest) => { this.setState(r, { kind: 'permission_requested' }); this.emit('permission', r, p) })
    w.on('exit', (code: number | null, _sig: string | null, err: string) => {
      if (this.workers.get(r.id) === w) this.workers.delete(r.id)
      if (w.cliSessionId) r.cliSessionId = w.cliSessionId
      if (code !== 0 && code !== 143 && code !== 137 && code !== null) {
        r.lastError = (err || `exit ${code}`).trim().slice(-600)
        const authErr = AUTH_ERROR.test(r.lastError)
        this.push(r, { id: itemId('e'), t: Date.now(), kind: 'system', text: authErr ? 'Claude 로그인이 필요해요 — 미니에서 claude → /login, 또는 설정 › Claude 토큰' : `세션을 못 띄웠어요 · ${r.lastError.split('\n').pop() ?? ''}` })
        if (authErr) this.emit('auth-error', r)
      }
      this.setState(r, { kind: 'process_exited', code })
      this.emit('sessions', r.botId)
    })
    this.emit('sessions', r.botId)
    return w
  }
  private thinking = new Map<string, ChatItem & { kind: 'thinking' }>()
  private activityAt = new Map<string, number>()
  /** «지금 하는 일» 한 줄 — 0.4초에 한 번만 밖으로 (토큰마다 쏘지 않는다) */
  private setActivity(r: SessionRec, text: string, force = false): void {
    r.activity = text
    const last = this.activityAt.get(r.id) ?? 0
    if (!force && Date.now() - last < 400) return
    this.activityAt.set(r.id, Date.now())
    this.emit('activity', r)
  }
  private subOf(r: SessionRec, parentId: string | null | undefined): (ChatItem & { kind: 'subagent' }) | undefined {
    if (!parentId) return undefined
    // 같은 id 가 두 번 올 수 있으니(재시도·스텁) 뒤에서부터 찾는다
    for (let i = r.items.length - 1; i >= 0; i--) { const it = r.items[i]; if (it.id === `t_${parentId}`) return it.kind === 'subagent' ? it : undefined }
    return undefined
  }
  private onLine(r: SessionRec, line: StreamLine): void {
    if (line.session_id && r.cliSessionId !== line.session_id) { r.cliSessionId = line.session_id; this.persist(r) }
    if (line.type === 'system' && line.subtype === 'init') return
    const parent = line.parent_tool_use_id ?? null
    if (line.type === 'stream_event') {
      const ev = line.event as { type?: string; delta?: { type?: string; text?: string; thinking?: string }; index?: number } | undefined
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && !parent) {
        let cur = this.streaming.get(r.id)
        if (!cur) { cur = { id: itemId('a'), t: Date.now(), kind: 'assistant', text: '', streaming: true }; this.streaming.set(r.id, cur); r.items.push(cur) }
        cur.text += ev.delta.text ?? ''
        this.emit('chat', r.id, cur, true)
        this.setActivity(r, '답 쓰는 중')
      } else if (ev?.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta' && !parent) {
        let th = this.thinking.get(r.id)
        if (!th) { th = { id: itemId('th'), t: Date.now(), kind: 'thinking', text: '', streaming: true }; this.thinking.set(r.id, th); r.items.push(th) }
        th.text += ev.delta.thinking ?? ''
        if (th.text.length % 40 < 8) this.emit('chat', r.id, th, true)
        this.setActivity(r, `생각 중 · ${th.text.slice(-90).replace(/\s+/g, ' ')}`)
      }
      this.setState(r, { kind: 'stream_activity' })
      return
    }
    if (line.type === 'assistant') {
      const sub = this.subOf(r, parent)
      const text = assistantText(line)
      if (!parent) {
        const th = this.thinking.get(r.id); if (th) { th.streaming = false; this.thinking.delete(r.id); this.push(r, th, true) }
        for (const b of line.message?.content ?? []) if (b.type === 'thinking' && typeof b.thinking === 'string' && !th) this.push(r, { id: itemId('th'), t: Date.now(), kind: 'thinking', text: String(b.thinking) })
        const cur = this.streaming.get(r.id)
        if (text) {
          if (cur) { cur.text = text; cur.streaming = false; this.streaming.delete(r.id); this.push(r, cur, true) }
          else this.push(r, { id: itemId('a'), t: Date.now(), kind: 'assistant', text })
        }
      } else if (sub && text) { sub.last = text.slice(0, 80).replace(/\s+/g, ' '); this.push(r, sub, true) }
      const touched: string[] = []
      for (const b of line.message?.content ?? []) {
        if (b.type !== 'tool_use') continue
        const name = String(b.name ?? 'tool'); const input = (b.input ?? {}) as Record<string, unknown>; const id = `t_${String(b.id ?? itemId('t'))}`
        if (name === 'TodoWrite' && !parent) {
          const todos = Array.isArray(input.todos) ? (input.todos as { content?: string; status?: string; activeForm?: string }[]) : []
          this.push(r, { id: `todos_${r.id}`, t: Date.now(), kind: 'todos', items: todos.map((x) => ({ content: String(x.content ?? ''), status: (x.status === 'completed' || x.status === 'in_progress' ? x.status : 'pending'), activeForm: x.activeForm ? String(x.activeForm) : undefined })) }, true)
          continue
        }
        if ((name === 'Task' || name === 'Agent') && !parent) {
          this.push(r, { id, t: Date.now(), kind: 'subagent', name: toolSummary(name, input) || '서브에이전트', prompt: typeof input.prompt === 'string' ? input.prompt : '', tools: 0, last: '', status: 'run' })
          this.setActivity(r, `에이전트 · ${toolSummary(name, input)}`, true)
          continue
        }
        this.push(r, { id, t: Date.now(), kind: 'tool', name, summary: toolSummary(name, input), input, parentId: sub ? sub.id : undefined })
        if (sub) { sub.tools += 1; sub.last = `${name} ${toolSummary(name, input)}`.slice(0, 80); this.push(r, sub, true) }
        this.setActivity(r, `${sub ? `${sub.name} › ` : ''}${name} · ${toolSummary(name, input)}`.slice(0, 120), true)
        const tp = touchedPath(name, input); if (tp) touched.push(tp)
      }
      if (touched.length) { this.push(r, { id: itemId('f'), t: Date.now(), kind: 'files', paths: touched }); this.emit('files', r.botId) }
      this.setState(r, { kind: 'stream_activity' })
      return
    }
    if (line.type === 'user') {
      for (const b of line.message?.content ?? []) {
        if (b.type !== 'tool_result') continue
        const id = `t_${String(b.tool_use_id ?? '')}`
        let it: ChatItem | undefined; for (let i = r.items.length - 1; i >= 0; i--) if (r.items[i].id === id) { it = r.items[i]; break }
        const c = b.content
        const resText = (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x as { text?: string }).text ?? '').join('\n') : '').slice(0, 2000)
        if (it && it.kind === 'tool') { it.result = resText; it.isError = !!b.is_error; this.push(r, it, true) }
        else if (it && it.kind === 'subagent') { it.status = b.is_error ? 'error' : 'done'; it.result = resText; this.push(r, it, true) }
      }
      return
    }
    if (line.type === 'result') {
      if (parent) return
      const cur = this.streaming.get(r.id); if (cur) { cur.streaming = false; this.streaming.delete(r.id); this.push(r, cur, true) }
      const th = this.thinking.get(r.id); if (th) { th.streaming = false; this.thinking.delete(r.id); this.push(r, th, true) }
      for (const it of r.items) if (it.kind === 'subagent' && it.status === 'run') { it.status = 'done'; this.push(r, it, true) }
      this.push(r, { id: itemId('r'), t: Date.now(), kind: 'result', ok: !line.is_error, durationMs: line.duration_ms ?? 0, costUsd: line.total_cost_usd, error: line.is_error ? String(line.error ?? line.result ?? '') : undefined })
      this.setActivity(r, '', true)
      this.setState(r, { kind: 'result_received', isError: !!line.is_error })
      this.persist(r)
    }
  }

  send(r: SessionRec, bot: Bot, text: string): void {
    const w = this.ensureWorker(r, bot)
    this.push(r, { id: itemId('u'), t: Date.now(), kind: 'user', text })
    w.send(text)
    if (r.state !== 'running') r.turnStartedAt = Date.now()
    this.setActivity(r, '시작하는 중', true)
    this.setState(r, { kind: 'user_sent' })
    this.persist(r)
  }
  respondPermission(r: SessionRec, requestId: string, allow: boolean, always = false): void {
    const w = this.workers.get(r.id); if (!w) return
    w.respondPermission(requestId, allow, always)
    this.push(r, { id: itemId('s'), t: Date.now(), kind: 'system', text: allow ? (always ? '항상 허용' : '허용') : '거부' })
    this.setState(r, { kind: 'input_provided' })
  }
  respondAsk(r: SessionRec, requestId: string, answers: Record<string, string>): void {
    const w = this.workers.get(r.id); if (!w) return
    w.respondAsk(requestId, answers)
    this.push(r, { id: itemId('s'), t: Date.now(), kind: 'user', text: Object.values(answers).join(' · ') })
    this.setState(r, { kind: 'input_provided' })
  }
  interrupt(r: SessionRec): void { this.workers.get(r.id)?.interrupt() }
  acknowledge(r: SessionRec): void { this.setState(r, { kind: 'acknowledged' }) }
  pendingOf(id: string): PermissionRequest[] { return [...(this.workers.get(id)?.pending.values() ?? [])] }

  /** 절전 — 유휴 TTL 넘긴 워커를 내린다(기록·id 유지) */
  private reclaim(): void {
    const now = Date.now()
    for (const [id, w] of this.workers) {
      const r = this.recs.get(id); if (!r) continue
      if (w.pending.size) continue
      if (r.state === 'running' || r.state === 'awaiting_input') continue
      if (now - r.lastActivity > this.idleTtlMs) { w.kill(); this.workers.delete(id); this.emit('sessions', r.botId) }
    }
  }
  hibernate(id: string): void { const w = this.workers.get(id); if (w) { w.kill(); this.workers.delete(id) } const r = this.recs.get(id); if (r) this.emit('sessions', r.botId) }
  stopAll(): void { for (const w of this.workers.values()) w.kill() }
  liveCount(): number { return [...this.workers.values()].filter((w) => w.alive).length }
  liveCountFor(botId: string): number { return [...this.workers.entries()].filter(([id, w]) => w.alive && this.recs.get(id)?.botId === botId).length }
}

export function statBotDir(abs: string): boolean { try { return statSync(abs).isDirectory() } catch { return false } }
export { mkdirSync }
