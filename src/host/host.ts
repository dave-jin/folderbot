import { invalidateUsage } from './usage'
import { planNow, refreshPlan } from './planUsage'
import { DEVICE_RULES_MD, type ClientCtx } from '../core/clientCtx'
import { mdPlain } from '../core/mdPlain'   // 알림 미리보기는 글자만 — 마크다운 기호가 그대로 나왔다(2026-09-25)
import { existsSync, readdirSync, statSync } from 'node:fs'
import { execFile, execFileSync } from 'node:child_process'
import { hostname } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { TODO_RULES_PROMPT } from '../core/todo'
import type { AuthState, Bot, Frame, PermissionMode, PermissionRequest, RoutineDef, SessionState } from '../core/types'
import { STATE_LABEL } from '../core/types'
import type { TurnFrom } from '../core/turnGuard'
import { checkAuth } from './auth'
import { FolderWatch } from './watch'
import { Notifier } from './notify'
import { type HostConfig, absRoot, dataDir, saveConfig } from './paths'
import { McpAuth } from './mcpAuth'
import { BridgeHub, type Incoming } from './bridge'
import { RunLog } from './runs'
import { readWakeEnv, wakePeer } from './wake'
import { OpsWatch } from './opsWatch'
import { letterBatch } from '../core/fbmf'
import type { PeerDef } from '../core/bridges'
import type { QueuedMsg } from '../core/types'
import { ORCH_ID, Registry, canon, ORCH_REQUEST_RULES_MD, ORCH_ASK_HINT, ORCH_REPORT_HINT, LETTER_RULES_MD } from './registry'
import { Routines, routineRun, routinesToDrop, RETRY_DELAY_MS } from './routines'
import { SessionManager, setOauthToken, setKeychainLogin, AUTH_ERROR, type SessionRec } from './session'
import { readTodo, todoAdd, todoContext } from './todoStore'
import { recent as recentFiles, tree as fileTree } from './files'
import { ConflictBook, sweep as sweepCopies } from './docSave'

/** 호스트 — 모든 부품을 묶고, 화면으로 나갈 프레임을 만든다 */
const PERM_MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk']

