import { AK_ROUTINE, AkiflowSync } from './akiflow'
import { invalidateUsage } from './usage'
import { planNow, refreshPlan } from './planUsage'
import { DEVICE_RULES_MD, type ClientCtx } from '../core/clientCtx'
import { mdPlain } from '../core/mdPlain'   // 알림 미리보기는 글자만 — 마크다운 기호가 그대로 나왔다(2026-09-25)
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { execFile, execFileSync } from 'node:child_process'
import { hostname } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { TODO_RULES_PROMPT, asksTodo, lastHumanText, parseTodo, setMetaLine } from '../core/todo'
import type { AuthState, Bot, Frame, PermissionMode, PermissionRequest, RoutineDef, SessionState } from '../core/types'
import { STATE_LABEL, stripRuntime } from '../core/types'
import type { TurnFrom } from '../core/turnGuard'
import { checkAuth } from './auth'
import { FolderWatch } from './watch'
import { NameIndex } from './nameIndex'
import { Notifier } from './notify'
import { type HostConfig, absRoot, atomicWrite, dataDir, saveConfig } from './paths'
import { McpAuth } from './mcpAuth'
import { BridgeHub, type Incoming } from './bridge'
import { INTERRUPTED_REASON, RunLog } from './runs'
import { mailWake, readWakeEnv, wakePeer } from './wake'
import { AskDesk, answerAfter } from './ask'
import { OpsWatch } from './opsWatch'
import { isDaveSaid, letterBatch } from '../core/fbmf'
import { askPatternHits, askTarget, ownsPeer, wakeMail, type AskBot, type PeerDef } from '../core/bridges'
import type { QueuedMsg } from '../core/types'
/** BX · 셸이 주는 업데이트 상태(`desktop/updater.js state()`) · 새벽 적용 걸기/풀기 */
export interface ShellUpdate { state: () => unknown; dawn: (on: boolean) => unknown }
import { ORCH_ID, Registry, canon, ORCH_REQUEST_RULES_MD, DAVE_SAID_RULES_MD, ORCH_ASK_HINT, ORCH_REPORT_HINT, LETTER_RULES_MD } from './registry'
import { CATCHUP_WINDOW_MS, Routines, routineRun, RETRY_DELAY_MS, StartQueue } from './routines'
import { boardSummary, latestStarts, pairRuns } from '../core/routineBoard'
import { buildBoard, type Board } from './routineBoard'
import { RoutineNotes } from './routineNotes'
import { parseOps } from '../core/ops'
import { RUN_TIMEOUT_MS } from '../core/runs'
import { autoToDrop, sessArea } from '../core/autoArea'
import { mark } from './slow'
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
  /** DA · `folderbot ask` 대기 창구 — 묻는 편지 id 마다 화면 앞에서 기다리는 쪽(host/ask.ts) */
  readonly askDesk = new AskDesk()
  /** BR-1 · 루틴 실행 기록 */
  readonly runs: RunLog
  /** CK-2 · Akiflow 동기화(짝 장부 · 계획 · 결과) */
  readonly akiflow: AkiflowSync
  /** BZ · 호스트 운영 감시(`.claude/ops.yml` 의 명령을 주기마다) */
  readonly ops: OpsWatch
  /** 파일 이름 색인 — `/exists` 가 이름만 적힌 것을 볼트 전체에서 찾을 때 (host/nameIndex 머리말) */
  readonly names = new NameIndex()
  auth: AuthState = { verdict: 'unknown', checkedAt: 0 }
  private queued: { botId: string; sessionId: string; text: string; origin: TurnFrom }[] = []
  broadcast: (f: Frame) => void = () => {}
  /** 🔴 `.bot.yml` 이 밖에서 바뀌면 **UI 로 저장한 것과 같은 길**을 탄다(AA-2) — 화면 갱신 + 스케줄 다시 걸기 */
  watcher = new FolderWatch(
    (botId) => { mark('폴더 바뀜'); this.broadcast({ ev: 'files', botId }); this.refreshNames() },
    (botId) => { mark('설정 다시 읽기'); this.log(`설정 파일이 바뀌어 루틴·연결을 다시 읽어요 · ${this.registry.bot(botId)?.name ?? botId}`); this.afterBotsChanged(); if (botId === ORCH_ID) { this.bridges.reload(); this.ops.reload() } },
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
  /**
   * BX · 셸(Electron 호스트 모드)이 넘겨 준 업데이트 손잡이 — 원격 화면(폰·맥북)도 이 맥의 «새벽 4시에 적용» 을 걸고 풀 수 있다.
   * 터미널로 띄운 호스트에는 셸이 없다(null) — 그때 화면은 이 칸을 안 그린다.
   */
  update: ShellUpdate | null = null

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
    this.routines = new Routines({ run: (b, r, why) => { if (why?.catchup) this.queueRun(why.catchup, b, r, why); else this.runRoutine(b, r, why ?? {}) }, log: this.log })   // RB-2 · 보충은 시작 줄(동시 2개)로
    this.routines.owner = () => this.ownsRoutines()
    this.routineNotes = new RoutineNotes({ root: this.registry.root, log: (m) => this.log(m), owner: () => this.ownsRoutines() })
    this.akiflow = new AkiflowSync(this.registry.root, () => this.registry.bots(), (botId) => { const b = this.registry.bot(botId); if (b) this.broadcast({ ev: 'todo', botId, items: readTodo(b.abs) }) }, (botId, title) => { if (title) this.noteTodoTitle(botId, title) })
    this.akiflow.routineOn = () => !!this.registry.bot('orch')?.routines.some((x) => x.name === AK_ROUTINE && x.enabled !== false)
    this.bridges = new BridgeHub({ root: this.registry.root, dataDir: dataDir(), hostNames: () => [hostname(), this.hostName(), this.cfg.hostName ?? ''], log: (m) => this.log(m), deliver: (peer, items) => this.deliverLetters(peer, items),
      wake: (peer, payload) => { void this.wakePeer(peer, payload) },
      askState: (peerId, re) => this.askDesk.state(peerId, re),
      askAnswered: (peerId, re, a) => this.askDesk.answered(peerId, re, a),
      onStale: (peer, last) => this.peerSignal(peer, last, false),
      onAlive: (peer, last) => this.peerSignal(peer, last, true),
      onChange: () => this.bridgesChanged() })
    this.routines.file = join(dataDir(), 'routine-runs.json')   // BR-2 · 놓친 회차 판단 기준
    this.runs = new RunLog(this.registry.root, () => this.bridges.cfg.runsCopy, () => hostname().replace(/\.local$/, ''), (m) => this.log(m))
    this.ops = new OpsWatch({ root: this.registry.root, hostNames: () => [hostname(), this.hostName(), this.cfg.hostName ?? ''], log: (m) => this.log(m),
      note: (e) => this.runs.note(e),
      alert: (text) => this.notifyOrch(text, 'ops'),
      firstDelayMs: Number(process.env.FOLDERBOT_OPS_FIRST_MS) || 30_000 })
    this.wire()
    this.sessions.drainAll()   // 호스트가 다시 떴다 — 기다리던 봇 말을 내보낸다
    this.routines.reschedule(this.registry.bots())
    this.routineNotes.sync(this.registry.bots())   // RB-3 · 폴더 CLAUDE.md 루틴 구역
    // CI · 지난 프로세스가 끝을 못 적은 회차(재시작·업데이트로 끊김)를 바로 닫는다 — 감시기가 «실행 중» 으로 오래 보지 않게
    const cut = this.recoverInterrupted()
    // BR-2 · 꺼져 있던 사이 놓친 회차를 한 번 보충한다 — 세션·인증이 자리 잡은 뒤에. 끊긴 회차의 재시도가 먼저(그게 markRun 을 적어 보충이 같은 루틴을 또 돌리지 않는다)
    setTimeout(() => {
      try { this.afterInterrupted(cut) } catch (e) { this.log(`끊긴 회차 처리 실패: ${(e as Error).message}`) }
      try { this.afterCutTurns(this.sessions.cutTurns) } catch (e) { this.log(`끊긴 턴 알림 실패: ${(e as Error).message}`) }
      try { this.routines.catchUp(this.registry.bots(), Date.now(), this.sharedRan()) } catch (e) { this.log(`놓친 회차 보충 실패: ${(e as Error).message}`) }
    }, Number(process.env.FOLDERBOT_CATCHUP_MS) || 20_000).unref()   // 검사 시임 — 스모크가 줄인다
    // 봇 폴더 감시 — 세션을 거치지 않은 쓰기(Bash·Codex·Dropbox·Finder)도 트리에 온다 (host/watch.ts 머리말)
    this.watcher.log = (m) => this.log(m)
    this.watcher.onRaw = () => this.names.touch()
    this.notifier.log = (m) => this.log(m)   // CF-④ 푸시 결과도 호스트 로그로
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
    // CC · 자동화 영역 정리(매시간) — 루틴마다 1개(2026-10-19) · 7일 지난 자동 세션
    setInterval(() => { try { this.sweepAuto() } catch (e) { this.log(`자동화 세션 정리 실패: ${(e as Error).message}`) } }, 3600_000).unref()
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
    this.registry.on('bots', (bots: Bot[], meta?: { reorderedBy?: 'orchestrator' }) => { this.routines.reschedule(bots); this.routineNotes.sync(bots); this.broadcast({ ev: 'bots', bots, ...(meta ?? {}) }); this.watcher.sync(bots) })
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
      this.guardTodo(r, prev)
      // BR-1 · 루틴 회차가 끝났다 — 결과 줄(`결과: ok|fail|skip`)까지 읽어 기록한다
      if (r.routine && prev === 'running' && (r.state === 'done' || r.state === 'error')) {
        const lastA = [...r.items].reverse().find((i) => i.kind === 'assistant') as { text: string } | undefined
        const res = this.runs.end(r.id, r.state === 'done', lastA?.text, r.state === 'error' ? r.lastError : undefined)
        const w = this.waitEnd.get(r.id); if (w) { this.waitEnd.delete(r.id); w() }   // RB-2 · 시작 줄의 자리를 비운다
        this.fromQueue.delete(r.id)
        // BR-2 · 실패한 회차는 `retry: true` 인 루틴만 10분 뒤 한 번 다시(기본 끔 — 외부 발송이 두 번 나가지 않게)
        const info = this.routineRuns.get(r.id); this.routineRuns.delete(r.id); this.startQueue.kick()   // 제시각 회차가 끝났으면 줄에 자리가 났다
        if (res && !res.ok && info && info.attempt === 1) {
          const def = this.registry.bot(info.botId)?.routines.find((x) => x.name === r.routine)
          if (def?.retry === true && def.enabled !== false) {
            this.runs.note({ event: 'retry', botId: info.botId, routine: def.name, run: r.id, ms: this.retryDelayMs })
            setTimeout(() => { const b = this.registry.bot(info.botId); const d = b?.routines.find((x) => x.name === def.name); if (b && d && d.enabled !== false) this.runRoutine(b, d, { attempt: 2 }) }, this.retryDelayMs).unref()
          }
        }
      }
      // DA · ask 로 온 편지가 든 턴이 끝났다 — bridge_send 로 답하지 않았으면 마지막 답으로 답 편지를 쓴다(기다리는 쪽에 돌려준다)
      if (r.channel && prev === 'running' && r.state !== 'running' && r.state !== 'awaiting_input') {
        this.askTurnEnded(r)
        this.sessions.closeAsks(r, (id) => answerAfter(r.items as { kind: string; text?: string }[], id) !== null)   // DB · 화면 «묻는 중» → «답함»
      }
      // L · 턴이 끝나면 사용량 캐시를 비운다 — 다음 /api/usage 가 새 기록을 훑어 60초 안에 원격 패널이 바뀐다
      if (prev === 'running' && r.state !== 'running') { invalidateUsage(); planNow(this.sessions.bin, true) }   // BD · 턴을 썼으니 실제 한도도 다시(60초 문턱 안에서)
      this.broadcast({ ev: 'sessions', botId: r.botId, sessions: this.sessions.list(r.botId) })
      if (!notify || r.state === 'awaiting_input') return
      const bot = this.registry.bot(r.botId)
      const last = [...r.items].reverse().find((i) => i.kind === 'assistant') as { text: string } | undefined
      const asRoutine = !!r.routine && !r.adopted   // CC · 사람이 이어받은 루틴 세션의 답은 사람 세션처럼 알린다
      if (r.state === 'done') this.notifier.emit(asRoutine ? 'routine' : 'done', r.botId, `${bot?.name ?? ''} · ${STATE_LABEL.done}`, mdPlain(last?.text ?? r.name).slice(0, 140), r.id, { push: !asRoutine || bot?.routines.find((x) => x.name === r.routine)?.push !== false })
      if (r.state === 'error') this.notifier.emit('error', r.botId, `${bot?.name ?? ''} · ${STATE_LABEL.error}`, (r.lastError ?? '세션 오류').split('\n').pop()!.slice(0, 140), r.id)
    })
  }

  systemPrompt(bot: Bot): string {
    const parts: string[] = []
    // BH · orch_ask — 볼트의 orchestrator.md·폴더 CLAUDE.md 가 옛 판이어도 규칙이 닿게 시스템 프롬프트로도 준다(DEVICE_RULES_MD 와 같은 이유)
    if (bot.orchestrator) { const op = this.registry.orchestratorPrompt(); parts.push(op); if (!op.includes('봇이 보낸 요청')) parts.push(ORCH_REQUEST_RULES_MD); else if (!op.includes('Dave 가 직접 한 말')) parts.push(`## 봇이 보낸 요청에 붙은 Dave 원문 (orch_ask)\n${DAVE_SAID_RULES_MD}`) }   // CS · 옛 orchestrator.md 에도 닿게
    else parts.push(`너는 Folder Bot 의 봇이다. 폴더 "${bot.rel}" 안에서 일한다. 산출물은 이 폴더에 둔다.\n${ORCH_ASK_HINT}\n${ORCH_REPORT_HINT}`)
    // BQ · 연결 편지를 받거나 보낼 수 있는 봇에게만 편지 규칙을 준다
    if (this.bridges?.cfg.peers.some((p) => p.enabled && (this.isDeliverTarget(p, bot) || p.maySend.includes(bot.id) || p.mayAsk.some((x) => askPatternHits(x, askBotOf(bot)))))) parts.push(LETTER_RULES_MD)
    parts.push(this.registry.todoRules() ?? TODO_RULES_PROMPT)   // CK-3 · 볼트 `todo-rules` 블록이 이긴다
    parts.push(DEVICE_RULES_MD)   // J-2 · 볼트 CLAUDE.md 에도 같은 글이 있지만, 옛 볼트에는 없으므로 시스템 프롬프트로도 준다
    const ctx = todoContext(bot.abs)
    if (ctx) parts.push(ctx)
    return parts.join('\n\n')
  }

  afterBotsChanged(): void {
    // 🔴 다시 짜고 나서 보낸다 (AA-1) — 스케줄 결과(lastError·nextRun)가 같은 판에 실려 나가야 화면이 사실을 본다
    const bots = this.registry.bots()
    this.routines.reschedule(bots)
    this.routineNotes?.sync(bots)   // 최종 리뷰 · `.bot.yml` 을 손으로 고쳐도 그 폴더 CLAUDE.md 구역이 따라온다
    this.broadcast({ ev: 'bots', bots })
  }

  /** 세션에 지시 — 없으면 만든다 */
  sendToBot(bot: Bot, text: string, sessionId?: string, name?: string, from?: string, opts: { model?: string; effort?: string; permissionMode?: PermissionMode; vendor?: 'claude' | 'codex'; client?: ClientCtx; grant?: string[] } = {}): string {
    let r = sessionId ? this.sessions.get(sessionId) : undefined
    // 🔴 봇끼리 오가는 말은 받는 봇의 «🤝 소통» 세션 하나로 (2026-10-02 Dave) — 세션을 집어 보냈으면 그 세션으로(답 돌려주기)
    if (!r && from && !name) r = this.sessions.commOf(bot, from)
    if (!r) {
      const list = this.sessions.list(bot.id).filter((x) => sessArea(x) === 'chat')   // 사람의 «이어서» 는 자동화 세션(소통·채널·루틴·봇끼리)으로 가지 않는다(CC)
      if (!name && list.length && !from) r = this.sessions.get(list[0].id)
      if (!r) {
        // BE · 봇당 4개도 같은 규칙 — 넘치면 그 봇의 가장 오래 안 쓴 쉬는 워커를 재운다. 전부 일하는 중일 때만 거절한다.
        //    호스트 전체 상한(15)은 워커를 띄우는 자리(`sessions.ensureWorker`)가 지킨다 — 새로 만들 때도, 잠든 세션을 깨울 때도
        if (this.sessions.liveCountFor(bot.id) >= 4 && !this.sessions.sleepLru(undefined, bot.id)) throw new Error(`${bot.name} 은 세션 4개가 모두 일하는 중이에요. 하나 끝나면 이어서 하세요.`)
        // BH · 위임으로 새로 연 세션은 출처를 남긴다 — `orch_ask` 가 이것으로 «되묻기 고리» 를 막는다
        r = this.sessions.create(bot, name ?? (from ? `위임 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '메인'), { ...opts, ...(from ? { delegatedFrom: from } : {}) })
      }
    }
    // CC · 사람이 자동화 세션에 보낸 말 — 루틴·봇끼리는 그 세션을 채팅으로 옮기고, 소통·채널은 새 채팅을 갈라 연다
    if (!from) r = this.sessions.takeOver(r, bot)
    if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') {
      this.queued.push({ botId: bot.id, sessionId: r.id, text, origin: from ? 'bot' : 'human' })
      this.sessions.get(r.id)!.items.push({ id: `q${Date.now()}`, t: Date.now(), kind: 'system', text: '미니의 Claude 로그인이 필요해 대기열에 뒀어요. 복구되면 이어서 보냅니다.' })
      this.broadcast({ ev: 'chat', sessionId: r.id, item: r.items[r.items.length - 1] })
      return r.id
    }
    // 다른 봇이 보낸 말은 받는 세션이 일하는 중이면 큐에서 기다린다(SessionManager.sendFromBot)
    if (from) this.sessions.sendFromBot(r, bot, { text, from, fromName: this.registry.bot(from)?.name, t: Date.now(), ...(opts.grant?.length ? { grant: opts.grant } : {}) })
    else this.sessions.send(r, bot, text, opts.client)
    return r.id
  }

  /** RB-3 · 루틴 변경 기록 · 폴더 CLAUDE.md 루틴 구역 */
  routineNotes!: RoutineNotes
  /** RB-2 · 켜질 때 몰리는 실행(끊긴 회차 재시도 · 놓친 회차 보충)의 줄 — 동시 2개 · 예정 시각 이른 것부터 */
  private startQueue = new StartQueue(2, () => this.onTimeLive())
  /** RB-2 · 줄을 거쳐 시작한 회차(세션 id) — 나머지 도는 루틴은 제시각 회차다 */
  private fromQueue = new Set<string>()
  /** 최종 리뷰 · 지금 도는 제시각 회차 수 — 줄의 동시 한도에 넣는다(60분 넘은 것은 끝난 셈 · 멈춘 세션이 줄을 영영 막지 않게) */
  private onTimeLive(now = Date.now()): number {
    let n = 0
    for (const [sid, x] of this.routineRuns) if (!this.fromQueue.has(sid) && now - x.t < RUN_TIMEOUT_MS) n++
    return n
  }
  /** RB-2 · 줄에서 시작한 회차가 끝나면 부를 것(세션 id → 자리 비우기) */
  private waitEnd = new Map<string, () => void>()
  /** RB-2 · 줄에 세워 돌린다 — 회차가 끝나거나 60분(`RUN_TIMEOUT_MS`)이 지나면 다음 것이 뜬다 */
  queueRun(at: number, b: Bot, r: RoutineDef, why: { attempt?: number; catchup?: number } = {}): void {
    // 🔴 최종 리뷰 · 같은 루틴은 줄에 하나만 · 차례가 왔을 때 그사이 이 호스트가 이미 돌렸으면(제시각 회차·croner 의 늦은 타이머) 건너뛴다
    const t0 = Date.now(), key = `${b.id}::${r.name}`
    const queued = this.startQueue.push(at, () => new Promise<void>((res) => {
      const cur = this.registry.bot(b.id), d = cur?.routines.find((x) => x.name === r.name)
      if (!cur || !d || d.enabled === false) { res(); return }   // 줄에서 기다리는 사이 지워졌거나 꺼졌다
      const sid = this.runRoutine(cur, d, why)
      this.fromQueue.add(sid)
      const timer = setTimeout(() => { if (this.waitEnd.delete(sid)) res() }, RUN_TIMEOUT_MS); timer.unref()
      this.waitEnd.set(sid, () => { clearTimeout(timer); res() })
    }), { key, skip: () => { const done = this.routines.ranSince(b.id, r.name, t0); if (done) this.log(`줄에서 기다리던 회차를 건너뛰어요(그사이 이미 돌았어요): ${b.name} · ${r.name}`); return done } })
    if (!queued) this.log(`이미 줄에서 기다리는 루틴이라 또 넣지 않아요: ${b.name} · ${r.name}${why.catchup ? ' · 보충' : ''}${why.attempt ? ` · ${why.attempt}번째 시도` : ''}`)
  }
  /** RB-2 · 이 호스트가 루틴 주인인가 — `.claude/ops.yml` 의 `host:`(운영 감시와 같은 판정 · 없으면 어디서나) */
  ownsRoutines(): boolean {
    let host: string | undefined
    try { const f = join(this.registry.root, '.claude', 'ops.yml'); if (existsSync(f)) host = parseOps(readFileSync(f, 'utf8')).host } catch { /* 못 읽으면 지금처럼 어디서나 */ }
    return ownsPeer({ host }, [hostname(), this.hostName(), this.cfg.hostName ?? ''])
  }
  /** RB-2 · 공유 실행 기록에 그 시각 이후 시작이 있나 — 다른 호스트가 이미 돌린 회차 */
  sharedRan(): (botId: string, name: string, t: number) => boolean {
    let m = new Map<string, number>()
    try { m = latestStarts(this.runs.events()) } catch (e) { this.log(`실행 기록을 못 읽었어요: ${(e as Error).message}`) }
    return (botId, name, t) => (m.get(`${botId}::${name}`) ?? 0) >= t
  }
  /** RB-5 · 루틴 보드 한 장 — 페이지·도구·정기보고 공용 */
  routineBoard(now = Date.now()): Board {
    let events: ReturnType<RunLog['events']> = []
    try { events = this.runs.events() } catch (e) { this.log(`실행 기록을 못 읽었어요: ${(e as Error).message}`) }
    return buildBoard(this.registry.bots(), (id, r) => this.routines.decorate(id, r), events, this.routineNotes.all(), now, (b) => !!this.routineNotes.noteFile(b))
  }
  /** RB-4 · 정기보고 «⏰ 루틴» 덩이 — 요약 한 줄 · 문제 · 그동안 바뀐 루틴 */
  routineOverview(since: number, problemsOnly = false): { summary: string; problems: unknown[]; changes: unknown[]; counts?: Board['counts'] } {
    const now = Date.now(), board = this.routineBoard(now)
    let rows: ReturnType<typeof pairRuns> = []
    try { rows = pairRuns(this.runs.events()) } catch { /* 위에서 이미 알렸다 */ }
    const problems = board.routines.filter((r) => r.state === 'fail' || r.state === 'missed' || r.state === 'unknown')
      .map((r) => ({ bot: r.bot, routine: r.name, state: r.state, when: r.when, why: r.last?.reason ?? r.error ?? null, daveTodo: r.daveTodo, last: r.last ? new Date(r.last.start).toISOString() : null }))
    const changes = this.routineNotes.all().filter((c) => c.at >= since).map((c) => ({ at: new Date(c.at).toISOString(), bot: this.registry.bot(c.botId)?.name ?? c.botId, routine: c.routine, actor: c.actor, what: c.what, why: c.why ?? null }))
    return { summary: boardSummary(rows, since, now, board.today.slots), problems, changes, ...(problemsOnly ? {} : { counts: board.counts }) }
  }
  /** RB-2 · 맥이 잠들었다 깼다 — 그 사이 놓친 회차를 같은 규칙으로 보충한다(desktop powerMonitor `resume`) */
  onWake(): void {
    this.log('깨어남 — 놓친 루틴 회차를 확인해요')
    try { this.routines.catchUp(this.registry.bots(), Date.now(), this.sharedRan()) } catch (e) { this.log(`놓친 회차 보충 실패: ${(e as Error).message}`) }
  }

  /** BR-2 · 이 호스트가 돌린 루틴 회차(세션 id → 몇 번째 시도) — 재시도 판단 */
  private routineRuns = new Map<string, { botId: string; attempt: number; t: number }>()
  /** @returns 루틴 세션 id */
  runRoutine(bot: Bot, r: RoutineDef, why: { attempt?: number; catchup?: number } = {}): string {
    this.log(`루틴 실행: ${bot.name} · ${r.name}${why.attempt && why.attempt > 1 ? ` · ${why.attempt}번째 시도` : ''}${why.catchup ? ' · 놓친 회차 보충' : ''}`)
    this.routines.markRun(bot.id, r.name)
    const run = routineRun(r)   // BS · 문구와 권한 모드를 같은 값에서
    const s = this.sessions.create(bot, `루틴 · ${r.name}`, { permissionMode: run.mode, routine: r.name })
    this.runs.start(s.id, bot.id, bot.name, r.name, why)
    this.routineRuns.set(s.id, { botId: bot.id, attempt: why.attempt ?? 1, t: Date.now() })
    /**
     * AI · 루틴 세션은 둘까지 → CC · **루틴마다** 둘까지 + 7일 지난 자동 세션 (2026-10-12) → **루틴마다 하나** (2026-10-19). 새로 만든 뒤 걷는다 —
     * 🔴 채팅(사람이 이어받은 세션 포함)·도는 중·확인 대기·백그라운드·대기 말·30분 안 활동은 걷지 않는다(`core/autoArea`).
     */
    this.sweepAuto(bot.id)
    this.sessions.send(s, bot, run.text, undefined, 'routine')
    return s.id
  }

  /**
   * 🔴 **CI · 끊긴 루틴 회차** (2026-10-13 오케스트레이터 제보 — 12:00 SNS 게시 루틴이 12:02 업데이트 적용으로 끊겨 조용히 빠졌다).
   *    ① 켜질 때 기록을 닫고(`RunLog.recoverInterrupted` · fail · «호스트 재시작으로 중단») 그 세션에 한 줄 남긴다.
   *    ② 다시 돌릴지는 루틴의 `retry` 가 정한다(BR-2 와 같은 값 · 기본 끔 — 외부 발송이 두 번 나가지 않게). 켜져 있으면 두 번째 시도로 한 번,
   *       꺼져 있거나 이미 두 번째였으면 오케스트레이터 소통 세션에 한 줄 — 다시 돌릴지는 사람이 정한다.
   */
  recoverInterrupted(): ReturnType<RunLog['recoverInterrupted']> {
    let cut: ReturnType<RunLog['recoverInterrupted']> = []
    try { cut = this.runs.recoverInterrupted() } catch (e) { this.log(`끊긴 회차를 못 읽었어요: ${(e as Error).message}`) }
    for (const c of cut) {
      this.log(`끊긴 루틴 회차를 닫았어요: ${c.bot} · ${c.routine} · ${c.run}`)
      this.sessions.systemNote(c.run, `이 루틴 회차는 호스트가 다시 뜨면서(업데이트 적용·앱 재시작) 끊겼어요 — 실행 기록에 «실패 · ${INTERRUPTED_REASON}» 로 닫았어요.`)
    }
    return cut
  }
  /** CI ② — 끊긴 회차를 다시 돌리거나(retry) 오케스트레이터에게 알린다 · 보충 창(6시간)보다 오래된 회차는 알리기만 */
  afterInterrupted(cut: ReturnType<RunLog['recoverInterrupted']>, now = Date.now()): void {
    const told: string[] = []
    for (const c of cut) {
      const b = this.registry.bot(c.botId), d = b?.routines.find((x) => x.name === c.routine)
      const hm = new Date(c.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      if (b && d && d.retry === true && d.enabled !== false && c.attempt === 1 && now - c.at <= CATCHUP_WINDOW_MS) {
        this.runs.note({ event: 'retry', botId: c.botId, routine: c.routine, run: c.run, reason: INTERRUPTED_REASON })
        this.queueRun(c.at, b, d, { attempt: 2 })   // RB-2 · 보충과 한 줄에 — 시작 시각이 이르니 자연히 먼저
        continue
      }
      const why = !b || !d ? '루틴이 이제 없어요' : d.enabled === false ? '루틴이 꺼져 있어요' : c.attempt > 1 ? '이미 두 번째 시도였어요' : d.retry !== true ? '재시도가 꺼져 있어요(retry)' : '보충 창(6시간)이 지났어요'
      told.push(`- ${c.bot} · «${c.routine}» · ${hm} 시작 · 세션 ${c.run} — 다시 안 돌림: ${why}`)
    }
    if (told.length) this.notifyOrch(`[운영 · 끊긴 루틴 ${told.length}건] 호스트가 다시 뜨면서(업데이트 적용·앱 재시작) 도중에 끊긴 루틴 회차예요. 실행 기록은 «실패 · ${INTERRUPTED_REASON}» 로 닫았어요.\n${told.join('\n')}\n다시 돌릴지는 그 봇이나 Dave 가 정합니다(routine_run). 외부 발송이 든 루틴이면 이미 나갔는지 먼저 확인하세요.`, 'ops')
  }

  /**
   * 🔴 CI-2 · 루틴 아닌 턴이 끊겼다(세션 쪽이 켜질 때 «끊겼어요» 로 닫았다 · `core/cutTurn`). 봇·바깥 상대가 시킨 턴이면 시킨 쪽이 결과를
   *    기다리고 있으니 오케스트레이터에게 한 턴으로 알린다. 다시 돌리지는 않는다 — 외부 발송·파일 쓰기가 두 번 나갈 수 있다.
   *    사람이 시킨 턴은 그 사람이 대화에서 «끊겼어요» 줄을 본다.
   */
  afterCutTurns(cut: SessionManager['cutTurns']): void {
    const told: string[] = []
    for (const c of cut) {
      const bot = this.registry.bot(c.botId)
      this.log(`끊긴 턴을 닫았어요: ${bot?.name ?? c.botId} · ${c.name} · ${c.id}`)
      if (c.from !== 'bot' && c.from !== 'peer' && c.from !== 'routine') continue
      const hm = c.at ? new Date(c.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '시각 모름'
      told.push(`- ${bot?.name ?? c.botId} · «${c.name}» · ${hm} 시작 · 세션 ${c.id} · 시킨 쪽: ${c.from === 'peer' ? '바깥 상대(연결)' : c.from === 'routine' ? '루틴' : '봇'}`)
    }
    if (told.length) this.notifyOrch(`[운영 · 끊긴 턴 ${told.length}건] 호스트가 다시 뜨면서(업데이트 적용·앱 재시작) 도중에 끊긴 턴이에요. 그 대화에 «끊겼어요» 줄을 남겼고 다시 돌리지는 않았어요.\n${told.join('\n')}\n이어서 시키려면 그 봇에게 다시 보내 주세요(같은 세션이면 끊기기 전 맥락을 이어받아요). 외부 발송이 든 일이면 이미 나갔는지 먼저 확인하세요.`, 'ops')
  }

  /**
   * CC · 자동화 영역 정리 — 루틴이 돌 때(그 봇)와 매시간(모든 봇). 지운 세션은 «지웠다» 표식 → 7일 뒤 앱 데이터 trash(되살리기 가능).
   * @returns 지운 세션 id
   */
  sweepAuto(botId?: string, now = Date.now()): string[] {
    const ids = autoToDrop(this.sessions.list(botId), now)
    for (const id of ids) { const r = this.sessions.get(id); this.log(`자동화 세션 정리: ${id}${r ? ` · ${r.name}` : ''}`); this.sessions.remove(id) }
    return ids
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
  setQuiet(from: string, to: string, off?: boolean): void {
    const ok = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
    if (!ok(from) || !ok(to)) throw new Error('시간은 HH:MM 이어야 해요')
    const wasOff = this.cfg.quiet?.off ?? false
    this.cfg.quiet = { from, to, ...((off ?? wasOff) ? { off: true } : {}) }   // off 를 안 보내면 켬/끔은 그대로
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

  todoAdd(bot: Bot, title: string, desc: string, by: 'me' | 'bot', notify = false, section = '', meta: { due?: string; proposed?: boolean } = {}): void {
    const items = todoAdd(bot.abs, title, desc, by, section, meta)
    this.noteTodoTitle(bot.id, title)
    this.broadcast({ ev: 'todo', botId: bot.id, items })
    if (notify && by === 'bot') this.notifier.emit('todo', bot.id, `${bot.name} · 할 일 남김`, `${title}${desc ? `: ${desc}` : ''}`)
  }
  todo(bot: Bot) { return readTodo(bot.abs) }
  /**
   * CK-2 · 미리보기 ↔ 켜기. 🔴 켜기(live)는 사람이 설정에서 누를 때만 — 그때 오케스트레이터에 15분 루틴 «Akiflow 동기화» 가 생긴다.
   * 끄면(미리보기·off) 루틴을 지운다. 짝 장부는 그대로 둔다.
   */
  akiflowMode(mode: 'off' | 'preview' | 'live'): void {
    this.akiflow.setMode(mode)
    const orch = this.registry.bot('orch'); if (!orch) return
    const rest = orch.routines.filter((x) => x.name !== AK_ROUTINE).map(stripRuntime)
    this.registry.saveRoutines(orch, mode === 'live' ? [...rest, this.akiflow.routineDef()] : rest)
    this.afterBotsChanged()
  }
  /**
   * 🔴 **CK-3 · 지키게 하는 장치** — 사람이 시키지 않은 턴(봇·루틴·바깥 상대)이 `Edit` 로 todo.md 에 바로 쓴 `- [ ]` 줄은 «제안» 으로 돌린다.
   *    규칙만 적으면 도구를 안 거치는 길이 남는다(기획안 §4). 줄은 지우지 않고 `<!-- bot:proposed -->` 로 바꿔 Akiflow 로 안 가게 한다.
   * ⚠ 호스트가 쓴 줄(화면의 + · todo_add/todo_propose)은 건드리지 않는다 — 턴 동안 그 줄들을 따로 적어 둔다(`hostWrote`).
   * ⚠ 사람이 «할 일로 적어 줘» 한 턴(`asksTodo`)은 거르지 않는다 — 그 대화가 곧 상의다(규칙 2의 예외). 사람이 시킨 턴이라도 할 일 이야기가 없으면 거른다.
   */
  private todoSnap = new Map<string, { titles: Set<string>; descs: Set<string>; n: number; human: boolean; at: number }>()
  private hostWrote = new Map<string, Set<string>>()
  /** CK-3 · 호스트가 쓴 줄(화면의 + · 고치기 · 도구 · Akiflow)은 지키는 장치가 건드리지 않는다 — 최근 200개만 기억한다 */
  noteTodoTitle(botId: string, title: string): void {
    const w = this.hostWrote.get(botId) ?? new Set<string>(); w.add(title.trim().replace(/\s*:\s*$/, '')); if (w.size > 200) w.delete(w.values().next().value as string); this.hostWrote.set(botId, w)
  }
  private guardTodo(r: SessionRec, prev: SessionState): void {
    const bot = this.registry.bot(r.botId); if (!bot || bot.orchestrator) return
    const p = join(bot.abs, 'todo.md')
    // ⚠ 비교는 **제목**으로 한다 — 봇이 있던 줄의 설명을 고치는 것(규약: 못 한 이유 갱신)은 새 줄이 아니다
    const all = () => { try { return parseTodo(readFileSync(p, 'utf8')) } catch { return [] } }
    if (r.state === 'running' && prev !== 'running') {
      if (r.turnFrom && (r.turnFrom !== 'human' || !asksTodo(lastHumanText(r.items)))) {
        const xs = all()
        this.todoSnap.set(r.id, { titles: new Set(xs.map((t) => t.title)), descs: new Set(xs.map((t) => t.desc).filter(Boolean)), n: xs.length, human: r.turnFrom === 'human', at: Date.now() })
      }
      return
    }
    if (prev !== 'running' || r.state === 'running') return
    const snap = this.todoSnap.get(r.id); this.todoSnap.delete(r.id)
    if (!snap) return
    // 🔴 이 턴이 도구(Edit·Write)로 **이 todo.md 를 썼을 때만** 본다 — 그사이 사람이 패널·옵시디언에서 고친 줄이나 Akiflow 에서 내려온 줄을 봇 줄로 바꾸면 안 된다(리뷰 10/16)
    const same = (v: unknown) => { if (typeof v !== 'string') return false; try { return realpathSync(v).normalize('NFC') === realpathSync(p).normalize('NFC') } catch { return v.normalize('NFC') === p.normalize('NFC') } }
    const wrote = r.items.some((it) => it.kind === 'tool' && it.t >= snap.at - 1000 && ((/^(Edit|Write|MultiEdit)$/.test(it.name) && [it.input?.file_path, it.input?.path].some(same)) || (it.name === 'Bash' && /todo\.md/.test(String(it.input?.command ?? '')))))
    if (!wrote) return
    const mine = this.hostWrote.get(bot.id) ?? new Set<string>()
    let md: string; try { md = readFileSync(p, 'utf8') } catch { return }
    const items = parseTodo(md)
    // 🔴 사람이 시킨 턴은 **줄이 늘었을 때만** 본다 — 봇이 사람 줄의 제목을 고친 것(개명)을 새 봇 줄로 바꾸면 사람 줄의 주인이 봇으로 넘어간다(리뷰 10/16)
    if (snap.human && items.length <= snap.n) return
    const vanished = [...snap.titles].some((x) => !items.some((t) => t.title === x))
    let changed = 0
    for (const t of items) {
      if (t.done || t.proposed || t.ak) continue   // 짝 있는 줄(Akiflow)은 사람 몫이다
      if (snap.titles.has(t.title) || mine.has(t.title)) continue
      if (vanished && t.desc && snap.descs.has(t.desc)) continue   // 제목만 바뀐 있던 줄(설명이 같다) — 새 줄이 아니다
      md = setMetaLine(md, t.line, { by: 'bot', proposed: true }); changed++
    }
    if (!changed) return
    atomicWrite(p, md)
    this.broadcast({ ev: 'todo', botId: bot.id, items: readTodo(bot.abs) })
    console.log(`[folderbot] CK-3 · ${bot.name} — 사람이 시키지 않은 턴이 todo.md 에 바로 쓴 ${changed}줄을 제안으로 돌렸어요`)
  }

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
    let res: { ok: boolean; status?: number; error?: string; skipped?: boolean }
    // DA · 메일 깨우기 — 받는 주소는 설정에 박힌 하나뿐 · 상대마다 10분에 한 통(host/wake.ts mailWake)
    if (peer.wake.mail && peer.wake.from) res = await mailWake(peer.id, peer.wake.mail, peer.wake.from, wakeMail(peer, payload as { id: string; kind: string; path: string; title?: string; needs_human?: boolean }))
    else try { res = await wakePeer(readWakeEnv(peer.wake.env ?? ''), payload) } catch (e) { res = { ok: false, error: (e as Error).message } }
    this.runs.note({ event: 'wake', peer: peer.id, id: String(payload.id), ok: res.ok, ...(peer.wake.mail ? { via: 'mail' } : {}), ...(res.skipped ? { skipped: true } : {}), ...(res.status ? { status: res.status } : {}), ...(res.error ? { error: res.error } : {}) })
    this.bridges.noteWake(String(payload.id), res)
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

  /**
   * BQ-9 · 연결 화면을 다시 읽으라는 신호 — 편지가 몰려도 0.5초에 한 번만 보낸다.
   * ⚠ 화면은 이 프레임만 믿지 않는다 — 다시 붙을 때와 30초마다 스스로 다시 읽는다(store 재접속 계약).
   */
  private bridgesTimer: NodeJS.Timeout | null = null
  private bridgesChanged(): void {
    if (this.bridgesTimer) return
    this.bridgesTimer = setTimeout(() => { this.bridgesTimer = null; this.broadcast({ ev: 'bridges' }) }, 500)
    this.bridgesTimer.unref?.()
  }
  /** BX · 이만큼 안에 도는(켜진) 루틴이 있나 — 셸의 «새벽 적용» 이 루틴과 겹치지 않게 30분씩 미룬다(desktop/dawn.js) */
  routineSoon(ms = 30 * 60_000): boolean {
    const now = Date.now()
    return this.registry.bots().some((b) => this.routines.decorate(b.id, b.routines).some((r) => r.enabled !== false && !!r.nextRun && r.nextRun >= now - 60_000 && r.nextRun - now <= ms))
  }
  /** BQ-9 · 그 상대의 채널 세션(받는 봇 · 채널 id 가 같은 것) — 스레드의 «채널 세션 열기» */
  channelFor(p: PeerDef): { botId: string; sid?: string } | null {
    const bot = this.registry.bots().find((b) => this.isDeliverTarget(p, b)); if (!bot) return null
    const sid = this.sessions.list(bot.id).filter((x) => x.channel === p.id).sort((a, b) => b.createdAt - a.createdAt)[0]?.id
    return { botId: bot.id, ...(sid ? { sid } : {}) }
  }
  private isDeliverTarget(p: PeerDef, bot: Bot): boolean { const q = p.deliver.bot; return q === bot.id || q === bot.name || q === bot.rel }
  /**
   * BQ-3·4 · 편지 묶음을 상대의 채널 세션에 넣는다 — 사람이 아니라 «바깥 상대» 의 턴(`turnFrom: peer`)이다.
   * 🔴 두 번 넣지 않는다 — 배달 기록을 쓰기 전에 꺼졌다 켜지면 같은 편지가 다시 오므로, 세션의 큐와 최근 대화에 그 id 가 있으면 건너뛴다.
   * 🔴 로그인이 막혀 있으면 보내지 않고 큐에만 둔다(파일로 저장된다) — 복구되면 `drainAll` 이 내보낸다.
   * @returns 세션 id · 넣을 봇이 없으면 null(기록하지 않고 다음 폴링에 다시)
   */
  deliverLetters(peer: PeerDef, items: Incoming[]): Record<string, string> | null {
    const bots = this.registry.bots()
    const home = bots.find((b) => this.isDeliverTarget(peer, b))
    // DA · 편지마다 받는 봇 — `to:` 가 받는 봇이 아닌 다른 봇이고 `may_ask` 안이면 그 봇의 채널로(파일로 온 편지도 같은 길). 밖이면 받는 봇으로
    const groups = new Map<Bot, Incoming[]>()
    for (const x of items) {
      let bot = home
      const to = x.letter.to
      if (to && to !== 'orch' && to !== peer.deliver.bot) { const t = askTarget(peer, bots.map(askBotOf), to); if ('bot' in t) bot = bots.find((b) => b.id === t.bot.id) ?? home }
      if (!bot) continue
      groups.set(bot, [...(groups.get(bot) ?? []), x])
    }
    if (!groups.size) { this.log(`⚠ 연결 «${peer.name}» 편지를 넣을 봇 «${peer.deliver.bot}» 이 없어요 — 편지는 그대로 두고 다음에 다시`); return null }
    const out: Record<string, string> = {}
    for (const [bot, list] of groups) {
      const direct = bot !== home
      const r = this.sessions.channelOf(bot, peer.id, peer.deliver.session, peer.trust, direct ? [] : peer.daveMay)
      for (const x of list) out[x.letter.id] = r.id
      const queued = new Set((r.queue ?? []).flatMap((q) => q.letters ?? []))
      const recent = r.items.slice(-400).filter((i) => i.kind === 'user').map((i) => (i as { text: string }).text)
      const fresh = list.filter((x) => !queued.has(x.letter.id) && !recent.some((t) => t.includes(`id="${x.letter.id}"`)))
      if (!fresh.length) continue
      // DA · 폴더 봇에 바로 간 편지 — 오케스트레이터가 모르는 일이 없게 소통 기록에 한 줄(턴을 쓰지 않는다)
      if (direct) { const orch = this.registry.bot(ORCH_ID); if (orch) { const c = this.sessions.commOf(orch, `peer:${peer.id}`); for (const x of fresh) this.sessions.systemNote(c.id, `직접 ask · ${peer.name} → ${bot.name} · ${x.letter.id}${x.letter.title ? ` · ${x.letter.title}` : ''}`) } }
      // CN · «Dave 말» 편지는 따로 한 턴 — 그 턴에서만 dave_may 도구가 열린다(다른 편지와 섞으면 남의 편지도 권한을 얻는다). 폴더 봇 채널에는 dave_may 가 없다
      const said = !direct && peer.daveMay.length ? fresh.filter((x) => isDaveSaid(x.letter)) : []
      const rest = fresh.filter((x) => !said.includes(x))
      for (const [group, grant] of [[rest, []], [said, peer.daveMay]] as const) {
        if (!group.length) continue
        const msg: QueuedMsg = { text: letterBatch(peer.name, group.map((x) => ({ letter: x.letter, rel: x.rel })), grant, direct ? bot.name : undefined), from: `peer:${peer.id}`, fromName: `${peer.icon} ${peer.name}`, t: Date.now(), origin: 'peer', letters: group.map((x) => x.letter.id), ...(group.some((x) => x.letter.urgent) ? { urgent: true } : {}), ...(grant.length ? { grant: [...grant] } : {}) }
        if (this.auth.verdict === 'unreadable' || this.auth.verdict === 'loggedout') this.sessions.enqueue(r, msg)
        else this.sessions.sendFromBot(r, bot, msg)
      }
    }
    return Object.keys(out).length ? out : null
  }

  /**
   * 🔴 DA · `folderbot ask` 한 통 — 받는 봇 판정(`may_ask`) → 편지 파일 → 그 봇의 채널에 바로. 기다릴 거면 대기 창구에 건다.
   * 인증·주소·상한은 gateway 가 먼저 본다. 거절은 `code` 를 단 오류로 던진다 — 'refused'(may_ask 밖 · 없는 봇) · 'not-owner'(다른 맥이 주인).
   */
  askIn(peerId: string, o: { text: string; title?: string; to?: string; re?: string; kind?: string; urgent?: boolean }, wait: boolean): { id: string; rel: string; bot: { id: string; name: string }; sid: string | null } {
    const peer = this.bridges.peer(peerId); if (!peer?.enabled) throw Object.assign(new Error('그런 연결이 없어요'), { code: 'refused' })
    const bots = this.registry.bots()
    const t = askTarget(peer, bots.map(askBotOf), o.to)
    if ('error' in t) throw Object.assign(new Error(t.error), { code: 'refused' })
    const bot = bots.find((b) => b.id === t.bot.id)!
    const out = this.bridges.askNow(peerId, { ...o, to: bot.orchestrator ? 'orch' : bot.rel })
    // 기다리면 대기 창구에 · 기다리지 않아도 급하면 건다 — 답이 날 때 긴급 메일로 알리려고(설계 2판 §2)
    if ((wait || o.urgent) && out.sid) this.askDesk.track(out.id, { peerId, botId: bot.id, sid: out.sid, urgent: !!o.urgent })
    // DB · 기다리든 안 기다리든(--no-wait 포함) 화면 맨 위에 «묻는 중» — 대기 창구와 따로 세션 기록에 단다
    if (out.sid) this.sessions.markAsk(out.sid, { id: out.id, by: peer.name, at: Date.now() })
    return { ...out, bot: { id: bot.id, name: bot.name } }
  }
  /** DA · ask 편지가 든 턴이 끝났다 — 그 턴에서 bridge_send(re) 로 답하지 않은 편지는 마지막 답으로 답 편지를 쓴다 */
  private askTurnEnded(r: SessionRec): void {
    for (const p of this.askDesk.pendingIn(r.id)) {
      const ans = answerAfter(r.items as { kind: string; text?: string }[], p.id)
      if (ans === null) continue   // 아직 큐에 있다 — 그 편지의 턴이 끝날 때
      if (r.state === 'error') this.askDesk.fail(p.id, r.lastError ?? '턴이 오류로 끝났어요')
      try { this.bridges.send(p.peerId, r.botId, { kind: 'reply', re: p.id, title: '답', text: ans || (r.state === 'error' ? `(턴이 오류로 끝났어요 — ${(r.lastError ?? '').split('\n').pop()?.slice(0, 200) ?? ''})` : '(답 없이 턴이 끝났어요)') }, { channel: true }) } catch (e) { this.log(`⚠ ask 답 편지를 못 썼어요 · ${p.id} · ${(e as Error).message}`) }
    }
  }
}

function summarize(req: PermissionRequest): string {
  const i = req.input
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  return (s('command') || s('file_path') || s('path') || s('url') || s('description') || JSON.stringify(i)).slice(0, 120)
}

/** DA · 봇 → `may_ask` 판정용 최소 꼴 */
function askBotOf(b: Bot): AskBot { return { id: b.id, name: b.name, rel: b.rel, orchestrator: b.orchestrator } }
