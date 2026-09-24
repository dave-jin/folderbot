import { withClient, type ClientCtx } from '../core/clientCtx'
import { providerBin } from './providers'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { transition, shouldNotify } from '../core/stateMachine'
import { assistantText, closeOpenItems, contextOf, itemId, modelOf, toolSummary, touchedPath, type StreamLine } from '../core/chat'
import { CodexWorker } from './codex'
import { fitsProvider, modelParts, sameModel } from '../core/agents'
import { CODEX_LOCAL, parseLocalSlash } from '../core/slashLocal'
import { isAutoSessionName, titleFromText } from '../core/sessionTitle'
import { isModelRejected } from '../core/codexMap'
import { autoAllows, fallbackRules, rulesLabel } from '../core/permPolicy'
import type { Bot, ChatItem, PermissionMode, PermissionRequest, SessionInfo, SessionState } from '../core/types'
import { atomicWrite, dataDir, ensureDir } from './paths'

/**
 * 워커 env — 중첩 마커를 지우고, **필요할 때만** 장기 토큰을 넣는다.
 *
 * 🔴 **키체인 로그인이 있으면 토큰을 안 넣는다** (2026-09-13 Dave 보고 — Akiflow MCP 가 안 뜸).
 *    `CLAUDE_CODE_OAUTH_TOKEN` 이 있으면 CLI 는 «다른 인증 소스가 우선» 으로 판정해
 *    **claude.ai 커넥터(MCP) 로딩을 통째로 건너뛴다**. 게다가 `claude setup-token` 토큰의 스코프는
 *    `user:inference user:profile` 뿐이라 `user:mcp_servers` 가 없어, 그 단계를 넘어도 못 쓴다.
 *    → GUI 앱(Folder Bot.app)은 키체인을 읽을 수 있으므로, 읽히면 **그쪽이 낫다**.
 * ⚠ 토큰은 «키체인을 못 읽는 자리»(SSH·launchd 로 띄운 미니)를 위한 **보험**으로 남는다 —
 *    그 자리에서는 `keychain` 이 거짓이라 자동으로 토큰이 다시 들어간다.
 * ⛔ 이 판정을 워커마다 다시 계산하지 마라 — `host.refreshAuth()` 한 곳이 정하고 여기에 알려 준다.
 *    두 곳이 각자 물어보면 «어떤 세션은 커넥터가 뜨고 어떤 세션은 안 뜨는» 상태가 된다.
 */
let oauthToken = ''
let keychainOk = false
export function setOauthToken(t: string | undefined): void { oauthToken = (t ?? '').trim() }
export function setKeychainLogin(ok: boolean): void { keychainOk = ok }
export function cleanClaudeEnv(opts: { noToken?: boolean } = {}): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT)/.test(k)) delete env[k]
  if (oauthToken && !keychainOk && !opts.noToken) env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken
  // GUI 앱(Electron)에서 띄우면 셸 PATH 가 없다 — claude 가 부르는 node·git 이 보이게
  env.PATH = [env.PATH, '/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`].filter(Boolean).join(':')
  return env
}
export const AUTH_ERROR = /Failed to authenticate|Not logged in|Please run \/login|Login expired|OAuth session expired|Invalid authentication|authentication_error/i

/**
 * 🔴 **AT · 턴을 띄우는 claude 는 목록을 만든 claude 와 같다** (2026-09-25 Dave: *«무조건 모델이나 실행환경에서의
 *    claude 버전만 확인하면 되는거 아니야?»*).
 * 종전에는 여기에 **따로** 「먼저 있는 경로」(`~/.local` → brew → `/usr/local`) 훑기가 있었다. AL 에서 목록 쪽
 * (`providers`)만 「가장 새 판」으로 고쳐서, **목록은 새 판(2.1.281)을 보고 Opus 5.5 를 내주는데 턴은 낡은
 * 판(2.1.278)으로 띄우는** 갈림이 생겼다 — 미니에서 난 `400 · does not support this model` 의 정체다.
 * ⇒ 고르는 곳은 `providers` 하나다. 여기서 다시 고르지 않는다. 사람이 정해 준 경로(환경변수·설정)만 먼저 이긴다.
 */
export function claudeBin(override?: string): string {
  if (process.env.FOLDERBOT_CLI_BIN) return process.env.FOLDERBOT_CLI_BIN
  if (override) return override
  return providerBin('claude') ?? 'claude'
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
        const p: PermissionRequest = { requestId: line.request_id, toolName: String(req.tool_name ?? 'tool'), displayName: String(req.display_name ?? req.tool_name ?? 'tool'), description: String(req.description ?? ''), input: (req.input ?? {}) as Record<string, unknown>, suggestions: [], ask: req.tool_name === 'AskUserQuestion' }
        // CLI 제안이 비면(복합 Bash) 호스트가 만든다 — «이 세션에서 항상 허용» 이 항상 있어야 한다(core/permPolicy)
        const sugg = (req.permission_suggestions as unknown[] | undefined) ?? []
        p.suggestions = sugg.length ? sugg : fallbackRules(p.toolName, p.input)
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
  /** @returns 미뤄진 질문에 **우리가 직접** 결과를 넣었으면 true — claude 가 되돌려 주지 않으니 화면 줄은 우리가 닫아야 한다(AX) */
  respondPermission(requestId: string, allow: boolean, always = false): boolean {
    const p = this.pending.get(requestId); this.pending.delete(requestId)
    if (this.deferredAsks.delete(requestId)) {
      this.write({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: requestId, is_error: true, content: '사용자가 질문을 취소했습니다. 반복하지 말고 진행하세요.' }] } })
      return true
    }
    const inner = allow ? { behavior: 'allow', updatedInput: p?.input ?? {}, ...(always && p && p.suggestions.length ? { updatedPermissions: p.suggestions } : {}) } : { behavior: 'deny', message: '사용자가 Folder Bot 에서 거부했습니다' }
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: inner } })
    return false
  }
  /** @returns 미뤄진 질문에 우리가 직접 답을 넣었으면 true(AX) */
  respondAsk(requestId: string, answers: Record<string, string>): boolean {
    const p = this.pending.get(requestId); this.pending.delete(requestId)
    if (this.deferredAsks.delete(requestId)) {
      this.write({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: requestId, content: JSON.stringify(answers) }] } })
      return true
    }
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: { behavior: 'allow', updatedInput: { ...(p?.input ?? {}), answers } } } })
    return false
  }
  interrupt(): void { this.write({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } }) }
  kill(): void { try { this.proc.kill('SIGTERM') } catch { /* */ } setTimeout(() => { try { this.proc.kill('SIGKILL') } catch { /* */ } }, 4000).unref() }
  get alive(): boolean { return this.proc.exitCode === null && this.proc.signalCode === null }
}

