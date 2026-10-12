import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AUTO_GRACE_MS, AUTO_MAX_IDLE_MS, autoKind, autoToDrop, extraComms, forkHandover, migrateArea, routinesToDrop, sessArea, takeoverMode } from '../../src/core/autoArea'
import { sessKind } from '../../src/core/cleanup'
import type { Bot } from '../../src/core/types'

/**
 * CC · 자동화 영역 (2026-10-12 Dave: *«채널 소통, 루틴 등 자동화 섹션은 내가 채팅하는 영역과 별개로 동작해야 해.
 *    이 영역은 정기적으로 자동 정리되어야 해»*). 설계: PARA/2. Area/제품_FolderBot/01_기획/2026-10-12_CC-자동화-영역-설계.md
 */
const H = 3600_000
const NOW = 1_800_000_000_000

describe('CC · 어느 영역인가 (core/autoArea)', () => {
  it('소통·채널·루틴·봇끼리는 자동화, 사람이 이어받은 것과 사람 세션은 채팅', () => {
    expect(autoKind({ comm: true })).toBe('소통')
    expect(autoKind({ exComm: true })).toBe('소통')
    expect(autoKind({ channel: 'halili' })).toBe('채널')
    expect(autoKind({ exChannel: true })).toBe('채널')
    expect(autoKind({ routine: 'r' })).toBe('루틴')
    expect(autoKind({ delegated: true })).toBe('봇끼리')
    expect(sessArea({})).toBe('chat')
    expect(sessArea({ routine: 'r', adopted: true })).toBe('chat')
    expect(sessArea({ delegated: true, adopted: true })).toBe('chat')
  })
  it('사람이 답하면 — 루틴·봇끼리·옛 채널은 옮기고, 살아 있는 소통·채널은 갈라 연다', () => {
    expect(takeoverMode({ routine: 'r' })).toBe('adopt')
    expect(takeoverMode({ delegated: true })).toBe('adopt')
    expect(takeoverMode({ exChannel: true })).toBe('adopt')
    expect(takeoverMode({ comm: true })).toBe('fork')
    expect(takeoverMode({ channel: 'halili' })).toBe('fork')
    expect(takeoverMode({})).toBe('none')
    expect(takeoverMode({ routine: 'r', adopted: true })).toBe('none')
  })
  it('세션 정리 창의 종류도 같은 판정 — 채널은 «채널», 이어받은 루틴은 «사람»', () => {
    const base = { name: 'x' }
    expect(sessKind({ ...base, channel: 'halili' })).toBe('채널')
    expect(sessKind({ ...base, routine: 'r', adopted: true })).toBe('사람')
    expect(sessKind({ name: '위임 · 10:00' })).toBe('봇끼리')
  })
})

