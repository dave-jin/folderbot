import { describe, it, expect } from 'vitest'
import { diffLines, diffStat, foldSame } from '../../src/core/diff'

describe('diffLines', () => {
  it('같으면 전부 =', () => expect(diffLines('a\nb\n', 'a\nb\n').map((l) => l.t).join('')).toBe('=='))
  it('한 줄 고침은 - + 한 쌍', () => {
    const d = diffLines('a\nb\nc\n', 'a\nB\nc\n')
    expect(d).toEqual([{ t: '=', s: 'a' }, { t: '-', s: 'b' }, { t: '+', s: 'B' }, { t: '=', s: 'c' }])
    expect(diffStat(d)).toEqual({ add: 1, del: 1 })
  })
  it('새 파일은 전부 +', () => expect(diffLines('', '# 제목\n\n본문\n').map((l) => l.t).join('')).toBe('+++'))
  it('지운 파일은 전부 -', () => expect(diffLines('x\ny', '').map((l) => l.t).join('')).toBe('--'))
  it('가운데 끼워 넣기 — 앞뒤 같은 줄은 남는다', () => {
    const d = diffLines('1\n2\n3\n4', '1\n2\n2.5\n3\n4')
    expect(d.map((l) => l.t).join('')).toBe('==+==')
    expect(d[2].s).toBe('2.5')
  })
  it('끝 줄바꿈 유무는 줄로 세지 않는다', () => expect(diffLines('a', 'a\n')).toEqual([{ t: '=', s: 'a' }]))
  it('너무 크면 통째로 바꾼 것으로 근사한다(느리지 않게)', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n')
    const t = Date.now(); const d = diffLines(a, b)
    expect(Date.now() - t).toBeLessThan(2000)
    expect(diffStat(d)).toEqual({ add: 3000, del: 3000 })
  })
})

describe('foldSame', () => {
  it('긴 같은 줄은 앞뒤 3줄만 남기고 접는다', () => {
    const same = Array.from({ length: 20 }, (_, i) => ({ t: '=' as const, s: `s${i}` }))
    const d = [...same, { t: '+' as const, s: 'new' }, ...same]
    const f = foldSame(d)
    // 앞: 접힘(17) + 3줄 · 새 줄 · 뒤: 3줄 + 접힘(17)
    expect(f.map((r) => r.t).join('')).toBe('~===+===~')
    expect((f[0] as { n: number }).n).toBe(17)
  })
  it('짧으면 안 접는다', () => expect(foldSame([{ t: '=', s: 'a' }, { t: '+', s: 'b' }]).length).toBe(2))
})
