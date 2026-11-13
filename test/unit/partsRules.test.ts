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

/**
 * 창의 한 틀 (2026-11-13 · 부품 넷 둘째 묶음 · `src/client/Modal.tsx`).
 * 11/12 리뷰에서 창 열 개의 폭이 열 가지(480~1180)였다. 폭은 셋(`--mw-s` 480 · `--mw-m` 720 · `--mw-l` 1080)으로 모았고,
 * 어둠막 · ⎋ · ✕ 는 `Modal` 이 붙인다. 화면에서 «바깥 · ✕ 로 닫히는지» 는 `test/uxui-eight.mjs` M1 이 잰다.
 */
describe('창의 한 틀 — 폭은 셋, 닫는 길은 틀이 붙인다', () => {
  it('폭 눈금은 480 · 720 · 1080 이다', () => {
    expect(/--mw-s:480px; --mw-m:720px; --mw-l:1080px/.test(css)).toBe(true)
    for (const k of ['s', 'm', 'l']) expect(css.includes(`.modal.sz-${k} { width:min(var(--mw-${k}), calc(100% - 24px)) }`), `sz-${k}`).toBe(true)
  })
  it('눈금 밖 폭을 가진 창은 알려진 예외뿐이다 — 새 창은 `Modal` 의 `size` 로 폭을 고른다', () => {
    const found: string[] = []
    // 화면 코드: <div className="modal 이름" style={{ width: 'min(NNNpx…' }}>
    for (const { f, s } of files) for (const m of code(s).matchAll(/className=(?:"|\{`)modal([^"`]*)(?:"|`\})[^>]*?width: 'min\((\d+)px/g)) found.push(`${f}:${m[1].trim().split(/\s+/)[0] || '(이름 없음)'}:${m[2]}`)
    // 스타일시트: .modal.이름 { … width:min(NNNpx … } / width:NNNpx  (폰 구간의 100% 는 폭 눈금이 아니다)
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[}\s,])\.modal((?:\.[\w-]+)+)\s*\{([^}]*)\}/g)) { const w = /(?:^|[;\s])width:\s*(?:min\()?(\d+)px/.exec(m[2]); if (w) found.push(`styles.css:${m[1].split('.')[1]}:${w[1]}`) }
    expect(found.sort()).toEqual([
      'App.tsx:(이름 없음):560',      // 메시지에 붙일 파일 고르기 — 목록 한 칸짜리
      'App.tsx:conf:520',             // 같은 이름의 파일이 여러 곳 — 확인창 계열
      'Sheets.tsx:ask:420',           // 이름 묻기
      'Sheets.tsx:conf:520',          // 확인창
      'Sheets.tsx:dif:860',           // 바뀐 내용 보기 — 코드 두 단
      'localOpen.tsx:conf:520',       // 동기화 중 확인창
      'styles.css:apick:560',         // 에이전트 고르기 — 맨 위 층
      'styles.css:keys:420',          // 단축키
      'styles.css:smg:1080',          // 줄기 관리(= 넓게)
    ].sort())
  })
  it('틀로 옮긴 창은 어둠막을 손으로 짓지 않는다', () => {
    for (const f of ['Manage.tsx', 'Routines.tsx', 'Cleanup.tsx']) {
      const s = code(files.find((x) => x.f === f)!.s)
      expect(s.includes('className="backdrop"'), `${f} 에 손으로 지은 어둠막`).toBe(false)
      expect(s.includes('<Modal '), `${f} 가 Modal 을 안 쓴다`).toBe(true)
    }
    const sheets = code(files.find((x) => x.f === 'Sheets.tsx')!.s)
    expect(sheets.includes('cls="rted"') && sheets.includes('cls="nmodal"'), '루틴 편집 · 알림이 Modal 을 안 쓴다').toBe(true)
    expect(/className="sheet(-[hbf])?"/.test(sheets), '옛 시트 틀(.sheet)이 남았다').toBe(false)
  })
  it('하나만 고르는 거르기는 세그먼트다 — 알약(`pill`)은 여럿을 함께 켜는 세션 창에만', () => {
    const users = files.filter(({ s }) => /className=(?:"|\{`)pill\b/.test(code(s))).map((x) => x.f)
    expect(users).toEqual(['Cleanup.tsx'])
  })
  it('체크는 한 모양(`.chk` — 네모 16 · 둥글기 4)이다', () => {
    const bare: string[] = []
    for (const { f, s } of files) for (const m of code(s).matchAll(/<input type="checkbox"([^>]*)>/g)) if (!/className="chk"/.test(m[1])) bare.push(f)
    expect(bare).toEqual([])
    expect(/\.chk \{ appearance:none;[^}]*width:16px; height:16px;[^}]*border-radius:4px/.test(css)).toBe(true)
  })
})
