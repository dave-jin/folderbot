import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { permLinePlain, presentOn, setPresent, subscribePresent } from '../../src/core/present'

/**
 * 보여 주기 보기 (2026-11-15 Dave 카드 답 셋). 화면 없이 잴 수 있는 것 — 켬/끔 저장소 · 가린 승인 카드의 한 줄 · 숨김 규칙이 한 곳에 있는가.
 */
describe('보여 주기 보기 — 켬/끔', () => {
  it('처음에는 꺼져 있다(기억하지 않는다)', () => { expect(presentOn()).toBe(false) })
  it('켜고 끄면 듣는 쪽에 한 번씩 알린다 · 같은 값은 알리지 않는다', () => {
    let n = 0; const off = subscribePresent(() => { n++ })
    setPresent(true); expect(presentOn()).toBe(true); expect(n).toBe(1)
    setPresent(true); expect(n).toBe(1)
    setPresent(false); expect(presentOn()).toBe(false); expect(n).toBe(2)
    off(); setPresent(true); expect(n).toBe(2); setPresent(false)
  })
  it('켜진 값을 어디에도 적어 두지 않는다 — 다시 열면 꺼져 있어야 한다', () => {
    const src = readFileSync('src/core/present.ts', 'utf8') + readFileSync('src/client/present.ts', 'utf8')
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB/)
  })
})

describe('보여 주기 보기 — 승인 카드의 한 줄은 명령 · 경로 · 주소를 싣지 않는다', () => {
  it('명령 — 원문 없이 한 줄', () => {
    const t = permLinePlain('Bash', 'Bash', { command: 'python3 build_slides.py --out "/Users/dave/PARA/1. Projects/강의/02_작업"', description: 'Run build in /Users/dave/PARA' })
    expect(t).toBe('명령을 실행해요')
  })
  it('파일 — 이름만, 폴더 경로는 없다', () => {
    const t = permLinePlain('Edit', 'Edit', { file_path: '/Users/dave/PARA/2. Area/재무_CFO/계약서.md' })
    expect(t).toBe('파일을 고쳐요 — 계약서.md'); expect(t).not.toContain('재무_CFO'); expect(t).not.toContain('/')
    expect(permLinePlain('Read', 'Read', { file_path: '/a/b/c.txt' })).toBe('파일을 읽어요 — c.txt')
  })
  it('주소 — 주소 없이 한 줄', () => {
    const t = permLinePlain('WebFetch', 'WebFetch', { url: 'https://example.com/private?token=abc' })
    expect(t).toBe('웹 주소를 열어요')
  })
  it('그 밖의 도구 — 도구 이름만(입력은 싣지 않는다)', () => {
    const t = permLinePlain('mcp__x__send', '보내기', { to: '고객사 김대표', body: '비밀' })
    expect(t).toBe('보내기 를 써요'); expect(t).not.toContain('김대표')
  })
})

describe('보여 주기 보기 — 숨김 규칙은 스타일 한 곳에 모여 있다', () => {
  const css = readFileSync('src/client/styles.css', 'utf8')
  const rules = css.split('\n').filter((l) => l.includes('.app.present') || l.includes('.app.phone.present'))
  const all = rules.join('\n')
  it('다른 폴더가 보이는 자리 — 왼쪽 목록 · 아이콘 띠 · 오른쪽 패널 · 서랍 · 독 · 폰 하단 탭', () => {
    for (const sel of ['.cols > .col.side', '.cols > .strip', '.cols > .rpwrap', '.cols > .drawer', '.cols > .dock', '.tabbar']) expect(all).toContain(`.app.present ${sel}`)
  })
  it('작업 흔적 — 도구 줄 · «생각» · 맡긴 일 · 작업 목록 · 뒤에서 도는 일', () => {
    for (const sel of ['.chat-body .tl', '.chat-body .meta.think', '.chat-body .sub', '.chat-body .todow', '.live .bgo']) expect(all).toContain(`.app.present ${sel}`)
  })
  it('설정 줄 — 모드 · 모델 · 사용량 고리 · 메인 이름 줄. 입력칸과 보내기 단추는 남는다', () => {
    for (const sel of ['.chat-foot .cbtn:not(.cplus)', '.chat-foot .ring', '.cchips', '.cfoot']) expect(all).toContain(`.app.present ${sel}`)
    expect(all).not.toMatch(/\.app\.present [^{]*\.cin[^{]*\{[^}]*display:none/)
    expect(all).not.toMatch(/\.app\.present [^{]*\.sendb[^{]*\{[^}]*display:none/)
  })
  it('글자는 한 단계 — 데스크톱 15 · 폰 17', () => {
    expect(all).toMatch(/\.app\.present \.chat-body \{ font-size:15px \}/)
    expect(all).toMatch(/\.app\.phone\.present \.chat-body \{ font-size:17px \}/)
  })
})
