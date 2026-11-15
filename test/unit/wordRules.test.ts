import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

/**
 * 🔴 **낱말 사전** (2026-11-15 Dave 카드 «추천대로 전부» · UX/UI 정리 «말» 걸음의 첫 묶음).
 *
 * 11/12 리뷰에서 센 것: 같은 것을 부르는 이름이 화면마다 달랐다 — «내 답을 기다리는 상태» 가 여덟 가지,
 * «봇이 사는 맥» 이 여덟 가지, 없애는 낱말이 열 가지. 한 낱말로 모았고, 버린 말이 화면 글에 다시 들어오면 빨강을 낸다.
 *
 * | 가리키는 것 | 쓰는 말 | 버린 말 |
 * |---|---|---|
 * | 한 줄기의 대화 | 세션 | 채팅 · 대화 · 스레드 (폰 하단 탭 «채팅» 은 화면 이름이라 그대로) |
 * | 폴더에 붙은 동료 | 봇 | 에이전트 · 일꾼 · 워커 («에이전트» 는 Claude · Codex 같은 엔진과 그 서브에이전트에만) |
 * | 볼트를 보는 봇 | 오케스트레이터 | 관제 · 볼트 운영 |
 * | 봇이 사는 맥 | 메인 | 호스트 · 주인 맥 · 맥미니 |
 * | 내 답을 기다리는 상태 | 내 답 기다림 | 확인 대기 · 내 차례 · 답 기다림 · 답 대기 · ask 대기 · 확인해 주세요 |
 * | 도는 중 / 쉬는 중 | 일하는 중 / 쉼 | 도는 중 · 하는 중 · 작업 중 · 실행 중 / 한가함 · 유휴 |
 * | 영영 없애기 / 목록에서만 빼기 | 지우기 / 빼기 | 삭제 · 제거 · 덜어내기 |
 * | 고치기 · 찾기 | 고치기 · 찾기 | 편집 · 변경 · 수정 · 검색 |
 * | 켜고 끄기 | 상태와 선택지는 켬 / 끔 | (누르는 동작은 «켜기 · 끄기» 동사 그대로다) |
 *
 * 보는 것은 **화면 글**이다 — `src/client` 의 문자열 · 템플릿 · JSX 글자. 주석과 코드 이름은 보지 않는다.
 * 봇에게 주는 지시문(호스트의 프롬프트 · 도구 설명)은 화면 글이 아니라 대상이 아니다.
 *
 * ⛔ 빨강이면 예외 목록을 넓히기 전에 사전의 말로 고친다. 이름이라서 남겨야 하면 `KEEP` 에 이유와 함께 적는다.
 */
const CLIENT = resolve(__dirname, '../../src/client')
const files = readdirSync(CLIENT).filter((f) => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f))

/** 화면 글 한 조각 — 문자열 · 템플릿의 글자 부분 · JSX 글자 */
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

/** 버린 말 — 이 글자가 화면 글에 있으면 빨강 */
const BANNED: { re: RegExp; use: string }[] = [
  { re: /대화|스레드/, use: '세션' },
  { re: /일꾼|워커/, use: '봇' },
  { re: /볼트 운영/, use: '오케스트레이터' },
  { re: /호스트|주인 맥|맥미니|메인 맥/, use: '메인' },
  { re: /확인 대기|내 차례|답 대기|ask 대기|확인해 주세요|답을 기다림|(?<!내 )답 기다림/, use: '내 답 기다림' },
  { re: /도는 중|작업 중|실행 중/, use: '일하는 중' },
  { re: /한가함|유휴/, use: '쉼' },
  { re: /삭제|제거/, use: '지우기' },
  { re: /덜어내|덜어냈|연결 해지/, use: '빼기' },
  { re: /편집|변경|수정/, use: '고치기 (이름만 «바꾸기»)' },
  { re: /검색/, use: '찾기' }
]
/** 남기는 것 — 이름이거나 다른 뜻인 글. 글 전체가 같아야 한다 */
const KEEP: Record<string, string> = {
  '서비스 워커가 안 떠요 — 새로 고침 뒤 다시': '브라우저의 Service Worker 를 가리키는 기술 이름이다'
}