export class Host {
  readonly version: string
  readonly registry: Registry
  readonly sessions = new SessionManager()
  /** BF · 문서 창 충돌 사본 장부 — 필요 없어진 사본은 `sweepClashes` 가 스스로 휴지통에 넣는다 */
  readonly clashes = new ConflictBook()
  readonly notifier: Notifier
  readonly routines: Routines
  /** BT · 로컬 MCP 세션 토큰 */
  readonly mcpAuth = new McpAuth(dataDir())
  /** 연결(Bridge) — 바깥 상대와 편지 파일로 대화한다(host/bridge.ts) */
  readonly bridges: BridgeHub
  /** BR-1 · 루틴 실행 기록 */
  readonly runs: RunLog
  /** BZ · 호스트 운영 감시(`.claude/ops.yml` 의 명령을 주기마다) */
  readonly ops: OpsWatch
  auth: AuthState = { verdict: 'unknown', checkedAt: 0 }
  private queued: { botId: string; sessionId: string; text: string; origin: TurnFrom }[] = []
  broadcast: (f: Frame) => void = () => {}
  /** 🔴 `.bot.yml` 이 밖에서 바뀌면 **UI 로 저장한 것과 같은 길**을 탄다(AA-2) — 화면 갱신 + 스케줄 다시 걸기 */
  watcher = new FolderWatch(
    (botId) => { this.broadcast({ ev: 'files', botId }); this.refreshNames() },
    (botId) => { this.log(`설정 파일이 바뀌어 루틴·연결을 다시 읽어요 · ${this.registry.bot(botId)?.name ?? botId}`); this.afterBotsChanged(); if (botId === ORCH_ID) { this.bridges.reload(); this.ops.reload() } },
  )
  private lastNames = ''
  /** 봇 폴더의 CLAUDE.md `display_name:` 이 바뀌면 레일도 바뀌어야 한다 — 파일 신호 뒤에 표시 이름을 다시 재 본다 */
  private refreshNames(): void {
    const now = this.registry.bots().map((b) => `${b.id}=${b.displayName}`).join('|')
    if (now !== this.lastNames) { this.lastNames = now; this.afterBotsChanged() }
  }
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
    void refreshPlan(cfg.claudeBin)   // BD · 첫 화면부터 실제 한도 — 모델을 부르지 않는 CLI 질문 한 번
    this.applyDefaults(cfg)
    setOauthToken(cfg.claudeOauthToken)
    // BT · 세션 토큰이 든 설정을 0600 파일로 넘긴다(argv 에 토큰을 싣지 않는다) — host/mcpAuth.ts
    this.sessions.mcpUrl = (sid, botId) => this.mcpAuth.configFile(botId, sid, cfg.port)
    this.sessions.systemPromptFor = (bot) => this.systemPrompt(bot)
    this.sessions.botOf = (id) => this.registry.bot(id)
    this.routines = new Routines({ run: (b, r, why) => { this.runRoutine(b, r, why ?? {}) }, log: this.log })
    this.bridges = new BridgeHub({ root: this.registry.root, dataDir: dataDir(), hostNames: () => [hostname(), this.hostName(), this.cfg.hostName ?? ''], log: (m) => this.log(m), deliver: (peer, items) => this.deliverLetters(peer, items),
      wake: (peer, payload) => { void this.wakePeer(peer, payload) },
      onStale: (peer, last) => this.peerSignal(peer, last, false),
      onAlive: (peer, last) => this.peerSignal(peer, last, true) })
    this.routines.file = join(dataDir(), 'routine-runs.json')   // BR-2 · 놓친 회차 판단 기준
    this.runs = new RunLog(this.registry.root, () => this.bridges.cfg.runsCopy, () => hostname().replace(/\.local$/, ''), (m) => this.log(m))
    this.ops = new OpsWatch({ root: this.registry.root, hostNames: () => [hostname(), this.hostName(), this.cfg.hostName ?? ''], log: (m) => this.log(m),
      note: (e) => this.runs.note(e),
      alert: (text) => this.notifyOrch(text, 'ops'),
      firstDelayMs: Number(process.env.FOLDERBOT_OPS_FIRST_MS) || 30_000 })
    this.wire()
    this.sessions.drainAll()   // 호스트가 다시 떴다 — 기다리던 봇 말을 내보낸다
    this.routines.reschedule(this.registry.bots())
    // BR-2 · 꺼져 있던 사이 놓친 회차를 한 번 보충한다 — 세션·인증이 자리 잡은 뒤에
    setTimeout(() => { try { this.routines.catchUp(this.registry.bots()) } catch (e) { this.log(`놓친 회차 보충 실패: ${(e as Error).message}`) } }, 20_000).unref()
    // 봇 폴더 감시 — 세션을 거치지 않은 쓰기(Bash·Codex·Dropbox·Finder)도 트리에 온다 (host/watch.ts 머리말)
    this.watcher.log = (m) => this.log(m)
    this.watcher.sync(this.registry.bots())
    this.bridges.reload()
    this.ops.reload()
    setInterval(() => this.runs.sweep(), 60_000).unref()
    void this.refreshAuth()
    setInterval(() => void this.refreshAuth(), 30 * 60 * 1000).unref()
    setInterval(() => this.watchInbox(), 60 * 1000).unref()
    this.sweepClashes(); setInterval(() => this.sweepClashes(), 60 * 60 * 1000).unref()
    // BW · 지운 지 7일 지난 세션 파일 → 앱 데이터 trash(6시간마다)
    const sweepS = () => { try { const n = this.sessions.sweepDeleted(); if (n.length) this.log(`지운 세션 ${n.length}개를 휴지통(앱 데이터 trash/sessions)으로 옮겼어요`) } catch (e) { this.log(`지운 세션 정리 실패: ${(e as Error).message}`) } }
    setTimeout(sweepS, 60_000).unref(); setInterval(sweepS, 6 * 3600_000).unref()
  }

  /** BF · 충돌 사본 치우기 — 원본과 같아졌거나 7일 지난 것만. 사람이 고친 사본은 그 사람 것이라 두고 장부에서만 뺀다 */
  sweepClashes(): void {
    try {
      const r = sweepCopies(this.clashes, (id) => this.registry.bot(id)?.abs ?? null, (id, rel) => { const b = this.registry.bot(id); if (b) { this.registry.trashPath(relative(this.registry.root, join(b.abs, rel))); this.broadcast({ ev: 'files', botId: id }) } })
      if (r.trashed.length) this.log(`충돌 사본 ${r.trashed.length}개를 휴지통으로: ${r.trashed.join(', ')}`)
    } catch (e) { this.log(`충돌 사본 정리 실패: ${(e as Error).message}`) }
  }

  private wire(): void {
    // 🔴 **다시 짜고 나서 보낸다** (AA-1) — `reschedule` 이 각 루틴에 `lastError`·`nextRun` 을 적어 넣으므로,
    //    먼저 보내면 화면은 늘 «오류도 없고 다음 실행도 모르는» 낡은 판을 받는다.
    this.registry.on('bots', (bots: Bot[], meta?: { reorderedBy?: 'orchestrator' }) => { this.routines.reschedule(bots); this.broadcast({ ev: 'bots', bots, ...(meta ?? {}) }); this.watcher.sync(bots) })
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
      // BR-1 · 루틴 회차가 끝났다 — 결과 줄(`결과: ok|fail|skip`)까지 읽어 기록한다
      if (r.routine && prev === 'running' && (r.state === 'done' || r.state === 'error')) {
        const lastA = [...r.items].reverse().find((i) => i.kind === 'assistant') as { text: string } | undefined
        const res = this.runs.end(r.id, r.state === 'done', lastA?.text, r.state === 'error' ? r.lastError : undefined)
        // BR-2 · 실패한 회차는 `retry: true` 인 루틴만 10분 뒤 한 번 다시(기본 끔 — 외부 발송이 두 번 나가지 않게)
        const info = this.routineRuns.get(r.id); this.routineRuns.delete(r.id)
        if (res && !res.ok && info && info.attempt === 1) {
          const def = this.registry.bot(info.botId)?.routines.find((x) => x.name === r.routine)
          if (def?.retry === true && def.enabled !== false) {
            this.runs.note({ event: 'retry', botId: info.botId, routine: def.name, run: r.id, ms: this.retryDelayMs })
            setTimeout(() => { const b = this.registry.bot(info.botId); const d = b?.routines.find((x) => x.name === def.name); if (b && d && d.enabled !== false) this.runRoutine(b, d, { attempt: 2 }) }, this.retryDelayMs).unref()
          }
        }
      }
      // L · 턴이 끝나면 사용량 캐시를 비운다 — 다음 /api/usage 가 새 기록을 훑어 60초 안에 원격 패널이 바뀐다
      if (prev === 'running' && r.state !== 'running') { invalidateUsage(); planNow(this.sessions.bin, true) }   // BD · 턴을 썼으니 실제 한도도 다시(60초 문턱 안에서)
      this.broadcast({ ev: 'sessions', botId: r.botId, sessions: this.sessions.list(r.botId) })
      if (!notify || r.state === 'awaiting_input') return
      const bot = this.registry.bot(r.botId)
      const last = [...r.items].reverse().find((i) => i.kind === 'assistant') as { text: string } | undefined
      if (r.state === 'done') this.notifier.emit(r.routine ? 'routine' : 'done', r.botId, `${bot?.name ?? ''} · ${STATE_LABEL.done}`, mdPlain(last?.text ?? r.name).slice(0, 140), r.id, { push: !r.routine || bot?.routines.find((x) => x.name === r.routine)?.push !== false })
      if (r.state === 'error') this.notifier.emit('error', r.botId, `${bot?.name ?? ''} · ${STATE_LABEL.error}`, (r.lastError ?? '세션 오류').split('\n').pop()!.slice(0, 140), r.id)
    })
  }

  systemPrompt(bot: Bot): string {
    const parts: string[] = []
    // BH · orch_ask — 볼트의 orchestrator.md·폴더 CLAUDE.md 가 옛 판이어도 규칙이 닿게 시스템 프롬프트로도 준다(DEVICE_RULES_MD 와 같은 이유)
    if (bot.orchestrator) { const op = this.registry.orchestratorPrompt(); parts.push(op); if (!op.includes('봇이 보낸 요청')) parts.push(ORCH_REQUEST_RULES_MD) }
    else parts.push(`너는 Folder Bot 의 봇이다. 폴더 "${bot.rel}" 안에서 일한다. 산출물은 이 폴더에 둔다.\n${ORCH_ASK_HINT}\n${ORCH_REPORT_HINT}`)
    // BQ · 연결 편지를 받거나 보낼 수 있는 봇에게만 편지 규칙을 준다
    if (this.bridges?.cfg.peers.some((p) => p.enabled && (this.isDeliverTarget(p, bot) || p.maySend.includes(bot.id)))) parts.push(LETTER_RULES_MD)
    parts.push(TODO_RULES_PROMPT)
    parts.push(DEVICE_RULES_MD)   // J-2 · 볼트 CLAUDE.md 에도 같은 글이 있지만, 옛 볼트에는 없으므로 시스템 프롬프트로도 준다
    const ctx = todoContext(bot.abs)
    if (ctx) parts.push(ctx)
    return parts.join('\n\n')
  }

  afterBotsChanged(): void {
    // 🔴 다시 짜고 나서 보낸다 (AA-1) — 스케줄 결과(lastError·nextRun)가 같은 판에 실려 나가야 화면이 사실을 본다
    const bots = this.registry.bots()
    this.routines.reschedule(bots)
    this.broadcast({ ev: 'bots', bots })
  }

  /** 세션에 지시 — 없으면 만든다 */
  sendToBot(bot: Bot, text: string, sessionId?: string, name?: string, from?: string, opts: { model?: string; effort?: string; permissionMode?: PermissionMode; vendor?: 'claude' | 'codex'; client?: ClientCtx } = {}): string {
    let r = sessionId ? this.sessions.get(sessionId) : undefined
    // 🔴 봇끼리 오가는 말은 받는 봇의 «🤝 소통» 세션 하나로 (2026-10-02 Dave) — 세션을 집어 보냈으면 그 세션으로(답 돌려주기)
    if (!r && from && !name) r = this.sessions.commOf(bot, from)
    if (!r) {
      const list = this.sessions.list(bot.id).filter((x) => !x.comm)   // 사람의 «이어서» 는 소통 세션으로 가지 않는다
      if (!name && list.length && !from) r = this.sessions.get(list[0].id)
      if (!r) {
        // BE · 봇당 4개도 같은 규칙 — 넘치면 그 봇의 가장 오래 안 쓴 쉬는 워커를 재운다. 전부 일하는 중일 때만 거절한다.
        //    호스트 전체 상한(15)은 워커를 띄우는 자리(`sessions.ensureWorker`)가 지킨다 — 새로 만들 때도, 잠든 세션을 깨울 때도
        if (this.sessions.liveCountFor(bot.id) >= 4 && !this.sessions.sleepLru(undefined, bot.id)) throw new Error(`${bot.name} 은 세션 4개가 모두 일하는 중이에요. 하나 끝나면 이어서 하세요.`)
        // BH · 위임으로 새로 연 세션은 출처를 남긴다 — `orch_ask` 가 이것으로 «되묻기 고리» 를 막는다
        r = this.sessions.create(bot, name ?? (from ? `위임 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '메인'), { ...opts, ...(from ? { delegatedFrom: from } : {}) })
      }
    }
    if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') {
      this.queued.push({ botId: bot.id, sessionId: r.id, text, origin: from ? 'bot' : 'human' })
      this.sessions.get(r.id)!.items.push({ id: `q${Date.now()}`, t: Date.now(), kind: 'system', text: '미니의 Claude 로그인이 필요해 대기열에 뒀어요. 복구되면 이어서 보냅니다.' })
      this.broadcast({ ev: 'chat', sessionId: r.id, item: r.items[r.items.length - 1] })
      return r.id
    }
    // 다른 봇이 보낸 말은 받는 세션이 일하는 중이면 큐에서 기다린다(SessionManager.sendFromBot)
    if (from) this.sessions.sendFromBot(r, bot, { text, from, fromName: this.registry.bot(from)?.name, t: Date.now() })
    else this.sessions.send(r, bot, text, opts.client)
    return r.id
  }

  /** BR-2 · 이 호스트가 돌린 루틴 회차(세션 id → 몇 번째 시도) — 재시도 판단 */
  private routineRuns = new Map<string, { botId: string; attempt: number }>()
  /** @returns 루틴 세션 id */
  runRoutine(bot: Bot, r: RoutineDef, why: { attempt?: number; catchup?: number } = {}): string {
    this.log(`루틴 실행: ${bot.name} · ${r.name}${why.attempt && why.attempt > 1 ? ` · ${why.attempt}번째 시도` : ''}${why.catchup ? ' · 놓친 회차 보충' : ''}`)
    this.routines.markRun(bot.id, r.name)
    const run = routineRun(r)   // BS · 문구와 권한 모드를 같은 값에서
    const s = this.sessions.create(bot, `루틴 · ${r.name}`, { permissionMode: run.mode, routine: r.name })
    this.runs.start(s.id, bot.id, bot.name, r.name, why)
    this.routineRuns.set(s.id, { botId: bot.id, attempt: why.attempt ?? 1 })
    /**
     * AI · **루틴 세션은 둘까지만** (2026-09-24 Dave). 새로 만든 뒤 오래된 «끝난» 것부터 걷는다 —
     * 🔴 도는 중·확인 대기는 걷지 않는다(하던 일을 끊고 안 읽은 답을 지우게 된다). 판정은 `core` 가 아니라
     *    `routines.routinesToDrop` 한 곳에 있다(순수 · 유닛).
     */
    for (const id of routinesToDrop(this.sessions.list(bot.id))) {
      this.log(`루틴 세션 정리: ${id}`)
      this.sessions.remove(id)
    }
    this.sessions.send(s, bot, run.text, undefined, 'routine')
    return s.id
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
    if (this.auth.verdict === 'loggedin' && prev !== 'loggedin') this.sessions.drainAll()   // 로그인이 막혀 큐에만 둔 편지를 내보낸다
    if (this.auth.verdict === 'loggedin' && this.queued.length) {
      const q = this.queued; this.queued = []
      for (const it of q) { const b = this.registry.bot(it.botId); const r = this.sessions.get(it.sessionId); if (b && r) this.sessions.send(r, b, it.text, undefined, it.origin) }
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
  shutdown(): void { this.sessions.stopAll(); this.watcher.close(); this.bridges.closeAll(); this.ops.stop() }

  /** 오케스트레이터 «🤝 소통» 세션에 시스템이 한 줄 넣는다(봇의 말로 · 일하는 중이면 큐) — 로그인이 막혀 있으면 큐에만 */
  notifyOrch(text: string, from: string): void {
    this.log(text.split('\n')[0])
    const orch = this.registry.bot(ORCH_ID); if (!orch) return
    const r = this.sessions.commOf(orch, from)
    const msg: QueuedMsg = { text, from, fromName: from === 'ops' ? '🛠 운영 감시' : from, t: Date.now(), origin: 'bot' }
    if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') this.sessions.enqueue(r, msg); else this.sessions.sendFromBot(r, orch, msg)
  }

  // ── BU · orch_report — 폴더 봇의 보고를 모아 오케스트레이터에게 ─────────────────────────────
  private reportBuf: { bot: string; botId: string; kind: string; text: string; t: number }[] = []
  private reportTimer: NodeJS.Timeout | null = null
  /** 보고를 모아 두는 시간 — 그 사이 온 보고는 한 턴으로 넘어간다(장애·급함은 바로) */
  reportHoldMs = Number(process.env.FOLDERBOT_REPORT_HOLD_MS) || 5 * 60_000   // 검사 시임 — 스모크가 몇 초로 줄인다
  /** BR-2 · 실패한 루틴을 다시 돌리기까지(검사 시임 FOLDERBOT_RETRY_MS) */
  retryDelayMs = Number(process.env.FOLDERBOT_RETRY_MS) || RETRY_DELAY_MS
  /** @returns 'now'(바로 넘김) · 'held'(모아 둠) */
  orchReport(bot: Bot, kind: 'report' | 'done' | 'incident', text: string, urgent: boolean, sid = ''): 'now' | 'held' {
    const t = Date.now()
    this.reportBuf.push({ bot: bot.name, botId: bot.id, kind, text, t })
    this.runs.note({ event: 'report', botId: bot.id, bot: bot.name, kind, text: text.slice(0, 500), urgent: urgent || undefined, session: sid || undefined })
    if (urgent || kind === 'incident') { this.flushReports(); return 'now' }
    if (!this.reportTimer) { this.reportTimer = setTimeout(() => this.flushReports(), this.reportHoldMs); this.reportTimer.unref?.() }
    return 'held'
  }
  flushReports(): void {
    if (this.reportTimer) { clearTimeout(this.reportTimer); this.reportTimer = null }
    const items = this.reportBuf.splice(0); if (!items.length) return
    const orch = this.registry.bot(ORCH_ID); if (!orch) return
    const time = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    const text = [`[보고 ← 폴더 봇 ${items.length}건]`, '(답이 필요 없는 보고다. 연결 상대에게 넘길 것만 골라 bridge_send 로 넘기고, 나머지는 기록만 한다.)', ...items.map((x) => `- [${time(x.t)} · ${x.bot} · ${x.botId} · ${x.kind}] ${x.text.replace(/\s*\n\s*/g, ' ')}`)].join('\n')
    const r = this.sessions.commOf(orch, 'reports')
    const msg: QueuedMsg = { text, from: 'reports', fromName: '📥 보고', t: Date.now(), origin: 'bot', reports: true }
    if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') this.sessions.enqueue(r, msg)
    else this.sessions.sendFromBot(r, orch, msg)
  }

  /** BQ-8 · 급한 편지 → 상대 웹훅. 결과는 실행 기록에 남긴다(키 값은 남기지 않는다) */
  async wakePeer(peer: PeerDef, payload: Record<string, unknown>): Promise<void> {
    if (!peer.wake) return
    let res: { ok: boolean; status?: number; error?: string }
    try { res = await wakePeer(readWakeEnv(peer.wake.env), payload) } catch (e) { res = { ok: false, error: (e as Error).message } }
    this.runs.note({ event: 'wake', peer: peer.id, id: String(payload.id), ok: res.ok, ...(res.status ? { status: res.status } : {}), ...(res.error ? { error: res.error } : {}) })
    if (!res.ok) this.log(`⚠ 연결 «${peer.name}» 깨우기 실패 · ${res.error ?? res.status}`)
  }
  /**
   * BQ-8 · 상대가 조용하다 / 돌아왔다 — 실행 기록 + 오케스트레이터 소통 세션에 한 줄 + (끊김이면) `fallback_notify` 명령.
   * ⚠ 같은 일을 볼트 감시기도 한다면 둘 중 하나만 켠다(알림이 두 갈래가 된다).
   */
  peerSignal(peer: PeerDef, last: number, alive: boolean): void {
    const ago = Math.round((Date.now() - last) / 60_000)
    const at = new Date(last).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    this.runs.note({ event: alive ? 'peer_ok' : 'peer_stale', peer: peer.id, last: new Date(last).toISOString(), minutes: ago })
    const text = alive ? `[연결 회복] ${peer.icon} ${peer.name} — 다시 신호가 왔어요(${at}).` : `[연결 끊김] ${peer.icon} ${peer.name} — 마지막 신호 ${at}(${ago}분 전). 기대 주기 ${Math.round((peer.expectEveryMs ?? 0) / 60_000)}분을 넘었어요. 상대 쪽(앱·연결·루틴)을 확인해 주세요.`
    this.log(text)
    const orch = this.registry.bot(ORCH_ID)
    if (orch) { const r = this.sessions.commOf(orch, `peer:${peer.id}`); const msg: QueuedMsg = { text, from: `peer:${peer.id}`, fromName: `${peer.icon} ${peer.name}`, t: Date.now(), origin: 'bot' }; if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') this.sessions.enqueue(r, msg); else this.sessions.sendFromBot(r, orch, msg) }
    if (!alive && peer.fallbackNotify) execFile('/bin/sh', ['-c', `${peer.fallbackNotify} "$1"`, 'sh', text], { timeout: 30_000 }, (e) => { if (e) this.log(`⚠ 연결 «${peer.name}» 대체 알림 실패 · ${e.message}`) })
  }

  private isDeliverTarget(p: PeerDef, bot: Bot): boolean { const q = p.deliver.bot; return q === bot.id || q === bot.name || q === bot.rel }
  /**
   * BQ-3·4 · 편지 묶음을 상대의 채널 세션에 넣는다 — 사람이 아니라 «바깥 상대» 의 턴(`turnFrom: peer`)이다.
   * 🔴 두 번 넣지 않는다 — 배달 기록을 쓰기 전에 꺼졌다 켜지면 같은 편지가 다시 오므로, 세션의 큐와 최근 대화에 그 id 가 있으면 건너뛴다.
   * 🔴 로그인이 막혀 있으면 보내지 않고 큐에만 둔다(파일로 저장된다) — 복구되면 `drainAll` 이 내보낸다.
   * @returns 세션 id · 넣을 봇이 없으면 null(기록하지 않고 다음 폴링에 다시)
   */
  deliverLetters(peer: PeerDef, items: Incoming[]): string | null {
    const bot = this.registry.bots().find((b) => this.isDeliverTarget(peer, b))
    if (!bot) { this.log(`⚠ 연결 «${peer.name}» 편지를 넣을 봇 «${peer.deliver.bot}» 이 없어요 — 편지는 그대로 두고 다음에 다시`); return null }
    const r = this.sessions.channelOf(bot, peer.id, peer.deliver.session, peer.trust)
    const queued = new Set((r.queue ?? []).flatMap((q) => q.letters ?? []))
    const recent = r.items.slice(-400).filter((i) => i.kind === 'user').map((i) => (i as { text: string }).text)
    const fresh = items.filter((x) => !queued.has(x.letter.id) && !recent.some((t) => t.includes(`id="${x.letter.id}"`)))
    if (!fresh.length) return r.id
    const msg: QueuedMsg = { text: letterBatch(peer.name, fresh.map((x) => ({ letter: x.letter, rel: x.rel }))), from: `peer:${peer.id}`, fromName: `${peer.icon} ${peer.name}`, t: Date.now(), origin: 'peer', letters: fresh.map((x) => x.letter.id), ...(fresh.some((x) => x.letter.urgent) ? { urgent: true } : {}) }
    if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') this.sessions.enqueue(r, msg)
    else this.sessions.sendFromBot(r, bot, msg)
    return r.id
  }
}

function summarize(req: PermissionRequest): string {
  const i = req.input
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  return (s('command') || s('file_path') || s('path') || s('url') || s('description') || JSON.stringify(i)).slice(0, 120)
}
