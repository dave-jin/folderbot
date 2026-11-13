import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 🔴 **부품 규칙** (2026-11-13 · UX/UI 정리 «부품 넷» 첫 묶음).
 *
 * 11/12 리뷰에서 센 것: 지우기 확인 방식 다섯 가지(브라우저 기본 확인창 13곳) · 주 단추가 흰색과 회색 두 모양 ·
 * 스타일이 없는 단추 변형(`btn sm` · `p` · `g`) 20곳. 한 규칙으로 모았고, 이 검사가 다시 갈라지면 빨강을 낸다.
 *
 * | 규칙 | 무엇 |
 * |---|---|
 * | 지우기 확인 | 되돌릴 수 있으면 묻지 않고 지운 뒤 되돌리기(`say(글, { label, run })`). 되돌릴 수 없으면 `askConfirm`. 브라우저 기본 `confirm()` · `alert()` · `prompt()` 는 쓰지 않는다 |
 * | 단추 넷 | `btn primary`(주 행동 · 흰 채움) · `btn`(보조) · `btn ghost`(글자) · `btn danger`(지우기). 작은 자리는 `sm` 을 덧붙인다 |
 * | 켜진 상태 | `btn on` 은 **상태**다 — 주 행동 자리에 고정으로 쓰지 않는다(조건으로만 붙는다) |
 *
 * ⛔ 빨강이면 예외 목록을 넓히기 전에 규칙대로 고친다.
 */
const CLIENT = resolve(__dirname, '../../src/client')
const files = readdirSync(CLIENT).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ f, s: readFileSync(join(CLIENT, f), 'utf8') }))
const css = readFileSync(join(CLIENT, 'styles.css'), 'utf8')

/** 주석을 걷는다 — 설명 글 속의 `confirm()` 은 호출이 아니다 */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

describe('지우기 확인 — 브라우저 기본 창을 쓰지 않는다', () => {
  /** 앱이 뜨기 전(호스트 부품이 아직 안 선 때)의 대비 — 파일마다 허용하는 호출 수 */
  const ALLOW: Record<string, { confirm?: number; prompt?: number }> = { 'Sheets.tsx': { confirm: 1, prompt: 1 } }
  it('confirm( · alert( · prompt( 호출이 없다', () => {
    const bad: string[] = []
    for (const { f, s } of files) {
      const c = code(s)
      const n = (re: RegExp) => (c.match(re) ?? []).length
      const conf = n(/(?<![A-Za-z_$.])confirm\(/g) + n(/window\.confirm\(/g)
      const al = n(/(?<![A-Za-z_$.])alert\(/g) + n(/window\.alert\(/g)
      const pr = n(/(?<![A-Za-z_$.])prompt\(/g) + n(/window\.prompt\(/g)
      if (conf > (ALLOW[f]?.confirm ?? 0)) bad.push(`${f}: confirm( ${conf}곳`)
      if (al) bad.push(`${f}: alert( ${al}곳`)
      if (pr > (ALLOW[f]?.prompt ?? 0)) bad.push(`${f}: prompt( ${pr}곳`)
    }
    expect(bad, '되돌릴 수 있으면 지운 뒤 되돌리기, 없으면 askConfirm · 이름은 askName').toEqual([])
  })
  it('남겨 둔 한 곳은 askConfirm · askName 의 대비뿐이다', () => {
    const s = files.find((x) => x.f === 'Sheets.tsx')!.s
    expect(s).toMatch(/if \(confSet\) confSet\(c\); else \{ confResolve = null; res\(window\.confirm\(/)
    expect(s).toMatch(/if \(askSet\) askSet\(\{ title, initial \}\); else \{ askResolve = null; res\(window\.prompt\(/)
  })
})

describe('단추 넷 — 변형은 정해진 낱말뿐', () => {
  /** 화면 고유 꾸밈(자리 · 크기만 다루는 것) — 색과 채움은 넷 중 하나가 정한다 */
  const LOCAL = /^(cx-[a-z]+|dawn-b)$/
  const KNOWN = new Set(['primary', 'ghost', 'danger', 'sm'])
  it('className="btn …" 의 낱말은 primary · ghost · danger · sm 과 화면 고유 접두뿐', () => {
    const bad: string[] = []
    for (const { f, s } of files) {
      for (const m of s.matchAll(/className="btn((?: [A-Za-z0-9_-]+)*)"/g)) {
        for (const w of m[1].trim().split(/\s+/).filter(Boolean)) if (!KNOWN.has(w) && !LOCAL.test(w)) bad.push(`${f}: btn ${m[1].trim()}`)
      }
    }
    expect(bad, '`on` 은 켜진 상태에만(조건으로 붙인다) · `p` → primary · `g` → ghost').toEqual([])
  })
  it('쓰는 변형은 스타일시트에 정의가 있다', () => {
    for (const w of KNOWN) expect(css, `.btn.${w}`).toMatch(new RegExp(`\\.btn\\.${w}\\b[^{]*\\{`))
  })
  it('승인 카드는 [거부] 가 먼저, [허용] 이 맨 끝이다 (2026-11-13 Dave «오른쪽 끝으로»)', () => {
    const s = files.find((x) => x.f === 'App.tsx')!.s
    const i = s.indexOf('className="btns perm-btns"')
    expect(i).toBeGreaterThan(0)
    const seg = s.slice(i, s.indexOf('</div>', s.indexOf('data-act="allow"', i)))
    expect(seg.indexOf('data-act="deny"')).toBeGreaterThan(0)
    expect(seg.indexOf('data-act="deny"')).toBeLessThan(seg.indexOf('data-act="allow"'))
    expect(seg.slice(seg.indexOf('data-act="allow"'))).not.toMatch(/<button/)
  })
})
