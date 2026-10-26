import { describe, it, expect } from 'vitest'
import { ASK_KEEP, ASK_SHOW_MS, ASK_STALE_MS, askAdd, askBadge, askClose, askLabel, askLifted, askSeen, iGa, type AskMark } from '../../src/core/askMark'

/** DB · ask 세션 보이기 (2026-10-25 Dave «계획대로 두 자리») — 묻는 중·답함·원래 자리 판정 */
const T = 1_000_000_000

describe('askBadge', () => {
  it('표시가 없으면 원래 자리', () => {
    expect(askBadge({}, T)).toBeNull()
    expect(askBadge({ asks: [] }, T)).toBeNull()
  })
  it('닫히지 않은 ask 는 «묻는 중» — 여럿이면 먼저 시작한 것', () => {
    const asks: AskMark[] = [{ id: 'b', by: '할일이', at: T - 10 }, { id: 'a', by: '할일이', at: T - 20 }]
    expect(askBadge({ asks }, T)).toEqual({ state: 'asking', by: '할일이', at: T - 20, letter: 'a' })
  })
  it('하나라도 묻는 중이면 답한 것보다 묻는 중이 앞선다', () => {
    const asks: AskMark[] = [{ id: 'a', by: '할일이', at: T - 100, doneAt: T - 50 }, { id: 'b', by: '할일이', at: T - 10 }]
    expect(askBadge({ asks }, T)?.state).toBe('asking')
  })
  it('답한 뒤 10분 동안 «답함», 그 뒤 원래 자리', () => {
    const asks: AskMark[] = [{ id: 'a', by: '할일이', at: T - 100, doneAt: T }]
    expect(askBadge({ asks }, T + 1000)?.state).toBe('answered')
    expect(askBadge({ asks }, T + ASK_SHOW_MS - 1)?.state).toBe('answered')
    expect(askBadge({ asks }, T + ASK_SHOW_MS)).toBeNull()
  })
  it('열었으면(seen) 원래 자리 — 읽음(readAt)으로는 내리지 않는다(폰 서랍 아래 대화가 읽음을 적는다)', () => {
    const m: AskMark = { id: 'a', by: '할일이', at: T - 100, doneAt: T }
    expect(askBadge({ asks: [{ ...m, seen: true }] }, T + 1)).toBeNull()
    expect(askBadge({ asks: [m], readAt: T + 1 } as { asks: AskMark[] }, T + 1)?.state).toBe('answered')
  })
  it('하루 넘게 안 닫힌 «묻는 중» 은 버린다', () => {
    expect(askBadge({ asks: [{ id: 'a', by: '할일이', at: T - ASK_STALE_MS }] }, T)).toBeNull()
  })
  it('오류로 끝난 턴은 err 를 싣는다', () => {
    expect(askBadge({ asks: [{ id: 'a', by: '할일이', at: T - 9, doneAt: T, err: true }] }, T + 1)).toMatchObject({ state: 'answered', err: true })
  })
})

describe('askAdd · askClose · askSeen', () => {
  it('같은 편지는 두 번 달지 않고, 오래된 것부터 덜어 ASK_KEEP 개', () => {
    let l = askAdd(undefined, { id: 'a', by: 'x', at: 1 })
    expect(askAdd(l, { id: 'a', by: 'x', at: 2 })).toBe(l)
    for (let i = 0; i < ASK_KEEP + 3; i++) l = askAdd(l, { id: `n${i}`, by: 'x', at: 10 + i })
    expect(l).toHaveLength(ASK_KEEP)
    expect(l[0].id).toBe(`n3`)
  })
  it('세션에 들어간 편지만 닫는다 — 큐에 남은 편지는 그 턴이 끝날 때', () => {
    const l: AskMark[] = [{ id: 'in', by: 'x', at: T }, { id: 'queued', by: 'x', at: T }]
    expect(askClose(l, (id) => id === 'in', { now: T + 5 })).toBe(true)
    expect(l[0]).toMatchObject({ doneAt: T + 5 })
    expect(l[1].doneAt).toBeUndefined()
    expect(askClose(l, (id) => id === 'in', { now: T + 9 })).toBe(false)   // 이미 닫힌 것은 그대로
  })
  it('askSeen 은 답한 것만 내리고 묻는 중은 남긴다', () => {
    const l: AskMark[] = [{ id: 'a', by: 'x', at: T, doneAt: T + 1 }, { id: 'b', by: 'x', at: T + 2 }]
    expect(askSeen(l)).toBe(true)
    expect(l[0].seen).toBe(true); expect(l[1].seen).toBeUndefined()
    expect(askSeen(l)).toBe(false)
  })
})

describe('askLifted · askLabel', () => {
  it('여럿이면 모두, 시작한 순서대로', () => {
    const ss = [
      { id: 's2', asks: [{ id: 'b', by: '할일이', at: T - 5 }] },
      { id: 's0' },
      { id: 's1', asks: [{ id: 'a', by: '할일이', at: T - 50, doneAt: T - 1 }] },
    ]
    expect(askLifted(ss, T).map((x) => x.s.id)).toEqual(['s1', 's2'])
  })
  it('머리말 — 받침에 따라 이/가 · 답함 · 방금/N분 전 · 오류', () => {
    expect(iGa('할일이')).toBe('가'); expect(iGa('개발')).toBe('이'); expect(iGa('Grok')).toBe('가')
    expect(askLabel({ state: 'asking', by: '할일이', at: T, letter: 'a' }, T)).toBe('할일이가 묻는 중')
    expect(askLabel({ state: 'answered', by: '할일이', at: T, doneAt: T, letter: 'a' }, T + 30_000)).toBe('답함 · 방금')
    expect(askLabel({ state: 'answered', by: '할일이', at: T, doneAt: T, letter: 'a' }, T + 3 * 60_000)).toBe('답함 · 3분 전')
    expect(askLabel({ state: 'answered', by: '할일이', at: T, doneAt: T, err: true, letter: 'a' }, T)).toBe('끝남 · 오류')
  })
})
