import { describe, it, expect } from 'vitest'
import { contextOf } from '../../src/core/chat'
import type { StreamLine } from '../../src/core/chat'

const asst = (input: number, read: number, parent?: string): StreamLine => ({
  type: 'assistant', parent_tool_use_id: parent ?? null,
  message: { role: 'assistant', usage: { input_tokens: input, cache_read_input_tokens: read, output_tokens: 300 } }
})
const result = (sum: number, mu?: Record<string, { contextWindow?: number; inputTokens?: number }>): StreamLine => ({
  type: 'result', usage: { input_tokens: sum, output_tokens: 1000 }, modelUsage: mu
})

describe('contextOf — 지금 프롬프트의 크기', () => {
  it('assistant 줄의 usage 가 정본', () => expect(contextOf(asst(4000, 60000))).toEqual({ used: 64000, window: 200_000 }))
  it('턴이 끝나도 합계로 덮지 않는다 — 합계는 창보다 커진다', () => {
    const live = contextOf(asst(4000, 60000))
    expect(contextOf(result(3_483_000), live)?.used).toBe(64000)
  })
  it('assistant 를 못 본 턴에서만 합계를 쓰되 창 크기로 자른다', () => {
    expect(contextOf(result(3_483_000), null)).toEqual({ used: 200_000, window: 200_000 })
  })
  it('창 크기는 이 세션 모델의 것 — 서브에이전트 모델의 1M 을 따라가지 않는다', () => {
    const mu = { 'claude-opus-5': { contextWindow: 200_000, inputTokens: 90_000 }, 'claude-sonnet-5[1m]': { contextWindow: 1_000_000, inputTokens: 500 } }
    expect(contextOf(result(1000, mu), null, 'claude-opus-5')?.window).toBe(200_000)
    // 모델을 모르면 토큰을 가장 많이 쓴 쪽이 주인공이다
    expect(contextOf(result(1000, mu), null)?.window).toBe(200_000)
  })
  it('창 크기는 한 번 알면 다음 줄에도 이어진다', () => {
    const prev = { used: 10, window: 1_000_000 }
    expect(contextOf(asst(1000, 2000), prev)?.window).toBe(1_000_000)
  })
  it('서브에이전트 줄은 부르는 쪽이 거른다 — 여기서는 값만 낸다', () => {
    expect(contextOf(asst(10, 20, 't_1'))?.used).toBe(30)
  })
})
