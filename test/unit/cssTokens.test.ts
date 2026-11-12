import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 🔴 **정의되지 않은 색 토큰을 쓰지 않는다** (2026-11-13 · 11/12 UX/UI 리뷰 «고장 여덟»).
 *
 * `var(--error)` 처럼 **어디에도 정의가 없는 이름**을 쓰면 그 선언은 통째로 버려진다 — 오류 없이.
 * 실제로 여섯 종이 27곳에 쓰이고 있었다(`--error` `--faint` `--accent` `--border` `--strong` `--dim`).
 * «이 루틴 삭제» 가 빨갛지 않았고, 루틴 오류 글과 경고 테두리의 색이 안 나왔고, 루틴 창의 «1~2개» 칸은 바탕이 없었다.
 * 빌드도 타입 검사도 못 잡는 자리라 여기서 잡는다.
 *
 * - 정의: 스타일시트 · 화면 코드의 `--이름:` · `'--이름'` 키 · `setProperty('--이름'` .
 * - 쓰임: `var(--이름)` — **기본값 없이** 쓴 것만 본다. `var(--이름, 값)` 은 JS 가 넣어 주는 값(화면 높이 · 문서 폭 등)이라 괜찮다.
 * ⛔ 빨강이면 새 토큰을 `:root` 에 더하기 전에 **있는 토큰**부터 본다 — 글자 `--w` `--t` `--t2` `--t3` · 선 `--line` `--line2` · 상태 `--run` `--hold` `--wait` `--done` `--err`.
 */
const CLIENT = resolve(__dirname, '../../src/client')
const files = readdirSync(CLIENT).filter((f) => /\.(css|tsx|ts)$/.test(f)).map((f) => ({ f, s: readFileSync(join(CLIENT, f), 'utf8') }))

describe('색 토큰 — 정의 없는 이름을 쓰지 않는다', () => {
  const defs = new Set<string>()
  for (const { s } of files) {
    for (const m of s.matchAll(/(?<![\w-])(--[a-zA-Z][\w-]*)\s*:/g)) defs.add(m[1])
    for (const m of s.matchAll(/['"](--[a-zA-Z][\w-]*)['"]/g)) defs.add(m[1])
  }

  it('토큰 정의를 읽었다 (검사 자신이 헛돌지 않는다)', () => {
    for (const k of ['--bg', '--w', '--t3', '--line2', '--err', '--run']) expect(defs.has(k), k).toBe(true)
  })

  it('`var(--이름)` 은 모두 정의가 있다', () => {
    const bad: string[] = []
    for (const { f, s } of files) {
      s.split('\n').forEach((line, i) => { for (const m of line.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)\s*\)/g)) if (!defs.has(m[1])) bad.push(`${f}:${i + 1} ${m[1]}`) })
    }
    expect(bad).toEqual([])
  })

  it('다크 · 라이트 테마가 `color-scheme` 을 정한다 — 안 정하면 다크 화면에 흰 기본 입력칸 · 체크박스가 뜬다', () => {
    const css = files.find((x) => x.f === 'styles.css')!.s
    const root = /:root\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    const light = /:root\[data-theme="light"\]\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(root).toMatch(/color-scheme:\s*dark/)
    expect(light).toMatch(/color-scheme:\s*light/)
  })
})
