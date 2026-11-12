import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 🔴 **값은 눈금에서 고른다** (2026-11-13 · UX/UI 정리 «눈금과 규칙»).
 *
 * 11/12 리뷰에서 스타일시트를 세어 보니 글자 크기 23가지 · 둥글기 30가지 · 그림자 값 30가지 · 쌓임 숫자 28가지였다.
 * 화면마다 0.5px 씩 다른 값을 새로 지어 쓴 결과다. 눈금을 정해 가까운 값으로 모았고, 이 검사가 **눈금 밖 값이 다시 생기면 빨강**을 낸다.
 * 눈금의 뜻은 `styles.css` 맨 위 `:root` 의 «눈금» 주석이 정본이다.
 *
 * | 무엇 | 눈금 |
 * |---|---|
 * | 글자(px) | 11 · 12 · 13 · 15 · 17 · 22 — 폰 문맥은 14(보조) · 16(본문 · 입력칸)도 |
 * | 둥글기 | 0 · 2 · 4 · 6 · 8 · 12 · 999px · 50% · `var(--r-sheet)` · `var(--r-dock)` |
 * | 그림자 | `var(--sh-1|2|3)`. 색을 직접 적지 않는다(테두리 고리 · 빛무리도 토큰 색으로) |
 * | 쌓임 | 부품 안은 −1~9 숫자, 그 밖은 `var(--z-…)` 또는 `calc(var(--z-…) ± 5 이내)` |
 * | 움직임 | 전환은 `var(--t-fast|--t-mid)` + `var(--ease)`. 도는 것(무한 반복 · 0.5초 이상)과 폴더봇 확대의 튀는 이징은 예외 |
 *
 * ⛔ 빨강이면 **검사의 눈금을 넓히기 전에** 가까운 눈금 값으로 바꾼다. 정말 눈금 밖이어야 하면 아래 `EXCEPT` 에 선택자와 이유를 적는다.
 * 폰 문맥 = `@media (max-width: 768px 이하)` · `(hover: none)` · `(pointer: coarse)` 안이거나, 선택자에 `.phone` 또는 폰 전용 부품(`PHONE_ONLY`)이 든 규칙.
 */
const CLIENT = resolve(__dirname, '../../src/client')
const css = readFileSync(join(CLIENT, 'styles.css'), 'utf8')
const tsx = readdirSync(CLIENT).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ f, s: readFileSync(join(CLIENT, f), 'utf8') }))

/** 폰에서만 그려지는 부품 — 선택자에 `.phone` 이 없어도 폰 문맥으로 본다. */
const PHONE_ONLY = /\.phone|\.tsheet|\.bgsheet|\.esheet|\.colsheet|\.mhome|\.setp(?![\w])|\.setp-|\.ptodo|\.sec-row/
/** 눈금 밖이어야 하는 글자 크기 — [선택자 조각, px, 이유] */
const EXCEPT: [string, number, string][] = [
  ['.mtitle', 30, '폰 홈의 큰 제목 «Folder Bot» — iOS 큰 제목 자리라 22 로 줄이면 화면 인상이 바뀐다'],
  ['.queue .tx', 14, '대기 말 카드의 글 — 2026-10-02 Dave «큐 편집화면도 키워줘». 고치는 칸과 같은 크기여야 누를 때 글이 안 튄다'],
  ['.queue .qin', 14, '대기 말을 고치는 칸 — 같은 결정. 스모크(큐 편집)가 14 이상을 지킨다'],
]

// ── 스타일시트를 «선언 + 그 선언이 든 선택자 · @규칙» 으로 읽는다
const blank = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
type Decl = { prop: string; value: string; sel: string; ats: string[]; line: number }
const decls: Decl[] = (() => {
  const out: Decl[] = []; const stack: string[] = []; let start = 0
  const push = (text: string, at: number) => {
    const m = /^\s*([a-zA-Z-]+)\s*:\s*([\s\S]+?)\s*$/.exec(text); if (!m || !stack.length) return
    out.push({ prop: m[1].toLowerCase(), value: m[2].replace(/\s+/g, ' '), sel: stack.filter((x) => !x.startsWith('@')).pop() ?? '', ats: stack.filter((x) => x.startsWith('@')), line: blank.slice(0, at).split('\n').length })
  }
  for (let i = 0; i < blank.length; i++) {
    const ch = blank[i]
    if (ch === '{') { stack.push(blank.slice(start, i).replace(/\s+/g, ' ').trim()); start = i + 1 }
    else if (ch === '}') { push(blank.slice(start, i), start); stack.pop(); start = i + 1 }
    else if (ch === ';') { push(blank.slice(start, i), start); start = i + 1 }
  }
  return out
})()
const isPhone = (d: Decl) => d.ats.some((a) => { const m = /max-width:\s*(\d+)px/.exec(a); return (m && Number(m[1]) <= 768) || /\((hover|pointer):\s*(none|coarse)\)/.test(a) }) || PHONE_ONLY.test(d.sel)
const inRoot = (d: Decl) => d.sel.startsWith(':root') && !/\s/.test(d.sel.trim())   // 토큰을 정의하는 자리
const where = (d: Decl) => `styles.css:${d.line} ${d.sel.slice(0, 60)} { ${d.prop}:${d.value} }`
const of = (prop: RegExp) => decls.filter((d) => prop.test(d.prop))

