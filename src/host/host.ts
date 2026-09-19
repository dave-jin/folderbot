import { existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { hostname } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { TODO_RULES_PROMPT } from '../core/todo'
import type { AuthState, Bot, Frame, PermissionMode, PermissionRequest, RoutineDef, SessionState } from '../core/types'
import { STATE_LABEL } from '../core/types'
import { checkAuth } from './auth'
import { FolderWatch } from './watch'
import { Notifier } from './notify'
import { type HostConfig, absRoot, saveConfig } from './paths'
import { ORCH_ID, Registry, canon } from './registry'
import { Routines, approveToMode } from './routines'
import { SessionManager, setOauthToken, setKeychainLogin, AUTH_ERROR, type SessionRec } from './session'
import { readTodo, todoAdd, todoContext } from './todoStore'
import { recent as recentFiles, tree as fileTree } from './files'

/** 호스트 — 모든 부품을 묶고, 화면으로 나갈 프레임을 만든다 */
const PERM_MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk']

export class Host {
  readonly version: string
  readonly registry: Registry
  readonly sessions = new SessionManager()
  readonly notifier: Notifier
  readonly routines: Routines
  auth: AuthState = { verdict: 'unknown', checkedAt: 0 }
  private queued: { botId: string; sessionId: string; text: string }[] = []
  broadcast: (f: Frame) => void = () => {}
  watcher = new FolderWatch((botId) => this.broadcast({ ev: 'files', botId }))
  log: (s: string) => void = (s) => console.log(`[folderbot] ${s}`)
  /**
   * 🔴 **루트를 바꾸는 일은 «저장» 과 «다시 세우기» 둘로 갈린다.** 호스트는 저장만 하고, 다시 세우는
   *    쪽은 셸(Electron)이 맡는다 — 레지스트리·세션·루틴이 전부 루트에 매여 있어 **통째로 새로 세우는
   *    것**이 제자리에서 갈아끼우는 것보다 안전하다. 셸이 안 꽂아 주면(터미널 호스트) 저장만 되고
   *    다음 시작에 적용된다 — 그 사실을 화면이 말해 준다.
   */
  onRoot: ((root: string) => void | Promise<void>) | null = null

  constructor(public cfg: HostConfig, version: string) {
    this.version = version
    this.registry = new Registry(absRoot(cfg))
    this.notifier = new Notifier(cfg)
    this.notifier.onEvent = (n) => this.broadcast({ ev: 'notify', n })
    this.sessions.bin = cfg.claudeBin
    this.applyDefaults(cfg)
    setOauthToken(cfg.claudeOauthToken)
    this.sessions.mcpUrl = (sid, botId) => JSON.stringify({ mcpServers: { folderbot: { type: 'http', url: `http://127.0.0.1:${cfg.port}/mcp/${botId}?sid=${encodeURIComponent(sid)}` } } })
    this.sessions.systemPromptFor = (bot) => this.systemPrompt(bot)
    this.routines = new Routines({ run: (b, r) => this.runRoutine(b, r), log: this.log })
    this.wire()
    this.routines.reschedule(this.registry.bots())
    // 봇 폴더 감시 — 세션을 거치지 않은 쓰기(Bash·Codex·Dropbox·Finder)도 트리에 온다 (host/watch.ts 머리말)
    this.watcher.log = (m) => this.log(m)
    this.watcher.sync(this.registry.bots())
    void this.refreshAuth()
    setInterval(() => void this.refreshAuth(), 30 * 60 * 1000).unref()
    setInterval(() => this.watchInbox(), 60 * 1000).unref()
  }

  private wire(): void {
    this.registry.on('bots', (bots: Bot[]) => { this.broadcast({ ev: 'bots', bots }); this.routines.reschedule(bots); this.watcher.sync(bots) })
    this.sessions.on('sessions', (botId: string) => this.broadcast({ ev: 'sessions', botId, sessions: this.sessions.list(botId) }))
    this.sessions.on('chat', (sessionId: string, item, replace: boolean) => this.broadcast({ ev: 'chat', sessionId, item, replace }))
    this.sessions.on('files', (botId: string) => this.broadcast({ ev: 'files', botId }))
    this.sessions.on('activity', (r: SessionRec) => this.broadcast({ ev: 'activity', sessionId: r.id, botId: r.botId, activity: r.activity ?? '', turnStartedAt: r.turnStartedAt }))
    this.sessions.on('auth-error', () => { void this.refreshAuth(true) })
    this.sessions.on('chat', (sessionId: string, item) => {
      // CLI 가 인증 오류를 result/assistant 로 흘리는 경우도 잡는다
      if ((item.kind === 'result' && !item.ok && AUTH_ERROR.test(item.error ?? '')) || (item.kind === 'assistant' && AUTH_ERROR.test(item.text) && item.text.length < 200)) void this.refreshAuth(true)
    })
    this.sessions.on('permission', (r: SessionRec, req: PermissionRequest) => {
      this.broadcast({ ev: 'permission', sessionId: r.id, botId: r.botId, req })
      const bot = this.registry.bot(r.botId)
      const what = req.ask ? String((req.input.questions as { question?: string }[] | undefined)?.[0]?.question ?? '질문에 답해 주세요') : `${req.displayName}: ${summarize(req)}`
      this.notifier.emit('awaiting', r.botId, `${bot?.name ?? r.botId} · 확인해 주세요`, what, r.id)
    })
    this.sessions.on('state', (r: SessionRec, prev: SessionState, notify: boolean) => {
      this.broadcast({ ev: 'state', sessionId: r.id, botId: r.botId, state: r.state })
      this.broadcast({ ev: 'sessions', botId: r.botId, sessions: this.sessions.list(r.botId) })
      if (!notify || r.state === 'awaiting_input') return
      const bot = this.registry.bot(r.botId)
      const last = [...r.items].reverse().find((i) => i.kind === 'assistant') as { text: string } | undefined
      if (r.state === 'done') this.notifier.emit(r.routine ? 'routine' : 'done', r.botId, `${bot?.name ?? ''} · ${STATE_LABEL.done}`, (last?.text ?? r.name).slice(0, 140), r.id, { push: !r.routine || bot?.routines.find((x) => x.name === r.routine)?.push !== false })
      if (r.state === 'error') this.notifier.emit('error', r.botId, `${bot?.name ?? ''} · ${STATE_LABEL.error}`, (r.lastError ?? '세션 오류').split('\n').pop()!.slice(0, 140), r.id)
    })
  }

  systemPrompt(bot: Bot): string {
    const parts: string[] = []
    if (bot.orchestrator) parts.push(this.registry.orchestratorPrompt())
    else parts.push(`너는 Folder Bot 의 봇이다. 폴더 "${bot.rel}" 안에서 일한다. 산출물은 이 폴더에 둔다.`)
    parts.push(TODO_RULES_PROMPT)
    const ctx = todoContext(bot.abs)
    if (ctx) parts.push(ctx)
    return parts.join('\n\n')
  }

  afterBotsChanged(): void {
    this.broadcast({ ev: 'bots', bots: this.registry.bots() })
    this.routines.reschedule(this.registry.bots())
  }

  /** 세션에 지시 — 없으면 만든다 */
  sendToBot(bot: Bot, text: string, sessionId?: string, name?: string, from?: string, opts: { model?: string; effort?: string; permissionMode?: PermissionMode; vendor?: 'claude' | 'codex' } = {}): string {
    let r = sessionId ? this.sessions.get(sessionId) : undefined
    if (!r) {
      const list = this.sessions.list(bot.id)
      if (!name && list.length && !from) r = this.sessions.get(list[0].id)
      if (!r) {
        if (this.sessions.liveCountFor(bot.id) >= 4) throw new Error(`${bot.name} 은 이미 세션 4개가 돌고 있어요. 하나 끝나면 이어서 하세요.`)
        if (this.sessions.liveCount() >= 12) throw new Error('호스트 세션 상한(12)에 닿았어요.')
        r = this.sessions.create(bot, name ?? (from ? `위임 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '메인'), opts)
      }
    }
    if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') {
      this.queued.push({ botId: bot.id, sessionId: r.id, text })
      this.sessions.get(r.id)!.items.push({ id: `q${Date.now()}`, t: Date.now(), kind: 'system', text: '미니의 Claude 로그인이 필요해 대기열에 뒀어요. 복구되면 이어서 보냅니다.' })
      this.broadcast({ ev: 'chat', sessionId: r.id, item: r.items[r.items.length - 1] })
      return r.id
    }
    this.sessions.send(r, bot, text)
    return r.id
  }

  runRoutine(bot: Bot, r: RoutineDef): void {
    this.log(`루틴 실행: ${bot.name} · ${r.name}`)
    const s = this.sessions.create(bot, `루틴 · ${r.name}`, { permissionMode: approveToMode(r.approve), routine: r.name })
    this.sessions.send(s, bot, `${r.prompt}\n\n(이건 예약된 루틴 "${r.name}" 이야. 사람이 없을 수 있으니 ${r.approve === 'always' ? '' : r.approve === 'folder' ? '이 폴더 안 파일만 고치고 ' : '파일을 고치지 말고 제안만 하고 '}결과를 짧게 요약해.)`)
  }

  /** 메인(호스트) 이름 — 설정값이 없으면 맥의 컴퓨터 이름(시스템 설정 › 일반 › 정보), 그것도 없으면 hostname */
  private computerName = ''
  hostName(): string {
    if (this.cfg.hostName?.trim()) return this.cfg.hostName.trim()
    if (!this.computerName) { try { this.computerName = process.platform === 'darwin' ? execFileSync('/usr/sbin/scutil', ['--get', 'ComputerName'], { timeout: 2000 }).toString().trim() : '' } catch { /* */ } if (!this.computerName) this.computerName = hostname().replace(/\.local$/, '') || 'Host' }
    return this.computerName
  }
  /** 볼트 루트 저장 — 되세우기는 `onRoot` 를 가진 쪽 몫이다 */
  setRoot(root: string): string {
    const abs = canon(resolve(root))
    this.cfg.root = abs; saveConfig(this.cfg)
    this.log(`볼트 루트: ${abs}`)
    return abs
  }

  setNames(o: { hostName?: string; deviceId?: string; deviceName?: string }): void {
    if (o.hostName !== undefined) this.cfg.hostName = o.hostName.trim() || undefined
    if (o.deviceId && o.deviceName !== undefined) { const d = this.cfg.devices.find((x) => x.id === o.deviceId); if (d && o.deviceName.trim()) d.name = o.deviceName.trim().slice(0, 40) }
    saveConfig(this.cfg)
  }
  /** 설정 → 세션 매니저. ⚠ 벤더마다 따로 — 섞으면 Codex 세션이 Claude 모델로 떠서 죽는다 */
  private applyDefaults(cfg = this.cfg): void {
    this.sessions.defaults = {
      claude: { model: cfg.defaultModel, effort: cfg.defaultEffort },
      codex: { model: cfg.defaultCodexModel, effort: cfg.defaultCodexEffort }
    }
    this.sessions.codexSandbox = cfg.codexSandbox ?? 'read-only'
    this.sessions.openaiApiKey = cfg.openaiApiKey
    this.sessions.defaultPermissionMode = cfg.defaultPermissionMode && cfg.defaultPermissionMode !== 'default' ? cfg.defaultPermissionMode : undefined
    // 절전 — 0 이면 «안 재운다» (밤새 돌리는 사람) · 아니면 그 분 뒤. 기본은 60분 (루프 4/10)
    const idle = cfg.idleMinutes === undefined ? 60 : cfg.idleMinutes
    this.sessions.idleTtlMs = idle > 0 ? idle * 60 * 1000 : Number.POSITIVE_INFINITY
  }
  setIdle(minutes: number): void { this.cfg.idleMinutes = Math.max(0, Math.round(minutes)); this.applyDefaults(); saveConfig(this.cfg) }
  /** 기본 모델·생각 레벨 — 저장하면 다음 세션부터. `agent` 로 어느 CLI 것인지 가른다 */
  setDefaults(model: string, effort: string, agent: 'claude' | 'codex' = 'claude', permissionMode?: string): void {
    if (agent === 'codex') { this.cfg.defaultCodexModel = model || undefined; this.cfg.defaultCodexEffort = effort || undefined }
    else {
      this.cfg.defaultModel = model || undefined; this.cfg.defaultEffort = effort || undefined
      // 새 채팅 기본 권한 — 아는 값만 받는다. `default` 는 «안 정함» 과 같아서 지운다
      if (permissionMode !== undefined) this.cfg.defaultPermissionMode = PERM_MODES.includes(permissionMode as PermissionMode) && permissionMode !== 'default' ? (permissionMode as PermissionMode) : undefined
    }
    this.applyDefaults()
    saveConfig(this.cfg)
  }
  /** 조용한 시간 — `HH:MM` 둘. 종전엔 설정에 있으면서 화면이 고칠 길이 없었다(2026-09-17) */
  setQuiet(from: string, to: string): void {
    const ok = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
    if (!ok(from) || !ok(to)) throw new Error('시간은 HH:MM 이어야 해요')
    this.cfg.quiet = { from, to }
    saveConfig(this.cfg)
  }
  /** Codex 설정 — 샌드박스(= 권한 정책)와 API 키 */
  setCodex(o: { sandbox?: string; apiKey?: string }): void {
    if (o.sandbox === 'read-only' || o.sandbox === 'workspace-write' || o.sandbox === 'danger-full-access') this.cfg.codexSandbox = o.sandbox
    if (o.apiKey !== undefined) this.cfg.openaiApiKey = o.apiKey.trim() || undefined
    this.applyDefaults()
    saveConfig(this.cfg)
  }
  setToken(token: string): void {
    this.cfg.claudeOauthToken = token.trim() || undefined
    setOauthToken(this.cfg.claudeOauthToken)
    saveConfig(this.cfg)
    void this.refreshAuth()
  }
  async refreshAuth(fromFailure = false): Promise<AuthState> {
    const prev = this.auth.verdict
    this.auth = await checkAuth(this.cfg.claudeBin)
    // 세션이 인증 오류로 죽었는데 status 가 «로그인됨» 이라고 하면, status 가 틀린 것 — 문맥에서 못 읽는 경우다
    if (fromFailure && this.auth.verdict === 'loggedin') this.auth = { ...this.auth, verdict: 'unreadable', reason: '세션 프로세스가 자격증명을 못 읽었어요' }
    /**
     * 🔴 **어느 인증을 쓸지 여기서 한 번만 정한다** — 워커 env 가 그 결정을 따른다.
     *    키체인 로그인이 읽히면 장기 토큰을 **안 넣는다**: 토큰이 있으면 CLI 가 claude.ai 커넥터(MCP)
     *    로딩을 건너뛴다(`session.ts` 의 `cleanClaudeEnv` 머리말 · Dave 의 Akiflow 사고).
     * ⚠ `mode` 는 «실제로 무엇을 쓰고 있나» 다 — 토큰이 설정돼 있어도 키체인이 이기면 `login` 이다.
     */
    setKeychainLogin(!!this.auth.keychain)
    this.auth.mode = this.cfg.claudeOauthToken && !this.auth.keychain ? 'token' : 'login'
    this.broadcast({ ev: 'auth', auth: this.auth })
    if (this.auth.verdict === 'unreadable' && prev !== 'unreadable') this.notifier.emit('error', ORCH_ID, `${this.hostName()} 에서 Claude 로그인이 필요해요`, '호스트 맥에서 터미널 → claude → /login. 대기 중인 지시는 복구되면 이어서 해요.')
    if (this.auth.verdict === 'loggedout' && prev !== 'loggedout') this.notifier.emit('error', ORCH_ID, 'Claude 가 로그아웃됐어요', `${this.hostName()} 에서 claude → /login 을 해 주세요.`)
    if (this.auth.verdict === 'loggedin' && this.queued.length) {
      const q = this.queued; this.queued = []
      for (const it of q) { const b = this.registry.bot(it.botId); const r = this.sessions.get(it.sessionId); if (b && r) this.sessions.send(r, b, it.text) }
    }
    return this.auth
  }

  private lastInbox = -1
  watchInbox(): void {
    const n = this.registry.inboxItems().length
    if (n !== this.lastInbox) { this.lastInbox = n; this.broadcast({ ev: 'inbox', count: n }) }
  }

  todoAdd(bot: Bot, title: string, desc: string, by: 'me' | 'bot', notify = false, section = ''): void {
    const items = todoAdd(bot.abs, title, desc, by, section)
    this.broadcast({ ev: 'todo', botId: bot.id, items })
    if (notify && by === 'bot') this.notifier.emit('todo', bot.id, `${bot.name} · 할 일 남김`, `${title}${desc ? `: ${desc}` : ''}`)
  }
  todo(bot: Bot) { return readTodo(bot.abs) }

  tree(dir: string, depth: number) {
    const base = join(this.registry.root, dir || '')
    if (!existsSync(base)) throw new Error('없는 폴더')
    return fileTree(base, depth).map(function flat(n): unknown { return { path: n.rel + (n.dir ? '/' : ''), children: n.children?.map(flat) } })
  }
  search(query: string, limit: number): string[] {
    const q = query.toLowerCase(); const out: { rel: string; m: number }[] = []
    const walk = (dir: string, d: number) => {
      let names: string[] = []; try { names = readdirSync(dir) } catch { return }
      for (const name of names) {
        if (name.startsWith('.') || name === 'node_modules') continue
        const abs = join(dir, name); let st; try { st = statSync(abs) } catch { continue }
        const rel = relative(this.registry.root, abs)
        if (rel.toLowerCase().includes(q)) out.push({ rel: rel + (st.isDirectory() ? '/' : ''), m: st.mtimeMs })
        if (st.isDirectory() && d > 0 && out.length < limit * 5) walk(abs, d - 1)
      }
    }
    walk(this.registry.root, 4)
    return out.sort((a, b) => b.m - a.m).slice(0, limit).map((x) => x.rel)
  }
  recentFiles(bot: Bot, limit = 12) { return recentFiles(bot.abs, limit) }
  shutdown(): void { this.sessions.stopAll(); this.watcher.close() }
}

function summarize(req: PermissionRequest): string {
  const i = req.input
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  return (s('command') || s('file_path') || s('path') || s('url') || s('description') || JSON.stringify(i)).slice(0, 120)
}