/** 워커 — Claude 든 Codex 든 세션 층이 쓰는 것은 이만큼뿐이다 */
export type Worker = ClaudeWorker | CodexWorker

/** 세션 하나의 정본 (호스트가 소유) */
export interface SessionRec {
  /** J · 마지막 메시지가 온 기기 — rondo_open/reveal 이 그 기기에만 간다 */
  lastClient?: ClientCtx
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
  /** 이 세션을 도는 에이전트 — 없으면 봇의 것. 벤더는 폴더가 아니라 세션의 성질이다 */
  vendor?: 'claude' | 'codex'
  model?: string
  effort?: string
  activity?: string
  /** AB · 지금 돌고 있는 도구 한 개 — 「남을 기다리는 중」 판정의 단서 (판정은 `core/waiting`) */
  inflight?: { name: string; summary?: string; since: number }
  turnStartedAt?: number
  ctx?: { used: number; window: number }
  restartPending?: boolean
  /** 이 턴에 파일을 썼나 — 턴 끝에 «파일 바뀜» 을 한 번 더 알리는 안전망용 */
  wroteThisTurn?: boolean
  /** 모델 거절로 한 번 다시 보냈나 — 두 번은 안 한다 */
  modelRetried?: boolean
  /** CLI init 이 알려준 슬래시 명령 이름들 */
  slash?: string[]
  /** 사람이 직접 지은 이름인가 — 그렇다면 자동 제목이 덮지 않는다 */
  named?: boolean
  /** S · 마지막으로 봇이 낸 말의 시각 (`core/unread`) */
  lastReplyAt?: number
  /** S · 사람이 맨 아래까지 봤다고 적은 시각 — 볼트에 남아 폰·맥이 같은 값을 본다 */
  readAt?: number
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
  private workers = new Map<string, Worker>()
  private streaming = new Map<string, ChatItem & { kind: 'assistant' }>()
  /**
   * 「파일 전후 diff」(루프 6/10) — 도구가 파일을 **건드리기 전** 의 글을 세션마다 붙잡아 둔다.
   * 🔴 **«전» 은 봇이 마지막으로 본 내용이다** — `tool_use` 가 도착한 순간에 디스크를 읽으면 늦을 수 있다.
   *    CLI 는 줄을 흘리고 **곧바로** 도구를 돌리므로(스텁은 같은 틱에 쓴다 · 실측: 전 = 후) 경주가 된다.
   *    대신 Claude Code 의 규칙을 탄다 — **있는 파일은 Read 한 뒤에만 Write·Edit 할 수 있다.** 그래서
   *    Read 가 도착할 때 디스크를 읽어 `seen` 에 두고(그때는 아무도 안 고친다), 고치는 도구가 오면 그걸 «전» 으로 삼는다.
   *    `seen` 에 없는 파일에 Write 가 오면 **새 파일**(null)이다 — 디스크를 읽지 않는다(읽으면 경주에 진다).
   *    고친 뒤(tool_result)에는 디스크를 다시 읽어 `seen` 을 갱신한다 — 다음 턴의 «전» 이다.
   * ⚠ 한 턴 안에서는 첫 손댐만 «전» 이다 — Edit 를 다섯 번 해도 사람이 보고 싶은 것은 «턴 전 ↔ 지금» 이다.
   * ⚠ 메모리에만 산다(세션당 60개 · 2MB 넘는 파일은 안 잡는다) — 호스트를 다시 켜면 «전을 모른다» 고 답한다.
   */
  private befores = new Map<string, Map<string, { text: string | null; turn: number }>>()
  private seen = new Map<string, Map<string, string | null>>()
  private turnAt = new Map<string, number>()
  private dir = ensureDir(join(dataDir(), 'sessions'))
  idleTtlMs = 60 * 60 * 1000
  mcpUrl: (sid: string, botId: string) => string | undefined = () => undefined
  systemPromptFor: (bot: Bot) => string = () => ''
  bin?: string
  /** 새 세션이 물려받는 기본값 — 기존 세션은 만들 때의 값을 유지한다 */
  /**
   * 새 세션의 기본값 — 🔴 **벤더마다 따로 둔다.** 하나로 두면 Codex 세션이 `claude-opus-5` 로 떠서
   *    그 자리에서 죽는다(이름 체계가 다르다 · core/agents.ts).
   */
  defaults: Record<'claude' | 'codex', { model?: string; effort?: string }> = { claude: {}, codex: {} }
  /** Codex 는 우리가 승인 화면을 못 띄운다 — 이 값이 곧 권한 정책이다(codex.ts 머리말) */
  codexSandbox: 'read-only' | 'workspace-write' | 'danger-full-access' = 'read-only'
  openaiApiKey?: string
  /** Claude 새 세션의 기본 권한 모드 — 만들 때 값을 안 주면 이걸 쓴다(설정 › Claude). Codex 는 샌드박스가 그 자리다 */
  defaultPermissionMode?: PermissionMode

