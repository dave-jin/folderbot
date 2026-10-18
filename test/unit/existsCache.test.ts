import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: string[][] = []
vi.mock('../../src/client/api', () => ({
  api: async (_p: string, o: { body: { rels: string[] } }) => { calls.push(o.body.rels); return Object.fromEntries(o.body.rels.map((r) => [r, r.startsWith('있는') ? { rel: r, dir: false } : false])) },
}))
const { askExists, forgetMissing, _resetExists } = await import('../../src/client/existsCache')

/** 10/18 · 같은 답을 다시 그릴 때마다 호스트에 또 묻던 것 */
describe('askExists', () => {
  beforeEach(() => { calls.length = 0; _resetExists() })
  it('한 번 들은 답은 다시 묻지 않는다 — 모르는 것만 묶어서', async () => {
    expect(await askExists('b', ['있는.md', '없는.tsx'])).toEqual({ '있는.md': { rel: '있는.md', dir: false }, '없는.tsx': false })
    await askExists('b', ['있는.md', '없는.tsx', '새.md'])
    expect(calls).toEqual([['있는.md', '없는.tsx'], ['새.md']])
  })
  it('동시에 같은 이름을 물으면 요청은 하나', async () => {
    await Promise.all([askExists('b', ['있는.md']), askExists('b', ['있는.md'])])
    expect(calls).toEqual([['있는.md']])
  })
  it('파일이 바뀌면 «없다» 만 다시 묻는다', async () => {
    await askExists('b', ['있는.md', '없는.tsx']); forgetMissing()
    await askExists('b', ['있는.md', '없는.tsx'])
    expect(calls).toEqual([['있는.md', '없는.tsx'], ['없는.tsx']])
  })
  it('묻는 사이 파일이 바뀌면 그 «없다» 는 적어 두지 않는다', async () => {
    const p = askExists('b', ['없는.tsx']); forgetMissing(); await p
    await askExists('b', ['없는.tsx'])
    expect(calls).toEqual([['없는.tsx'], ['없는.tsx']])
  })
  it('«없다» 는 1분 뒤 다시 묻는다(감시가 안 닿는 곳)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await askExists('b', ['없는.tsx', '있는.md']); vi.advanceTimersByTime(61_000)
      await askExists('b', ['없는.tsx', '있는.md'])
      expect(calls).toEqual([['없는.tsx', '있는.md'], ['없는.tsx']])
    } finally { vi.useRealTimers() }
  })
  it('봇마다 따로 기억한다', async () => {
    await askExists('a', ['있는.md']); await askExists('b', ['있는.md'])
    expect(calls.length).toBe(2)
  })
})
