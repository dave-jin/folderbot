import { describe, it, expect } from 'vitest'
import { openTab, replaceTab, type TabsSt } from '../../src/core/docTabs'
import { etagHit, ifRangeOk, parseRange, rawEtag } from '../../src/host/rawServe'
import { storeVer, pool } from '../../src/client/cache'

/** DA · 원격 캐시 · 문서 탭 (2026-10-17 Dave «세션 누를 때·PDF 열 때 느리다» · «전부 미리 받기» · «누를 때마다 새 탭») */
describe('DA 문서 탭 — 누를 때마다 새 탭', () => {
  const e: TabsSt = { tabs: [], active: null }
  it('데스크톱은 연 문서가 다 남는다(미리보기로 바뀌지 않는다)', () => {
    let s = openTab(e, 'a.md', false, true); s = openTab(s, 'b.pdf', false, true); s = openTab(s, 'c.html', false, true)
    expect(s.tabs.map((t) => t.rel)).toEqual(['a.md', 'b.pdf', 'c.html'])
    expect(s.tabs.every((t) => t.pinned)).toBe(true)
    expect(s.active).toBe('c.html')
  })
  it('이미 연 문서는 탭이 늘지 않고 그 탭으로 간다', () => {
    let s = openTab(e, 'a.md', false, true); s = openTab(s, 'b.md', false, true); s = openTab(s, 'a.md', false, true)
    expect(s.tabs.length).toBe(2); expect(s.active).toBe('a.md')
  })
  it('옛 미리보기 탭이 남아 있어도 새 문서는 그 자리를 뺏지 않는다', () => {
    const s = openTab({ tabs: [{ rel: 'old.md', pinned: false }], active: 'old.md' }, 'new.md', false, true)
    expect(s.tabs.map((t) => t.rel)).toEqual(['old.md', 'new.md'])
  })
  it('폰(한 장)은 종전대로 미리보기 탭을 바꾼다', () => {
    let s = openTab(e, 'a.md', false, false); s = openTab(s, 'b.md', false, false)
    expect(s.tabs.map((t) => t.rel)).toEqual(['b.md'])
  })
  it('옆 문서로 넘기기는 지금 탭을 바꾼다(탭이 쌓이지 않는다)', () => {
    let s = openTab(e, 'a.md', false, true); s = openTab(s, 'x.md', false, true)
    s = replaceTab(s, 'y.md'); s = replaceTab(s, 'z.md')
    expect(s.tabs.map((t) => t.rel)).toEqual(['a.md', 'z.md']); expect(s.active).toBe('z.md')
    expect(replaceTab(s, 'a.md')).toEqual({ ...s, active: 'a.md' })   // 이미 연 문서면 그 탭으로
  })
})

describe('DA /raw — 한 번 받은 파일은 304 · 큰 PDF 는 조각부터', () => {
  it('판 표식은 크기·수정 시각이 같으면 같다', () => {
    expect(rawEtag(100, 5)).toBe(rawEtag(100, 5.4))
    expect(rawEtag(100, 5)).not.toBe(rawEtag(101, 5))
    expect(rawEtag(100, 5)).not.toBe(rawEtag(100, 6))
  })
  it('If-None-Match — 약한 표식·여러 개·* 를 받는다', () => {
    const t = rawEtag(10, 1)
    expect(etagHit(t, t)).toBe(true)
    expect(etagHit(`"x", ${t}`, t)).toBe(true)
    expect(etagHit(t.replace('W/', ''), t)).toBe(true)
    expect(etagHit('*', t)).toBe(true)
    expect(etagHit('"other"', t)).toBe(false)
    expect(etagHit(undefined, t)).toBe(false)
  })
  it('판 표식은 강한 표식이다 — 크롬이 조각을 이어 붙일 때 믿는다', () => {
    expect(rawEtag(100, 5).startsWith('W/')).toBe(false)
    expect(etagHit('W/' + rawEtag(100, 5), rawEtag(100, 5))).toBe(true)
  })
  it('If-Range — 그새 파일이 바뀌었으면 조각 대신 전체', () => {
    const t = rawEtag(100, 5000)
    expect(ifRangeOk(undefined, t, 5000)).toBe(true)
    expect(ifRangeOk(t, t, 5000)).toBe(true)
    expect(ifRangeOk(rawEtag(101, 5000), t, 5000)).toBe(false)
    expect(ifRangeOk(new Date(5000).toUTCString(), t, 5400)).toBe(true)
    expect(ifRangeOk(new Date(4000).toUTCString(), t, 5400)).toBe(false)
  })
  it('Range 한 조각', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=1000-', 1000)).toBe('bad')
    expect(parseRange('bytes=5-2', 1000)).toBe('bad')
    expect(parseRange('bytes=0-1,5-9', 1000)).toBe(null)   // 여러 조각은 통째로
    expect(parseRange(undefined, 1000)).toBe(null)
  })
})

describe('DA 디스크 캐시', () => {
  it('쓰는 중인 답이 있으면 판을 비운다 — 다음에 켤 때 통째로 다시 받게', () => {
    expect(storeVer([{ id: 'a', t: 1, kind: 'user', text: 'x' }] as never, 'v1')).toBe('v1')
    expect(storeVer([{ id: 'a', t: 1, kind: 'assistant', text: 'x', streaming: true }] as never, 'v1')).toBe('')
    expect(storeVer([] as never, undefined)).toBe('')
  })
  it('pool — n 개씩만 나란히, 실패해도 나머지를 한다', async () => {
    let now = 0; let max = 0; const did: number[] = []
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (x) => { now++; max = Math.max(max, now); await new Promise((r) => setTimeout(r, 5)); now--; if (x === 3) throw new Error('x'); did.push(x) })
    expect(max).toBe(3); expect(did.sort()).toEqual([1, 2, 4, 5, 6, 7])
  })
})