describe('낱말 사전 — 버린 말이 화면 글에 없다', () => {
  it('세션 · 봇 · 오케스트레이터 · 메인 · 내 답 기다림 · 일하는 중 · 쉼 · 지우기 · 빼기 · 고치기 · 찾기', () => {
    const bad: string[] = []
    for (const x of ALL) {
      if (KEEP[x.text]) continue
      for (const b of BANNED) { const m = b.re.exec(x.text); if (m) bad.push(`${x.f}:${x.line} «${m[0]}» → ${b.use} — ${x.text.slice(0, 80)}`) }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })
  it('«채팅» 은 폰 하단 탭의 이름으로만 쓴다', () => {
    const bad = ALL.filter((x) => x.text.includes('채팅') && x.text !== '채팅').map((x) => `${x.f}:${x.line} ${x.text.slice(0, 80)}`)
    expect(bad, bad.join('\n')).toEqual([])
    expect(ALL.filter((x) => x.text === '채팅').length, '폰 하단 탭 «채팅» 은 한 곳').toBe(1)
  })
  it('«관제» 는 화면에 보이지 않는다 — 호스트가 주는 묶음 열쇠로만 남는다', () => {
    const bad = ALL.filter((x) => x.text.includes('관제') && x.text !== '관제').map((x) => `${x.f}:${x.line} ${x.text.slice(0, 80)}`)
    expect(bad, bad.join('\n')).toEqual([])
    const app = readFileSync(join(CLIENT, 'App.tsx'), 'utf8')
    expect(app.split("{sec === '관제' ? '볼트' : sec}").length - 1, '묶음 이름은 맥 목록과 폰 홈 두 곳 모두 «볼트» 로 보인다').toBe(2)
    expect(app, '묶음 열쇠를 그대로 그리는 자리가 없다').not.toContain('className="secl">{sec}<')
  })
  it('«에이전트» 는 엔진(Claude · Codex)과 서브에이전트에만 쓴다', () => {
    const OK = [/서브에이전트/, /^에이전트$/, /고른 에이전트가/, /깔린 에이전트가/, /명령 · 에이전트 · 스킬/, /Codex 버전 에이전트/]
    const bad = ALL.filter((x) => x.text.includes('에이전트') && !OK.some((r) => r.test(x.text))).map((x) => `${x.f}:${x.line} ${x.text.slice(0, 80)}`)
    expect(bad, bad.join('\n')).toEqual([])
  })
  it('앱이 뜨기 전 화면과 맥 메뉴도 같은 말을 쓴다 — index.html 의 첫 화면 · 연결 화면 · 메뉴 막대', () => {
    const splash = readFileSync(join(CLIENT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    expect(splash).toContain('메인에 연결하는 중…')
    expect(splash).not.toMatch(/호스트에 연결/)
    const desk = resolve(__dirname, '../../desktop')
    const connect = readFileSync(join(desk, 'connect.html'), 'utf8')
    expect(connect, '연결 화면').not.toMatch(/호스트|미니에서/)
    // 메뉴 이름(`label:`) — 맥의 기본 메뉴 «편집» 은 운영체제의 이름이라 그대로다
    const labels = [...readFileSync(join(desk, 'main.js'), 'utf8').matchAll(/label: (?:'([^']*)'|`([^`]*)`)/g)].map((m) => m[1] ?? m[2] ?? '')
    expect(labels.length).toBeGreaterThan(10)
    const bad = labels.filter((l) => /호스트|검색|확인 대기|한가함|삭제|대화/.test(l))
    expect(bad, bad.join(' / ')).toEqual([])
  })
  it('상태 이름은 호스트와 화면이 같은 말을 쓴다', () => {
    const types = readFileSync(resolve(__dirname, '../../src/core/types.ts'), 'utf8')
    expect(types).toContain("idle: '쉼', running: '일하는 중', awaiting_input: '내 답 기다림'")
    const tabs = readFileSync(resolve(__dirname, '../../src/core/sessionTabs.ts'), 'utf8')
    expect(tabs).toContain("{ k: 'wait', t: '내 답 기다림' }, { k: 'work', t: '일하는 중' }")
  })
})
