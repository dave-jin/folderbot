import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Bot } from '../../src/core/types'

/**
 * BE · 워커 상한 15 + LRU 절전 (2026-09-27 Dave) — 넘치면 가장 오래 안 쓴 **쉬는** 워커부터 재우고,
 * 다시 부르면 `--resume` 으로 이어진다. 일하는 중·확인 대기는 절대 안 재운다.
 */
let SessionManager: typeof import('../../src/host/session').SessionManager
beforeAll(async () => {
  process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-lru-'))
  process.env.FOLDERBOT_CLI_BIN = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
  ;({ SessionManager } = await import('../../src/host/session'))
})

const bot = (id: string): Bot => ({ id, rel: `2. Projects/${id}`, abs: tmpdir(), name: id, section: '2. Projects', orchestrator: false, startedAt: 0, vendor: 'claude', routines: [] } as unknown as Bot)
type Fake = { alive: boolean; pending: Map<string, unknown>; kill: () => void; send: () => void; on: () => void }
const killed: string[] = []
function fake(id: string): Fake { const f: Fake = { alive: true, pending: new Map(), kill: () => { f.alive = false; killed.push(id) }, send: () => {}, on: () => {} }; return f }

/** 쉬는 워커 n 개를 심는다 — lastActivity 는 1, 2, 3… (1 이 가장 오래 안 쓴 것) */
function seed(sm: InstanceType<typeof SessionManager>, n: number, botId = 'a') {
  const ids: string[] = []
  const workers = (sm as unknown as { workers: Map<string, Fake> }).workers
  for (let i = 0; i < n; i++) {
    const r = sm.create(bot(botId), `s${i}`)
    r.lastActivity = i + 1; r.state = 'idle'
    workers.set(r.id, fake(r.id)); ids.push(r.id)
  }
  return ids
}

describe('LRU 절전 (BE)', () => {
  afterEach(() => { killed.length = 0 })

  it('15개가 차 있으면 새 워커를 띄우기 전에 가장 오래 안 쓴 것을 재운다 — 살아 있는 수는 15 그대로', () => {
    const sm = new SessionManager()
    const ids = seed(sm, 15)
    const r = sm.create(bot('a'), 'new'); r.lastActivity = 100
    sm.ensureWorker(r, bot('a'))
    expect(killed).toEqual([ids[0]])
    expect(sm.liveCount()).toBe(15)
    sm.stopAll()
  })

  it('🔴 일하는 중·확인 대기·권한 질문이 걸린 워커는 안 재운다 — 그다음으로 오래된 쉬는 것을 재운다', () => {
    const sm = new SessionManager()
    const ids = seed(sm, 15)
    sm.get(ids[0])!.state = 'running'
    sm.get(ids[1])!.state = 'awaiting_input'
    ;(sm as unknown as { workers: Map<string, Fake> }).workers.get(ids[2])!.pending.set('p', {})
    const r = sm.create(bot('a'), 'new'); r.lastActivity = 100
    sm.ensureWorker(r, bot('a'))
    expect(killed).toEqual([ids[3]])
    sm.stopAll()
  })

  it('15개가 모두 일하는 중이면 새로 띄우지 않고 그렇게 말한다', () => {
    const sm = new SessionManager()
    const ids = seed(sm, 15)
    for (const id of ids) sm.get(id)!.state = 'running'
    const r = sm.create(bot('a'), 'new')
    expect(() => sm.ensureWorker(r, bot('a'))).toThrow(/모두 일하는 중/)
    expect(killed).toEqual([])
    sm.stopAll()
  })

  it('이미 살아 있는 워커에 보낼 때는 아무것도 재우지 않는다', () => {
    const sm = new SessionManager()
    const ids = seed(sm, 15)
    sm.ensureWorker(sm.get(ids[5])!, bot('a'))
    expect(killed).toEqual([])
    sm.stopAll()
  })

  it('봇 하나 안에서 고르면(only) 그 봇의 가장 오래된 것만 재운다', () => {
    const sm = new SessionManager()
    const a = seed(sm, 2, 'a'); const b = seed(sm, 2, 'b')
    sm.get(b[0])!.lastActivity = 0                     // 전체로는 b 가 가장 오래됐지만
    expect(sm.sleepLru(undefined, 'a')?.id).toBe(a[0])  // a 안에서만 고른다
    expect(killed).toEqual([a[0]])
    sm.stopAll()
  })
})
