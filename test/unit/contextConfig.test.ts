import { describe, it, expect } from 'vitest'
import { contextConfigBody } from '../../src/core/contextConfig'

describe('상황판 설정 저장 본문', () => {
  it('off 참·거짓 · dailyCap 양의 정수를 받는다', () => {
    expect(contextConfigBody({ off: true })).toEqual({ off: true })
    expect(contextConfigBody({ dailyCap: 300 })).toEqual({ dailyCap: 300 })
    expect(contextConfigBody({ off: false, dailyCap: 1 })).toEqual({ off: false, dailyCap: 1 })
  })
  it('dailyCap null = 비움(기본값으로 되돌리기)', () => {
    expect(contextConfigBody({ dailyCap: null })).toEqual({ dailyCap: null })
  })
  it('틀린 값과 빈 본문은 거절한다', () => {
    for (const b of [{ off: 'yes' }, { dailyCap: 0 }, { dailyCap: -3 }, { dailyCap: 1.5 }, { dailyCap: '500' }, { dailyCap: Number.POSITIVE_INFINITY }, {}]) expect(contextConfigBody(b as Record<string, unknown>)).toHaveProperty('error')
  })
})