describe('CC · 자동 정리 규칙 (autoToDrop)', () => {
  const S = (id: string, o: Record<string, unknown> = {}) => ({ id, state: 'done', lastActivity: NOW - 2 * H, ...o })

  /**
   * 🔴 2026-10-12 12:00 맥미니 실측 — SNS 봇의 08:00 루틴 세션에 Dave 가 답해 11:32 까지 일하고 12:30 게시를 백그라운드로 걸었다.
   *    12:00 같은 봇의 워커빌 루틴이 돌며 «봇마다 2개» 규칙으로 그 세션을 지웠다. 이제는 어느 규칙으로도 안 지운다.
   */
  it('🔴 10/12 사고 재현 — 다른 루틴이 돌아도 사람이 쓰던 루틴 세션은 남는다', () => {
    const sns = S('sns-0800', { routine: 'sns-두봇영상', adopted: true, lastActivity: NOW - 28 * 60_000, bg: 1 })
    const trend = S('trend-0600', { routine: '트렌드레이더', lastActivity: NOW - 6 * H })
    const wbOld = S('wb-0000', { routine: '워커빌', lastActivity: NOW - 12 * H })
    const wbOld2 = S('wb-0600', { routine: '워커빌', lastActivity: NOW - 6 * H })
    const wbNew = S('wb-1200', { routine: '워커빌', state: 'running', lastActivity: NOW })
    const drop = autoToDrop([sns, trend, wbOld, wbOld2, wbNew], NOW)
    expect(drop).not.toContain('sns-0800')
    expect(drop).not.toContain('trend-0600')    // 다른 루틴의 세션은 그 루틴 몫 2개 안
    expect(drop).toEqual(['wb-0000'])          // 워커빌만 2개를 넘었다(도는 새 회차 + 직전 회차)
  })
  it('🔴 이어받지 않았어도 — 백그라운드 작업·대기 말·30분 안 활동이 있으면 안 지운다', () => {
    const mk = (id: string, o: Record<string, unknown>) => S(id, { routine: 'r', ...o })
    const list = [mk('n1', { lastActivity: NOW - H }), mk('n2', { lastActivity: NOW - 2 * H }),
      mk('bg', { lastActivity: NOW - 3 * H, bg: 1 }), mk('q', { lastActivity: NOW - 3 * H, queue: [{}] }), mk('fresh', { lastActivity: NOW - AUTO_GRACE_MS + 60_000 }), mk('old', { lastActivity: NOW - 5 * H })]
    // 잡힌 셋이 «2개» 자리를 먼저 채우므로 쉬는 것은 다 걷힌다 — 잡힌 것은 하나도 안 걷힌다(잠시 2개를 넘는 편이 낫다)
    expect(autoToDrop(list, NOW).sort()).toEqual(['n1', 'n2', 'old'])
  })
  it('루틴은 루틴마다 2개 — 봇 전체가 아니라', () => {
    const list = ['a', 'b'].flatMap((r) => [1, 2, 3].map((k) => S(`${r}${k}`, { routine: r, lastActivity: NOW - k * H })))
    expect(autoToDrop(list, NOW).sort()).toEqual(['a3', 'b3'])
  })
  it('7일 넘게 안 쓴 자동 세션은 정리 — 안 읽은 답이 있어도 · 살아 있는 소통·채널과 채팅은 안 건드린다', () => {
    const old = NOW - AUTO_MAX_IDLE_MS - H
    const list = [
      S('rt', { routine: 'r', lastActivity: old, lastReplyAt: old, readAt: 0 }),
      S('bot', { delegated: true, lastActivity: old }),
      S('exch', { exChannel: true, lastActivity: old }),
      S('excomm', { exComm: true, lastActivity: old }),
      S('comm', { comm: true, lastActivity: old }),
      S('chan', { channel: 'halili', lastActivity: old }),
      S('me', { lastActivity: old }),
      S('mine', { routine: 'r', adopted: true, lastActivity: old }),
      S('bot6', { delegated: true, lastActivity: NOW - 6 * 24 * H }),
    ]
    expect(autoToDrop(list, NOW).sort()).toEqual(['bot', 'exch', 'excomm', 'rt'])
  })
  it('루틴마다 2개 규칙에서는 안 읽은 답을 지키고 자리에 먼저 센다(2026-10-02 결정 유지)', () => {
    const list = [S('u', { routine: 'r', lastActivity: NOW - 5 * H, lastReplyAt: NOW - 5 * H, readAt: 0 }), S('a', { routine: 'r', lastActivity: NOW - H }), S('b', { routine: 'r', lastActivity: NOW - 2 * H })]
    expect(routinesToDrop(list, 2, NOW)).toEqual(['b'])
  })
})

describe('CC · 옛 세션 이관 · 소통 하나 · 인수인계', () => {
  it('사람 말이 있는 루틴 세션은 채팅으로 · 갈아탄 옛 채널은 exChannel', () => {
    const r1 = { routine: 'r', items: [{ kind: 'user' }, { kind: 'assistant' }, { kind: 'user', from: { device: 'iPhone' } }] }
    expect(migrateArea(r1)).toBe(true); expect(r1).toMatchObject({ adopted: true })
    const r2 = { routine: 'r', turnFrom: 'human', items: [] }
    expect(migrateArea(r2)).toBe(true)
    const r3 = { routine: 'r', turnFrom: 'routine', items: [{ kind: 'user' }] }   // 루틴 프롬프트만 — 그대로
    expect(migrateArea(r3)).toBe(false)
    const r4 = { trust: 'propose', items: [] }
    expect(migrateArea(r4)).toBe(true); expect(r4).toMatchObject({ exChannel: true })
    expect(migrateArea({ trust: 'propose', channel: 'h', items: [] })).toBe(false)
  })
  it('소통 세션이 둘 이상이면 가장 최근 것만 남긴다', () => {
    expect(extraComms([{ id: 'a', botId: 'x', comm: true, lastActivity: 1 }, { id: 'b', botId: 'x', comm: true, lastActivity: 3 }, { id: 'c', botId: 'y', comm: true, lastActivity: 1 }, { id: 'd', botId: 'x', lastActivity: 9 }])).toEqual(['a'])
  })
  it('갈라 여는 채팅의 인수인계 — 최근 사람·봇 말만 · 세션 id · 길이 상한', () => {
    const t = forkHandover('🤝 소통', 's_x', [{ kind: 'system', text: '무시' }, { kind: 'user', text: '요청 하나' }, { kind: 'assistant', text: '답 하나' }, { kind: 'tool', text: '도구' }])
    expect(t).toMatch(/«🤝 소통»\(s_x\)/); expect(t).toMatch(/받은 말: 요청 하나\n\n봇: 답 하나/); expect(t).not.toMatch(/무시|도구/)
    const long = forkHandover('c', 's', Array.from({ length: 40 }, (_, i) => ({ kind: 'assistant', text: `${i}`.repeat(1000) })))
    expect(long.length).toBeLessThan(7000)
  })
})

