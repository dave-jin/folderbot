import { describe, it, expect } from 'vitest'
import { candidatePaths, relUnder } from '../../src/core/paths'

describe('candidatePaths', () => {
  it('공백 있는 PARA 폴더까지 넓힌 변형을 함께 낸다 (긴 것 먼저)', () => {
    const c = candidatePaths('3. Area/제품_Rondo/todo.md 를 고쳤어요')
    expect(c[0]).toBe('3. Area/제품_Rondo/todo.md')
    expect(c).toContain('Area/제품_Rondo/todo.md')     // 뼈대도 후보 — 호스트가 고른다
  })
  it('URL 은 안 집는다 — 이미 링크다', () => {
    expect(candidatePaths('https://example.com/a/b.md 를 봐')).toEqual([])
  })
  it('인라인 코드 · 펜스 안은 안 집는다', () => {
    expect(candidatePaths('`src/core/a.ts` 와 ```\nsrc/core/b.ts\n``` 는 코드다')).toEqual([])
  })
  it('마크다운 링크의 목적지는 안 집는다', () => {
    expect(candidatePaths('[할 일](2. Projects/x/todo.md) 를 봐')).toEqual([])
  })
  it('확장자 없는 폴더는 안 집는다 — 문서 탭이 못 연다', () => {
    expect(candidatePaths('3. Area/제품_Rondo 아래에 뒀어요')).toEqual([])
  })
  it('중복은 한 번만, 나온 순서대로', () => {
    const c = candidatePaths('a/x.md 와 b/y.md 와 a/x.md')
    expect(c.filter((x) => x.endsWith('a/x.md')).length).toBeGreaterThan(0)
    expect(c.indexOf('a/x.md')).toBeLessThan(c.indexOf('b/y.md'))
  })
  it('상한을 지킨다', () => {
    const t = Array.from({ length: 30 }, (_, i) => `d/f${i}.md`).join(' ')
    expect(candidatePaths(t, 5)).toHaveLength(5)
  })
  it('괄호·따옴표에 둘러싸여도 집는다', () => {
    expect(candidatePaths('("a/b.md") 를')).toEqual(['a/b.md'])
  })
})

describe('relUnder', () => {
  it('아래면 상대 경로', () => { expect(relUnder('/v/bot', '/v/bot/a/b.md')).toBe('a/b.md') })
  it('밖이면 null', () => { expect(relUnder('/v/bot', '/v/other/a.md')).toBeNull() })
  it('NFD 로 와도 맞춘다', () => {
    expect(relUnder('/v/제품'.normalize('NFC'), '/v/제품/a.md'.normalize('NFD'))).toBe('a.md')
  })
})
