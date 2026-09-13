import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, extname, normalize, relative } from 'node:path'
import type { Frame } from '../core/types'
import type { Host } from './host'
import { bindAddresses, tailnetInfo } from './tailnet'
import { saveConfig } from './paths'
import { handleMcp } from './mcp'
import { hookState, setBudget, setHook, usageReport } from './usage'
import { allDirs, guard, kindOf, mime, readText, recent, stream, tree, writeText, exists, listDir, renameEntry } from './files'
import { todoDelete, todoEdit, todoMove, todoToggle } from './todoStore'
import { globParents, roleOf } from '../core/rules'
import { slashCommands } from './slash'

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
    let d = this.host.cfg.devices.find((x) => x.name === 'this-mac')
    if (!d) { d = { id: randomBytes(6).toString('hex'), name: 'this-mac', token: randomBytes(32).toString('base64url'), createdAt: Date.now(), lastSeen: Date.now() }; this.host.cfg.devices.push(d); saveConfig(this.host.cfg) }
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
      if (a.length === b.length && timingSafeEqual(a, b)) { d.lastSeen = Date.now(); return { ok: true, device: d.name, id: d.id, main: d.name === 'this-mac' } }
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
    if (p === '/api/usage' && m === 'GET') return json(200, { ...usageReport(), hook: hookState().installed })
    if (p === '/api/usage/hook' && m === 'POST') { const b = await body(); return json(200, setHook(!!b.on)) }
    if (p === '/api/usage/budget' && m === 'POST') { const b = await body(); return json(200, setBudget({ window: b.window === undefined ? undefined : Number(b.window), day: b.day === undefined ? undefined : Number(b.day), week: b.week === undefined ? undefined : Number(b.week) } as never)) }
    if (p === '/api/state') {
      const tn = await tailnetInfo()
      return json(200, { version: h.version, root: reg.root, rules: reg.rules, rulesInstalled: reg.rulesInstalled(), bots: reg.bots(), candidates: reg.candidates(), auth: h.auth, inbox: reg.inboxItems().length, notifications: h.notifier.events.slice(0, 50), vapidPublic: h.notifier.vapidPublic(), tailnet: tn, addrs: this.addrs, port: h.cfg.port, botLimit: reg.botLimit, devices: h.cfg.devices.map((d) => ({ id: d.id, name: d.name, lastSeen: d.lastSeen })), sessionsByBot: Object.fromEntries(reg.bots().map((b) => [b.id, h.sessions.list(b.id)])), defaults: { model: h.cfg.defaultModel ?? '', effort: h.cfg.defaultEffort ?? '' }, hostName: h.hostName(), device: { id: who.id, name: who.main ? h.hostName() : who.device, main: who.main } })
    }
    if (p === '/api/bots' && m === 'GET') return json(200, reg.bots())
    if (p === '/api/candidates') return json(200, reg.candidates())
    if (p === '/api/bots/start' && m === 'POST') { const b = await body(); const bot = reg.start(String(b.rel)); h.afterBotsChanged(); return json(200, bot) }
    if (p === '/api/folders' && m === 'POST') { const b = await body(); const rel = reg.createFolder(String(b.section), String(b.name)); let bot = null; if (b.start) { bot = reg.start(rel); h.afterBotsChanged() } return json(200, { rel, bot }) }
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
    if (p === '/api/names' && m === 'POST') { const b = await body(); h.setNames({ hostName: b.hostName === undefined ? undefined : String(b.hostName), deviceId: who.id, deviceName: b.deviceName === undefined ? undefined : String(b.deviceName) }); return json(200, { hostName: h.hostName(), device: { id: who.id, name: who.main ? h.hostName() : (h.cfg.devices.find((d) => d.id === who.id)?.name ?? who.device), main: who.main } }) }
    if (p === '/api/defaults' && m === 'POST') { const b = await body(); h.setDefaults(String(b.model ?? ''), String(b.effort ?? '')); return json(200, { model: h.cfg.defaultModel ?? '', effort: h.cfg.defaultEffort ?? '' }) }
    if (p === '/api/auth/token' && m === 'POST') { const b = await body(); h.setToken(String(b.token ?? '')); return json(200, { ok: true, mode: h.cfg.claudeOauthToken ? 'token' : 'login' }) }
    if (p === '/api/pairing' && m === 'POST') { if (!this.isLoopback(req) && device !== 'local') return json(403, { error: '미니에서만 열 수 있어요' }); return json(200, this.openPairing()) }
    if (p === '/api/devices/revoke' && m === 'POST') { const b = await body(); h.cfg.devices = h.cfg.devices.filter((d) => d.id !== b.id); saveConfig(h.cfg); return json(200, { ok: true }) }

    if (seg[1] === 'bots' && seg[2]) {
      const bot = botOf(seg[2]); const sub = seg[3]
      if (sub === 'stop' && m === 'POST') { if (bot.orchestrator) throw new Error('오케스트레이터는 정지할 수 없어요'); reg.stop(bot.id); h.afterBotsChanged(); return json(200, { ok: true }) }
      if (sub === 'retire' && m === 'POST') { const to = reg.retire(bot.id); h.afterBotsChanged(); return json(200, { to }) }
      if (sub === 'sessions' && m === 'GET') return json(200, h.sessions.list(bot.id))
      if (sub === 'sessions' && m === 'POST') { const b = await body(); const s = h.sessions.create(bot, String(b.name ?? '새 세션'), { permissionMode: b.permissionMode as never, model: b.model ? String(b.model) : undefined }); return json(200, h.sessions.info(s)) }
      if (sub === 'send' && m === 'POST') { const b = await body(); const sid = h.sendToBot(bot, String(b.text), b.sessionId ? String(b.sessionId) : undefined, b.name ? String(b.name) : undefined, undefined, { model: b.model ? String(b.model) : undefined, effort: b.effort ? String(b.effort) : undefined, permissionMode: b.permissionMode ? (String(b.permissionMode) as never) : undefined }); return json(200, { sessionId: sid }) }
      if (sub === 'slash') { const sid = url.searchParams.get('sid') ?? ''; return json(200, slashCommands(bot.abs, reg.root, sid ? h.sessions.slashOf(sid) : [])) }
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
        return json(200, listDir(bot.abs, rel).map((n) => { if (!n.dir) return n; const vrel = bot.rel ? `${bot.rel}/${n.rel}` : n.rel; return { ...n, harness: reg.hasHarness(join(bot.abs, n.rel)), botId: reg.botByRel(vrel)?.id, role: vrel.includes('/') ? undefined : (globParents(reg.rules.roles.active).includes(vrel) ? 'active' : roleOf(reg.rules, vrel) ?? undefined) } }))
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
      if (sub === 'file' && m === 'GET') {
        const abs = guard(roots(bot), join(bot.abs, url.searchParams.get('rel') ?? ''))
        if (!exists(abs)) return json(404, { error: '없는 파일' })
        const kind = kindOf(abs)
        if (kind === 'text') { const r = readText(abs); return json(200, { kind, rel: url.searchParams.get('rel'), text: r.text, truncated: r.truncated, size: statSync(abs).size, mtime: statSync(abs).mtimeMs }) }
        return json(200, { kind, rel: url.searchParams.get('rel'), size: statSync(abs).size, mtime: statSync(abs).mtimeMs })
      }
      if (sub === 'file' && m === 'POST') { const b = await body(); const abs = guard(roots(bot), join(bot.abs, String(b.rel))); writeText(abs, String(b.text)); h.broadcast({ ev: 'files', botId: bot.id }); return json(200, { ok: true }) }
      if (sub === 'raw') { const abs = guard(roots(bot), join(bot.abs, url.searchParams.get('rel') ?? '')); if (!exists(abs)) return json(404, { error: 'none' }); res.writeHead(200, { 'content-type': mime(abs), 'cache-control': 'no-store' }); stream(abs).pipe(res); return }
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
