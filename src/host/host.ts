import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { TODO_RULES_PROMPT } from '../core/todo'
import type { AuthState, Bot, Frame, PermissionMode, PermissionRequest, RoutineDef, SessionState } from '../core/types'
import { STATE_LABEL } from '../core/types'
import { checkAuth } from './auth'
import { Notifier } from './notify'
import { type HostConfig, absRoot, saveConfig } from './paths'
import { ORCH_ID, Registry } from './registry'
import { Routines, approveToMode } from './routines'
import { SessionManager, setOauthToken, AUTH_ERROR, type SessionRec } from './session'
import { readTodo, todoAdd, todoContext } from './todoStore'
import { recent as recentFiles, tree as fileTree } from './files'

/** 호스트 — 모든 부품을 묶고, 화면으로 나갈 프레임을 만든다 */
export class Host {
  readonly version: string
  readonly registry: Registry
  readonly sessions = new SessionManager()
  readonly notifier: Notifier
  readonly routines: Routines
  auth: AuthState = { verdict: 'unknown', checkedAt: 0 }
  private queued: { botId: string; sessionId: string; text: string }[] = []
  broadcast: (f: Frame) => void = () => {}
  log: (s: string) => void = (s) => console.log(`[folderbot] ${s}`)

  constructor(public cfg: HostConfig, version: string) {
    this.version = version
    this.registry = new Registry(absRoot(cfg))
    this.registry.botLimit = cfg.botLimit ?? 8
    this.notifier = new Notifier(cfg)
    this.notifier.onEvent = (n) => this.broadcast({ ev: 'notify', n })
    this.sessions.bin = cfg.claudeBin
    this.sessions.defaults = { model: cfg.defaultModel, effort: cfg.defaultEffort }
    setOauthToken(cfg.claudeOauthToken)
    this.sessions.mcpUrl = (sid, botId) => JSON.stringify({ mcpServers: { folderbot: { type: 'http', url: `http://127.0.0.1:${cfg.port}/mcp/${botId}?sid=${encodeURIComponent(sid)}` } } })
    this.sessions.systemPromptFor = (bot) => this.systemPrompt(bot)
    this.routines = new Routines({ run: (b, r) => this.runRoutine(b, r), log: this.log })
    this.wire()
    this.routines.reschedule(this.registry.bots())
    void this.refreshAuth()
    setInterval(() => void this.refreshAuth(), 30 * 60 * 1000).unref()
    setInterval(() => this.watchInbox(), 60 * 1000).unref()
  }

  private wire(): void {
    this.registry.on('bots', (bots: Bot[]) => { this.broadcast({ ev: 'bots', bots }); this.routines.reschedule(bots) })
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
  sendToBot(bot: Bot, text: string, sessionId?: string, name?: string, from?: string, opts: { model?: string; effort?: string; permissionMode?: PermissionMode } = {}): string {
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

  /** 기본 모델·생각 레벨 — 저장하면 다음 세션부터 */
  setDefaults(model: string, effort: string): void {
    this.cfg.defaultModel = model || undefined; this.cfg.defaultEffort = effort || undefined
    this.sessions.defaults = { model: this.cfg.defaultModel, effort: this.cfg.defaultEffort }
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
    this.auth.mode = this.cfg.claudeOauthToken ? 'token' : 'login'
    this.broadcast({ ev: 'auth', auth: this.auth })
    if (this.auth.verdict === 'unreadable' && prev !== 'unreadable') this.notifier.emit('error', ORCH_ID, 'Mac mini 에서 Claude 로그인이 필요해요', 'Jump Desktop → 터미널 → claude → /login. 대기 중인 지시는 복구되면 이어서 해요.')
    if (this.auth.verdict === 'loggedout' && prev !== 'loggedout') this.notifier.emit('error', ORCH_ID, 'Claude 가 로그아웃됐어요', '미니에서 claude → /login 을 해 주세요.')
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

  todoAdd(bot: Bot, title: string, desc: string, by: 'me' | 'bot', notify = false): void {
    const items = todoAdd(bot.abs, title, desc, by)
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
  shutdown(): void { this.sessions.stopAll() }
}

function summarize(req: PermissionRequest): string {
  const i = req.input
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  return (s('command') || s('file_path') || s('path') || s('url') || s('description') || JSON.stringify(i)).slice(0, 120)
}
