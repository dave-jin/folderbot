import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { errText } from '../../src/client/errText'

/**
 * 🔴 **말투와 오류 글** (2026-11-15 · UX/UI 정리 «말» 걸음의 셋째 묶음 · Dave 카드 «추천대로 전부»).
 *
 * 11/12 리뷰에서 센 것:
 *  - 말투 — 기본은 해요체인데 모델 확인창과 승인 카드는 합쇼체, 상황판 단추는 반말, 루틴의 승인 수준은 한다체였다.
 *  - 공개 제품인데 화면 글에 이 볼트의 사정이 들어 있었다(«할일이가 folderbot ask 로…» · «Dave 가 손댄 것은 그대로» · «맥미니에서…»).
 *  - 실패했을 때 서버가 준 글만 토스트에 띄우는 곳이 46건이었고, 머리말을 붙인 곳도 꼴이 둘이었다.
 *
 * 보는 것은 화면 글(`src/client` 의 문자열 · 템플릿 · JSX 글자)이다. 주석과 코드 이름은 보지 않는다.
 * ⛔ 빨강이면 예외를 넓히기 전에 글을 고친다.
 */
const CLIENT = resolve(__dirname, '../../src/client')
const files = readdirSync(CLIENT).filter((f) => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f))
function texts(f: string): { line: number; text: string }[] {
  const src = readFileSync(join(CLIENT, f), 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: { line: number; text: string }[] = []
  const visit = (n: ts.Node): void => {
    let t: string | null = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TemplateHead || n.kind === ts.SyntaxKind.TemplateMiddle || n.kind === ts.SyntaxKind.TemplateTail) t = (n as ts.LiteralLikeNode).text
    else if (ts.isJsxText(n)) t = n.getText()
    if (t && /[가-힣]/.test(t)) out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: t.replace(/\s+/g, ' ').trim() })
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}
const ALL = files.flatMap((f) => texts(f).map((x) => ({ f, ...x })))
/** 주석을 걷은 코드 */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

describe('말투 — 해요체', () => {
  it('합쇼체(~니다 · ~니까)가 화면 글에 없다', () => {
    const bad = ALL.filter((x) => /니다|니까/.test(x.text)).map((x) => `${x.f}:${x.line} ${x.text.slice(0, 90)}`)
    expect(bad, bad.join('\n')).toEqual([])
  })
  it('리뷰가 짚은 한다체와 반말이 돌아오지 않았다 — 승인 수준 · 단축키 설명 · 상황판 단추', () => {
    const BAD = [/바로 한다/, /끝까지 돈다/, /안에서만 쓴다/, /계획만 세운다/, /하나만 한다/, /안 가로챈다/, /바로 깨운다/, /^놔둬$/, /^안 끝났어$/]
    const bad = ALL.filter((x) => BAD.some((r) => r.test(x.text))).map((x) => `${x.f}:${x.line} ${x.text.slice(0, 90)}`)
    expect(bad, bad.join('\n')).toEqual([])
    const all = ALL.map((x) => x.text)
    expect(all).toContain('놔두기'); expect(all).toContain('안 끝났어요')
    expect(all.some((t) => t.includes('묻지 않고 바로 해요'))).toBe(true)
  })
})

describe('이 볼트의 사정이 화면 글에 없다', () => {
  it('«할일이» · «Dave» · «레일» · «버전 칩» · «업데이트 칩» 이 없다', () => {
    const bad = ALL.filter((x) => /할일이|Dave|레일|버전 칩|업데이트 칩|저에게 주시면/.test(x.text)).map((x) => `${x.f}:${x.line} ${x.text.slice(0, 90)}`)
    expect(bad, bad.join('\n')).toEqual([])
  })
})

describe('실패 글 — «못 ~했어요 — 원문» 한 꼴', () => {
  it('errText — 머리말 뒤에 원문 · 원문이 없으면 머리말만', () => {
    expect(errText('못 보냈어요', new Error('다른 봇의 세션이에요'))).toBe('못 보냈어요 — 다른 봇의 세션이에요')
    expect(errText('못 보냈어요', 'timeout')).toBe('못 보냈어요 — timeout')
    expect(errText('못 보냈어요', new Error(''))).toBe('못 보냈어요')
    expect(errText('못 보냈어요', undefined)).toBe('못 보냈어요')
    expect(errText('못 보냈어요', { code: 1 })).toBe('못 보냈어요')
  })
  it('서버가 준 글만 띄우는 곳이 없다 — `say((e as Error).message)` 꼴', () => {
    const bad: string[] = []
    for (const f of files) {
      const s = code(readFileSync(join(CLIENT, f), 'utf8'))
      for (const m of s.matchAll(/say\(\s*\(e\d? as Error\)\.message\s*\)|say\(\s*String\(e\d?\)\s*\)|say\(\s*e\d? instanceof Error \? e\d?\.message : String\(e\d?\)\s*\)/g)) bad.push(`${f}: ${m[0]}`)
    }
    expect(bad, bad.join('\n')).toEqual([])
  })
  it('머리말의 꼴이 하나다 — «~ 실패 — 원문» 이 없고, errText 의 머리말은 «못 …어요» 다', () => {
    const bad: string[] = []
    let heads = 0
    for (const f of files) {
      const s = code(readFileSync(join(CLIENT, f), 'utf8'))
      for (const m of s.matchAll(/`[^`]*실패 — \$\{[^`]*`/g)) bad.push(`${f}: ${m[0].slice(0, 70)}`)
      for (const m of s.matchAll(/errText\('([^']*)'/g)) { heads++; if (!/못 .*(어요|았어요|했어요|였어요)$/.test(m[1])) bad.push(`${f}: 머리말 «${m[1]}»`) }
    }
    expect(bad, bad.join('\n')).toEqual([])
    expect(heads).toBeGreaterThan(50)
  })
})