describe('눈금 — 스타일 값은 눈금에서 고른다', () => {
  it('스타일시트를 읽었다 (검사 자신이 헛돌지 않는다)', () => {
    expect(of(/^font-size$/).length).toBeGreaterThan(500)
    expect(of(/^border-radius$/).length).toBeGreaterThan(250)
    expect(of(/^z-index$/).length).toBeGreaterThan(30)
    expect(of(/^font-size$/).filter(isPhone).length).toBeGreaterThan(80)
    for (const k of ['--r-sheet', '--r-dock', '--sh-1', '--sh-2', '--sh-3', '--t-fast', '--t-mid', '--ease', '--z-stick', '--z-drawer', '--z-modal', '--z-pop', '--z-over', '--z-banner', '--z-hover', '--z-alert', '--z-menu']) expect(css.includes(`${k}:`), k).toBe(true)
  })

  it('글자 크기 — 11 · 12 · 13 · 15 · 17 · 22 (폰 문맥은 14 · 16 도)', () => {
    const DESK = new Set([11, 12, 13, 15, 17, 22]); const PHONE = new Set([...DESK, 14, 16])
    const bad: string[] = []
    for (const d of of(/^font-size$/)) {
      const m = /^([0-9.]+)px$/.exec(d.value); if (!m) continue                       // em · % · inherit · var() 는 눈금이 아니라 «따라가기»
      const v = Number(m[1])
      if ((isPhone(d) ? PHONE : DESK).has(v)) continue
      if (EXCEPT.some(([k, px]) => d.sel.includes(k) && px === v)) continue
      bad.push(where(d))
    }
    for (const { f, s } of tsx) s.split('\n').forEach((line, i) => { for (const m of line.matchAll(/fontSize:\s*([0-9.]+)(?![0-9.\w])/g)) if (!DESK.has(Number(m[1]))) bad.push(`${f}:${i + 1} fontSize ${m[1]}`) })
    expect(bad).toEqual([])
  })

  it('둥글기 — 0 · 2 · 4 · 6 · 8 · 12 · 알약 · 동그라미 · 이름 붙인 예외 둘', () => {
    const OK = new Set(['0', '2px', '4px', '6px', '8px', '12px', '999px', '50%', 'var(--r-sheet)', 'var(--r-dock)', 'inherit'])
    const bad: string[] = []
    for (const d of of(/^border(-(top|bottom)-(left|right))?-radius$/)) {
      if (d.ats.some((a) => /print/.test(a))) continue                                // 인쇄용은 pt 를 쓴다
      if (d.value.split(' ').some((t) => !OK.has(t))) bad.push(where(d))
    }
    for (const { f, s } of tsx) s.split('\n').forEach((line, i) => { for (const m of line.matchAll(/borderRadius:\s*([0-9.]+)(?![0-9.\w])/g)) if (!OK.has(`${m[1]}px`) && m[1] !== '0') bad.push(`${f}:${i + 1} borderRadius ${m[1]}`) })
    expect(bad).toEqual([])
  })

  it('그림자 — 색을 직접 적지 않는다 (`--sh-1` · `--sh-2` · `--sh-3` · 고리와 빛무리는 토큰 색)', () => {
    const bad = of(/^box-shadow$/).filter((d) => !inRoot(d) && /rgba?\(|#[0-9a-fA-F]{3,8}\b/.test(d.value)).map(where)
    expect(bad).toEqual([])
    for (const { f, s } of tsx) expect(/boxShadow:/.test(s), `${f} — boxShadow 를 화면 코드에 직접 적지 않는다`).toBe(false)
  })

  it('쌓임 — 부품 안은 −1~9, 그 밖은 층 이름(`var(--z-…)` · 한 층 안에서 ±5)', () => {
    const ok = (v: string) => (/^-?\d+$/.test(v) && Number(v) >= -1 && Number(v) <= 9) || /^var\(--z-[a-z]+\)$/.test(v) || /^calc\(var\(--z-[a-z]+\) [+-] [1-5]\)$/.test(v)
    const bad = of(/^z-index$/).filter((d) => !ok(d.value)).map(where)
    for (const { f, s } of tsx) s.split('\n').forEach((line, i) => { for (const m of line.matchAll(/zIndex:\s*([^,}\s]+)/g)) { const v = m[1].replace(/^['"]|['"]$/g, ''); if (!ok(v)) bad.push(`${f}:${i + 1} zIndex ${m[1]}`) } })
    expect(bad).toEqual([])
  })

  /**
   * 🔴 **가장 흐린 글자도 읽혀야 한다** (2026-11-13 Dave 카드 «올린다»). 보조 글자색 `--t3` 는 시각 · 설명 · 힌트 400여 곳이 쓴다.
   * 종전 값(다크 #666666 · 라이트 #8a8a8a)은 바탕 대비가 3.2~3.6:1 이었다. 바탕(`--bg`)과 옆 칸(`--sb`) 위에서 4.5:1(WCAG AA)을 넘긴다.
   * ⚠ 한 단계 위 `--t2` 보다 진해지면 위계가 뒤집힌다 — 그것도 같이 잰다.
   */
  it('보조 글자색 — 바탕과 옆 칸 위에서 대비 4.5:1 이상 · 한 단계 위 글자색보다는 흐리다', () => {
    const lum = (hex: string) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
    const blockOf = (head: string) => { const i = blank.indexOf(head); expect(i, head).toBeGreaterThanOrEqual(0); return blank.slice(i, blank.indexOf('}', i)) }   // 토큰 줄 — 주석은 지운 글에서 읽는다
    const themes = { dark: blockOf(':root {'), light: blockOf(':root[data-theme="light"] {') }
    for (const [name, body] of Object.entries(themes)) {
      const tok = (k: string) => { const m = new RegExp(`(?<![\\w-])${k}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`).exec(body); expect(m, `${name} ${k}`).toBeTruthy(); return m![1] }
      for (const bg of ['--bg', '--sb']) expect(ratio(tok('--t3'), tok(bg)), `${name} --t3 on ${bg}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(tok('--t2'), tok('--bg')), `${name} --t2 는 --t3 보다 또렷해야 한다`).toBeGreaterThan(ratio(tok('--t3'), tok('--bg')))
      // 🔴 `--t3` 는 끝낸 할 일의 체크 칸을 «칠하는» 데도 쓴다. 그 위의 체크 표시(`--onAccent`)가 묻히면 안 된다(그림 기준 3:1).
      //    색을 올린 날 스모크가 잡았다 — 데스크톱 쪽 체크만 `#111` 로 박혀 있어 라이트에서 2.7:1 이 됐다.
      expect(ratio(tok('--onAccent'), tok('--t3')), `${name} 체크 표시(--onAccent) on --t3`).toBeGreaterThanOrEqual(3)
    }
    expect(/\.todo\.done \.bx \{[^}]*color:var\(--onAccent\)/.test(blank), '.todo.done .bx 는 체크 표시 색을 --onAccent 로 정한다').toBe(true)
    const fixed = tsx.filter(({ s }) => /className="bx"[^\n]*n="check"[^>]*color=/.test(s)).map(({ f }) => f)
    expect(fixed, '할 일 체크 칸의 체크 표시에 색을 박지 않는다 — 칸의 글자색을 물려받는다').toEqual([])
  })

  it('움직임 — 전환은 빠르게 · 보통 두 토큰과 이징 하나', () => {
    const BOUNCE = 'cubic-bezier(.34,1.3,.64,1)'                                      // 폴더봇을 누르면 튀며 커진다 — 하나뿐인 예외
    const part = (p: string) => p === 'none' || new RegExp(`^[a-z-]+ var\\(--t-(fast|mid)\\) (var\\(--ease\\)|${BOUNCE.replace(/[.()]/g, '\\$&')})$`).test(p)
    const bad = of(/^transition$/).filter((d) => !d.value.split(', ').every(part)).map(where)
    for (const d of of(/^animation$/)) {
      if (/infinite/.test(d.value)) continue                                           // 도는 것(로딩 · 숨쉬기)
      const m = /(?<![\w.-])([0-9]*\.?[0-9]+)s\b/.exec(d.value); if (m && Number(m[1]) < 0.5) bad.push(where(d))   // 짧게 나타나는 것은 토큰으로
    }
    for (const { f, s } of tsx) s.split('\n').forEach((line, i) => { for (const m of line.matchAll(/transition:\s*'([^']+)'/g)) if (!m[1].split(', ').every(part)) bad.push(`${f}:${i + 1} transition ${m[1]}`) })
    expect(bad).toEqual([])
  })
})
