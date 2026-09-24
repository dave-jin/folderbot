import { describe, it, expect } from 'vitest'
import { bareFileNames, botRelOf, candidatePaths, relUnder } from '../../src/core/paths'

describe('candidatePaths', () => {
  it('공백 있는 PARA 폴더까지 넓힌 변형을 함께 낸다 (긴 것 먼저)', () => {
    const c = candidatePaths('3. Area/제품_Rondo/todo.md 를 고쳤어요')
    expect(c[0]).toBe('3. Area/제품_Rondo/todo.md')
    expect(c).toContain('Area/제품_Rondo/todo.md')     // 뼈대도 후보 — 호스트가 고른다
  })
  it('URL 은 안 집는다 — 이미 링크다', () => {
    expect(candidatePaths('https://example.com/a/b.md 를 봐')).toEqual([])
  })
  /**
   * 🔴 2026-09-15 뒤집힘 — 에이전트는 파일 이름을 거의 언제나 백틱으로 감싼다. 인라인 코드를 통째로
   *    거르면 「칩이 되는 경로」가 실제 답변에서는 거의 안 생겼다(Dave: «답변 내용안에는 칩이 없어»).
   */
  it('인라인 코드 안의 경로는 집고, 펜스 안은 안 집는다', () => {
    const c = candidatePaths('`src/core/a.ts` 와 ```\nsrc/core/b.ts\n``` 는 다르다')
    expect(c).toContain('src/core/a.ts')
    expect(c.some((x) => x.includes('b.ts'))).toBe(false)
  })
  it('백틱 바로 뒤에서 시작해도 공백 있는 폴더까지 넓힌다', () => {
    expect(candidatePaths('정본 `3. Area/제품_Rondo/todo.md` 를 고쳐')[0]).toBe('3. Area/제품_Rondo/todo.md')
  })
  it('마크다운 링크의 목적지는 안 집는다', () => {
    expect(candidatePaths('[할 일](2. Projects/x/todo.md) 를 봐')).toEqual([])
  })
  /** 🔴 2026-09-15 뒤집힘 — 폴더도 칩이다(누르면 트리에서 열린다). 있는지는 호스트가 가른다 */
  it('확장자 없는 폴더도 집는다 (공백 있는 PARA 이름까지)', () => {
    expect(candidatePaths('3. Area/제품_Rondo 아래에 뒀어요')[0]).toBe('3. Area/제품_Rondo')
  })
  it('절대 경로도 집는다 — 왼쪽으로는 안 넓힌다', () => {
    const c = candidatePaths('정본은 /Users/dave/PARA/3. Area/x.md 에 있어요')
    expect(c[0]).toBe('/Users/dave/PARA/3. Area/x.md')   // 공백 뒤 낱말을 이어 붙인 것이 먼저(긴 것부터)
    expect(c).toContain('/Users/dave/PARA/3')
    expect(c.some((x) => x.startsWith('정본은'))).toBe(false)
  })
  it('문장 끝 부호와 끝 슬래시는 뗀다', () => {
    expect(candidatePaths('a/b.md. 그리고 c/d/ 를 봐')).toEqual(expect.arrayContaining(['a/b.md', 'c/d']))
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

describe('botRelOf — 절대 경로 → 봇 폴더 기준 rel (볼트 안·폴더 밖은 ../ · 볼트 밖은 null)', () => {
  const root = '/v', bot = '/v/3. Area/제품_Rondo'
  it('폴더 안 · 폴더 밖 · 볼트 밖 · 봇 폴더 자체', () => {
    expect(botRelOf(bot, root, '/v/3. Area/제품_Rondo/files/a.pdf')).toBe('files/a.pdf')
    expect(botRelOf(bot, root, '/v/1. Inbox/바깥.md')).toBe('../../1. Inbox/바깥.md')
    expect(botRelOf(bot, root, '/v/x.md')).toBe('../../x.md')
    expect(botRelOf(bot, root, '/Users/dave/etc')).toBeNull()
    expect(botRelOf(bot, root, bot)).toBe('')
    expect(botRelOf('/v', '/v', '/v/a.md')).toBe('a.md')   // 루트 봇(오케스트레이터)
  })
})

describe('bareFileNames — 파일명만 적힌 것도 후보 (G)', () => {
  it('백틱 안·문장 속 파일명 · URL 은 아님 · 경로가 있으면 경로도 함께', () => {
    /* ⚠ **AP 뒤로는 «완전일치» 로 재지 않는다** (2026-09-24) — 띄어쓰기가 든 이름을 잡으려고 «왼쪽으로 한 낱말 더»
       변형을 **함께** 낸다(`그림은 그림.png` 처럼 없는 것도 섞인다). 어느 것이 진짜인지는 호스트가 고른다.
       그래서 여기서 지킬 것은 둘이다 — **진짜가 들어 있나** · **들어오면 안 되는 것이 없나**. */
    expect(bareFileNames('설명서 PDF 가 나왔습니다 — `이한율_준비할것_설명서_2026-09-19.pdf` (A4 13쪽)')).toContain('이한율_준비할것_설명서_2026-09-19.pdf')
    const g = bareFileNames('그림은 그림.png 이고 https://x.com/a.png 는 링크다')
    expect(g).toContain('그림.png')
    expect(g.some((x) => /x\.com|https/.test(x)), JSON.stringify(g)).toBe(false)   // URL 은 여전히 후보가 아니다
    expect(candidatePaths('메모는 `files/메모.md` 를, 설명서는 `설명서.pdf` 를 보세요')).toEqual(expect.arrayContaining(['files/메모.md', '설명서.pdf']))
    expect(candidatePaths('버전 v1.2.3 을 배포했다')).toEqual([])
  })
})