/** SessionManager + 스텁 CLI — 사람이 자동화 세션에 말을 보냈을 때 */
describe('CC · 사람이 자동화 세션에 답하면 (SessionManager)', () => {
  let SessionManager: typeof import('../../src/host/session').SessionManager
  let dir = ''
  const bot = { id: 'sns', rel: '', abs: tmpdir(), name: 'SNS', section: '', startedAt: 0, vendor: 'claude', routines: [] } as unknown as Bot
  const until = async (f: () => boolean, ms = 8000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 50)) } return true }
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fb-auto-'))
    process.env.FOLDERBOT_DATA = dir
    process.env.FOLDERBOT_CLI_BIN = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
    ;({ SessionManager } = await import('../../src/host/session'))
  })

  it('루틴 세션은 그 자리에서 채팅으로 옮겨진다 — 같은 세션 · 정리 대상에서 빠진다', () => {
    const sm = new SessionManager(); sm.botOf = () => bot
    const r = sm.create(bot, '루틴 · sns', { routine: 'sns' })
    const got = sm.takeOver(r, bot)
    expect(got.id).toBe(r.id)
    expect(r.adopted).toBe(true)
    expect(sm.list(bot.id).find((x) => x.id === r.id)).toMatchObject({ adopted: true, routine: 'sns' })
    expect(sessArea(sm.list(bot.id).find((x) => x.id === r.id)!)).toBe('chat')
  })
  it('봇끼리 세션(기록에는 delegatedFrom 만 있다)도 그 자리에서 채팅으로', () => {
    const sm = new SessionManager(); sm.botOf = () => bot
    const r = sm.create(bot, '위임 · 숫자 검토', { delegatedFrom: 'orch' })
    expect(sm.takeOver(r, bot).id).toBe(r.id)
    expect(r.adopted).toBe(true)
  })
  it('🔴 소통 세션은 새 채팅으로 갈라진다 — 맥락은 워커에게만 가고, 화면의 내 말과 제목은 내가 쓴 그대로', async () => {
    const sm = new SessionManager(); sm.botOf = () => bot
    const c = sm.commOf(bot, 'orch')
    sm.send(c, bot, '되읊어: 오케스트레이터가 보낸 요청', undefined, 'bot')
    expect(await until(() => c.state === 'done')).toBe(true)
    const nr = sm.takeOver(c, bot)
    expect(nr.id).not.toBe(c.id)
    expect(c.comm).toBe(true)                                // 소통 세션은 그대로 하나
    sm.send(nr, bot, '전부되읊어 이어서 해 줘', { device: 'iPhone', origin: 'remote', tier: 'phone' } as never)
    expect(await until(() => nr.state === 'done')).toBe(true)
    const users = sm.items(nr.id).filter((i) => i.kind === 'user').map((i) => (i as { text: string }).text)
    expect(users).toEqual(['전부되읊어 이어서 해 줘'])
    const said = sm.items(nr.id).filter((i) => i.kind === 'assistant').map((i) => (i as { text: string }).text).join('\n')
    expect(said).toMatch(/자동화 세션 «🤝 소통»/)            // 워커는 맥락을 받았다
    expect(said).toMatch(/오케스트레이터가 보낸 요청/)
    expect(nr.name).not.toMatch(/자동화|이 채팅은/)          // 제목은 사람의 첫 말에서
    expect(sessArea(sm.list(bot.id).find((x) => x.id === nr.id)!)).toBe('chat')
    expect(sm.items(c.id).some((i) => i.kind === 'system' && /새 채팅\(/.test((i as { text: string }).text))).toBe(true)
  })
  it('호스트가 뜰 때 이관 — 사람 말 있는 루틴 세션은 채팅으로 · 소통은 하나만 남는다', () => {
    const sd = join(dir, 'sessions'); mkdirSync(sd, { recursive: true })
    const base = { botId: 'mig', cwd: tmpdir(), cliSessionId: null, state: 'done', createdAt: 1 }
    writeFileSync(join(sd, 's_migrt01.json'), JSON.stringify({ ...base, id: 's_migrt01', name: '루틴 · x', routine: 'x', lastActivity: 5, items: [{ id: 'u1', t: 1, kind: 'user', text: '루틴 프롬프트' }, { id: 'u2', t: 2, kind: 'user', text: '사람 답', from: { device: 'iPhone' } }] }))
    writeFileSync(join(sd, 's_migcm01.json'), JSON.stringify({ ...base, id: 's_migcm01', name: '🤝 소통', comm: true, lastActivity: 1, items: [] }))
    writeFileSync(join(sd, 's_migcm02.json'), JSON.stringify({ ...base, id: 's_migcm02', name: '🤝 소통', comm: true, lastActivity: 9, items: [] }))
    const sm = new SessionManager()
    const l = sm.list('mig')
    expect(l.find((x) => x.id === 's_migrt01')).toMatchObject({ adopted: true })
    expect(l.filter((x) => x.comm).map((x) => x.id)).toEqual(['s_migcm02'])
    expect(l.find((x) => x.id === 's_migcm01')).toMatchObject({ exComm: true })
  })
})
