import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

type Mac = { id: string; url: string }
type Links = { sync(macs: Mac[], tokenOf: (id: string) => string): void; waiting(id: string): number; working(id: string): number; busy(id: string): number; reachable(id: string): boolean; stopAll(): void }
type Opt = { onChange(id: string): void; onNotify(id: string, n: Record<string, unknown>): void; onReach(id: string, ok: boolean): void; onAuthLost(id: string): void; onState(id: string, st: Record<string, unknown>): void; retryMs?: number; idleMs?: number; connectMs?: number }
const require_ = createRequire(import.meta.url)
const { createLinks } = require_('../../desktop/macLinks.js') as { createLinks: (o: Opt) => Links }

/** 가짜 호스트 — 토큰 하나만 받는다. `/api/events` 는 SSE, `/api/state` 는 JSON */
type Fake = { url: string; push(f: unknown): void; hits: { events: number; state: number }; open: Set<ServerResponse>; srv: Server; close(): Promise<void>; state: Record<string, unknown> }
async function fake(token: string, port = 0): Promise<Fake> {
  const open = new Set<ServerResponse>(); const hits = { events: 0, state: 0 }
  const f = { open, hits, state: { hostName: '집 미니', version: '0.3.9', sessionsByBot: {} } } as unknown as Fake
  const srv = createServer((req, res) => {
    const ok = req.headers.authorization === `Bearer ${token}`
    if (req.url === '/api/events') {
      hits.events++
      if (!ok) { res.writeHead(401); res.end(); return }
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': hi\n\n'); open.add(res); req.on('close', () => open.delete(res)); return
    }
    if (req.url === '/api/state') { hits.state++; if (!ok) { res.writeHead(401); res.end(); return } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(f.state)); return }
    res.writeHead(404); res.end()
  })
  await new Promise<void>((r) => srv.listen(port, '127.0.0.1', () => r()))
  f.srv = srv; f.url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  f.push = (x) => { for (const r of open) r.write(`data: ${JSON.stringify(x)}\n\n`) }
  f.close = () => new Promise<void>((r) => { for (const x of open) x.destroy(); srv.close(() => r()); srv.closeAllConnections?.() })
  return f
}
const until = async (cond: () => boolean, ms = 2000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error('시간 초과'); await new Promise((r) => setTimeout(r, 10)) } }
const rec = () => { const ev: string[] = []; const notes: [string, Record<string, unknown>][] = []; const states: [string, Record<string, unknown>][] = []
  const o: Opt = { onChange: (id) => ev.push(`change:${id}`), onNotify: (id, n) => notes.push([id, n]), onReach: (id, ok) => ev.push(`reach:${id}:${ok}`), onAuthLost: (id) => ev.push(`auth:${id}`), onState: (id, st) => states.push([id, st]), retryMs: 50 }
  return { ev, notes, states, o } }

let links: Links | null = null; const servers: Fake[] = []
afterEach(async () => { links?.stopAll(); links = null; for (const s of servers.splice(0)) await s.close().catch(() => {}) })