  constructor() {
    super()
    for (const f of readdirSync(this.dir).filter((f) => f.endsWith('.json'))) {
      try {
        const r = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as SessionRec & { deleted?: boolean }
        // 🔴 지운 세션은 되살리지 않는다 — remove() 가 «지웠다» 표식을 남기는데 종전에는 그걸 안 읽어
        //    호스트를 다시 띄우면 삭제한 세션이 목록에 그대로 돌아왔다 (2026-09-13)
        if (r.deleted) continue
        if (r.state === 'running' || r.state === 'awaiting_input') r.state = 'idle' // 호스트가 다시 뜨면 워커는 없다
        if (closeOpenItems(r.items, 'restore').length) atomicWrite(join(this.dir, f), JSON.stringify({ ...r, items: r.items.slice(-1500) })) // 스피너로 남은 항목도 함께 마감
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
    return { id: r.id, botId: r.botId, name: r.name, vendor: r.vendor, state: r.state, cliSessionId: r.cliSessionId, createdAt: r.createdAt, lastActivity: r.lastActivity, inflight: r.inflight, lastReplyAt: r.lastReplyAt, readAt: r.readAt, alive: !!w?.alive, hibernated: !w && !!r.cliSessionId, bg: r.items.filter((it) => it.kind === 'subagent' && it.bg && it.status === 'run').length, pending: w ? [...w.pending.values()] : [], lastError: r.lastError, routine: r.routine, activity: r.activity, turnStartedAt: r.turnStartedAt, model: r.model, effort: r.effort, permissionMode: r.permissionMode, ctx: r.ctx, restartPending: r.restartPending }
  }
  get(id: string): SessionRec | undefined { return this.recs.get(id) }
  /** 볼트 전체의 세션 기록 — 「지난 대화 찾기」 가 훑는다(읽기만) */
  all(): SessionRec[] { return [...this.recs.values()] }
  /** 「전」 — `undefined` = 모른다(호스트 재시작·상한 밖) · `null` = 그때는 파일이 없었다 */
  before(sid: string, abs: string): string | null | undefined { return this.befores.get(sid)?.get(abs)?.text }
  private seenOf(r: SessionRec): Map<string, string | null> { let m = this.seen.get(r.id); if (!m) { m = new Map(); this.seen.set(r.id, m) } return m }
  private diskText(abs: string): string | null {
    try { if (!existsSync(abs)) return null; const st = statSync(abs); return st.size > 2_000_000 ? null : readFileSync(abs, 'utf8') } catch { return null }
  }
  private captureBefore(r: SessionRec, abs: string, tool: string): void {
    const turn = this.turnAt.get(r.id) ?? 0
    let m = this.befores.get(r.id); if (!m) { m = new Map(); this.befores.set(r.id, m) }
    const had = m.get(abs); if (had && had.turn === turn) return
    if (!had && m.size >= 60) return
    const seen = this.seenOf(r)
    // Write 를 Read 없이 한다 = 새 파일(규칙) · Edit 을 Read 없이 한다 = 호스트가 다시 켜진 뒤(디스크가 최선)
    const text = seen.has(abs) ? seen.get(abs) ?? null : tool === 'Write' ? null : this.diskText(abs)
    m.set(abs, { text, turn })
  }
  items(id: string): ChatItem[] { return this.recs.get(id)?.items ?? [] }

  create(bot: Bot, name: string, opts: { permissionMode?: PermissionMode; model?: string; effort?: string; routine?: string; vendor?: 'claude' | 'codex' } = {}): SessionRec {
    const id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const r: SessionRec = { id, botId: bot.id, name, cwd: bot.repo ?? bot.abs, cliSessionId: null, state: 'idle', createdAt: Date.now(), lastActivity: Date.now(), items: [], routine: opts.routine, permissionMode: opts.permissionMode ?? ((opts.vendor ?? bot.vendor) === 'codex' ? undefined : this.defaultPermissionMode), vendor: opts.vendor ?? bot.vendor, model: opts.model ?? this.defaults[opts.vendor ?? bot.vendor].model, effort: opts.effort ?? this.defaults[opts.vendor ?? bot.vendor].effort }
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
  /** ⚠ 사람이 지은 이름은 **표시를 남긴다** — 그래야 첫 말 자동 제목이 이걸 안 덮는다 */
  /**
   * S · 여기까지 읽었다 — 화면이 **맨 아래에 닿고 턴이 끝났을 때** 부른다(`core/unread.shouldMarkRead`).
   * ⚠ 읽은 지점은 «지금» 이 아니라 **그 세션의 마지막 답 시각**으로 적는다. «지금» 으로 적으면 읽는 사이에 온 답까지
   *   읽은 것이 돼 버린다(시계가 아니라 내용을 가리켜야 한다).
   */
  markRead(id: string, at?: number): SessionRec | undefined {
    const r = this.recs.get(id); if (!r) return undefined
    const next = at ?? r.lastReplyAt ?? Date.now()
    if ((r.readAt ?? 0) >= next) return r
    r.readAt = next; this.persist(r); this.emit('sessions', r.botId)
    return r
  }
  /**
   * 🔴 **AV · 이 봇의 모든 세션을 읽음으로** (2026-09-25 Dave 승인: 「모두 읽음」 단추).
   *    봇 줄의 더블링은 **세션 하나라도** 안 읽었으면 켜지는데, 어느 세션인지 찾아 끝까지 내려야만 풀렸다.
   * ⚠ 읽은 지점은 각 세션의 **마지막 답 시각**으로 적는다(`markRead` 와 같은 원칙) — 누르는 사이 온 답까지 삼키지 않는다.
   * @returns 새로 읽음이 된 세션 수
   */
  readAll(botId: string): number {
    let n = 0
    for (const r of this.recs.values()) {
      if (r.botId !== botId || !r.lastReplyAt || (r.readAt ?? 0) >= r.lastReplyAt) continue
      r.readAt = r.lastReplyAt; this.persist(r); n++
    }
    if (n) this.emit('sessions', botId)
    return n
  }
  rename(id: string, name: string): void { const r = this.recs.get(id); if (!r) return; r.name = name; r.named = true; this.persist(r); this.emit('sessions', r.botId) }
  /**
   * 🔴 **첫 말이 제목이 된다** (2026-09-15 Dave: «첫 채팅이 진행되면 그에 맞는 채팅 제목을 자동으로»).
   *    목록에 「세션 1 · 세션 2 · 세션 3」 만 서 있으면 **어느 것이 무엇이었는지** 를 알 길이 없다.
   * ⚠ 바꾸는 때는 **첫 사용자 메시지 한 번뿐**이다 — 대화가 흐를 때마다 이름이 바뀌면 목록이 출렁이고,
   *   사람이 찾아 둔 세션이 눈앞에서 다른 이름이 된다.
   * ⚠ 덮는 대상은 **앱이 붙인 이름**(`세션 3` 류)뿐 — 사람이 지었거나(`named`) 루틴이 지은 이름은 그대로 둔다.
   * ⚠ 호스트에서 한다 — 화면·MCP·루틴 어디로 들어온 첫 말이든 같은 규칙을 받는다(클라이언트마다 다시 짜지 않는다).
   */
  private autoTitle(r: SessionRec, text: string): void {
    if (r.named || r.routine) return
    if (!isAutoSessionName(r.name)) return
    if (r.items.some((i) => i.kind === 'user')) return
    const t = titleFromText(text)
    if (!t || t === r.name) return
    r.name = t
    this.emit('sessions', r.botId)
  }

  /** 세션의 모델·노력·모드 — 셋 다 스폰 인자라 워커를 내리고 같은 id 로 이어서 띄운다. 턴이 도는 중이면 끝난 뒤에 */
  configure(r: SessionRec, o: { model?: string; effort?: string; permissionMode?: PermissionMode }): void {
    let changed = false
    if (o.model !== undefined && o.model !== r.model) { r.model = o.model || undefined; changed = true }
    if (o.effort !== undefined && o.effort !== r.effort) { r.effort = o.effort || undefined; changed = true }
    if (o.permissionMode !== undefined && o.permissionMode !== r.permissionMode) { r.permissionMode = o.permissionMode; changed = true }
    if (!changed) return
    const w = this.workers.get(r.id)
    if (w?.alive) {
      // 새 모드가 대신 답해도 되는 물음은 지금 바로 닫는다 — 화면에 남은 카드를 하나하나 누르게 두지 않는다
      let answered = false
      for (const p of [...w.pending.values()]) if (this.autoAllow(r, w, p)) answered = true
      if (answered && !w.pending.size) this.setState(r, { kind: 'input_provided' })
      if (r.state === 'running' || r.state === 'awaiting_input' || w.pending.size) r.restartPending = true; else { w.kill(); this.workers.delete(r.id) }
    }
    this.persist(r); this.emit('sessions', r.botId)
  }
  /** 새 모드가 허락하는 물음이면 호스트가 «허용» 을 누른다 — 기록은 남긴다(조용히 넘어가지 않는다) */
  private autoAllow(r: SessionRec, w: Worker, p: PermissionRequest): boolean {
    if (!autoAllows(r.permissionMode, p.toolName) || !w.pending.has(p.requestId)) return false
    w.respondPermission(p.requestId, true)
    this.push(r, { id: itemId('s'), t: Date.now(), kind: 'system', text: `자동 허용 · ${p.displayName} (${r.permissionMode === 'acceptEdits' ? '편집 자동 수락' : '항상 허용'} 모드)` })
    return true
  }
  slashOf(id: string): string[] { return this.recs.get(id)?.slash ?? [] }

  private persist(r: SessionRec): void {
    const slim = { ...r, items: r.items.slice(-1500) }
    atomicWrite(join(this.dir, `${r.id}.json`), JSON.stringify(slim))
  }
  private push(r: SessionRec, item: ChatItem, replace = false): void {
    if (replace) {
      const i = r.items.findIndex((x) => x.id === item.id)
      if (i >= 0) r.items[i] = item; else r.items.push(item)
    } else r.items.push(item)
    // S · «봇이 낸 말» 만 안 읽음을 만든다 — 내 말·도구 줄은 아니다(내가 친 것을 내가 안 읽었을 리 없다)
    if (item.kind === 'assistant') r.lastReplyAt = Date.now()
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

  /**
   * 워커 확보 — 없으면 (같은 cli 세션 id 로) 띄운다.
   * 봇의 `vendor` 가 워커의 종류를 고른다 — 여기서 갈리고, 아래는 어느 CLI 인지 모른다
   * (둘 다 `line`·`exit` 만 내보내고 `send`·`kill` 만 받는다).
   */
  ensureWorker(r: SessionRec, bot: Bot): Worker {
    const existing = this.workers.get(r.id)
    if (existing?.alive) return existing
    // 🔴 **세션이 벤더를 정한다** — 봇의 값은 «안 고른 세션» 의 폴백일 뿐이다(한 폴더에 둘이 섞인다)
    const w: Worker = (r.vendor ?? bot.vendor) === 'codex'
      // ⚠ 모델 이름은 CLI 마다 다르다 — Claude 이름(claude-opus-5)을 Codex 에 넘기면 그 자리에서 죽는다.
      //    Codex 것처럼 보이는 이름만 넘기고 아니면 CLI 의 기본값에 맡긴다.
      ? new CodexWorker({ cwd: r.cwd, resume: r.cliSessionId, model: fitsProvider('codex', r.model) ? r.model : undefined, effort: r.effort, sandbox: this.codexSandbox, apiKey: this.openaiApiKey })
      : new ClaudeWorker({ cwd: r.cwd, resume: r.cliSessionId, permissionMode: r.permissionMode, addDirs: bot.repo ? [bot.abs] : undefined, mcpConfig: this.mcpUrl(r.id, bot.id), model: r.model, effort: r.effort, name: `${bot.name}-${r.name}`, appendSystemPrompt: this.systemPromptFor(bot) || undefined, bin: this.bin })
    this.workers.set(r.id, w)
    w.on('line', (line: StreamLine) => this.onLine(r, line))
    w.on('permission', (p: PermissionRequest) => {
      /**
       * 🔴 **모드는 스폰 인자다 — 바꾼 뒤 이 턴이 끝날 때까지 워커는 옛 모드로 묻는다** (2026-09-18 Dave:
       *    «중간에 권한을 바꿨는데 그 이후에도 계속 실행하기 전에 물어보네»). 그 사이는 호스트가 새 모드를
       *    대신 집행한다 — 워커를 턴 중간에 죽이면 하던 일이 끊기므로 답만 대신한다. 정책은 core/permPolicy.
       */
      if (this.autoAllow(r, w, p)) return
      this.setState(r, { kind: 'permission_requested' }); this.emit('permission', r, p)
    })
    w.on('exit', (code: number | null, _sig: string | null, err: string) => {
      if (this.workers.get(r.id) === w) this.workers.delete(r.id)
      if (w.cliSessionId) r.cliSessionId = w.cliSessionId
      for (const it of closeOpenItems(r.items, 'exit')) this.push(r, it, true)
      this.streaming.delete(r.id); this.thinking.delete(r.id); this.thinkSent.delete(r.id); this.thinkShown.delete(r.id)
      if (code !== 0 && code !== 143 && code !== 137 && code !== null) {
        r.lastError = (err || `exit ${code}`).trim().slice(-600)
        const authErr = AUTH_ERROR.test(r.lastError)
        /**
         * 🔴 **고른 모델을 계정이 안 받아 주면, 모델 없이 한 번 더** (2026-09-14).
         *    Codex 에서 먼저 겪은 일(«이 계정에서는 그 모델을 못 쓴다»)은 Claude 에서도 난다 —
         *    요금제마다 쓸 수 있는 모델이 다르고, 긴 문맥(1M) 같은 것은 특히 그렇다.
         *    모델 하나 때문에 **턴이 통째로 죽는 것**이 제일 나쁘다 — CLI 의 기본값에 맡기고 이어간다.
         * ⚠ **한 번만** 다시 보낸다(`modelRetried`) — 다른 이유로 또 죽으면 그때는 사람에게 말해야 한다.
         * ⚠ 세션의 모델 설정을 **지운다** — 다음 턴부터도 기본값으로 간다(매 턴 죽지 않게).
         */
        const lastUser = [...r.items].reverse().find((it) => it.kind === 'user') as { text: string } | undefined
        if (!authErr && r.model && !r.modelRetried && isModelRejected(r.lastError) && lastUser?.text) {
          r.modelRetried = true
          const was = r.model
          r.model = undefined
          this.push(r, { id: itemId('s'), t: Date.now(), kind: 'system', text: `${was} 는 이 계정에서 못 써요 — 기본 모델로 다시 보냅니다` })
          this.persist(r)
          const bot2 = bot
          setTimeout(() => { try { this.send(r, bot2, lastUser.text) } catch { /* 두 번은 안 한다 */ } }, 50)
          this.emit('sessions', r.botId)
          return
        }
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
  /** 생각 스트림을 렌더러로 보낸 마지막 시각 — 길이 나머지(%40)로 던지면 큰 청크가 오는 모델에서 한 번도 안 맞아 화면이 비어 있었다 */
  private thinkSent = new Map<string, number>()
  /** 생각 항목을 채팅에 넣었나 — 본문이 생기기 전엔 넣지 않는다. 실측(CLI 2.1.269 `-p`, Opus 5·Sonnet 5·Haiku 4.5 전부):
   *  thinking 블록과 delta 가 오지만 `thinking` 은 빈 문자열이고 서명만 있다. 즉 headless 출력은 생각 내용을 주지 않는다.
   *  그러니 빈 «생각 · (내용 없음)» 행을 도구마다 남기지 말고, 생각 중임은 상태줄(activity)로만 보인다. */
  private thinkShown = new Set<string>()
  /** 생각 블록 마감 — 본문이 있으면 채팅에 남기고(이미 보였으면 교체), 없으면 조용히 버린다 */
  private endThinking(r: SessionRec, extra: string[] = []): void {
    const th = this.thinking.get(r.id)
    if (!th) { for (const t of extra) this.push(r, { id: itemId('th'), t: Date.now(), kind: 'thinking', text: t }); return }
    this.thinking.delete(r.id); this.thinkSent.delete(r.id)
    if (!th.text.trim() && extra.length) th.text = extra.join('\n\n')
    th.streaming = false
    const shown = this.thinkShown.delete(r.id)
    if (!th.text.trim()) return
    if (shown) this.push(r, th, true); else this.push(r, th)
  }
  private activityAt = new Map<string, number>()
  /** «지금 하는 일» 한 줄 — 0.4초에 한 번만 밖으로 (토큰마다 쏘지 않는다) */
  private setActivity(r: SessionRec, text: string, force = false): void {
    r.activity = text
    const last = this.activityAt.get(r.id) ?? 0
    if (!force && Date.now() - last < 400) return
    this.activityAt.set(r.id, Date.now())
    this.emit('activity', r)
  }
  /**
   * 백그라운드 Agent 의 생애 — CLI 2.1.269 실측 (2026-09-13):
   *   tool_use Agent{run_in_background} → system/task_started{task_id, tool_use_id, is_backgrounded}
   *   → tool_result «Async agent launched…»(즉시) → result(턴 끝) → …(부모 id 단 줄들)… → system/task_notification{tool_use_id, status, summary}
   *   → CLI 가 스스로 새 턴을 열어 이어 간다(system/init → assistant → result).
   * 종전엔 즉시 오는 tool_result 로 «끝남» 을 찍어 실제로는 돌고 있는데 끝난 것처럼 보였고, 반대로 호스트가 재시작되면 영원히 «실행 중» 이었다.
   */
  private onTask(r: SessionRec, line: StreamLine): void {
    const byTool = line.tool_use_id ? r.items.find((it) => it.id === `t_${line.tool_use_id}`) : undefined
    const it = (byTool ?? (line.task_id ? r.items.find((x) => x.kind === 'subagent' && x.taskId === line.task_id) : undefined)) as (ChatItem & { kind: 'subagent' }) | undefined
    if (!it || it.kind !== 'subagent') return
    if (line.subtype === 'task_started') { it.taskId = line.task_id; if (line.is_backgrounded) it.bg = true; this.push(r, it, true); return }
    if (line.subtype === 'task_updated') { const st = line.patch?.status; if (st === 'failed' || st === 'killed' || st === 'cancelled') { it.status = 'error'; it.result = it.result || `백그라운드 작업 ${st}`; this.push(r, it, true) } return }
    // task_notification — 진짜 끝
    it.status = line.status === 'completed' ? 'done' : 'error'
    if (line.summary) it.result = String(line.summary).slice(0, 2000)
    this.push(r, it, true)
    this.setActivity(r, `${it.name} 끝남`, true); this.emit('sessions', r.botId)
  }
  private subOf(r: SessionRec, parentId: string | null | undefined): (ChatItem & { kind: 'subagent' }) | undefined {
    if (!parentId) return undefined
    // 같은 id 가 두 번 올 수 있으니(재시도·스텁) 뒤에서부터 찾는다
    for (let i = r.items.length - 1; i >= 0; i--) { const it = r.items[i]; if (it.id === `t_${parentId}`) return it.kind === 'subagent' ? it : undefined }
    return undefined
  }
  /**
   * 🔴 **지금 도는 모델은 CLI 가 말해 준다** (2026-09-15 Dave: *«모델이 바뀌었지만 하단에 반영이 안되네»*
   *    — 대화에서 `/model claude-opus-4-8` 을 치면 CLI 는 바꿔 주는데 우리 칩은 고른 적 없는
   *    옛 이름을 계속 들고 있었다). 답에 찍혀 오는 이름이 정본이다.
   * ⚠ 날짜 꼬리표만 다른 것은 **같은 모델**이다(`sameModel`) — 아니면 사람이 고른 이름이 매 턴 덮인다.
   * ⚠ 서브에이전트 줄은 제 모델이라 세지 않는다.
   */
  private noteModel(r: SessionRec, line: StreamLine): void {
    if (line.parent_tool_use_id) return
    const m = modelOf(line)
    /**
     * 🔴 **모델 이름이 아닌 것은 안 받는다** (AI · 2026-09-24 Dave 스크린샷). 오류 턴에서 CLI 가
     *    `"model":"<synthetic>"` 을 보내는데, 그걸 그대로 받아 **칩에 «<synthetic>» 이 박혔다.**
     *    모양이 `claude-<종류>-<판>` 이 아니면 그건 기계가 쓴 표식이지 사람이 고를 모델이 아니다.
     */
    if (!m || !modelParts(m) || sameModel(m, r.model)) return
    r.model = m
    this.persist(r); this.emit('sessions', r.botId)
  }

  private onLine(r: SessionRec, line: StreamLine): void {
    if (line.session_id && r.cliSessionId !== line.session_id) { r.cliSessionId = line.session_id; this.persist(r) }
    if (line.type === 'system' && (line.subtype === 'task_started' || line.subtype === 'task_notification' || line.subtype === 'task_updated')) { this.onTask(r, line); return }
    this.noteModel(r, line)
    if (line.type === 'system' && line.subtype === 'init') { if (Array.isArray(line.slash_commands)) { r.slash = line.slash_commands.map(String); this.emit('sessions', r.botId) } return }
    const parent = line.parent_tool_use_id ?? null
    if (line.type === 'stream_event') {
      const ev = line.event as { type?: string; delta?: { type?: string; text?: string; thinking?: string }; index?: number } | undefined
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && !parent) {
        let cur = this.streaming.get(r.id)
        if (!cur) { cur = { id: itemId('a'), t: Date.now(), kind: 'assistant', text: '', streaming: true }; this.streaming.set(r.id, cur); r.items.push(cur) }
        cur.text += ev.delta.text ?? ''
        this.emit('chat', r.id, cur, true)
        r.inflight = undefined                      // 답이 오기 시작하면 공은 다시 우리 손에 있다 (AB)
        this.setActivity(r, '답 쓰는 중')
      } else if (ev?.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta' && !parent) {
        let th = this.thinking.get(r.id)
        if (!th) { th = { id: itemId('th'), t: Date.now(), kind: 'thinking', text: '', streaming: true }; this.thinking.set(r.id, th) }
        th.text += ev.delta.thinking ?? ''
        if (th.text.trim() && !this.thinkShown.has(r.id)) { this.thinkShown.add(r.id); r.items.push(th) }
        const now = Date.now(); if (this.thinkShown.has(r.id) && now - (this.thinkSent.get(r.id) ?? 0) > 150) { this.thinkSent.set(r.id, now); this.emit('chat', r.id, th, true) }
        r.inflight = undefined                      // 생각하고 있다 = 내가 들고 있다 (AB)
        this.setActivity(r, th.text.trim() ? `생각 중 · ${th.text.slice(-90).replace(/\s+/g, ' ')}` : '생각 중')
      }
      this.setState(r, { kind: 'stream_activity' })
      return
    }
    if (line.type === 'assistant') {
      const sub = this.subOf(r, parent)
      const text = assistantText(line)
      // ⚠ 컨텍스트는 **이 줄의 usage** 로 잰다 — result 의 합계가 아니라(`core/chat.ts` 의 `contextOf`).
      //   서브에이전트 줄은 제 작은 문맥이라 세지 않는다.
      if (!parent) { const c = contextOf(line, r.ctx, r.model); if (c) { r.ctx = c; this.emit('sessions', r.botId) } }
      if (!parent) {
        this.endThinking(r, (line.message?.content ?? []).filter((b) => b.type === 'thinking' && typeof b.thinking === 'string').map((b) => String(b.thinking)).filter((t) => t.trim()))
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
          r.inflight = { name, summary: toolSummary(name, input) || '서브에이전트', since: Date.now() }
          this.setActivity(r, `에이전트 · ${toolSummary(name, input)}`, true)
          continue
        }
        this.push(r, { id, t: Date.now(), kind: 'tool', name, summary: toolSummary(name, input), input, parentId: sub ? sub.id : undefined })
        if (sub) { sub.tools += 1; sub.last = `${name} ${toolSummary(name, input)}`.slice(0, 80); this.push(r, sub, true) }
        r.inflight = { name, summary: toolSummary(name, input), since: Date.now() }
        this.setActivity(r, `${sub ? `${sub.name} › ` : ''}${name} · ${toolSummary(name, input)}`.slice(0, 120), true)
        const tp = touchedPath(name, input); if (tp) { touched.push(tp); this.captureBefore(r, tp, name) }
        else if (name === 'Read' && typeof input.file_path === 'string') this.seenOf(r).set(input.file_path, this.diskText(input.file_path))
      }
      // ⚠ 칩만 만든다 — «파일 바뀜»(files 프레임)은 여기서 쏘지 않는다. 이 줄은 도구를 *부르는* 줄이라 파일은
      //    아직 없다(권한 확인 → 실행이 뒤따른다). 신호는 tool_result 가 성공으로 돌아왔을 때(아래) 나간다.
      //    2026-09-18 실측: 여기서 쏘면 화면이 빈 폴더를 읽고 끝나 트리가 낡은 채로 남았다.
      if (touched.length) this.push(r, { id: itemId('f'), t: Date.now(), kind: 'files', paths: touched })
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
        if (it && it.kind === 'tool') {
          it.result = resText; it.isError = !!b.is_error; this.push(r, it, true)
          // 고친 뒤의 디스크가 다음 턴의 «전» 이다
          const tp = touchedPath(it.name, it.input ?? {}); if (tp && !b.is_error) { this.seenOf(r).set(tp, this.diskText(tp)); r.wroteThisTurn = true; this.emit('files', r.botId) }
        }
        else if (it && it.kind === 'subagent') { if (it.bg || /^Async agent launched/i.test(resText)) { it.bg = true; this.push(r, it, true) } else { it.status = b.is_error ? 'error' : 'done'; it.result = resText; this.push(r, it, true) } }
      }
      return
    }
    if (line.type === 'result') {
      if (parent) return
      const cur = this.streaming.get(r.id); if (cur) { cur.streaming = false; this.streaming.delete(r.id); this.push(r, cur, true) }
      this.endThinking(r)
      for (const it of closeOpenItems(r.items, 'result')) this.push(r, it, true)
      this.push(r, { id: itemId('r'), t: Date.now(), kind: 'result', ok: !line.is_error, durationMs: line.duration_ms ?? 0, costUsd: line.total_cost_usd, error: line.is_error ? String(line.error ?? line.result ?? '') : undefined })
      const ctx = contextOf(line, r.ctx, r.model); if (ctx) r.ctx = ctx
      r.inflight = undefined                        // 턴이 끝났으면 아무도 안 들고 있다 (AB)
      this.setActivity(r, '', true)
      this.setState(r, { kind: 'result_received', isError: !!line.is_error })
      // 안전망 — 이 턴에 파일을 썼으면 턴이 끝날 때 한 번 더 알린다(중간 신호를 놓친 화면도 여기서 따라잡는다)
      if (r.wroteThisTurn) { r.wroteThisTurn = false; this.emit('files', r.botId) }
      if (r.restartPending) { const w = this.workers.get(r.id); if (!w || !w.pending.size) { r.restartPending = false; if (w) { w.kill(); this.workers.delete(r.id) } } }
      this.persist(r); this.emit('sessions', r.botId)
    }
  }

  send(r: SessionRec, bot: Bot, text: string, client?: ClientCtx): void {
    this.autoTitle(r, text)
    if (client) r.lastClient = client
    const from = client ? { device: client.device, main: client.origin === 'host', tier: client.tier } : undefined
    this.turnAt.set(r.id, Date.now())
    /**
     * 🔴 **Codex 의 슬래시 명령은 우리가 처리한다** (2026-09-13 Dave: «codex 에서는 /clear 와 같은
     *    메시지도 동작을 안해»). `codex exec` 는 한 턴짜리 명령이라 «세션 명령» 이 없다 —
     *    `/clear` 를 보내면 **그 글자를 프롬프트로** 받아 엉뚱한 답을 한다.
     * ⚠ `/clear` 의 진짜 뜻은 «이어가기를 끊는다» 다 — 다음 턴이 `resume` 없이 새로 시작한다.
     *    대화 기록은 **지우지 않는다**: 사람이 쓴 말은 사람 것이고, 지우려면 «세션 삭제» 가 따로 있다.
     */
    if (r.vendor === 'codex') {
      const hit = parseLocalSlash(text, CODEX_LOCAL)
      if (hit) {
        this.push(r, { id: itemId('u'), t: Date.now(), kind: 'user', text })
        if (hit.name === 'clear' || hit.name === 'new') {
          const w0 = this.workers.get(r.id)
          if (w0) { w0.kill(); this.workers.delete(r.id) }
          r.cliSessionId = null
          this.push(r, { id: itemId('s'), t: Date.now(), kind: 'system', text: '새 대화로 — 여기까지의 맥락을 끊었어요. 다음 메시지는 처음부터 시작합니다.' })
        }
        // ⚠ 명령 뒤에 글이 붙어 있으면(«/clear 그리고 …») 그 글은 **새 대화의 첫 말**로 보낸다
        if (hit.rest) { const w2 = this.ensureWorker(r, bot); w2.send(hit.rest); this.setActivity(r, '시작하는 중', true); this.setState(r, { kind: 'user_sent' }) }
        else this.setState(r, { kind: 'result_received', isError: false })   // ⚠ 턴이 없었으니 곧바로 «끝남» 으로 되돌린다
        this.persist(r)
        this.emit('sessions', r.botId)
        return
      }
    }
    const w = this.ensureWorker(r, bot)
    this.push(r, { id: itemId('u'), t: Date.now(), kind: 'user', text, ...(from ? { from } : {}) })
    w.send(withClient(text, client))   // J-1 · 워커에게만 기기 블록을 앞세운다 — 채팅에는 사람의 글 그대로
    if (r.state !== 'running') r.turnStartedAt = Date.now()
    this.setActivity(r, '시작하는 중', true)
    this.setState(r, { kind: 'user_sent' })
    this.persist(r)
  }
  /**
   * 🔴 **AX · 우리가 직접 결과를 넣은 도구 줄은 우리가 닫는다** (2026-09-25 Dave: *«왜 이미 끝난 이전 도구가 계속
   *    돌고 있어?»* · 스크린샷_234 — 답까지 달린 `AskUserQuestion` 줄이 한참 뒤까지 돌고 있었다).
   * 도구 줄은 claude 가 stdout 으로 내보내는 `tool_result` 를 받아야 닫힌다. 그런데 **미뤄진 질문**(`tool_deferred`)은
   * 답을 **우리가 claude 의 stdin 으로** 넣고, claude 는 그 결과를 되돌려 내보내지 않는다 — 그래서 줄이 영영 열려 있었다.
   * ⚠ 이미 결과가 있는 줄은 건드리지 않는다(나중에 claude 가 진짜 결과를 주면 그쪽이 덮는다).
   */
  private closeTool(r: SessionRec, toolUseId: string, result: string, isError = false): void {
    const id = `t_${toolUseId}`
    for (let i = r.items.length - 1; i >= 0; i--) {
      const it = r.items[i]
      if (it.id !== id) continue
      if (it.kind === 'tool' && it.result === undefined) { it.result = result; it.isError = isError; this.push(r, it, true) }
      return
    }
  }
  respondPermission(r: SessionRec, requestId: string, allow: boolean, always = false): void {
    const w = this.workers.get(r.id); if (!w) return
    const label = always ? rulesLabel(w.pending.get(requestId)?.suggestions ?? []) : ''
    if (w.respondPermission(requestId, allow, always)) this.closeTool(r, requestId, '질문을 취소했어요', true)
    this.push(r, { id: itemId('s'), t: Date.now(), kind: 'system', text: allow ? (always ? `이 세션에서 항상 허용${label ? ` · ${label}` : ''}` : '허용') : '거부' })
    this.setState(r, { kind: 'input_provided' })
  }
  respondAsk(r: SessionRec, requestId: string, answers: Record<string, string>): void {
    const w = this.workers.get(r.id); if (!w) return
    if (w.respondAsk(requestId, answers)) this.closeTool(r, requestId, JSON.stringify(answers))
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
      if (r.items.some((it) => it.kind === 'subagent' && it.bg && it.status === 'run')) continue // 백그라운드 에이전트가 돌면 워커를 죽이지 않는다 — 죽이면 결과가 사라진다
      if (now - r.lastActivity > this.idleTtlMs) { w.kill(); this.workers.delete(id); this.emit('sessions', r.botId) }
    }
  }
  /**
   * **다시 연결** (2026-09-13 Dave: *«현재 연결된 claude code 나 codex 를 재 연결하는 기능이 없어»*).
   *
   * 인증이 바뀌었을 때 **살아 있는 워커는 옛 환경을 그대로 쥐고 있다** — 로그인을 새로 해도,
   * 토큰을 지워도, 이미 뜬 프로세스에는 닿지 않는다(도구 목록·인증은 시작 시점에 고정된다).
   * 그래서 워커만 내린다: 세션 id·대화·레일 카드는 그대로 남고, 다음 메시지에 **같은 id 로**
   * 새 환경으로 다시 뜬다.
   *
   * ⛔ **일하는 중인 워커를 그 자리에서 죽이지 않는다** — 턴이 끊기면 사람이 쓴 지시가 사라진다.
   *    `restartPending` 으로 표시해 두고 **턴이 끝나면** 스스로 내려간다(설정 변경과 같은 길).
   * ⚠ 되돌아오는 수는 «지금 내린 것 · 끝나면 내릴 것» 둘이다 — 화면이 그대로 사람에게 말해 준다.
   */
  recycleAll(vendor?: 'claude' | 'codex'): { now: number; pending: number } {
    let now = 0, pending = 0
    for (const [id, w] of [...this.workers]) {
      const r = this.recs.get(id)
      if (!r || (vendor && r.vendor !== vendor)) continue
      if (r.state === 'running' || r.state === 'awaiting_input' || w.pending.size) { r.restartPending = true; pending++; continue }
      w.kill(); this.workers.delete(id); now++
      this.emit('sessions', r.botId)
    }
    return { now, pending }
  }
  hibernate(id: string): void { const w = this.workers.get(id); if (w) { w.kill(); this.workers.delete(id) } const r = this.recs.get(id); if (r) this.emit('sessions', r.botId) }
  stopAll(): void { for (const w of this.workers.values()) w.kill() }
  liveCount(): number { return [...this.workers.values()].filter((w) => w.alive).length }
  liveCountFor(botId: string): number { return [...this.workers.entries()].filter(([id, w]) => w.alive && this.recs.get(id)?.botId === botId).length }
}

export function statBotDir(abs: string): boolean { try { return statSync(abs).isDirectory() } catch { return false } }
export { mkdirSync }
