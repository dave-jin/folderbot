import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, extname, normalize, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import type { Frame } from '../core/types'
import type { Host } from './host'
import { bindAddresses, tailnetInfo } from './tailnet'
import { saveConfig } from './paths'
import { handleMcp } from './mcp'
import { providers } from './providers'
import { agentModels, codexAuth, diagnose } from './auth'
import { canon } from './registry'
import { normalizeRootInput } from '../core/rootPath'
import { searchConversations } from '../core/convSearch'

/**
 * 안 겹치는 이름 — `이름`, 없으면 `이름 2`, `이름 3` …
 * 🔴 **덮어쓰지 않는다.** 새로 만들기·복제는 한 번 누르면 끝인 동작이라, 덮어쓰면 되돌릴 방법이 없다.
 */
/**
 * 🔴 **만드는 곳은 «이 봇의 폴더 안» 이다.** `guard(roots(bot), …)` 만으로는 모자라다 —
 *    roots 에는 볼트 루트·참조 폴더도 들어 있어서 `../..` 가 **통과한다**(스모크가 잡았다).
 *    읽기는 넓게 허용해도 되지만 **새로 만드는 것은 자기 폴더 안**이어야 한다.
 */
/**
 * 🔴 **호스트 자신의 토큰이 쓰는 이름.** 기기 목록에 **안 보인다** (2026-09-13 Dave:
 * *«This mac 은 구지 왜 있는거지? 필요 없다면 없애줘»*).
 *
 * 이 줄은 «페어링한 기기» 가 아니라 **호스트 맥의 제 창이 쓰는 열쇠**다. 목록에 두면 «끊기» 가
 * 달리는데, 그걸 누르면 **지금 보고 있는 창이 제 권한을 끊는다**(그러고도 되살릴 길이 없다).
 * ⛔ 기록 자체는 지우지 않는다 — 지우면 로컬 토큰이 매번 새로 나 앱이 다시 로그인을 묻는다.
 */
const LOCAL_DEVICE = 'this-mac'

function inBot(botAbs: string, rel: string): string {
  const abs = resolve(botAbs, rel)
  if (abs !== botAbs && !abs.startsWith(botAbs + sep)) throw new Error('이 폴더 밖에는 만들 수 없어요')
  return abs
}

function freeName(botAbs: string, dir: string, name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 1; i < 200; i++) {
    const cand = i === 1 ? name : `${stem} ${i}${ext}`
    const rel = dir ? `${dir}/${cand}` : cand
    if (!existsSync(join(botAbs, rel))) return rel
  }
  return dir ? `${dir}/${Date.now()}-${name}` : `${Date.now()}-${name}`
}
import { favicon } from './favicon'
import { preview } from './preview'
import { hookState, setBudget, setHook, usageReport } from './usage'
import { allDirs, guard, kindOf, mime, readText, recent, resolveNF, resolveNFDeep, stream, tree, writeText, exists, listDir, renameEntry } from './files'
import { readTodo, todoDelete, todoEdit, todoMove, todoToggle } from './todoStore'
import { globParents, roleOf } from '../core/rules'
import { createCommand, listCommandFiles, slashCommands } from './slash'
import { globalHarness, harnessDetail, harnessRow } from './harness'

interface Client { res: ServerResponse; device: string }
interface Who { ok: boolean; device: string; id: string; main: boolean }
const PAIR_TTL = 2 * 60 * 1000

export class Gateway {
  private servers: Server[] = []
  private clients = new Set<Client>()
  pairing: { code: string; expiresAt: number } | null = null
  addrs: string[] = []
  constructor(private host: Host, private webRoot: string) {
    host.broadcast = (f) => this.broadcastFrame(f)
  }

