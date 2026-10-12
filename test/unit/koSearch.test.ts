import { describe, it, expect } from 'vitest'
import { jamo, rank, scoreName } from '../../src/core/search'

/** 2026-10-12 Dave: «한국어 검색이 바로바로 안될 때가 있어» — 조합 중인 질의가 0건이 되던 것 */
describe('조합 중인 한글 질의', () => {
  const nfd = (s: string) => s.normalize('NFD')   // 맥 디스크의 이름은 NFD
  it('«디캠프» 를 치는 동안 지나는 모든 상태가 걸린다', () => {
    for (const q of ['ㄷ', '디', '디ㅋ', '디캐', '디캠', '디캠ㅍ', '디캠프']) expect(scoreName(q, nfd('2026_멘토링-디캠프')), q).toBeGreaterThan(0)
  })
  it('받침이 다음 글자로 넘어가는 중간 상태도 걸린다', () => {
    expect(scoreName('닭', '달가')).toBeGreaterThan(0)    // 달 + ㄱ → 닭 → 달가
    expect(scoreName('간', '가나다')).toBeGreaterThan(0)
    expect(scoreName('고', '과제')).toBeGreaterThan(0)    // ㅗ 다음 ㅏ → ㅘ
  })
  it('글자 한가운데서 시작하는 자모 일치는 치지 않는다', () => {
    expect(scoreName('ㅏ나', '가나')).toBe(0)
    expect(scoreName('나', '간다')).toBe(0)
  })
  it('완성된 일치가 조합 중 일치보다 위', () => {
    const xs = ['디캐스트', '디캐']
    expect(rank('디캐', xs, (n) => ({ name: n }))[0]).toBe('디캐')
    expect(jamo('닭')).toBe('ㄷㅏㄹㄱ')
  })
})
