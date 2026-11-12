import { describe, it, expect, beforeEach } from 'vitest'
import { escPush, escKey, escDepth } from '../../src/client/esc'

/** 키 이벤트 흉내 — `preventDefault` 를 부르면 `defaultPrevented` 가 선다(브라우저와 같게) */
const key = (k = 'Escape', o: { isComposing?: boolean; defaultPrevented?: boolean } = {}) => {
  const e = { key: k, isComposing: !!o.isComposing, defaultPrevented: !!o.defaultPrevented, preventDefault() { e.defaultPrevented = true } }
  return e
}

describe('Esc 로 닫기 — 맨 위에 뜬 것 하나만 (2026-11-13)', () => {
  const offs: Array<() => void> = []
  const push = (f: () => void) => { const off = escPush(f); offs.push(off); return off }
  beforeEach(() => { while (offs.length) offs.pop()!(); expect(escDepth()).toBe(0) })

  it('창이 둘 겹치면 나중에 뜬 것만 닫는다 — 뒤의 창은 그대로', () => {
    const log: string[] = []
    push(() => log.push('설정')); push(() => log.push('확인창'))
    const e = key()
    expect(escKey(e)).toBe(true)
    expect(log).toEqual(['확인창'])
    expect(e.defaultPrevented).toBe(true)   // «처리했다» 표식 — 턴 멈추기(전역 ⎋)가 같이 돌지 않게
  })
  it('위의 것이 닫히면(빠지면) 그다음 ⎋ 는 아래 창을 닫는다', () => {
    const log: string[] = []
    push(() => log.push('설정')); const off = push(() => log.push('확인창'))
    off()
    escKey(key())
    expect(log).toEqual(['설정'])
  })
  it('가운데 것이 먼저 빠져도 순서가 안 꼬인다 · 같은 것을 두 번 빼도 남의 것을 안 건드린다', () => {
    const log: string[] = []
    push(() => log.push('a')); const offB = push(() => log.push('b')); push(() => log.push('c'))
    offB(); offB()
    expect(escDepth()).toBe(2)
    escKey(key())
    expect(log).toEqual(['c'])
  })
  it('안쪽 입력칸이 먼저 쓴 ⎋(defaultPrevented)는 창을 닫지 않는다', () => {
    const log: string[] = []
    push(() => log.push('창'))
    expect(escKey(key('Escape', { defaultPrevented: true }))).toBe(false)
    expect(log).toEqual([])
  })
  it('한글 조합 중의 ⎋ 와 다른 키는 무시한다', () => {
    const log: string[] = []
    push(() => log.push('창'))
    expect(escKey(key('Escape', { isComposing: true }))).toBe(false)
    expect(escKey(key('Enter'))).toBe(false)
    expect(log).toEqual([])
  })
  it('뜬 것이 없으면 아무것도 안 하고 표식도 안 남긴다 — 턴 멈추기 ⎋ 가 그대로 돈다', () => {
    const e = key()
    expect(escKey(e)).toBe(false)
    expect(e.defaultPrevented).toBe(false)
  })
})