  start(): void {
    this.addrs = bindAddresses()
    for (const addr of this.addrs) {
      const s = createServer((req, res) => void this.route(req, res).catch((e) => { try { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: (e as Error).message })) } catch { /* */ } }))
      s.on('error', (e) => this.host.log(`listen ${addr}:${this.host.cfg.port} 실패: ${e.message}`))
      s.listen(this.host.cfg.port, addr, () => this.host.log(`listening http://${addr}:${this.host.cfg.port}`))
      this.servers.push(s)
    }
    setInterval(() => this.rebind(), 30_000).unref()
    setInterval(() => { for (const c of this.clients) c.res.write(': hb\n\n') }, 8000).unref()
  }
  private rebind(): void {
    const want = bindAddresses()
    for (const addr of want) if (!this.addrs.includes(addr)) {
      const s = createServer((req, res) => void this.route(req, res).catch(() => res.end()))
      s.on('error', () => {}); s.listen(this.host.cfg.port, addr, () => this.host.log(`listening http://${addr}:${this.host.cfg.port}`))
      this.servers.push(s); this.addrs.push(addr)
    }
  }
  /** 같은 맥의 창(호스트 앱)용 토큰 — 페어링 없이 바로 */
  localToken(): string {
    let d = this.host.cfg.devices.find((x) => x.name === LOCAL_DEVICE)
    if (!d) { d = { id: randomBytes(6).toString('hex'), name: LOCAL_DEVICE, token: randomBytes(32).toString('base64url'), createdAt: Date.now(), lastSeen: Date.now() }; this.host.cfg.devices.push(d); saveConfig(this.host.cfg) }
    return d.token
  }
  openPairing(): { code: string; expiresAt: number } {
    this.pairing = { code: String(Math.floor(100000 + Math.random() * 900000)), expiresAt: Date.now() + PAIR_TTL }
    return this.pairing
  }
  private broadcastFrame(f: Frame): void {
    const data = `data: ${JSON.stringify(f)}\n\n`
    for (const c of this.clients) { try { c.res.write(data) } catch { this.clients.delete(c) } }
  }

  /** 누가 보고 있나 — 호스트 맥 자체의 창(this-mac 토큰 · 인증 없는 로컬)은 «메인», 나머지는 «원격 · 기기이름» */
  private auth(req: IncomingMessage): Who {
    if (process.env.FOLDERBOT_NO_AUTH) return { ok: true, device: 'local', id: 'local', main: true }
    const h = req.headers.authorization ?? ''
    const url = new URL(req.url ?? '/', 'http://x')
    const tok = h.startsWith('Bearer ') ? h.slice(7) : (url.searchParams.get('token') ?? '')
    if (!tok) return { ok: false, device: '', id: '', main: false }
    for (const d of this.host.cfg.devices) {
      const a = Buffer.from(d.token), b = Buffer.from(tok)
      if (a.length === b.length && timingSafeEqual(a, b)) { d.lastSeen = Date.now(); return { ok: true, device: d.name, id: d.id, main: d.name === LOCAL_DEVICE } }
    }
    return { ok: false, device: '', id: '', main: false }
  }
  private isLoopback(req: IncomingMessage): boolean { const a = req.socket.remoteAddress ?? ''; return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1' }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x')
    const p = url.pathname
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    const body = async (): Promise<Record<string, unknown>> => { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const s = Buffer.concat(chunks).toString('utf8'); return s ? JSON.parse(s) : {} }

    if (p.startsWith('/mcp/')) {
      if (!this.isLoopback(req)) return json(403, { error: 'loopback only' })
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer)
      return handleMcp(this.host, decodeURIComponent(p.slice(5)), req, res, Buffer.concat(chunks).toString('utf8'))
    }
    if (p === '/api/health') return json(200, { ok: true, name: 'folderbot', version: this.host.version })
    if (p === '/api/pair' && req.method === 'POST') {
      const b = await body()
      const code = String(b.code ?? ''); const device = String(b.device ?? 'device').slice(0, 40)
      if (!this.pairing || Date.now() > this.pairing.expiresAt || code !== this.pairing.code) { await new Promise((r) => setTimeout(r, 800)); return json(401, { error: '코드가 맞지 않거나 만료됐어요' }) }
      this.pairing = null
      const token = randomBytes(32).toString('base64url')
      this.host.cfg.devices.push({ id: randomBytes(6).toString('hex'), name: device, token, createdAt: Date.now(), lastSeen: Date.now() })
      saveConfig(this.host.cfg)
      this.host.log(`기기 연결됨: ${device}`)
      return json(200, { token, device })
    }
    if (p.startsWith('/api/')) {
      const a = this.auth(req)
      if (!a.ok) return json(401, { error: 'unauthorized' })
      return this.api(p, url, req, res, json, body, a.device, a)
    }
    return this.static(p, res)
  }

  private async api(p: string, url: URL, req: IncomingMessage, res: ServerResponse, json: (c: number, b: unknown) => void, body: () => Promise<Record<string, unknown>>, device: string, who: Who): Promise<void> {
    const h = this.host; const reg = h.registry
    const m = req.method ?? 'GET'
    const seg = p.split('/').filter(Boolean) // ['api', ...]
    const botOf = (id: string) => { const b = reg.bot(id); if (!b) throw new Error('그런 봇이 없어요'); return b }
    const roots = (b: ReturnType<typeof botOf>) => [reg.root, ...(b.repo ? [b.repo] : [])]

    if (p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      res.write(`data: ${JSON.stringify({ ev: 'hello', version: h.version, serverTime: Date.now() } satisfies Frame)}\n\n`)
      const c: Client = { res, device }; this.clients.add(c)
      req.on('close', () => this.clients.delete(c))
      return
    }
    if (p === '/api/agents' && m === 'GET') return json(200, providers())
    // 쓸 수 있는 모델 — **기계에서 주워 온다**(빌트인 목록은 화면이 빈 자리를 메울 때만 쓴다)
    if (p === '/api/agents/models' && m === 'GET') return json(200, agentModels())
    if (p === '/api/usage' && m === 'GET') return json(200, { ...usageReport(), hook: hookState().installed })
    if (p === '/api/usage/hook' && m === 'POST') { const b = await body(); return json(200, setHook(!!b.on)) }
    if (p === '/api/usage/budget' && m === 'POST') { const b = await body(); return json(200, setBudget({ window: b.window === undefined ? undefined : Number(b.window), day: b.day === undefined ? undefined : Number(b.day), week: b.week === undefined ? undefined : Number(b.week) } as never)) }
    // 파비콘 — 화면 셋(채팅·문서·입력창)이 이 하나를 본다. 호스트가 받아 data URL 로 내준다
    if (p === '/api/favicon' && m === 'GET') {
      const u = url.searchParams.get('url') ?? ''
      const data = await favicon(u)
      return json(200, { data })
    }
    // 링크 미리보기 — 파비콘과 같은 창구 하나. 제목·설명·썸네일까지 호스트가 받아 넘긴다
    if (p === '/api/preview' && m === 'GET') {
      const u = url.searchParams.get('url') ?? ''
      return json(200, { meta: await preview(u) })
    }
    if (p === '/api/state') {
      const tn = await tailnetInfo()
      return json(200, { version: h.version, root: reg.root, rules: reg.rules, rulesInstalled: reg.rulesInstalled(), bots: reg.bots(), candidates: reg.candidates(), auth: h.auth, inbox: reg.inboxItems().length, notifications: h.notifier.events.slice(0, 50), vapidPublic: h.notifier.vapidPublic(), tailnet: tn, addrs: this.addrs, port: h.cfg.port, devices: h.cfg.devices.filter((d) => d.name !== LOCAL_DEVICE).map((d) => ({ id: d.id, name: d.name, lastSeen: d.lastSeen })), sessionsByBot: Object.fromEntries(reg.bots().map((b) => [b.id, h.sessions.list(b.id)])), quiet: h.cfg.quiet ?? { from: '23:00', to: '07:00' }, defaults: { model: h.cfg.defaultModel ?? '', effort: h.cfg.defaultEffort ?? '', permissionMode: h.cfg.defaultPermissionMode ?? 'default', idleMinutes: h.cfg.idleMinutes ?? 60, codex: { model: h.cfg.defaultCodexModel ?? '', effort: h.cfg.defaultCodexEffort ?? '', sandbox: h.cfg.codexSandbox ?? 'read-only', auth: codexAuth(h.cfg.openaiApiKey) } }, hostName: h.hostName(), device: { id: who.id, name: who.main ? h.hostName() : who.device, main: who.main } })
    }
    /**
     * 🔴 **볼트 루트는 앱에서 바꾼다** (2026-09-14 Dave: «지금 현재 기본 볼트 수정이 안되네»).
     *    종전에는 **호스트 맥의 트레이 메뉴**에만 있었다 — 폰·맥북에서는 바꿀 길이 아예 없었고,
     *    설정 화면은 경로를 **읽기만** 했다.
     * ⚠ 여기서 하는 일은 «확인하고 저장» 까지다. 되세우기는 `h.onRoot` 를 가진 셸이 한다(§host.ts).
     *    셸이 없으면 `restarting:false` 로 솔직히 말한다 — 「바꿨다는데 그대로」 가 제일 나쁘다.
     */
    if (p === '/api/root' && m === 'POST') {
      const b = await body()
      const abs = normalizeRootInput(String(b.path ?? ''), homedir())
      if (!abs) return json(400, { error: '절대 경로를 넣어 주세요 (예: /Users/이름/PARA)' })
      let dir = false
      try { dir = statSync(abs).isDirectory() } catch { dir = false }
      if (!dir) return json(400, { error: `그런 폴더가 없어요: ${abs}` })
      // ⚠ «이미 그 폴더» 는 **돌고 있는 루트와 저장된 루트가 둘 다 같을 때**다. 되세울 셸이 없으면
      //   (터미널 호스트) 저장값만 앞서 가 둘이 갈리는데, 그때 돌고 있는 쪽만 보고 «같다» 며 넘기면
      //   **설정을 되돌릴 길이 사라진다**(스모크가 잡았다).
      const stored = canon(resolve(h.cfg.root ?? reg.root))
      if (canon(abs) === canon(reg.root) && canon(abs) === stored) return json(200, { ok: true, root: reg.root, restarting: false, same: true })
      const saved = h.setRoot(abs)
      const restarting = !!h.onRoot
      json(200, { ok: true, root: saved, restarting })
      // ⚠ 되세우기는 **답을 보낸 뒤**에 — 이 서버를 끄는 일이라 먼저 하면 답이 못 나간다
      if (h.onRoot) setTimeout(() => { void h.onRoot?.(saved) }, 250)
      return
    }
    /** 폴더 고르기 — 원격(폰·맥북)에는 Finder 가 없다. 이름만 훑어 보여 준다(내용은 안 연다) */
    if (p === '/api/root/browse' && m === 'GET') {
      const home = homedir()
      const at = normalizeRootInput(url.searchParams.get('path') ?? '', home) ?? home
      let dirs: { name: string; path: string }[] = []
      try {
        dirs = readdirSync(at, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .slice(0, 400).map((e) => ({ name: e.name, path: join(at, e.name) }))
          .sort((x, y) => x.name.localeCompare(y.name, 'ko'))
      } catch { return json(400, { error: `못 읽는 폴더예요: ${at}` }) }
      const up = dirname(at)
      return json(200, { path: at, name: basename(at) || at, parent: up === at ? null : up, home, dirs })
    }
    /**
     * 🔴 **볼트 전체의 안 끝난 할 일** — 홈의 「오늘 할 일」 칸이 본다 (2026-09-15 Dave: 4칸을 전부
     *    «바로 보고 바로 액션» 으로). 화면은 폴더를 하나씩 열어 보고 있을 수 없다.
     * ⚠ 봇마다 `todo.md` 하나를 읽는 것뿐이라 싸다. 정렬은 **가장 먼저 할 것**(파일 순서) 그대로 둔다 —
     *    「중요도」 를 여기서 지어내면 화면마다 다른 순서가 된다.
     */
    /**
     * 「지난 대화 찾기」(루프 7/10) — 볼트 전체 세션의 **이름·말** 을 훑는다. 판정은 core/convSearch.
     * ⚠ 봇 경계를 넘는 유일한 읽기라 여기(전역)에 둔다 — 팔레트에서 «그 얘기 어느 폴더에서 했지» 를 푼다.
     */
    if (p === '/api/search' && m === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      const names = new Map(reg.bots().map((b) => [b.id, b.name]))
      const hits = searchConversations(q, h.sessions.all().map((r) => ({ id: r.id, botId: r.botId, name: r.name, lastActivity: r.lastActivity, items: r.items as { kind: string; text?: string }[] })), 20)
      return json(200, hits.map((x) => ({ ...x, bot: names.get(x.botId) ?? '' })))
    }
    if (p === '/api/todos' && m === 'GET') {
      const rows = reg.bots().filter((b) => !b.orchestrator).map((b) => {
        const open = readTodo(b.abs).filter((t) => !t.done)
        return { botId: b.id, name: b.name, open: open.length, next: open[0] ? { line: open[0].line, title: open[0].title } : null }
      }).filter((r) => r.open > 0)
      return json(200, { open: rows.reduce((n, r) => n + r.open, 0), rows })
    }
    if (p === '/api/bots' && m === 'GET') return json(200, reg.bots())
    if (p === '/api/candidates') return json(200, reg.candidates())
    if (p === '/api/bots/start' && m === 'POST') { const b = await body(); const bot = reg.start(String(b.rel), b.provider === 'codex' ? 'codex' : b.provider === 'claude' ? 'claude' : undefined); h.afterBotsChanged(); return json(200, bot) }
    if (p === '/api/harness' && m === 'GET') {
      const rel = url.searchParams.get('rel')
      if (rel !== null) { const abs = join(reg.root, rel); if (!abs.startsWith(reg.root)) return json(400, { error: '루트 밖' }); return json(200, harnessDetail(rel, rel.split('/').pop() ?? rel, rel.includes('/') ? rel.split('/')[0] : '', abs, reg.root)) }
      const rows = [...reg.bots().filter((b) => !b.orchestrator).map((b) => ({ rel: b.rel, name: b.name, section: b.section, abs: b.abs })),
        ...reg.candidates().filter((c) => !c.active).map((c) => ({ rel: c.rel, name: c.name, section: c.section, abs: join(reg.root, c.rel) }))]
      return json(200, rows.map((r) => harnessRow(r.rel, r.name, r.section, r.abs, reg.root)))
    }
    if (p === '/api/harness/global' && m === 'GET') return json(200, globalHarness(reg.root))
    if (p === '/api/folders' && m === 'POST') { const b = await body(); const rel = reg.createFolder(String(b.section), String(b.name)); let bot = null; if (b.start) { bot = reg.start(rel, b.provider === 'codex' ? 'codex' : undefined); h.afterBotsChanged() } return json(200, { rel, bot }) }
    if (p === '/api/rules' && m === 'GET') return json(200, { rules: reg.rules, installed: reg.rulesInstalled(), file: reg.rulesFile(), parents: reg.rules.roles.active })
    if (p === '/api/rules/install' && m === 'POST') { const b = await body(); const r = reg.installRules((b.preset as 'para') ?? 'para'); h.afterBotsChanged(); return json(200, { rules: r, candidates: reg.candidates() }) }
    if (p === '/api/inbox') return json(200, reg.inboxItems())
    if (p === '/api/move' && m === 'POST') { const b = await body(); reg.move(String(b.from), String(b.to)); h.afterBotsChanged(); return json(200, { ok: true }) }
    if (p === '/api/undo' && m === 'GET') return json(200, reg.undoList())
    if (p === '/api/undo' && m === 'POST') { const b = await body(); reg.undo(Number(b.t)); h.afterBotsChanged(); return json(200, { ok: true }) }
    if (p === '/api/notifications' && m === 'GET') return json(200, h.notifier.events.slice(0, 100))
    if (p === '/api/notifications/read' && m === 'POST') { const b = await body(); h.notifier.markRead(Array.isArray(b.ids) ? (b.ids as string[]) : undefined); return json(200, { ok: true }) }
    if (p === '/api/push/subscribe' && m === 'POST') { const b = await body(); h.notifier.addSub(b.sub as { endpoint: string; keys: { p256dh: string; auth: string } }, device); return json(200, { ok: true }) }
    if (p === '/api/push/test' && m === 'POST') { h.notifier.emit('done', 'orch', 'Folder Bot', '푸시가 도착하면 성공이에요', undefined, { mac: false }); return json(200, { ok: true }) }
    if (p === '/api/tailnet') return json(200, await tailnetInfo())
    if (p === '/api/auth/refresh' && m === 'POST') return json(200, await h.refreshAuth())
    /**
     * **다시 연결** — 인증을 다시 읽고, 살아 있는 워커를 내려 **다음 메시지가 새 환경으로 뜨게** 한다.
     * 🔴 이게 필요한 이유: 도구 목록과 인증은 **워커가 뜰 때 고정된다.** 터미널에서 `claude /login`
     *    을 새로 해도, 토큰을 지워도, 이미 떠 있는 세션에는 닿지 않는다(Dave 의 Akiflow MCP 사고와
     *    같은 뿌리다). 사람이 할 수 있는 일은 «앱 다시 켜기» 뿐이었다.
     * ⛔ 일하는 중인 워커는 그 자리에서 안 죽인다 — 턴이 끝나면 스스로 내려간다(`recycleAll`).
     */
    /**
     * **터미널에서 로그인** (2026-09-13 Dave: *«설정에서 claude code / codex 로그인 연결 기능이
     * 안보여서 진행이 안돼»*).
     *
     * 🔴 **우리가 대신 로그인할 수는 없다** — `claude /login` 도 `codex login` 도 브라우저를 열고
     *    사람이 승인하는 대화형 절차다. 하지만 **그 창을 대신 열어 줄 수는 있다**: 종전에는 설정에
     *    «터미널에서 claude 를 치세요» 라는 **글자만** 있었고, 그건 기능이 아니라 안내문이었다.
     * ⚠ **호스트 맥에서만** 연다 — 폰·원격 맥에서 눌러도 터미널은 저쪽에 떠야 한다. 그래서
     *    로컬(메인) 요청일 때만 받는다.
     * ⚠ 작업 폴더를 볼트 루트로 잡는다 — 로그인 뒤 바로 `claude` 를 이어 쓸 수 있게.
     * ⛔ 토큰을 만들게 하지 않는다(`setup-token`) — 그 길로 가면 claude.ai 커넥터가 안 붙는다
     *    (`session.ts` 의 `cleanClaudeEnv` 머리말). 우리가 원하는 것은 **키체인 로그인**이다.
     */
    if (p === '/api/auth/login-terminal' && m === 'POST') {
      const b = await body()
      if (!who.main) return json(400, { error: '호스트 맥에서 눌러 주세요 — 터미널은 그쪽에 떠야 해요' })
      if (process.platform !== 'darwin') return json(400, { error: '맥에서만 열 수 있어요' })
      const cmd = b.agent === 'codex' ? 'codex login' : 'claude'
      const script = `cd ${JSON.stringify(reg.root)}; clear; ${cmd}`
      execFile('/usr/bin/osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(script)}`, '-e', 'tell application "Terminal" to activate'], () => {})
      return json(200, { ok: true, cmd })
    }
    // 진단 — 사람이 전령이 되지 않게. ⛔ 토큰·이메일·키 값은 안 들어간다(`auth.diagnose` 머리말)
    if (p === '/api/auth/diagnose' && m === 'GET') return json(200, { text: await diagnose({ claudeBin: h.cfg.claudeBin, openaiApiKey: h.cfg.openaiApiKey, tokenSet: !!h.cfg.claudeOauthToken }) })
    if (p === '/api/auth/reconnect' && m === 'POST') {
      const b = await body()
      const vendor = b.agent === 'codex' ? 'codex' : b.agent === 'claude' ? 'claude' : undefined
      const auth = await h.refreshAuth()
      const r = h.sessions.recycleAll(vendor)
      return json(200, { auth, codex: codexAuth(h.cfg.openaiApiKey), ...r })
    }
    if (p === '/api/names' && m === 'POST') { const b = await body(); h.setNames({ hostName: b.hostName === undefined ? undefined : String(b.hostName), deviceId: who.id, deviceName: b.deviceName === undefined ? undefined : String(b.deviceName) }); return json(200, { hostName: h.hostName(), device: { id: who.id, name: who.main ? h.hostName() : (h.cfg.devices.find((d) => d.id === who.id)?.name ?? who.device), main: who.main } }) }
    if (p === '/api/defaults' && m === 'POST') { const b = await body(); h.setDefaults(String(b.model ?? ''), String(b.effort ?? ''), b.agent === 'codex' ? 'codex' : 'claude', b.permissionMode === undefined ? undefined : String(b.permissionMode)); return json(200, { model: h.cfg.defaultModel ?? '', effort: h.cfg.defaultEffort ?? '', permissionMode: h.cfg.defaultPermissionMode ?? 'default' }) }
    // 조용한 시간 — 알림 칸에서 고친다 (2026-09-17). 「확인해 주세요」 는 이 시간에도 통과한다(notify.ts)
    if (p === '/api/quiet' && m === 'POST') { const b = await body(); h.setQuiet(String(b.from ?? ''), String(b.to ?? '')); return json(200, h.cfg.quiet) }
    // Codex 설정 — 샌드박스(= 우리가 승인 화면을 못 띄우므로 이게 곧 권한 정책이다)와 API 키
    if (p === '/api/codex' && m === 'POST') { const b = await body(); h.setCodex({ sandbox: b.sandbox ? String(b.sandbox) : undefined, apiKey: b.apiKey === undefined ? undefined : String(b.apiKey) }); return json(200, { ok: true, auth: codexAuth(h.cfg.openaiApiKey), sandbox: h.cfg.codexSandbox ?? 'read-only' }) }
    if (p === '/api/auth/token' && m === 'POST') { const b = await body(); h.setToken(String(b.token ?? '')); return json(200, { ok: true, mode: h.cfg.claudeOauthToken ? 'token' : 'login' }) }
    if (p === '/api/pairing' && m === 'POST') { if (!this.isLoopback(req) && device !== 'local') return json(403, { error: '미니에서만 열 수 있어요' }); return json(200, this.openPairing()) }
    // ⛔ 호스트 자신의 열쇠는 못 끊는다 — 끊으면 지금 보고 있는 창이 제 권한을 잃는다
    if (p === '/api/devices/revoke' && m === 'POST') { const b = await body(); h.cfg.devices = h.cfg.devices.filter((d) => d.id !== b.id || d.name === LOCAL_DEVICE); saveConfig(h.cfg); return json(200, { ok: true }) }

    // 레일 순서 — 끌어다 놓은 차례를 볼트에 남긴다(기기마다 달라지지 않게)
    if (p === '/api/idle' && m === 'POST') { const b = await body(); h.setIdle(Number(b.minutes)); return json(200, { minutes: h.cfg.idleMinutes ?? 60 }) }
    if (p === '/api/bots/pin' && m === 'POST') { const b = await body(); try { reg.pin(String(b.id), !!b.on) } catch (e) { return json(400, { error: (e as Error).message }) } h.afterBotsChanged(); return json(200, { ok: true }) }
    if (p === '/api/bots/reorder' && m === 'POST') { const b = await body(); reg.reorder((Array.isArray(b.ids) ? b.ids : []).map((x: unknown) => String(x))); h.afterBotsChanged(); return json(200, { ok: true }) }
    if (seg[1] === 'bots' && seg[2]) {
      const bot = botOf(seg[2]); const sub = seg[3]
      if (sub === 'stop' && m === 'POST') { if (bot.orchestrator) throw new Error('오케스트레이터는 정지할 수 없어요'); reg.stop(bot.id); h.afterBotsChanged(); return json(200, { ok: true }) }
      if (sub === 'retire' && m === 'POST') { const to = reg.retire(bot.id); h.afterBotsChanged(); return json(200, { to }) }
      // ⛔ **봇(폴더) 자체를 치우는 길은 없다** (2026-09-13 Dave 정정: *«실제 폴더를 삭제하는게 아니라
      //    에이전트 연동 삭제»*). 레일의 «지우기» 는 위 `stop` — 목록에서만 덜어낸다. 파일을 치우는 것은
      //    아래 트리의 `sub === 'trash'` 로, **봇 폴더 안 파일**에만 닿는다.
      if (sub === 'sessions' && m === 'GET') return json(200, h.sessions.list(bot.id))
      // ⚠ `vendor` 는 **세션마다** 고를 수 있다 — 한 폴더에 Claude 세션과 Codex 세션이 섞여 산다
      if (sub === 'sessions' && m === 'POST') { const b = await body(); const vd = b.vendor === 'codex' || b.vendor === 'claude' ? b.vendor : undefined; const s = h.sessions.create(bot, String(b.name ?? '새 세션'), { permissionMode: b.permissionMode as never, model: b.model ? String(b.model) : undefined, vendor: vd }); return json(200, h.sessions.info(s)) }
      if (sub === 'send' && m === 'POST') { const b = await body(); const sid = h.sendToBot(bot, String(b.text), b.sessionId ? String(b.sessionId) : undefined, b.name ? String(b.name) : undefined, undefined, { model: b.model ? String(b.model) : undefined, effort: b.effort ? String(b.effort) : undefined, permissionMode: b.permissionMode ? (String(b.permissionMode) as never) : undefined, vendor: b.vendor === 'codex' || b.vendor === 'claude' ? b.vendor : undefined }); return json(200, { sessionId: sid }) }
      // ⚠ 목록은 **그 세션의 벤더**로 정한다 — Claude 의 명령을 Codex 에 보여 주면 그 글자가 프롬프트로 들어간다
      /** 슬래시 명령 관리 (루프 8/10) — 목록은 파일 그대로, 만들기는 파일 하나. `rel` 은 봇 폴더 기준(루트 것은 `../`), 사용자 것은 문서 열 밖이라 rel 이 없다 */
      if (sub === 'commands' && m === 'GET') return json(200, listCommandFiles(bot.abs, reg.root).map((c) => ({ name: c.name, desc: c.desc, scope: c.scope, rel: c.scope === 'user' ? null : relative(bot.abs, c.abs) })))
      if (sub === 'commands' && m === 'POST') {
        const b = await body()
        try {
          const abs = createCommand(b.scope === 'root' ? reg.root : bot.abs, String(b.name ?? '').trim(), typeof b.desc === 'string' ? b.desc : '')
          h.broadcast({ ev: 'files', botId: bot.id })
          return json(200, { rel: relative(bot.abs, abs) })
        } catch (e) { return json(400, { error: (e as Error).message }) }
      }
      if (sub === 'slash') { const sid = url.searchParams.get('sid') ?? ''; const v = sid ? h.sessions.get(sid)?.vendor : undefined; return json(200, slashCommands(bot.abs, reg.root, sid ? h.sessions.slashOf(sid) : [], v === 'codex' ? 'codex' : 'claude')) }
      if (sub === 'todo' && m === 'GET') return json(200, h.todo(bot))
      if (sub === 'todo' && seg[4] === 'toggle' && m === 'POST') { const b = await body(); const items = todoToggle(bot.abs, Number(b.line), !!b.done); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && seg[4] === 'edit' && m === 'POST') { const b = await body(); const items = todoEdit(bot.abs, Number(b.line), String(b.title ?? ''), String(b.desc ?? '')); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && seg[4] === 'move' && m === 'POST') { const b = await body(); const items = todoMove(bot.abs, Number(b.line), b.before === null || b.before === undefined ? null : Number(b.before)); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && seg[4] === 'delete' && m === 'POST') { const b = await body(); const items = todoDelete(bot.abs, Number(b.line)); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && m === 'POST') { const b = await body(); h.todoAdd(bot, String(b.title), String(b.desc ?? ''), 'me', false, String(b.section ?? '')); return json(200, h.todo(bot)) }
      if (sub === 'files') return json(200, tree(bot.abs, Number(url.searchParams.get('depth') ?? 2)))
      if (sub === 'ls') {
        // 폴더 항목에 «하네스 있음» · «봇 있음(id)» · 1단계 역할을 붙인다 — 피커와 우클릭 «여기서 시작» 이 쓴다
        const rel = url.searchParams.get('dir') ?? ''; guard(roots(bot), join(bot.abs, rel))
        return json(200, listDir(bot.abs, rel, url.searchParams.get('all') === '1').map((n) => { if (!n.dir) return n; const vrel = bot.rel ? `${bot.rel}/${n.rel}` : n.rel; return { ...n, harness: reg.hasHarness(join(bot.abs, n.rel)), botId: reg.botByRel(vrel)?.id, role: vrel.includes('/') ? undefined : (globParents(reg.rules.roles.active).includes(vrel) ? 'active' : roleOf(reg.rules, vrel) ?? undefined) } }))
      }
      if (sub === 'dirs') {
        // 폴더만 평평하게 — 피커의 «폴더 찾기» 색인. 파일을 세지 않으므로 tree(…,4) 보다 훨씬 깊고 넓다
        const depth = Math.min(8, Math.max(1, Number(url.searchParams.get('depth') ?? 6)))
        return json(200, allDirs(bot.abs, depth).map((n) => { const vrel = bot.rel ? `${bot.rel}/${n.rel}` : n.rel; return { ...n, harness: reg.hasHarness(join(bot.abs, n.rel)), botId: reg.botByRel(vrel)?.id, role: vrel.includes('/') ? undefined : (globParents(reg.rules.roles.active).includes(vrel) ? 'active' : roleOf(reg.rules, vrel) ?? undefined) } }))
      }
      if (sub === 'rename' && m === 'POST') { const b = await body(); const abs = guard(roots(bot), join(bot.abs, String(b.rel))); const to = renameEntry(abs, String(b.name)); h.broadcast({ ev: 'files', botId: bot.id }); return json(200, { rel: relative(bot.abs, to) }) }
      if (sub === 'upload' && m === 'POST') {
        // 원격 기기에서 올린 파일 — <봇 폴더>/첨부/ 에 저장 (덮어쓰지 않음, 25MB 상한)
        const chunks: Buffer[] = []; let total = 0
        for await (const c of req) { total += (c as Buffer).length; if (total > 40 * 1024 * 1024) return json(413, { error: '너무 커요 (25MB 상한)' }); chunks.push(c as Buffer) }
        const b = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { name?: string; data?: string }
        const name = String(b.name ?? 'file').replace(/[\/\\:\u0000-\u001f]/g, '_').slice(0, 120)
        const buf = Buffer.from(String(b.data ?? ''), 'base64')
        if (buf.length > 25 * 1024 * 1024) return json(413, { error: '너무 커요 (25MB 상한)' })
        const dir = join(bot.abs, '첨부'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        let rel = `첨부/${name}`; let i = 1
        while (existsSync(join(bot.abs, rel))) { const dot = name.lastIndexOf('.'); rel = `첨부/${dot > 0 ? name.slice(0, dot) : name}-${i++}${dot > 0 ? name.slice(dot) : ''}` }
        writeFileSync(join(bot.abs, rel), buf)
        h.broadcast({ ev: 'files', botId: bot.id })
        return json(200, { rel, abs: join(bot.abs, rel), size: buf.length })
      }
      if (sub === 'recent') return json(200, recent(bot.abs, 14))
      /**
       * 미리보기(마우스 오버) 전용 읽기 — 🔴 **없어도 200 이다.**
       *
       * `/file` 은 «열기» 의 길이라 없는 파일에 404 가 맞다. 하지만 오버 미리보기는 **곁다리 읽기**다 —
       * 404 가 나면 브라우저 콘솔에 빨간 줄이 남고(끌 수 없다), 스모크의 «페이지 오류 0» 계약이 깨지며,
       * 무엇보다 사람에게는 아무 일도 아니다. 그래서 여기서는 «없음» 도 정상 응답으로 답한다.
       * ⚠ 이름은 **NFC 로 맞춘다** — 맥에서 온 경로는 자모가 풀려(NFD) 오는 일이 있어 같은 이름이
       *    디스크와 안 맞는다(실측: 오버 한 번에 404). 레지스트리도 같은 자리에서 NFC 로 맞춘다.
       * ⛔ 앞부분만 준다(4KB) — 카드에 12줄만 그린다.
       */
      if (sub === 'peek' && m === 'GET') {
        const rel = url.searchParams.get('rel') ?? ''
        let abs: string
        try { abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, rel)).slice(1)) } catch { return json(200, { kind: 'none' }) }
        if (!exists(abs)) return json(200, { kind: 'none' })
        const kind = kindOf(abs)
        const st = statSync(abs)
        // ⚠ `mtime` 도 함께 준다 — 열려 있는 문서가 «바뀌었나 · 사라졌나» 를 **404 없이** 물어보는 길이다
        const meta = { kind, mtime: st.mtimeMs, size: st.size }
        if (kind !== 'text' && kind !== 'canvas') return json(200, meta)
        const r = readText(abs)
        return json(200, { ...meta, text: r.text.slice(0, 4096) })
      }
      if (sub === 'file' && m === 'GET') {
        // ⚠ 한글 이름은 NFC/NFD 두 벌로 산다 — **있는 쪽**을 찾아 준다(`resolveNF` 머리말)
        const abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, url.searchParams.get('rel') ?? '')).slice(1))
        if (!exists(abs)) return json(404, { error: '없는 파일' })
        const kind = kindOf(abs)
        // ⚠ 캔버스도 **글로 내려보낸다** — 화면이 JSON 을 읽어 노드를 그린다(원문으로 그리지는 않는다)
        if (kind === 'text' || kind === 'canvas') { const r = readText(abs); return json(200, { kind, rel: url.searchParams.get('rel'), text: r.text, truncated: r.truncated, size: statSync(abs).size, mtime: statSync(abs).mtimeMs }) }
        return json(200, { kind, rel: url.searchParams.get('rel'), size: statSync(abs).size, mtime: statSync(abs).mtimeMs })
      }
      if (sub === 'file' && m === 'POST') { const b = await body(); const abs = guard(roots(bot), join(bot.abs, String(b.rel))); writeText(abs, String(b.text)); h.broadcast({ ev: 'files', botId: bot.id }); return json(200, { ok: true }) }
      /**
       * 어느 경로가 실제로 있나 — 채팅 답변의 «경로처럼 보이는 글자» 를 칩으로 만들기 전에 묻는다.
       * 🔴 확인 없이 칩을 만들면 죽은 링크가 대화에 쌓이고, 한 번 눌러 본 사람은 다시 안 누른다.
       * ⚠ 후보는 봇 폴더 기준 상대 경로다. 루트 밖은 `guard` 가 막고 조용히 false 로 답한다.
       */
      /**
       * 🔴 **세 갈래로 찾는다 — 봇 폴더 · 볼트 루트 · 절대** (2026-09-15 Dave: *«채팅 본문에서 폴더 및 파일 칩 …
       *    구현이 안되어 있어»*). 종전에는 봇 폴더 기준 하나뿐이라, 폴더 봇 대화에 흔히 나오는 «볼트 기준
       *    경로»(`3. Area/…`)와 «절대 경로»(`/Users/…`)가 전부 «없음» 이었다 — 칩이 안 뜨던 진짜 이유.
       * ⚠ **폴더도 있음이다** — 파일과 구분해서 돌려준다(폴더 칩은 문서 탭이 아니라 트리를 연다).
       * ⚠ 돌려주는 `rel` 은 **봇 폴더 기준**이다(`../` 가 섞일 수 있다) — 문서·트리 API 가 그걸 그대로 받는다.
       *    `guard` 가 루트 밖을 막으므로 `..` 로 볼트를 벗어날 수는 없다.
       */
      /**
       * 「파일 전후 diff」(루프 6/10) — 세션이 붙잡아 둔 «전» 과 지금 디스크의 «후» 를 함께 준다. 비교는 화면이 한다(core/diff).
       * ⚠ `before === undefined` 는 «모른다»(호스트를 다시 켰거나 상한 밖) — 화면은 그걸 빈 파일로 그리지 말고 말로 한다.
       */
      if (sub === 'diff' && m === 'GET') {
        const p = url.searchParams.get('abs') ?? ''
        const sid = url.searchParams.get('s') ?? ''
        let abs: string
        try { abs = resolveNFDeep('/', guard(roots(bot), p.startsWith('/') ? p : join(bot.abs, p)).slice(1)) } catch { return json(404, { error: '루트 밖' }) }
        const after = exists(abs) && kindOf(abs) === 'text' ? readText(abs).text : exists(abs) ? undefined : null
        const before = h.sessions.before(sid, abs)
        return json(200, { rel: relative(bot.abs, abs), before, after, known: before !== undefined })
      }
      if (sub === 'exists' && m === 'POST') {
        const b = await body()
        const rels = (Array.isArray(b.rels) ? b.rels : []).slice(0, 40).map(String)
        const out: Record<string, { rel: string; dir: boolean } | false> = {}
        for (const c of rels) {
          const tries = c.startsWith('/') ? [c] : [join(bot.abs, c), join(reg.root, c)]
          out[c] = false
          for (const t of tries) {
            try {
              const abs = resolveNFDeep('/', guard(roots(bot), t).slice(1))
              if (!exists(abs)) continue
              out[c] = { rel: relative(bot.abs, abs), dir: statSync(abs).isDirectory() }
              break
            } catch { /* 루트 밖 — 다음 갈래 */ }
          }
        }
        return json(200, out)
      }
      /**
       * 기본 앱으로 열기 — 🔴 **여는 주체는 언제나 호스트(메인 맥)다.**
       *    폰에서 눌러도 미리보기는 **메인에서** 뜬다. 그래서 화면이 원격일 때는 이름을 «메인 맥에서 열기»
       *    로 바꾸고 «이 기기로 내려받기» 를 함께 준다 — 안 그러면 눌러도 아무 일이 없는 것처럼 보인다.
       * ⛔ 임의 경로를 열지 않는다 — `guard` 가 봇 폴더 밖을 막는다.
       */
      if (sub === 'open' && m === 'POST') {
        const b = await body()
        const abs = guard(roots(bot), join(bot.abs, String(b.rel ?? '')))
        if (!exists(abs)) return json(404, { error: '없는 파일' })
        if (process.platform !== 'darwin') return json(400, { error: '메인이 맥일 때만 열 수 있어요' })
        execFile('/usr/bin/open', [abs], () => {})
        return json(200, { ok: true })
      }
      /**
       * Finder 에서 보기 — **열지 않고 위치를 보여 준다**(`open -R`).
       * ⚠ 「기본 앱으로 열기」와 다른 일이다: 저것은 파일을 열고, 이것은 **그 파일이 어디 있는지** 보여 준다.
       *    파일을 옮기거나 다른 앱에 끌어다 놓으려는 사람이 원하는 것은 늘 이쪽이다.
       */
      if (sub === 'reveal' && m === 'POST') {
        const b = await body()
        const abs = guard(roots(bot), join(bot.abs, String(b.rel ?? '')))
        if (!exists(abs)) return json(404, { error: '없는 파일' })
        if (process.platform !== 'darwin') return json(400, { error: '메인이 맥일 때만 열 수 있어요' })
        execFile('/usr/bin/open', ['-R', abs], () => {})
        return json(200, { ok: true })
      }
      /**
       * 새 노트 · 새 폴더 — 봇 폴더 **안**에서 만든다(`guard`).
       * ⚠ `.md` 는 **자동으로 붙인다** — 사람이 확장자를 기억하게 하지 않는다. 다른 확장자를 직접 쓰면 그대로 둔다.
       * ⚠ 같은 이름이 있으면 `이름 2`, `이름 3` 으로 비킨다 — 덮어쓰기는 되돌릴 수 없다.
       */
      if (sub === 'new' && m === 'POST') {
        const b = await body()
        const dir = String(b.dir ?? '').replace(/^\/+|\/+$/g, '')
        const folder = b.kind === 'folder'
        let name = String(b.name ?? '').trim().replace(/[/\\]/g, '-')
        if (!name) return json(400, { error: '이름이 비었어요' })
        if (!folder && !/\.[A-Za-z0-9]{1,8}$/.test(name)) name += '.md'
        const rel = freeName(bot.abs, dir, name)
        const abs = inBot(bot.abs, rel)
        if (folder) mkdirSync(abs, { recursive: true })
        else { mkdirSync(join(abs, '..'), { recursive: true }); writeFileSync(abs, '') }
        h.broadcast({ ev: 'files', botId: bot.id })
        return json(200, { rel })
      }
      /** 복제 — 같은 폴더에 «이름 사본». ⛔ 폴더는 통째로(재귀) 복사한다 */
      if (sub === 'copy' && m === 'POST') {
        const b = await body()
        const rel = String(b.rel ?? '')
        const abs = guard(roots(bot), join(bot.abs, rel))
        if (!exists(abs)) return json(404, { error: '없는 파일' })
        const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
        const base = rel.split('/').pop() ?? rel
        const dot = base.lastIndexOf('.')
        const stem = dot > 0 ? base.slice(0, dot) : base
        const ext = dot > 0 ? base.slice(dot) : ''
        const to = freeName(bot.abs, dir, `${stem} 사본${ext}`)
        cpSync(abs, inBot(bot.abs, to), { recursive: true })
        h.broadcast({ ev: 'files', botId: bot.id })
        return json(200, { rel: to })
      }
      /**
       * 휴지통으로 — 트리에서 고른 것을 **여럿 한꺼번에** 치운다.
       *
       * 🔴 **지우지 않고 옮긴다** — 볼트 안 `.folderbot/trash/` 로 간다(`registry.trashPath` 머리말).
       *    되돌리기(⌘Z)가 이걸 다시 제자리로 돌린다.
       * ⚠ 대상은 **이 봇 폴더 안**이어야 한다(`inBot`) — `guard(roots)` 는 볼트 루트까지 통과시키므로
       *    지우는 일에는 넓다(실제로 `../..` 가 뚫렸던 자리).
       * ⚠ 하나가 실패해도 **나머지는 계속한다** — 여럿을 고른 사람에게 «아무것도 안 됐다» 는 최악이다.
       */
      if (sub === 'trash' && m === 'POST') {
        const b = await body()
        const rels = (Array.isArray(b.rels) ? b.rels : [b.rel]).map((x: unknown) => String(x ?? '')).filter(Boolean)
        if (!rels.length) return json(400, { error: '고른 것이 없어요' })
        const to: string[] = []; const failed: string[] = []
        for (const rel of rels) {
          try { inBot(bot.abs, rel); to.push(reg.trashPath(relative(reg.root, join(bot.abs, rel)))) } catch { failed.push(rel) }
        }
        h.broadcast({ ev: 'files', botId: bot.id })
        return json(200, { to, failed })
      }
      /**
       * 옮기기 — 트리에서 끌어다 놓기(A7)와 «여기로 옮기기»(A6) 가 같이 쓴다.
       * ⚠ 목적지도 **봇 폴더 안**이어야 하고, **자기 자신 안으로는 못 옮긴다**(폴더를 자기 자손으로 넣으면 사라진다).
       * ⚠ 같은 이름이 있으면 `freeName` 으로 비킨다 — 끌어 놓기 한 번에 덮어쓰기는 없다.
       */
      if (sub === 'move' && m === 'POST') {
        const b = await body()
        const dir = String(b.dir ?? '').replace(/^\/+|\/+$/g, '')
        const dirAbs = inBot(bot.abs, dir)
        if (!exists(dirAbs)) return json(404, { error: '없는 폴더' })
        const rels = (Array.isArray(b.rels) ? b.rels : [b.rel]).map((x: unknown) => String(x ?? '')).filter(Boolean)
        const moved: { from: string; to: string }[] = []; const failed: string[] = []
        for (const rel of rels) {
          try {
            const from = inBot(bot.abs, rel)
            if (dirAbs === from || dirAbs.startsWith(from + sep)) throw new Error('자기 안으로는 못 옮겨요')
            if (join(from, '..') === dirAbs) { moved.push({ from: rel, to: rel }); continue }
            const to = freeName(bot.abs, dir, rel.split('/').pop() ?? rel)
            reg.movePath(relative(reg.root, from), relative(reg.root, inBot(bot.abs, to)))
            moved.push({ from: rel, to })
          } catch { failed.push(rel) }
        }
        h.broadcast({ ev: 'files', botId: bot.id })
        return json(200, { moved, failed })
      }
      if (sub === 'raw') { const abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, url.searchParams.get('rel') ?? '')).slice(1)); if (!exists(abs)) return json(404, { error: 'none' }); res.writeHead(200, { 'content-type': mime(abs), 'cache-control': 'no-store' }); stream(abs).pipe(res); return }
      if (sub === 'routines' && m === 'GET') return json(200, bot.routines)
      if (sub === 'routines' && m === 'PUT') { const b = await body(); const cfg = reg.botConfig(bot.abs); cfg.routines = b.routines as never; reg.saveBotConfig(bot.abs, cfg); h.afterBotsChanged(); return json(200, { ok: true }) }
      if (sub === 'config' && m === 'PUT') { const b = await body(); const cfg = reg.botConfig(bot.abs); Object.assign(cfg, b); reg.saveBotConfig(bot.abs, cfg); h.afterBotsChanged(); return json(200, { ok: true }) }
    }
    if (seg[1] === 'sessions' && seg[2]) {
      const r = h.sessions.get(seg[2]); if (!r) return json(404, { error: '그런 세션이 없어요' })
      const bot = botOf(r.botId); const sub = seg[3]
      if (!sub && m === 'DELETE') { h.sessions.remove(r.id); return json(200, { ok: true }) }
      if (sub === 'chat') return json(200, { info: h.sessions.info(r), items: r.items.slice(-800) })
      if (sub === 'send' && m === 'POST') { const b = await body(); h.sendToBot(bot, String(b.text), r.id); return json(200, { ok: true }) }
      if (sub === 'permission' && m === 'POST') { const b = await body(); h.sessions.respondPermission(r, String(b.requestId), !!b.allow, !!b.always); return json(200, { ok: true }) }
      if (sub === 'ask' && m === 'POST') { const b = await body(); h.sessions.respondAsk(r, String(b.requestId), (b.answers ?? {}) as Record<string, string>); return json(200, { ok: true }) }
      if (sub === 'interrupt' && m === 'POST') { h.sessions.interrupt(r); return json(200, { ok: true }) }
      if (sub === 'ack' && m === 'POST') { h.sessions.acknowledge(r); return json(200, { ok: true }) }
      if (sub === 'rename' && m === 'POST') { const b = await body(); h.sessions.rename(r.id, String(b.name)); return json(200, { ok: true }) }
      if (sub === 'hibernate' && m === 'POST') { h.sessions.hibernate(r.id); return json(200, { ok: true }) }
      if (sub === 'settings' && m === 'POST') { const b = await body(); h.sessions.configure(r, { model: b.model === undefined ? undefined : String(b.model), effort: b.effort === undefined ? undefined : String(b.effort), permissionMode: b.permissionMode === undefined ? undefined : (String(b.permissionMode) as never) }); return json(200, h.sessions.info(r)) }
    }
    return json(404, { error: 'not found' })
  }

  private static(p: string, res: ServerResponse): void {
    let rel = normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, '')
    if (rel === '/' || rel === '') rel = '/index.html'
    let f = join(this.webRoot, rel)
    if (!f.startsWith(this.webRoot) || !existsSync(f) || statSync(f).isDirectory()) f = join(this.webRoot, 'index.html')
    if (!existsSync(f)) { res.writeHead(404); res.end('client not built'); return }
    const e = extname(f)
    const immutable = f.includes('/assets/')
    res.writeHead(200, { 'content-type': mime(f) === 'application/octet-stream' ? ({ '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' } as Record<string, string>)[e] ?? 'application/octet-stream' : mime(f), 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-store', 'service-worker-allowed': '/' })
    res.end(readFileSync(f))
  }
  stop(): void { for (const s of this.servers) s.close() }
}
