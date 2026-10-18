import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * CF-④ · 폰 푸시가 한 번도 안 왔다 (2026-10-12 Dave). 맥미니 호스트의 구독이 0건이었고(HTTPS 없음),
 *   HTTPS 를 붙여도 VAPID sub 가 `mailto:folderbot@local` 이라 Apple 이 403 으로 거절할 판이었다. 실패는 로그 한 줄 없이 삼켜졌다.
 */
const sent: { endpoint: string }[] = []
let reply: (endpoint: string) => Promise<{ statusCode: number }> = async () => ({ statusCode: 201 })
let subject = ''
vi.mock('web-push', () => ({ default: {
  generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
  setVapidDetails: (s: string) => { subject = s },
  sendNotification: async (sub: { endpoint: string }) => { sent.push(sub); return reply(sub.endpoint) },
} }))

beforeAll(() => { process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-push-')) })

describe('CF-④ VAPID subject', () => {
  it('Apple 이 거절하는 .local·localhost 는 쓰지 않는다', async () => {
    const { validVapidSubject, vapidSubject } = await import('../../src/host/notify')
    expect(validVapidSubject('mailto:folderbot@local')).toBe(false)
    expect(validVapidSubject('mailto:admin@localhost')).toBe(false)
    expect(validVapidSubject('https://localhost')).toBe(false)
    expect(validVapidSubject('mailto:dave@innate.kr')).toBe(true)
    expect(validVapidSubject('https://folderbot.dev')).toBe(true)
    expect(vapidSubject(undefined)).toBe('https://folderbot.dev')
    expect(vapidSubject('mailto:x@local')).toBe('https://folderbot.dev')
    expect(vapidSubject('mailto:dave@innate.kr')).toBe('mailto:dave@innate.kr')
  })
  it('호스트가 실제로 거는 값도 올바르다', async () => {
    const { Notifier, validVapidSubject } = await import('../../src/host/notify')
    new Notifier({ port: 0 } as never)
    expect(validVapidSubject(subject)).toBe(true)
  })
})

describe('CF-④ 푸시 결과는 로그로 남고 403 은 구독을 지우지 않는다', () => {
  it('201 · 403 · 410', async () => {
    const { Notifier } = await import('../../src/host/notify')
    const cfg = { port: 0, quiet: { from: '00:00', to: '00:00' }, pushSubs: [
      { endpoint: 'https://web.push.apple.com/aaa', keys: { p256dh: 'p', auth: 'a' }, device: 'iPhone' },
      { endpoint: 'https://web.push.apple.com/bbb', keys: { p256dh: 'p', auth: 'a' }, device: 'iPad' },
      { endpoint: 'https://fcm.googleapis.com/ccc', keys: { p256dh: 'p', auth: 'a' }, device: 'Mac' },
    ] }
    const n = new Notifier(cfg as never)
    const lines: string[] = []; n.log = (s) => lines.push(s)
    reply = async (e) => { if (e.endsWith('bbb')) throw Object.assign(new Error('x'), { statusCode: 403, body: 'BadJwtToken' }); if (e.endsWith('ccc')) throw Object.assign(new Error('x'), { statusCode: 410, body: 'gone' }); return { statusCode: 201 } }
    await n.push({ id: 'n1', t: 0, kind: 'done', botId: 'b', title: 't', body: 'b', read: false })
    expect(lines.some((l) => l.includes('201') && l.includes('iPhone'))).toBe(true)
    expect(lines.some((l) => l.includes('403') && l.includes('BadJwtToken'))).toBe(true)
    expect(lines.join('\n')).not.toContain('/aaa')   // endpoint 전체는 로그에 안 쓴다
    expect(cfg.pushSubs.map((s) => s.device)).toEqual(['iPhone', 'iPad'])   // 410 만 지운다
    expect(n.lastPush).toMatchObject({ ok: 1, fail: 2 })
    expect(n.subsView()).toEqual([{ device: 'iPhone', host: 'web.push.apple.com' }, { device: 'iPad', host: 'web.push.apple.com' }])
  })
  it('«푸시 테스트»(force) 는 조용한 시간에도 간다', async () => {
    const { Notifier } = await import('../../src/host/notify')
    const cfg = { port: 0, quiet: { from: '00:00', to: '23:59' }, pushSubs: [{ endpoint: 'https://web.push.apple.com/zzz', keys: { p256dh: 'p', auth: 'a' }, device: 'iPhone' }] }
    const n = new Notifier(cfg as never); reply = async () => ({ statusCode: 201 })
    sent.length = 0
    n.emit('done', 'orch', 't', 'b', undefined, { mac: false })
    await new Promise((r) => setTimeout(r, 10))
    expect(sent.length).toBe(0)
    n.emit('done', 'orch', 't', 'b', undefined, { mac: false, force: true })
    await new Promise((r) => setTimeout(r, 10))
    expect(sent.length).toBe(1)
  })
})

describe('조용한 시간 끄기 (2026-10-19)', () => {
  it('꺼 두면 하루 종일 걸러도 맥 배너·푸시를 막지 않는다', async () => {
    const { Notifier } = await import('../../src/host/notify')
    const cfg = { port: 0, quiet: { from: '00:00', to: '23:59', off: true }, pushSubs: [{ endpoint: 'https://web.push.apple.com/qqq', keys: { p256dh: 'p', auth: 'a' }, device: 'iPhone' }] }
    const n = new Notifier(cfg as never)
    expect(n.quiet()).toBe(false)
    cfg.quiet.off = false
    expect(n.quiet()).toBe(true)
  })
})

describe('폰 푸시는 «확인해 주세요» 만 (2026-10-19)', () => {
  it('끝남·오류·할 일·루틴은 안 보내고 awaiting 만 보낸다', async () => {
    const { Notifier } = await import('../../src/host/notify')
    const cfg = { port: 0, quiet: { from: '00:00', to: '00:00' }, pushSubs: [{ endpoint: 'https://web.push.apple.com/yyy', keys: { p256dh: 'p', auth: 'a' }, device: 'iPhone' }] }
    const n = new Notifier(cfg as never); reply = async () => ({ statusCode: 201 })
    sent.length = 0
    for (const k of ['done', 'error', 'todo', 'routine'] as const) n.emit(k, 'orch', 't', 'b', undefined, { mac: false })
    await new Promise((r) => setTimeout(r, 10))
    expect(sent.length).toBe(0)
    expect(n.events.slice(0, 4).map((e) => e.kind)).toEqual(['routine', 'todo', 'error', 'done'])   // 알림 목록에는 남는다
    n.emit('awaiting', 'orch', '확인해 주세요', 'b', undefined, { mac: false })
    await new Promise((r) => setTimeout(r, 10))
    expect(sent.length).toBe(1)
  })
})

describe('CF-④ tailscale serve 를 거친 요청은 loopback 이 아니다', () => {
  it('프록시 머리가 있으면 바깥', async () => {
    const { isLoopbackReq } = await import('../../src/host/gateway')
    expect(isLoopbackReq('127.0.0.1', {})).toBe(true)
    expect(isLoopbackReq('::1', {})).toBe(true)
    expect(isLoopbackReq('127.0.0.1', { 'x-forwarded-for': '100.64.1.2' })).toBe(false)
    expect(isLoopbackReq('127.0.0.1', { 'tailscale-user-login': 'dave@github' })).toBe(false)
    expect(isLoopbackReq('100.71.156.11', {})).toBe(false)
  })
})
