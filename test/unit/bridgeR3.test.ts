import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DailyLog } from '../../src/host/logfile'
import { BridgeHub, STABLE_MS, type Incoming } from '../../src/host/bridge'
import { parseBridges } from '../../src/core/bridges'
import type { Bot } from '../../src/core/types'

/** 연결(Bridge) R3 (2026-10-09) — BY 호스트 로그 · BW 지운 세션 정리 · BQ-11 들어오는 웹훅(파일로 모인다) */
const until = async (f: () => boolean, ms = 12000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 50)) } return true }

describe('BY · 호스트 로그 날짜별 파일 · 7일', () => {
  it('그날 파일에 시각과 함께 쓰고, 7일 지난 파일만 지운다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-log-'))
    let now = new Date('2026-10-09T18:00:00')
    const l = new DailyLog(dir, 7, () => now)
    l.write('첫 줄')
    for (const d of ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']) writeFileSync(join(dir, `host-${d}.log`), 'x')
    writeFileSync(join(dir, 'other.txt'), 'keep')
    expect(readFileSync(join(dir, 'host-2026-10-09.log'), 'utf8')).toMatch(/^18:00:00 첫 줄\n$/)
    expect(l.sweep().sort()).toEqual(['host-2026-09-30.log', 'host-2026-10-01.log'])
    expect(readdirSync(dir).sort()).toEqual(['host-2026-10-02.log', 'host-2026-10-03.log', 'host-2026-10-09.log', 'other.txt'])
    now = new Date('2026-10-10T00:00:01'); l.write('다음 날')
    expect(existsSync(join(dir, 'host-2026-10-10.log'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('BW · 지운 지 7일 지난 세션 파일은 앱 데이터 trash 로', () => {
  let SessionManager: typeof import('../../src/host/session').SessionManager
  let data = ''
  const bot = { id: 'b1', rel: 'x', abs: tmpdir(), name: 'b1', section: '', orchestrator: false, startedAt: 0, vendor: 'claude', routines: [] } as unknown as Bot
  beforeAll(async () => {
    data = mkdtempSync(join(tmpdir(), 'fb-bw-'))
    process.env.FOLDERBOT_DATA = data
    process.env.FOLDERBOT_CLI_BIN = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
    ;({ SessionManager } = await import('../../src/host/session'))
  })
  it('지운 시각(없으면 수정 시각) 기준 · 살아 있는 세션·최근에 지운 세션은 그대로 · 옮긴 파일은 남는다', () => {
    const sm = new SessionManager()
    const keep = sm.create(bot, '살아 있음'), recent = sm.create(bot, '방금 지움'), old = sm.create(bot, '오래전 지움')
    sm.remove(recent.id); sm.remove(old.id)
    const f = join(data, 'sessions', `${old.id}.json`)
    const j = JSON.parse(readFileSync(f, 'utf8')); j.deletedAt = Date.now() - 8 * 86400_000; writeFileSync(f, JSON.stringify(j))
    expect(sm.sweepDeleted()).toEqual([old.id])
    expect(existsSync(join(data, 'trash/sessions', `${old.id}.json`))).toBe(true)
    expect(existsSync(f)).toBe(false)
    expect(existsSync(join(data, 'sessions', `${recent.id}.json`))).toBe(true)
    expect(existsSync(join(data, 'sessions', `${keep.id}.json`))).toBe(true)
    expect(JSON.parse(readFileSync(join(data, 'sessions', `${recent.id}.json`), 'utf8')).deletedAt).toBeGreaterThan(0)
  })
})

describe('BQ-11 · 들어오는 웹훅은 to-folderbot 에 편지 파일을 만들고 평소처럼 배달된다', () => {
  it('설정 inbound: true → ~/.config/secrets/folderbot-bridge-<id>-in.env', () => {
    expect(parseBridges('bridges:\n  - id: n8n\n    mailbox: m\n    inbound: true\n').peers[0].inbound).toEqual({ env: '~/.config/secrets/folderbot-bridge-n8n-in.env' })
  })
  it('receive → 파일(from = 상대) → 배달', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-in-')), data = mkdtempSync(join(tmpdir(), 'fb-ind-'))
    mkdirSync(join(root, '.claude'), { recursive: true }); mkdirSync(join(root, 'mb/to-folderbot'), { recursive: true })
    writeFileSync(join(root, '.claude/bridges.yml'), 'bridges:\n  - id: n8n\n    name: 자동화\n    mailbox: mb\n    inbound: true\n')
    const got: Incoming[][] = []
    const hub = new BridgeHub({ root, dataDir: data, hostNames: () => ['h'], log: () => {}, deliver: (_p, items) => { got.push(items); return 's' } })
    try {
      hub.reload()
      const out = hub.receive('n8n', { kind: 'report', title: '주문 들어옴', text: '주문 #12' })
      expect(out.id).toMatch(/^\d{8}-\d{6}-n8n-[0-9a-f]{4}$/)
      expect(out.rel).toMatch(/^mb\/to-folderbot\/\d{4}-\d{2}\//)
      expect(await until(() => (hub.scanNow(), got.length === 1), STABLE_MS + 8000)).toBe(true)
      expect(got[0][0].letter).toMatchObject({ id: out.id, from: 'n8n', to: 'orch', kind: 'report', title: '주문 들어옴', body: '주문 #12' })
      expect(() => hub.receive('none', { text: 'x' })).toThrow()
    } finally { hub.closeAll(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }) }
  }, 20000)
})
