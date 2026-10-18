import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, extname, normalize, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
/** zip 을 표준 출력으로 — 숨김 파일(.folderbot 등)은 뺀다 */
function spawnZip(cwd: string, name: string) { return spawn('zip', ['-r', '-q', '-', name, '-x', '*/.*', '.*'], { cwd }) }
import type { Frame, RoutineDef } from '../core/types'
import { stripRuntime } from '../core/types'
import { WHEN_EXAMPLES, confirmLine, cronOk, describeCron, parseWhen, sameOnce } from '../core/when'
import type { Host } from './host'
import { bindAddresses, tailnetInfo, tailnetInfoCached } from './tailnet'
import { StaticCache, pickEncoding } from './staticCache'
import { chatVer } from '../core/chatVer'
import { etagHit, ifRangeOk, parseRange, rawEtag } from './rawServe'
import { pipeline } from 'node:stream'
import { mark, routeLabel, slowSince } from './slow'
import { saveConfig } from './paths'
import { handleMcp } from './mcp'
import { bearer, mcpGate } from './mcpAuth'
import { readTokenEnv } from './wake'
import { providers, forgetProviders } from './providers'
import { agentModels, codexAuth, diagnose, forgetModels } from './auth'
import { canon } from './registry'
import { normalizeRootInput } from '../core/rootPath'
import { searchConversations } from '../core/convSearch'
import { sessLocked } from '../core/cleanup'
import type { ClientCtx } from '../core/clientCtx'
/** J-1 · 요청의 기기 컨텍스트 — 누가 보냈나(origin·device)는 호스트가 정하고, 화면 종류·손가락·열 수 있나·모드는 화면이 말한 대로 */
function clientOf(who: { device: string; main: boolean }, c: unknown): ClientCtx {
  const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
  const tier = o.tier === 'phone' || o.tier === 'desktop' || o.tier === 'browser' ? o.tier : 'browser'
  return { origin: who.main ? 'host' : 'remote', device: who.main ? 'host' : who.device, tier, touch: o.touch === true, canOpenOnDevice: who.main ? true : o.canOpenOnDevice === true, openMode: o.openMode === 'sync' || o.openMode === 'download' ? o.openMode : '' }
}

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
import { hookState, setBudget, setHook, usageReport, warmUsage } from './usage'
import { planNow } from './planUsage'
import { saveDoc, fileVer } from './docSave'
import { allDirs, guard, headHash, kindOf, mime, readText, recent, resolveNF, resolveNFDeep, stream, tree, writeText, exists, listDir, renameEntry } from './files'
import { readTodo, todoDelete, todoDue, todoEdit, todoMeta, todoMove, todoToggle } from './todoStore'
import { globParents, roleOf } from '../core/rules'
import { createCommand, listCommandFiles, slashCommands } from './slash'
import { globalHarness, harnessDetail, harnessRow } from './harness'

interface Client { res: ServerResponse; device: string }
interface Who { ok: boolean; device: string; id: string; main: boolean }
const PAIR_TTL = 2 * 60 * 1000