describe('macLinks', () => {
  it('맥마다 답 대기를 따로 센다', async () => {
    const A = await fake('TA'), B = await fake('TB'); servers.push(A, B); const r = rec()
    links = createLinks(r.o); links.sync([{ id: 'A', url: A.url }, { id: 'B', url: B.url }], (id) => (id === 'A' ? 'TA' : 'TB'))
    await until(() => A.open.size === 1 && B.open.size === 1)
    A.push({ ev: 'state', sessionId: 's1', state: 'awaiting_input' })
    await until(() => links!.waiting('A') === 1)
    expect(links.waiting('B')).toBe(0); expect(r.ev).toContain('change:A')
  })
  it('알림은 그 맥 id 로 올라온다', async () => {
    const B = await fake('TB'); servers.push(B); const r = rec()
    links = createLinks(r.o); links.sync([{ id: 'B', url: B.url }], () => 'TB')
    await until(() => B.open.size === 1)
    B.push({ ev: 'notify', n: { title: '승인', body: 'x', botId: 'b1' } })
    await until(() => r.notes.length === 1)
    expect(r.notes[0]).toEqual(['B', { title: '승인', body: 'x', botId: 'b1' }])
  })
  it('401 이면 auth 상태로 멈춘다', async () => {
    const B = await fake('TB'); servers.push(B); const r = rec()
    links = createLinks(r.o); links.sync([{ id: 'B', url: B.url }], () => 'TA')
    await until(() => r.ev.includes('auth:B'))
    const n = B.hits.events; await new Promise((x) => setTimeout(x, 300))
    expect(B.hits.events).toBe(n); expect(r.ev.filter((e) => e === 'auth:B')).toHaveLength(1)
  })
  it('끊기면 알리고, 다시 열리면 회복한다', async () => {
    const A = await fake('TA'); servers.push(A); const r = rec(); const port = Number(new URL(A.url).port)
    links = createLinks(r.o); links.sync([{ id: 'A', url: A.url }], () => 'TA')
    await until(() => r.ev.includes('reach:A:true'))
    await A.close(); servers.splice(0)
    await until(() => r.ev.includes('reach:A:false')); expect(links.reachable('A')).toBe(false)
    const A2 = await fake('TA', port); servers.push(A2)
    await until(() => r.ev.filter((e) => e === 'reach:A:true').length === 2, 3000); expect(links.reachable('A')).toBe(true)
  })
  it('목록에서 빠진 맥은 연결을 닫는다', async () => {
    const A = await fake('TA'), B = await fake('TB'); servers.push(A, B); const r = rec()
    links = createLinks(r.o); links.sync([{ id: 'A', url: A.url }, { id: 'B', url: B.url }], (id) => (id === 'A' ? 'TA' : 'TB'))
    await until(() => B.open.size === 1)
    links.sync([{ id: 'A', url: A.url }], () => 'TA')
    await until(() => B.open.size === 0); expect(A.open.size).toBe(1)
  })
  it('/api/state 의 이름과 판을 올린다', async () => {
    const A = await fake('TA'); servers.push(A); const r = rec()
    links = createLinks(r.o); links.sync([{ id: 'A', url: A.url }], () => 'TA')
    await until(() => r.states.length > 0)
    expect(r.states[0]).toEqual(['A', { hostName: '집 미니', version: '0.3.9' }])
  })
})

describe('macLinks — 말없이 끊긴 연결', () => {
  it('심박(: ping)을 보내던 맥이 조용해지면 끊고 다시 붙는다', async () => {
    const A = await fake('TA'); servers.push(A); const r = rec(); r.o.idleMs = 200
    links = createLinks(r.o); links.sync([{ id: 'A', url: A.url }], () => 'TA')
    await until(() => A.open.size === 1)
    for (const x of A.open) x.write(': ping\n\n')
    await until(() => r.ev.includes('reach:A:false'), 3000)
    await until(() => A.hits.events >= 2, 3000)
  })
  it('심박을 모르는 옛 호스트는 조용해도 끊지 않는다', async () => {
    const A = await fake('TA'); servers.push(A); const r = rec(); r.o.idleMs = 150
    links = createLinks(r.o); links.sync([{ id: 'A', url: A.url }], () => 'TA')
    await until(() => A.open.size === 1); await new Promise((x) => setTimeout(x, 500))
    expect(A.hits.events).toBe(1); expect(links.reachable('A')).toBe(true)
  })
  it('대답 없는 주소(패킷이 버려지는 꺼진 맥)는 시한 안에 «닿지 않음»', async () => {
    const srv = createServer(() => { /* 머리말을 영영 안 보낸다 */ }); await new Promise<void>((x) => srv.listen(0, '127.0.0.1', () => x()))
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`; const r = rec(); r.o.connectMs = 200; r.o.retryMs = 10000
    links = createLinks(r.o); links.sync([{ id: 'Z', url }], () => 'T')
    try { await until(() => r.ev.includes('reach:Z:false'), 2000) } finally { links.stopAll(); links = null; srv.closeAllConnections?.(); srv.close() }
  })
})
