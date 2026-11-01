import { describe, it, expect } from 'vitest'
import type { ChatItem } from '../../src/core/types'
import { cardChannel, needsSplit, splitSegments, segmentFolder, VAULT_OPS } from '../../src/core/contextSegment'

const u = (id: string, text: string): ChatItem => ({ id, t: 1, kind: 'user', text })
const a = (id: string, text: string): ChatItem => ({ id, t: 1, kind: 'assistant', text })
const sys = (id: string, text: string): ChatItem => ({ id, t: 1, kind: 'system', text })
const tool = (id: string, name: string, input?: Record<string, unknown>): ChatItem => ({ id, t: 1, kind: 'tool', name, summary: name, input })

describe('cardChannel', () => {
  it('orch · comm · bridge(channel 있음)', () => {
    expect(cardChannel({ botId: 'orch' })).toBe('orch')
    expect(cardChannel({ botId: 'hack1', comm: true })).toBe('comm')
    expect(cardChannel({ botId: 'hack1', channel: { kind: 'bridge' } })).toBe('bridge')
  })
  it('루틴은 입양 전에만 routine', () => {
    expect(cardChannel({ botId: 'hack1', routine: 'x' })).toBe('routine')
    expect(cardChannel({ botId: 'hack1', routine: 'x', adopted: true })).toBe('folder')
  })
  it('나머지는 folder', () => {
    expect(cardChannel({ botId: 'hack1' })).toBe('folder')
  })
  it('우선순위 — orch > comm > channel > routine', () => {
    expect(cardChannel({ botId: 'orch', comm: true, channel: {}, routine: 'x' })).toBe('orch')
    expect(cardChannel({ botId: 'hack1', comm: true, channel: {}, routine: 'x' })).toBe('comm')
    expect(cardChannel({ botId: 'hack1', channel: {}, routine: 'x' })).toBe('bridge')
  })
  it('VAULT_OPS 는 orch', () => { expect(VAULT_OPS).toBe('orch') })
})

describe('needsSplit', () => {
  it('orch · comm · bridge 만 참', () => {
    expect(needsSplit('orch')).toBe(true)
    expect(needsSplit('comm')).toBe(true)
    expect(needsSplit('bridge')).toBe(true)
    expect(needsSplit('folder')).toBe(false)
    expect(needsSplit('routine')).toBe(false)
  })
})

describe('splitSegments', () => {
  it('사람 말 하나 = 조각 하나의 시작', () => {
    const [u1, a1, t1, u2, a2] = [u('1', 'q1'), a('2', 'r1'), tool('3', 'Read'), u('4', 'q2'), a('5', 'r2')]
    expect(splitSegments([u1, a1, t1, u2, a2])).toEqual([[u1, a1, t1], [u2, a2]])
  })
  it('첫 user 앞의 system 줄은 첫 조각에 붙는다', () => {
    const [s, u1, a1, u2] = [sys('0', 'init'), u('1', 'q1'), a('2', 'r1'), u('3', 'q2')]
    expect(splitSegments([s, u1, a1, u2])).toEqual([[s, u1, a1], [u2]])
  })
  it('user 가 하나도 없으면 통째로 한 조각, 빈 입력은 []', () => {
    const [s, a1] = [sys('0', 'x'), a('1', 'y')]
    expect(splitSegments([s, a1])).toEqual([[s, a1]])
    expect(splitSegments([])).toEqual([])
  })
})

describe('segmentFolder', () => {
  const bots = new Map([['hack1', 'hack1'], ['해커톤', 'hack1'], ['book', 'book']])
  it('요청 머리의 botId', () => {
    expect(segmentFolder([u('1', '[요청 ← 해커톤 · hack1 · s9] 명단 알려줘'), a('2', 'ok')], bots)).toBe('hack1')
  })
  it('머리의 botId 가 이름·별칭이어도 정본 id 로 바꾼다', () => {
    expect(segmentFolder([u('1', '[요청 ← 누군가 · 해커톤 · s9] x')], bots)).toBe('hack1')
  })
  it('머리의 이름에 · 가 있어도 뒤 두 칸을 botId·sid 로 읽는다', () => {
    expect(segmentFolder([u('1', '[요청 ← A · B · book · s1] x')], bots)).toBe('book')
  })
  it('머리가 없으면 bot_send 입력의 bot', () => {
    for (const name of ['bot_send', 'mcp__folderbot__bot_send']) {
      expect(segmentFolder([u('1', '해커톤에 보내'), tool('2', name, { bot: 'book', text: 'hi' })], bots)).toBe('book')
    }
  })
  it('bot_send 의 bot 이 이름이면 id 로 바꾼다', () => {
    expect(segmentFolder([u('1', 'x'), tool('2', 'bot_send', { bot: '해커톤' })], bots)).toBe('hack1')
  })
  it('둘 다 없으면 null', () => {
    expect(segmentFolder([u('1', '안녕'), a('2', '네'), tool('3', 'Read', { bot: 'hack1' })], bots)).toBeNull()
  })
  it('맵 밖의 id 는 null', () => {
    expect(segmentFolder([u('1', '[요청 ← 유령 · ghost · s1] x')], bots)).toBeNull()
    expect(segmentFolder([u('1', 'x'), tool('2', 'bot_send', { bot: 'ghost' })], bots)).toBeNull()
  })
  it('머리가 맵 밖이면 bot_send 로 계속 찾는다', () => {
    expect(segmentFolder([u('1', '[요청 ← 유령 · ghost · s1] x'), tool('2', 'bot_send', { bot: 'book' })], bots)).toBe('book')
  })
  it('bot 입력이 문자열이 아니면 건너뛴다', () => {
    expect(segmentFolder([u('1', 'x'), tool('2', 'bot_send', { bot: 3 }), tool('3', 'bot_send', { bot: 'book' })], bots)).toBe('book')
  })
})