export class Gateway {
  private servers: Server[] = []
  private clients = new Set<Client>()
  /** BH · 화면 발자국(`/api/client-log`) 분당 상한 */
  private clogs: number[] = []
  pairing: { code: string; expiresAt: number } | null = null
  addrs: string[] = []
  /** BJ · 화면 판 — 호스트가 내보내는 `index.html` 의 지문. 화면은 이것이 바뀌면 스스로 다시 읽는다(옛 코드가 계속 돌지 않게) */
  private build: string | null = null
  clientBuild(): string { if (this.build === null) { try { this.build = createHash('sha256').update(readFileSync(join(this.webRoot, 'index.html'))).digest('hex').slice(0, 12) } catch { this.build = '' } } return this.build }
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
    this.watchLoop()
    warmUsage()   // BO · 첫 훑기를 뒤에서 미리 — 끊어 읽으니 켜지는 동안에도 요청을 받는다(켜기만 하는 `init` 같은 명령은 안 탄다)
  }
  /**
   * 🔴 **BO · 호스트가 스스로 «멈춘 시간» 을 잰다** (2026-10-08). 250ms 마다 시계를 보고 늦은 만큼이 그동안 멈춘 시간이다.
   *    원격 화면이 «기다린다» 고 느낀 뿌리는 네트워크가 아니라 호스트 멈춤이었다(사용량 훑기 2.5초) — 다음에 느려지면
   *    `/api/health` 의 `stallMs`(최근 1분 최대)로 숫자가 바로 보이고, 1초를 넘으면 로그에 한 줄 남는다.
   */
  stall = { maxMs: 0, at: 0 }
  private watchLoop(): void {
    const TICK = 250; let last = performance.now()
    setInterval(() => {
      const now = performance.now(); const late = Math.max(0, now - last - TICK); last = now
      if (Date.now() - this.stall.at > 60_000) this.stall = { maxMs: 0, at: Date.now() }
      if (late > this.stall.maxMs) this.stall = { maxMs: Math.round(late), at: this.stall.at }
      // CI-3 · 무엇이 쥐고 있었나를 함께 — `mark` 의 기록은 check 단계(setImmediate)에서 들어오므로 그 뒤에 읽는다
      if (late > 1000) setImmediate(() => { const who = slowSince(late + 2 * TICK); this.host.log(`호스트가 ${Math.round(late)}ms 멈췄어요 · ${who ? `그사이 길었던 일: ${who}` : '호스트 일 기록 없음(앱 화면·GC 쪽)'}`) })
    }, TICK).unref()
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
    // ⚠ 검사 시임 — 인증을 끈 QA 에서 `x-fb-as: <기기이름>` 헤더를 붙이면 그 이름의 «원격 기기» 로 본다(원격 화면 계약을 스모크로 재려고)
    if (process.env.FOLDERBOT_NO_AUTH) { const as = req.headers['x-fb-as']; return as ? { ok: true, device: String(as), id: 'as', main: false } : { ok: true, device: 'local', id: 'local', main: true } }
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
  /**
   * CF-④ · `tailscale serve`(폰 HTTPS — iOS 웹 푸시의 전제)는 tailnet 요청을 127.0.0.1 로 넘긴다. 그 요청은 **loopback 이 아니다** —
   *   프록시가 붙이는 머리(`x-forwarded-for`·`tailscale-user-login`)가 있으면 바깥에서 온 것으로 본다. 안 그러면 serve 를 켜는 순간
   *   `/mcp`·`/api/pairing` 의 «미니에서만» 울타리가 tailnet 에 열린다.
   */
  private isLoopback(req: IncomingMessage): boolean { return isLoopbackReq(req.socket.remoteAddress, req.headers) }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    mark(routeLabel(req.method, req.url))
    const url = new URL(req.url ?? '/', 'http://x')
    const p = url.pathname
    // 큰 JSON 은 gzip — 폴더 찾기 색인이 600KB → 60KB (2026-10-12 · 원격에서 첫 검색이 비던 원인 하나). 받는 쪽이 gzip 을 말할 때만
    const json = (code: number, body: unknown) => {
      const text = JSON.stringify(body); const head: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      if (text.length > 32 * 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) { res.writeHead(code, { ...head, 'content-encoding': 'gzip', vary: 'accept-encoding' }); res.end(gzipSync(text)); return }
      res.writeHead(code, head); res.end(text)
    }
    const body = async (): Promise<Record<string, unknown>> => { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const s = Buffer.concat(chunks).toString('utf8'); return s ? JSON.parse(s) : {} }

    if (p.startsWith('/mcp/')) {
      if (!this.isLoopback(req)) return json(403, { error: 'loopback only' })
      // BT · 브라우저(Origin)·JSON 아닌 본문·세션 토큰 없는 요청은 거절 — host/mcpAuth.ts 머리말
      const gate = mcpGate(req.headers); if (gate) return json(gate.code, { error: gate.error })
      const mBot = decodeURIComponent(p.slice(5)), mSid = url.searchParams.get('sid') ?? ''
      if (!this.host.mcpAuth.check(mBot, mSid, bearer(req.headers))) return json(401, { error: 'mcp token required' })
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer)
      return handleMcp(this.host, mBot, req, res, Buffer.concat(chunks).toString('utf8'), mSid)
    }
    // BQ-11 · 연결 상대의 들어오는 웹훅 — 기기 토큰이 아니라 그 상대만의 토큰. 이 맥·같은 tailnet 에서만(공개 주소로 열지 않는다)
    const mIn = /^\/api\/bridges\/([a-z0-9-]+)\/messages$/.exec(p)
    if (mIn && req.method === 'POST') return this.bridgeInbound(mIn[1], req, json, body)
    // ③ 승인을 기다리는 연결 채널 세션 수와 가장 오래 선 시간 — 이름은 안 낸다(인증 없는 창구다). 감시기가 이것을 본다
    if (p === '/api/health') return json(200, { ok: true, name: 'folderbot', version: this.host.version, stallMs: this.stall.maxMs, channelWaits: this.host.sessions.channelWaits(), pushSubs: this.host.notifier.subsView().length, lastPush: this.host.notifier.lastPush })
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
    return this.static(p, res, req)
  }

  /** BQ-11 · 상대별 토큰 확인 → 편지 파일 → 평소처럼 배달. 상한: 상대마다 시간당 60통 */
  private inboundLog = new Map<string, number[]>()
  private async bridgeInbound(peerId: string, req: IncomingMessage, json: (c: number, b: unknown) => void, body: () => Promise<Record<string, unknown>>): Promise<void> {
    const a = req.socket.remoteAddress ?? ''
    const local = this.isLoopback(req) || /^(::ffff:)?100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a)
    if (!local) return json(403, { error: 'tailnet only' })
    const peer = this.host.bridges.peer(peerId)
    if (!peer?.enabled || !peer.inbound) return json(404, { error: 'no such inbound bridge' })
    let token = ''
    try { token = readTokenEnv(peer.inbound.env) } catch (e) { this.host.log(`⚠ 연결 «${peer.name}» 들어오는 웹훅 토큰을 못 읽었어요 · ${(e as Error).message}`); return json(503, { error: 'inbound token not configured' }) }
    const got = Buffer.from(bearer(req.headers)), want = Buffer.from(token)
    if (!(got.length === want.length && timingSafeEqual(got, want))) { await new Promise((r) => setTimeout(r, 500)); return json(401, { error: 'unauthorized' }) }
    const now = Date.now(); const log = (this.inboundLog.get(peerId) ?? []).filter((t) => now - t < 3600_000)
    if (log.length >= 60) return json(429, { error: 'too many letters — 60 per hour' })
    log.push(now); this.inboundLog.set(peerId, log)
    let b: Record<string, unknown>
    try { b = await body() } catch { return json(400, { error: 'json body required' }) }
    try {
      const out = this.host.bridges.receive(peerId, { kind: typeof b.kind === 'string' ? b.kind : undefined, text: String(b.text ?? ''), title: typeof b.title === 'string' ? b.title : undefined, re: typeof b.re === 'string' ? b.re : undefined, urgent: b.urgent === true, needsHuman: b.needs_human === true })
      return json(201, out)
    } catch (e) { return json(400, { error: (e as Error).message }) }
  }

  private async api(p: string, url: URL, req: IncomingMessage, res: ServerResponse, json: (c: number, b: unknown) => void, body: () => Promise<Record<string, unknown>>, device: string, who: Who): Promise<void> {
    const h = this.host; const reg = h.registry
    const m = req.method ?? 'GET'
    const seg = p.split('/').filter(Boolean) // ['api', ...]
    const botOf = (id: string) => { const b = reg.bot(id); if (!b) throw new Error('그런 봇이 없어요'); return b }
    const roots = (b: ReturnType<typeof botOf>) => [reg.root, ...(b.repo ? [b.repo] : []), ...(b.refs ?? [])]

    if (p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      res.write(`data: ${JSON.stringify({ ev: 'hello', version: h.version, serverTime: Date.now(), build: this.clientBuild() } satisfies Frame)}\n\n`)
      const c: Client = { res, device }; this.clients.add(c)
      req.on('close', () => this.clients.delete(c))
      return
    }
    if (p === '/api/agents' && m === 'GET') return json(200, providers())
    // 쓸 수 있는 모델 — **기계에서 주워 온다**(빌트인 목록은 화면이 빈 자리를 메울 때만 쓴다)
    if (p === '/api/agents/models' && m === 'GET') return json(200, agentModels())
    /**
     * 🔴 **AL · 새로고침** (2026-09-24 Dave: *«폴더봇을 종료했다가 다시 시작하면 종류별 최신 모델이 자동으로
     *    선택되도록 바뀌거나, 혹은 리프레시가 가능하도록 했으면 좋겠는데 지금은 전혀 그렇게 되지가 않아»*).
     * ⚠ **재시작으로는 안 고쳐지는 게 맞았다** — 고르는 코드가 판을 안 보고 «먼저 있는 경로» 를 집었기 때문이다
     *    (`providers.resolve`). 이제 판을 보고 고르므로, 여기서 캐시만 버리면 **CLI 를 새로 깔자마자** 반영된다.
     */
    if (p === '/api/agents/refresh' && m === 'POST') {
      forgetProviders(); forgetModels()
      const ps = providers()
      // ⚠ `refreshAuth(true)` 는 «턴이 인증 오류로 죽었다» 는 신호다 — 그걸 주면 멀쩡한 로그인을
      //    «못 읽음» 으로 낮춰 버린다(실측: 이 줄 때문에 위임 세션이 안 돌고 idle 로 남았다). 새로고침은 그냥 다시 읽는 것이다.
      void h.refreshAuth()
      return json(200, { ok: true, providers: ps, models: agentModels() })
    }
    /**
     * AJ · **CLI 업데이트를 화면에서 바로** (2026-09-24 Dave). 앱은 **호스트의 CLI** 로 도는데 그게 낡으면
     * 새 모델이 400 으로 죽는다 — 그때 사람이 어느 기계에 들어가 무엇을 쳐야 하는지 스스로 알아내야 했다.
     * ⚠ **claude 만** 연다. Codex 는 올리는 길이 설치 방식마다 달라(npm·brew·직접) 여기서 함부로 못 부른다.
     * ⚠ 오래 걸리므로(내려받기) 넉넉히 기다리고, 끝나면 **새 판을 다시 읽어** 돌려준다 — 「했다」가 아니라 「이렇게 됐다」를 말한다.
     */
    if (p === '/api/agents/claude/update' && m === 'POST') {
      const cl = providers().find((x) => x.id === 'claude')
      if (!cl?.bin) return json(400, { error: '이 호스트에 claude CLI 가 없어요' })
      const before = cl.version ?? null
      // 🔴 **QA 는 실 CLI 를 건드리지 않는다** (리포 규칙). 검사에서는 길이 열려 있는지만 보고 실제로는 안 올린다
      if (process.env.FOLDERBOT_QA) return json(200, { ok: true, skipped: true, before, after: before, changed: false, out: 'QA — 실제 업데이트는 건너뜀' })
      try {
        const out = await new Promise<string>((res, rej) => {
          execFile(cl.bin!, ['update'], { timeout: 5 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (e, so, se) => (e && !so && !se ? rej(e) : res(String(so || '') + String(se || ''))))
        })
        const after = providers().find((x) => x.id === 'claude')?.version ?? null
        void h.refreshAuth(true)      // 화면이 제공자·판을 다시 읽게 한다(에이전트 상태와 같은 길)
        return json(200, { ok: true, before, after, changed: !!after && after !== before, out: out.slice(-1200) })
      } catch (e) { return json(500, { error: (e as Error).message, before }) }
    }
    if (p === '/api/usage' && m === 'GET') {
      // 봇별 내역 — 세션의 CLI 세션 id 가 곧 기록 파일 이름이다 (L)
      const bySid = new Map<string, { botId: string; name: string }>()
      for (const r of h.sessions.all()) if (r.cliSessionId) { const b = reg.bot(r.botId); bySid.set(r.cliSessionId, { botId: r.botId, name: b?.displayName ?? b?.name ?? r.botId }) }
      // BD · 실제 요금제 한도 — CLI 에게 물어 둔 값(오래됐으면 뒤에서 새로 묻는다 · 기다리지 않는다)
      return json(200, { ...(await usageReport(Date.now(), (sid) => bySid.get(sid), planNow(h.sessions.bin))), hook: hookState().installed })
    }
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
      const tn = await tailnetInfoCached()
      return json(200, { version: h.version, root: reg.root, rules: reg.rules, rulesInstalled: reg.rulesInstalled(), bots: reg.bots(), candidates: reg.candidates(), auth: h.auth, inbox: reg.inboxItems().length, notifications: h.notifier.events.slice(0, 100) /* CJ · 알림 칸 숫자 = 알림 창(100)과 같은 창 — 50 이면 칸이 덜 셌다 */, vapidPublic: h.notifier.vapidPublic(), tailnet: tn, addrs: this.addrs, port: h.cfg.port, devices: h.cfg.devices.filter((d) => d.name !== LOCAL_DEVICE).map((d) => ({ id: d.id, name: d.name, lastSeen: d.lastSeen })), sessionsByBot: Object.fromEntries(reg.bots().map((b) => [b.id, h.sessions.list(b.id)])), quiet: h.cfg.quiet ?? { from: '23:00', to: '07:00' }, defaults: { model: h.cfg.defaultModel ?? '', effort: h.cfg.defaultEffort ?? '', permissionMode: h.cfg.defaultPermissionMode ?? 'default', idleMinutes: h.cfg.idleMinutes ?? 60, codex: { model: h.cfg.defaultCodexModel ?? '', effort: h.cfg.defaultCodexEffort ?? '', sandbox: h.cfg.codexSandbox ?? 'read-only', auth: codexAuth(h.cfg.openaiApiKey) } }, hostName: h.hostName(), device: { id: who.id, name: who.main ? h.hostName() : who.device, main: who.main } })
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
    /**
     * 세션 정리 (2026-10-02 · 시안 B) — 여러 세션을 한 번에 지우고, 10초 안에 되살린다.
     * 🔴 잠긴 세션(일하는 중·답 기다림·안 읽음·뒤에서 도는 중·대기 말)은 화면이 막아도 **호스트가 한 번 더** 걸러 건너뛴다 —
     *    화면이 낡은 목록으로 보내도 일·답이 사라지면 안 된다. 판정은 `core/cleanup` 하나.
     */
    if (p === '/api/sessions/bulk-delete' && m === 'POST') {
      const b = await body(); const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(String) : []
      const removed: string[] = [], skipped: { id: string; why: string }[] = []
      for (const id of ids) {
        const r = h.sessions.get(id); if (!r) { skipped.push({ id, why: '없음' }); continue }
        const why = sessLocked(h.sessions.info(r)); if (why) { skipped.push({ id, why }); continue }
        h.sessions.remove(id); removed.push(id)
      }
      return json(200, { removed, skipped })
    }
    if (p === '/api/sessions/restore' && m === 'POST') {
      const b = await body(); const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(String) : []
      return json(200, { restored: h.sessions.restore(ids) })
    }
    /**
     * 볼트 할 일 — 폴더마다 열린 수와 첫 줄. 🔴 CJ · 제안(`<!-- bot:proposed -->`)은 정식 할 일이 아니라 `open` 에서 빼고 `proposed` 로 따로 센다(10/16 규칙 2).
     * `?items=1` 이면 열린 줄 전체와 폴더별 Akiflow 상태(켜졌을 때만)까지 — 전체 할 일 보드가 쓴다(읽기 전용 · 60초 주기 읽기와 같은 양).
     */
    if (p === '/api/todos' && m === 'GET') {
      const full = url.searchParams.get('items') === '1'
      // 동기화 상태를 못 읽어도 보드는 선다 — 머리 «Akiflow …» 만 빠진다
      let ak: ReturnType<typeof h.akiflow.folderState> = null
      if (full) try { ak = h.akiflow.folderState() } catch { ak = null }
      const rows = reg.bots().filter((b) => !b.orchestrator).map((b) => {
        const all = readTodo(b.abs).filter((t) => !t.done)
        const open = all.filter((t) => !t.proposed)
        return { botId: b.id, name: b.name, open: open.length, proposed: all.length - open.length, next: open[0] ? { line: open[0].line, title: open[0].title } : null,
          ...(full ? { items: open.map((t) => ({ line: t.line, title: t.title, desc: t.desc, by: t.by, ...(t.due ? { due: t.due } : {}), ...(t.ak ? { ak: t.ak } : {}) })), ak: ak?.[b.rel] ?? null } : {}) }
      }).filter((r) => r.open > 0 || r.proposed > 0)
      return json(200, { open: rows.reduce((n, r) => n + r.open, 0), rows, ...(full ? { items: true, akLive: !!ak } : {}) })
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
    /* AV · 봇 하나의 세션을 전부 읽음으로 — 알림도 함께 닫는다(같은 대화의 알림이 남으면 종이 계속 운다) */
    { const mm = /^\/api\/bots\/([^/]+)\/read-all$/.exec(p)
      if (mm && m === 'POST') {
        const botId = decodeURIComponent(mm[1])
        const n = h.sessions.readAll(botId)
        for (const x of h.sessions.list(botId)) h.notifier.markReadBySession(x.id)
        return json(200, { ok: true, read: n })
      } }
    /* BL · 🔔 「모두 읽음」 — 모든 봇의 세션과 알림을 함께 읽음으로(알림만 닫으면 레일 링이 남는다) */
    if (p === '/api/read-all' && m === 'POST') { const n = h.sessions.readEverything(); h.notifier.markRead(undefined); return json(200, { ok: true, read: n }) }
    if (p === '/api/notifications/read' && m === 'POST') { const b = await body(); h.notifier.markRead(Array.isArray(b.ids) ? (b.ids as string[]) : undefined); return json(200, { ok: true }) }
    if (p === '/api/push/subscribe' && m === 'POST') { const b = await body(); h.notifier.addSub(b.sub as { endpoint: string; keys: { p256dh: string; auth: string } }, device); return json(200, { ok: true }) }
    if (p === '/api/push/test' && m === 'POST') { const subs = h.notifier.subsView(); h.notifier.emit('done', 'orch', 'Folder Bot', '푸시가 도착하면 성공이에요', undefined, { mac: false, force: true }); return json(200, { ok: true, subs: subs.length, mine: subs.some((s) => s.device === device) }) }
    if (p === '/api/push/status' && m === 'GET') return json(200, { subs: h.notifier.subsView(), last: h.notifier.lastPush })
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
    /**
     * BH · 화면이 남기는 발자국 — 알림 배너로 옮겼는데 가리킨 세션이 화면 목록에 없던 일을 **호스트 로그**에 적는다.
     * 원격 맥북의 일은 그 맥에서만 보여 재현이 어려웠다(2026-09-27). 길이는 300자, 분당 20줄에서 자른다.
     */
    if (p === '/api/client-log' && m === 'POST') {
      const now = Date.now(); this.clogs = this.clogs.filter((t) => now - t < 60_000)
      if (this.clogs.length < 20) { this.clogs.push(now); const b = await body(); h.log(`화면(${who.main ? '호스트' : who.device}): ${String(b.msg ?? '').replace(/\s+/g, ' ').slice(0, 300)}`) }
      return json(200, { ok: true })
    }
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
    // CK-2 · Akiflow 동기화 — 미리보기·켜기·카드 고르기(설정 «Akiflow 동기화»)
    if (p === '/api/akiflow' && m === 'GET') return json(200, h.akiflow.status())
    if (p === '/api/akiflow/mode' && m === 'POST') { const b = await body(); const mode = String(b.mode); if (!['off', 'preview', 'live'].includes(mode)) return json(400, { error: 'mode 는 off · preview · live 중 하나' }); h.akiflowMode(mode as 'off' | 'preview' | 'live'); return json(200, h.akiflow.status()) }
    if (p === '/api/akiflow/legacy' && m === 'POST') { const n = h.akiflow.legacyToProposed(); return json(200, { moved: n, ...h.akiflow.status() }) }
    if (p === '/api/akiflow/due' && m === 'POST') { const b = await body(); const date = b.date == null ? null : String(b.date); if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: 'date 는 YYYY-MM-DD' }); if (!h.akiflow.dueCand(String(b.rel), Number(b.line), String(b.title), date)) return json(409, { error: '그 줄이 바뀌었어요 — 다시 읽어 주세요' }); return json(200, h.akiflow.status()) }
    if (p === '/api/akiflow/resolve' && m === 'POST') { const b = await body(); const kind = String(b.kind); if (!['gone', 'conflict', 'pair'].includes(kind)) return json(400, { error: 'kind' }); h.akiflow.resolve(kind as 'gone' | 'conflict' | 'pair', String(b.id), String(b.choice)); return json(200, h.akiflow.status()) }
    if (p === '/api/bots/reorder' && m === 'POST') { const b = await body(); reg.reorder((Array.isArray(b.ids) ? b.ids : []).map((x: unknown) => String(x)), b.moved ? String(b.moved) : undefined); h.afterBotsChanged(); return json(200, { ok: true }) }
    if (p === '/api/bots/unfix' && m === 'POST') { const b = await body(); try { reg.unfix(String(b.id)) } catch (e) { return json(400, { error: (e as Error).message }) } h.afterBotsChanged(); return json(200, { ok: true }) }
    if (seg[1] === 'bots' && seg[2]) {
      const bot = botOf(seg[2]); const sub = seg[3]
      if (sub === 'stop' && m === 'POST') { if (bot.orchestrator) throw new Error('오케스트레이터는 정지할 수 없어요'); reg.stop(bot.id); h.afterBotsChanged(); return json(200, { ok: true }) }
      // CN · 몸 색 고르기 — 판 12색만 · 주황은 오케스트레이터 전용(registry.setColor 가 거절한다)
      if (sub === 'color' && m === 'POST') { const b = await body(); try { const nb = reg.setColor(bot.id, String(b.color ?? '')); h.afterBotsChanged(); return json(200, nb) } catch (e) { return json(400, { error: (e as Error).message }) } }
      if (sub === 'retire' && m === 'POST') { const to = reg.retire(bot.id); h.afterBotsChanged(); return json(200, { to }) }
      // ⛔ **봇(폴더) 자체를 치우는 길은 없다** (2026-09-13 Dave 정정: *«실제 폴더를 삭제하는게 아니라
      //    에이전트 연동 삭제»*). 레일의 «지우기» 는 위 `stop` — 목록에서만 덜어낸다. 파일을 치우는 것은
      //    아래 트리의 `sub === 'trash'` 로, **봇 폴더 안 파일**에만 닿는다.
      if (sub === 'sessions' && m === 'GET') return json(200, h.sessions.list(bot.id))
      // ⚠ `vendor` 는 **세션마다** 고를 수 있다 — 한 폴더에 Claude 세션과 Codex 세션이 섞여 산다
      if (sub === 'sessions' && m === 'POST') {
        const b = await body(); const vd = b.vendor === 'codex' || b.vendor === 'claude' ? b.vendor : undefined
        // BO · 화면이 id 를 정해 보내면(먼저 그 세션으로 가 있다) 그 id 로 만든다. 같은 요청이 또 오면 있는 것을 돌려준다
        const id = b.id === undefined ? undefined : String(b.id)
        if (id !== undefined) {
          const v = h.sessions.acceptId(id, bot.id)
          if (v === 'bad') return json(400, { error: '세션 id 를 쓸 수 없어요' })
          if (v === 'same') return json(200, h.sessions.info(h.sessions.get(id)!))
        }
        const s = h.sessions.create(bot, String(b.name ?? '새 세션'), { permissionMode: b.permissionMode as never, model: b.model ? String(b.model) : undefined, vendor: vd, id })
        return json(200, h.sessions.info(s))
      }
      if (sub === 'send' && m === 'POST') { const b = await body(); const sid = h.sendToBot(bot, String(b.text), b.sessionId ? String(b.sessionId) : undefined, b.name ? String(b.name) : undefined, undefined, { model: b.model ? String(b.model) : undefined, effort: b.effort ? String(b.effort) : undefined, permissionMode: b.permissionMode ? (String(b.permissionMode) as never) : undefined, vendor: b.vendor === 'codex' || b.vendor === 'claude' ? b.vendor : undefined, client: clientOf(who, b.client) }); return json(200, { sessionId: sid }) }
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
      if (sub === 'slash') { const sid = url.searchParams.get('sid') ?? ''; const v = sid ? h.sessions.get(sid)?.vendor : undefined; return json(200, slashCommands(bot.abs, reg.root, h.sessions.slashList(sid || undefined), v === 'codex' ? 'codex' : 'claude')) }
      if (sub === 'todo' && m === 'GET') return json(200, h.todo(bot))
      if (sub === 'todo' && seg[4] === 'toggle' && m === 'POST') { const b = await body()
        // CJ 보드 · 줄 번호는 다른 손(봇·Akiflow·다른 기기)이 파일을 고치면 밀린다 — 제목을 같이 보내면 맞을 때만 고친다(엉뚱한 줄을 끝내지 않는다)
        if (typeof b.title === 'string' && readTodo(bot.abs).find((t) => t.line === Number(b.line))?.title !== b.title) return json(409, { error: '할 일 목록이 그사이 바뀌었어요 — 다시 읽었어요' })
        const items = todoToggle(bot.abs, Number(b.line), !!b.done); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && seg[4] === 'edit' && m === 'POST') { const b = await body(); const due = b.due === undefined ? undefined : b.due === null || b.due === '' ? null : String(b.due); if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return json(400, { error: '마감은 YYYY-MM-DD 로 주세요' }); h.noteTodoTitle(bot.id, String(b.title ?? '')); const items = todoEdit(bot.abs, Number(b.line), String(b.title ?? ''), String(b.desc ?? ''), due); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      // CK-3 · 봇 제안 [넣기] — `<!-- bot:proposed -->` → `<!-- bot -->`(정식 줄 · Akiflow 대상)
      if (sub === 'todo' && seg[4] === 'accept' && m === 'POST') { const b = await body(); const items = todoMeta(bot.abs, Number(b.line), { proposed: false }); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      // CK-1 · 마감만 바꾸기 — 날짜 또는 null(지우기)
      if (sub === 'todo' && seg[4] === 'due' && m === 'POST') { const b = await body(); const due = b.due ? String(b.due) : null; if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return json(400, { error: '마감은 YYYY-MM-DD 로 주세요' }); const items = todoDue(bot.abs, Number(b.line), due); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && seg[4] === 'move' && m === 'POST') { const b = await body(); const items = todoMove(bot.abs, Number(b.line), b.before === null || b.before === undefined ? null : Number(b.before)); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && seg[4] === 'delete' && m === 'POST') { const b = await body(); const items = todoDelete(bot.abs, Number(b.line)); h.broadcast({ ev: 'todo', botId: bot.id, items }); return json(200, items) }
      if (sub === 'todo' && m === 'POST') { const b = await body(); const due = b.due && /^\d{4}-\d{2}-\d{2}$/.test(String(b.due)) ? String(b.due) : undefined; h.todoAdd(bot, String(b.title), String(b.desc ?? ''), 'me', false, String(b.section ?? ''), due ? { due } : {}); return json(200, h.todo(bot)) }
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
        let rel = `첨부/${name}`; let i = 2   // 같은 이름이면 `_2`, `_3` … — 덮어쓰지 않는다 (N-3)
        while (existsSync(join(bot.abs, rel))) { const dot = name.lastIndexOf('.'); rel = `첨부/${dot > 0 ? name.slice(0, dot) : name}_${i++}${dot > 0 ? name.slice(dot) : ''}` }
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
        return json(200, { ...meta, ver: fileVer(abs), text: r.text.slice(0, 4096) })
      }
      if (sub === 'file' && m === 'GET') {
        // ⚠ 한글 이름은 NFC/NFD 두 벌로 산다 — **있는 쪽**을 찾아 준다(`resolveNF` 머리말)
        const abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, url.searchParams.get('rel') ?? '')).slice(1))
        if (!exists(abs)) return json(404, { error: '없는 파일' })
        const kind = kindOf(abs)
        // ⚠ 캔버스도 **글로 내려보낸다** — 화면이 JSON 을 읽어 노드를 그린다(원문으로 그리지는 않는다)
        // DA · 화면이 든 판(`v`)과 같으면 글은 안 보낸다 — 한 번 받은 문서는 «그대로» 한 줄로 끝난다(충돌 사본 목록은 늘 새로)
        if (kind === 'text' || kind === 'canvas') { const q = url.searchParams.get('rel') ?? ''; const ver = fileVer(abs); const clashes = h.clashes.of(bot.id, q).map((c) => c.copy); if (url.searchParams.get('v') === ver) return json(200, { same: true, kind, rel: q, ver, clashes }); const r = readText(abs); return json(200, { kind, rel: q, text: r.text, truncated: r.truncated, size: statSync(abs).size, mtime: statSync(abs).mtimeMs, ver, clashes }) }
        return json(200, { kind, rel: url.searchParams.get('rel'), size: statSync(abs).size, mtime: statSync(abs).mtimeMs })
      }
      /**
       * 저장 (BF) — 문서 창은 연 판(`base`)을 함께 보낸다. 디스크가 그새 바뀌었으면 원본은 그대로 두고 내 글을 «충돌 사본» 으로
       * 옆에 두고 `{ ok:false, conflict }` 로 알린다. 글이 디스크와 같으면 쓰지 않는다(`docSave.ts` 머리말).
       * ⚠ 쓰기는 **봇 폴더 안만** — 참조 폴더·폴더 밖 문서는 읽기만이다(`inBot`).
       */
      if (sub === 'file' && m === 'POST') {
        const b = await body(); const rel = String(b.rel ?? '')
        // ⚠ 한글 이름은 NFC/NFD 두 벌로 산다 — 읽을 때와 **같은 파일**에 쓴다(안 그러면 판이 늘 «없음» 이라 매번 충돌이 난다)
        const abs = resolveNFDeep('/', inBot(bot.abs, rel).slice(1))
        /**
         * 🔴 BJ · **판(`base`) 없는 저장은 거절한다** — 스크립트·검사만 `force:true` 로 쓴다.
         *    BF(v163)는 새 화면이 판을 보내게 했지만, 호스트를 올려도 **이미 떠 있던 화면은 옛 코드 그대로** 돌며 판 없이 썼다.
         *    그 화면들이 막히지 않으면 호스트를 올린 뒤에도 뒤바뀜이 난다. 옛 화면은 이제 «저장 실패» 를 보고, 다시 읽으면(BJ 자동 새로고침) 새 코드가 된다.
         */
        if (typeof b.base !== 'string' && b.force !== true) return json(428, { error: '화면이 옛 판이라 저장하지 않았어요 — 새로고침하면 새 판으로 저장돼요' })
        const r = saveDoc({ botId: bot.id, botAbs: bot.abs, rel, abs, text: String(b.text ?? ''), base: typeof b.base === 'string' ? b.base : undefined, book: h.clashes })
        if (!(r.ok && r.same)) h.broadcast({ ev: 'files', botId: bot.id })
        // ⚠ 충돌은 **오류가 아니라 상태**로 답한다(200) — 409 를 주면 브라우저 콘솔에 끌 수 없는 빨간 줄이 남는다(`peek` 과 같은 이유)
        return json(200, r)
      }
      /**
       * 충돌 사본 정리 (BF) — 배너의 «내 글로 바꾸기»(mine) · «지금 파일 유지»(theirs). 장부에 있는 사본만 받는다.
       * mine 은 사람이 충돌을 보고 고른 것이라 판을 묻지 않고 쓴다. 쓰고 나면 사본은 휴지통으로.
       */
      if (sub === 'clash' && m === 'POST') {
        const b = await body(); const c = h.clashes.find(bot.id, String(b.copy ?? ''))
        if (!c) return json(404, { error: '이미 정리된 사본이에요' })
        const copyAbs = inBot(bot.abs, c.copy); let ver: string | undefined
        if (b.action === 'mine') { if (!exists(copyAbs)) return json(404, { error: '사본이 없어요' }); const t = readFileSync(copyAbs, 'utf8'); writeText(inBot(bot.abs, c.rel), t); ver = fileVer(inBot(bot.abs, c.rel)) }
        if (exists(copyAbs)) reg.trashPath(relative(reg.root, copyAbs))
        h.clashes.drop(c); h.broadcast({ ev: 'files', botId: bot.id })
        return json(200, { ok: true, ver })
      }
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
        const out: Record<string, { rel: string; dir: boolean; matches?: string[] } | false> = {}
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
          // 파일명만(«설명서.pdf») — 봇 폴더 → 참조 폴더 → 볼트 전체 순으로 찾는다. 여럿이면 목록을 돌려주고 화면이 고르게 한다 (G)
          if (!out[c] && !c.includes('/')) {
            const found: string[] = []
            // K-1 · 위키링크 `[[노트]]` 는 확장자를 안 쓴다 — 이름 그대로 없으면 `노트.md` 로도 찾는다
            const names = extname(c) ? [c] : [c, `${c}.md`]
            // 🔴 볼트를 매번 훑지 않는다 — 표에서 찾는다(host/nameIndex · 10/18 파일 칸 느림의 원인)
            for (const base of [bot.abs, ...(bot.repo ? [bot.repo] : []), reg.root]) { for (const n of names) for (const f of await h.names.find(base, n)) if (!found.includes(f)) found.push(f); if (found.length) break }
            if (found.length) out[c] = { rel: relative(bot.abs, found[0]), dir: false, matches: found.map((f) => relative(bot.abs, f)) }
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
      // 원격 기기가 «내 사본이 호스트와 같은가» 를 재는 자 — 크기 · 앞 64KB 해시 (E · desktop/localfs.js 와 같은 식)
      /**
       * 참조 폴더 (BC · 2026-09-27) — 파일 영역 «＋참조 폴더» · 문서 띠 «참조 폴더로 추가» 가 쓴다. `{ path }` 는 더하기,
       * `{ path, remove: true }` 는 빼기. 🔴 세션 작업 폴더는 안 바뀐다(`--add-dir` 로만 붙는다) — 아래 `/repo` 와 다르다.
       */
      if (sub === 'refs' && m === 'POST') { const b = await body(); try { const p2 = String(b.path ?? ''); const nb = b.remove ? reg.removeRef(bot.id, p2) : reg.addRef(bot.id, p2); h.afterBotsChanged(); return json(200, { ok: true, refs: nb.refs ?? [] }) } catch (e) { return json(400, { error: (e as Error).message }) } }
      // 코드 리포 (`.bot.yml repo` = 코드 세션의 cwd) — D 가 한때 참조 폴더로 썼던 길. 빈 path 면 푼다
      if (sub === 'repo' && m === 'POST') { const b = await body(); try { const nb = reg.setRepo(bot.id, String(b.path ?? '')); h.afterBotsChanged(); return json(200, { ok: true, repo: nb.repo ?? null }) } catch (e) { return json(400, { error: (e as Error).message }) } }
      if (sub === 'stat' && m === 'GET') { const abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, url.searchParams.get('rel') ?? '')).slice(1)); if (!exists(abs)) return json(404, { error: '없는 파일' }); const st = statSync(abs); return json(200, { size: st.size, mtime: st.mtimeMs, head: headHash(abs), vaultRel: relative(reg.root, abs) }) }
      /**
       * M-3 · 파일 목록(재귀) — 원격 기기가 «폴더째 받기» 전에 개수·용량을 알고 확인창을 띄우고, 사본이 신선한지(size+head) 대조한다.
       * 폴더가 아니면 그 파일 하나. 5000개에서 자른다(`truncated`) — 그보다 크면 폴더째 복사가 아니라 압축이 맞다.
       */
      if (sub === 'manifest' && m === 'GET') {
        const relQ = url.searchParams.get('rel') ?? ''
        const abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, relQ)).slice(1)); if (!exists(abs)) return json(404, { error: '없는 파일' })
        const out: { rel: string; size: number; mtime: number; head: string }[] = []; let truncated = false
        const walk = (dir: string, r: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (out.length >= 5000) { truncated = true; return } if (e.name.startsWith('.')) continue; const a = join(dir, e.name); const rr = r ? `${r}/${e.name}` : e.name; if (e.isDirectory()) walk(a, rr); else { const st = statSync(a); out.push({ rel: rr, size: st.size, mtime: st.mtimeMs, head: headHash(a) }) } } }
        const st = statSync(abs)
        if (st.isDirectory()) walk(abs, ''); else out.push({ rel: '', size: st.size, mtime: st.mtimeMs, head: headHash(abs) })
        return json(200, { dir: st.isDirectory(), name: basename(abs), files: out, total: out.reduce((a, f) => a + f.size, 0), truncated })
      }
      /** M-3 · 폴더를 zip 으로 — 폰의 «공유…» 와 브라우저 내려받기. macOS·Linux 의 /usr/bin/zip 을 스트리밍한다(디스크에 안 남긴다) */
      if (sub === 'zip' && m === 'GET') {
        const relQ = url.searchParams.get('rel') ?? ''
        const abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, relQ)).slice(1)); if (!exists(abs)) return json(404, { error: '없는 폴더' })
        const name = basename(abs)
        res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.zip`, 'cache-control': 'no-store' })
        const z = spawnZip(dirname(abs), name); z.stdout.pipe(res); z.on('error', () => { try { res.end() } catch { /* */ } }); req.on('close', () => { try { z.kill() } catch { /* */ } })
        return
      }
      /** DA · 원본 — 판 표식으로 «그대로면 304» · 조각(Range)으로 큰 PDF 첫 쪽부터 (`rawServe.ts` 머리말) */
      if (sub === 'raw') {
        const abs = resolveNFDeep('/', guard(roots(bot), join(bot.abs, url.searchParams.get('rel') ?? '')).slice(1)); if (!exists(abs)) return json(404, { error: 'none' })
        const st = statSync(abs); const tag = rawEtag(st.size, st.mtimeMs)
        const head: Record<string, string> = { 'content-type': mime(abs), 'cache-control': 'private, no-cache', etag: tag, 'last-modified': new Date(st.mtimeMs).toUTCString(), 'accept-ranges': 'bytes' }
        if (etagHit(req.headers['if-none-match'], tag)) { res.writeHead(304, head); res.end(); return }
        const ir = req.headers['if-range']
        const rg = ifRangeOk(Array.isArray(ir) ? ir[0] : ir, tag, st.mtimeMs) ? parseRange(req.headers.range, st.size) : null   // 바뀐 파일이면 조각 대신 전체
        // ⚠ pipeline — 크롬 PDF 보기가 받다 끊으면 읽던 파일을 닫고, 그새 파일이 지워져도 호스트가 죽지 않는다
        const send = (s: ReturnType<typeof stream>) => pipeline(s, res, () => { /* 끊김 — 정리는 pipeline 이 한다 */ })
        if (rg === 'bad') { res.writeHead(416, { ...head, 'content-range': `bytes */${st.size}` }); res.end(); return }
        if (rg) { res.writeHead(206, { ...head, 'content-range': `bytes ${rg.start}-${rg.end}/${st.size}`, 'content-length': String(rg.end - rg.start + 1) }); send(stream(abs, rg)); return }
        res.writeHead(200, { ...head, 'content-length': String(st.size) }); send(stream(abs)); return
      }
      // AA-1 · 목록에는 **사람 말 · 다음 실행 · 오류**가 함께 간다 — 원시 cron 만 보여 주던 것이 사고를 못 보게 했다
      if (sub === 'routines' && !seg[4] && m === 'GET') return json(200, h.routines.decorate(bot.id, bot.routines).map((r) => ({ ...r, when: describeCron(r.cron) })))
      /**
       * 🔴 **저장 시점에도 같은 검증을 한다** (AA-1). 종전에는 검증 없이 통째로 덮어써서 `cron: "20"` 이 그대로
       *    파일에 들어갔고, 스케줄러가 그 예외를 삼켜 **한 번도 안 도는 루틴**이 화면에 멀쩡히 살아 있었다.
       *    파싱이 안 되면 **400 으로 막고 무엇이 잘못됐는지와 고친 예를 함께** 돌려준다.
       */
      if (sub === 'routines' && !seg[4] && m === 'PUT') {
        const b = await body()
        const list = Array.isArray(b.routines) ? (b.routines as RoutineDef[]) : []
        const bad: { name: string; cron: string; error: string }[] = []
        const clean = list.map((r) => {
          const name = String(r?.name ?? '').trim()
          const when = String(r?.cron ?? '').trim()
          const v = parseWhen(when)                    // 사람 말도 여기서 cron 이 된다 — 화면과 봇이 같은 문을 쓴다
          if (!v.ok) { bad.push({ name, cron: when, error: 'ask' in v ? v.ask.q : v.error }); return null }
          // CR · 지난 한 번짜리는 이미 저장돼 있던 값(끝난 루틴)일 때만 둔다 — 새로 넣는 지난 시각은 조용히 «끝남» 이 된다
          if (v.past && !sameOnce(v.cron, bot.routines.find((x) => x.name === name)?.cron)) { bad.push({ name, cron: when, error: `${v.text.replace(/ 한 번$/, '')} — 이미 지난 시각이에요` }); return null }
          return stripRuntime({ ...r, name, cron: v.cron })
        })
        if (bad.length) return json(400, { error: '주기를 못 읽었어요', bad, examples: WHEN_EXAMPLES })
        reg.saveRoutines(bot, clean.filter(Boolean) as RoutineDef[]); h.afterBotsChanged()   // BK · 오케스트레이터는 .claude/routines.yml · 다시 읽어 확인
        const saved = reg.bot(bot.id)?.routines ?? []
        return json(200, { ok: true, routines: h.routines.decorate(bot.id, saved).map((r) => ({ ...r, when: describeCron(r.cron), confirm: confirmLine(r.cron) })) })
      }
      /** AA-3 · 「언제」 한 줄을 미리 읽어 본다 — 화면이 타이핑하는 동안 「다음 실행」을 보여 주는 문 */
      if (sub === 'routines' && seg[4] === 'when' && m === 'POST') { const b = await body(); const v = parseWhen(String(b.when ?? '')); return json(200, v.ok ? { ok: true, cron: v.cron, text: v.text, confirm: confirmLine(v.cron) } : 'ask' in v ? { ok: false, ask: v.ask } : { ok: false, error: v.error, examples: v.examples }) }
      /** AA-4 · 「지금 한 번 돌려보기」 — 저장 직후 동작을 사람이 확인할 수 있어야 한다(이번 사고는 그게 없어서 이틀을 몰랐다) */
      if (sub === 'routines' && seg[4] === 'run' && m === 'POST') {
        const b = await body(); const name = String(b.name ?? '')
        const r = (reg.bot(bot.id)?.routines ?? []).find((x) => x.name === name)
        if (!r) return json(404, { error: '그 이름의 루틴이 없어요' })
        const v = cronOk(r.cron)
        h.runRoutine(reg.bot(bot.id)!, r)
        return json(200, { ok: true, ran: name, warn: v.ok ? null : `주기는 아직 안 서요 — ${v.error}` })
      }
      if (sub === 'config' && m === 'PUT') { const b = await body(); const cfg = reg.botConfig(bot.abs); Object.assign(cfg, b); reg.saveBotConfig(bot.abs, cfg); h.afterBotsChanged(); return json(200, { ok: true }) }
    }
    if (seg[1] === 'sessions' && seg[2]) {
      const r = h.sessions.get(seg[2]); if (!r) return json(404, { error: '그런 세션이 없어요' })
      const bot = botOf(r.botId); const sub = seg[3]
      if (!sub && m === 'DELETE') { h.sessions.remove(r.id); return json(200, { ok: true }) }
      if (sub === 'chat') {
        const info = h.sessions.info(r); const items = r.items.slice(-800)
        // CF-1 · 화면이 든 판과 같으면 «그대로» 만 — 다시 붙을 때 안 바뀐 대화를 다시 보내지 않는다
        const ver = chatVer(items, info.state, info.lastActivity, info.pending.length)
        if (url.searchParams.get('v') === ver) return json(200, { same: true, ver, info })
        return json(200, { info, items, ver })
      }
      // CC · 자동화 세션(소통·채널)에 보낸 사람 말은 새 채팅으로 갈라진다 — 화면이 그 세션으로 넘어가게 id 를 돌려준다
      if (sub === 'send' && m === 'POST') { const b = await body(); const sid = h.sendToBot(bot, String(b.text), r.id, undefined, undefined, { client: clientOf(who, b.client) }); return json(200, { ok: true, sessionId: sid }) }
      // CL-1 B · 고쳐 다시 = 되감기 — 못 하면 { ok: false } 로 답하고 화면이 A(이어서 고치기)로 보낸다
      if (sub === 'rewind' && m === 'POST') { const b = await body(); if (h.auth.verdict === 'unreadable' || h.auth.verdict === 'loggedout') return json(200, { ok: false }); return json(200, { ok: h.sessions.rewind(r, bot, String(b.text ?? ''), clientOf(who, b.client)) }) }
      // 호스트 대기열(다른 봇이 보낸 말) 고치기·빼기 — 빈 글이면 뺀다 (2026-10-02)
      if (sub === 'queue-now' && m === 'POST') { const b = await body(); try { h.sessions.nowQueue(r, Number(b.i)); return json(200, { ok: true }) } catch (e) { return json(400, { error: (e as Error).message }) } }
      if (sub === 'queue' && m === 'POST') { const b = await body(); try { return json(200, { queue: h.sessions.editQueue(r, Number(b.i), String(b.text ?? '')) }) } catch (e) { return json(400, { error: (e as Error).message }) } }
      if (sub === 'permission' && m === 'POST') {
        const b = await body()
        // 🔴 질문(AskUserQuestion)은 «허용» 으로 닫지 않는다 — 답은 `/ask` 로 온다. 허용을 받아 주면 답 없이 넘어가거나(보통 질문)
        //    질문이 취소된다(미뤄진 질문). 거부(취소)는 그대로 받는다 (2026-09-25 디자인 검수)
        // ⚠ allow 는 불리언만 — `"false"` 같은 글자가 참으로 읽혀 허용이 나가면 안 된다 (리뷰 · Codex)
        const allow = b.allow === true
        const pend = h.sessions.pendingOf(r.id).find((x) => x.requestId === String(b.requestId))
        // CQ · 이미 끝난(걷힌) 요청에는 아무것도 보내지 않는다 — 죽은 id 로 간 결과가 지금 걸린 질문을 끊었다
        if (!pend) return json(400, { error: '이미 끝난 요청이에요 — 새로 온 카드를 봐 주세요' })
        if (allow && pend.ask) return json(400, { error: '질문은 허용이 아니라 답으로 보내 주세요' })
        h.sessions.respondPermission(r, String(b.requestId), allow, b.always === true); return json(200, { ok: true })
      }
      /**
       * S · 여기까지 읽었다 (2026-09-21 Dave) — 화면이 맨 아래에 닿고 턴이 끝나면 한 번 부른다.
       * ⚠ 같이 그 세션의 **알림도 읽음**으로 넘긴다 — 대화를 다 읽었는데 🔔 에 같은 건이 남아 있으면 배지가 거짓말을 한다(실제로 50 이 쌓였다).
       */
      if (sub === 'read' && m === 'POST') { const b = await body(); h.sessions.markRead(r.id, typeof b.at === 'number' ? b.at : undefined); h.notifier.markReadBySession(r.id); return json(200, { ok: true }) }
      if (sub === 'ask' && m === 'POST') {
        const b = await body()
        // 🔴 답은 **질문에만** 간다 — 종전에는 Bash·Edit 같은 권한 요청 id 를 넣어도 받아서 «허용» 을 보냈다(위 허용 가드를 옆길로 우회 · 리뷰 · Codex)
        const pend = h.sessions.pendingOf(r.id).find((x) => x.requestId === String(b.requestId))
        if (!pend) return json(400, { error: '이미 끝난 질문이에요 — 새로 온 카드에 답해 주세요' })   // CQ
        if (!pend.ask) return json(400, { error: '기다리는 질문이 아니에요' })
        h.sessions.respondAsk(r, String(b.requestId), (b.answers ?? {}) as Record<string, string>); return json(200, { ok: true })
      }
      if (sub === 'interrupt' && m === 'POST') { const b = await body(); h.sessions.interrupt(r, b.by === 'human'); return json(200, { ok: true }) }
      // CL-1 · 멈춰 둔 대기 말 다시 내보내기
      if (sub === 'resume' && m === 'POST') { h.sessions.resume(r); return json(200, { ok: true }) }
      if (sub === 'ack' && m === 'POST') { h.sessions.acknowledge(r); return json(200, { ok: true }) }
      if (sub === 'rename' && m === 'POST') { const b = await body(); h.sessions.rename(r.id, String(b.name)); return json(200, { ok: true }) }
      if (sub === 'hibernate' && m === 'POST') { h.sessions.hibernate(r.id); return json(200, { ok: true }) }
      if (sub === 'settings' && m === 'POST') { const b = await body(); h.sessions.configure(r, { model: b.model === undefined ? undefined : String(b.model), effort: b.effort === undefined ? undefined : String(b.effort), permissionMode: b.permissionMode === undefined ? undefined : (String(b.permissionMode) as never) }); return json(200, h.sessions.info(r)) }
    }
    return json(404, { error: 'not found' })
  }

  private files = new StaticCache()
  private static(p: string, res: ServerResponse, req?: IncomingMessage): void {
    let rel = normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, '')
    if (rel === '/' || rel === '') rel = '/index.html'
    let f = join(this.webRoot, rel)
    const missing = !f.startsWith(this.webRoot) || !existsSync(f) || statSync(f).isDirectory()
    // 없는 파일(확장자가 있는 길)은 404 — 종전엔 index.html 을 200 으로 줘서 iOS 가 아이콘 자리(/apple-touch-icon.png)에서 HTML 을 받았다 (2026-10-19)
    if (missing && extname(rel) && extname(rel) !== '.html') { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return }
    if (missing) f = join(this.webRoot, 'index.html')
    if (!existsSync(f)) { res.writeHead(404); res.end('client not built'); return }
    const e = extname(f)
    const immutable = f.includes('/assets/')
    const type = mime(f) === 'application/octet-stream' ? ({ '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' } as Record<string, string>)[e] ?? 'application/octet-stream' : mime(f)
    // CF-1 · 자산은 압축본(br·gzip)을 메모리에서 · 나머지(index.html·sw.js)는 ETag 로 «안 바뀜» 을 304 로 — 매번 다시 받지 않는다
    const ent = this.files.get(f)
    const head: Record<string, string> = { 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'service-worker-allowed': '/', etag: ent.etag, vary: 'accept-encoding' }
    if (!immutable && req?.headers['if-none-match'] === ent.etag) { res.writeHead(304, head); res.end(); return }
    const enc = pickEncoding(req?.headers['accept-encoding'] as string | undefined)
    const body = this.files.encoded(f, ent, enc)
    if (body && enc) { res.writeHead(200, { ...head, 'content-encoding': enc }); res.end(body); return }
    res.writeHead(200, head); res.end(ent.raw)
  }
  stop(): void { for (const s of this.servers) s.close() }
}

/** CF-④ · 프록시(tailscale serve)를 거친 요청은 출발지가 127.0.0.1 이어도 바깥 요청이다 */
export function isLoopbackReq(addr: string | undefined, headers: Record<string, string | string[] | undefined>): boolean {
  if (headers['x-forwarded-for'] || headers['tailscale-user-login'] || headers['forwarded']) return false
  const a = addr ?? ''; return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
}
