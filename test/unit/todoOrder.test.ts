import { describe, it, expect } from 'vitest'
import { orderItems, orderSections, peekDone, DONE_PEEK } from '../../src/core/todo'

/**
 * AK (2026-09-24 Dave) — 「아직 끝내지 않은 항목이 맨 상단에 떠야 돼 … 완료된 건 최근 완료 항목 몇 개만」.
 * ⚠ 여기서 재는 것은 **보여 주는 차례**다. 파일 차례를 바꾸는지는 `todoFile.test.ts` 가 따로 본다.
 */
const t = (title: string, done = false) => ({ title, done })

describe('AK · 할 일 차례', () => {
  it('🔴 안 끝난 것이 위로 — 끝난 것이 사이에 섞여 있어도', () => {
    const got = orderItems([t('a', true), t('b'), t('c', true), t('d')])
    expect(got.map((x) => x.title)).toEqual(['b', 'd', 'a', 'c'])
  })
  it('각 무리 안 차례는 파일 그대로 — 끌어 옮긴 순서를 지킨다', () => {
    const got = orderItems([t('2'), t('1'), t('x', true), t('y', true)])
    expect(got.map((x) => x.title)).toEqual(['2', '1', 'x', 'y'])
  })
  it('🔴 안 끝난 일이 있는 절이 먼저 — 다 끝난 절은 뒤로', () => {
    const got = orderSections([['완료', [t('a', true)]], ['이번 주', [t('b')]], ['나중', [t('c')]]])
    expect(got.map(([n]) => n)).toEqual(['이번 주', '나중', '완료'])
  })
  it('🔴 끝난 것은 최근 3개만 — 나머지 수를 준다', () => {
    const list = [t('u'), ...Array.from({ length: 9 }, (_, i) => t(`d${i}`, true))]
    const { rows, hidden } = peekDone(list)
    expect(DONE_PEEK).toBe(3)
    expect(rows.map((x) => x.title)).toEqual(['d6', 'd7', 'd8'])   // 파일 뒤쪽 = 최근 완료
    expect(hidden).toBe(6)
  })
  it('「더보기」 를 누르면 다 나오고, 적으면 애초에 감추지 않는다', () => {
    const list = [t('a', true), t('b', true), t('c', true), t('d', true)]
    expect(peekDone(list, 3, true).rows).toHaveLength(4)
    expect(peekDone(list, 3, true).hidden).toBe(0)
    expect(peekDone([t('a', true)]).hidden).toBe(0)
  })
})
