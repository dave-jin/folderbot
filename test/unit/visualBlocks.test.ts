import { describe, it, expect } from 'vitest'
import { CHART_MAX, COMPARE_MAX, MINI_CSP, STEPS_MAX, VISUAL_LANGS, VISUAL_RULES_MD, fenceOpen, miniDoc, miniOutside, parseVisual, type ChartBlock, type CompareBlock, type StepsBlock } from '../../src/core/visualBlocks'
import { mediaKind, planCards } from '../../src/core/media'
import { bareFileNames } from '../../src/core/paths'

/**
 * 🔴 **그림으로 받는 답** (2026-11-12 Dave: «다이어그램 형태로 보여주거나 … 보다 시각화된 커뮤니케이션» · 시각화 채팅 둘째 묶음).
 *
 * 봇이 코드 울타리(`steps` · `compare` · `chart`)로 쓴 글을 읽어 카드로 그린다. 여기는 **읽기**만 잰다.
 * ⛔ 반만 읽은 블록을 그리지 않는다 — 모양이 다른 줄이 하나라도 있으면 `null`(화면은 코드 그대로 둔다).
 */
const steps = (s: string) => parseVisual('steps', s) as StepsBlock | null
const compare = (s: string) => parseVisual('compare', s) as CompareBlock | null
const chart = (s: string) => parseVisual('chart', s) as ChartBlock | null

describe('steps — 어디까지 왔나', () => {
  it('목업의 예시를 읽는다 · 지금 단계 번호', () => {
    const b = steps('title: 강의 준비\n[x] 기획 | 10/28 확정\n[x] 커리큘럼 | 11/3\n[>] 슬라이드 | 42장 중 31\n[ ] 리허설 | 11/19 예정\n[ ] 강의 | 11/22')
    expect(b).not.toBeNull()
    expect(b!.title).toBe('강의 준비')
    expect(b!.steps.map((s) => s.state)).toEqual(['done', 'done', 'now', 'todo', 'todo'])
    expect(b!.steps[2]).toEqual({ state: 'now', label: '슬라이드', note: '42장 중 31' })
    expect(b!.at).toBe(3)
  })
  it('목록 표시(- )가 붙어도 · 덧붙임이 없어도 · 한글 머리말도 읽는다', () => {
    const b = steps('제목: 순서\n- [X] 하나\n- [] 둘\n* [ ] 셋')
    expect(b!.title).toBe('순서')
    expect(b!.steps.map((s) => [s.state, s.label, s.note])).toEqual([['done', '하나', ''], ['todo', '둘', ''], ['todo', '셋', '']])
    expect(b!.at).toBe(1)   // 지금 단계가 없으면 끝난 수
  })
  it('모양이 다른 줄이 섞이면 그리지 않는다', () => {
    expect(steps('[x] 하나\n그냥 글\n[ ] 둘')).toBeNull()
    expect(steps('[x] 하나')).toBeNull()                      // 하나뿐
    expect(steps(Array.from({ length: 13 }, (_, i) => `[ ] ${i}`).join('\n'))).toBeNull()   // 12개 초과
    expect(steps('')).toBeNull()
  })
})

describe('compare — 안 비교', () => {
  const src = '# 노션 템플릿 *\n준비: 약 2시간\n수강생 부담: 복제 한 번\n# PDF 워크북\n준비: 약 4시간\n걸리는 점: 실습이 정적\n# 깃허브 저장소 (추천)\n준비: 약 3시간'
  it('안과 항목을 읽는다 · 추천 표시 둘 다 · 항목은 처음 나온 순서', () => {
    const b = compare(src)
    expect(b!.options.map((o) => [o.name, o.rec])).toEqual([['노션 템플릿', true], ['PDF 워크북', false], ['깃허브 저장소', true]])
    expect(b!.keys).toEqual(['준비', '수강생 부담', '걸리는 점'])
    expect(b!.options[1].rows).toEqual({ 준비: '약 4시간', '걸리는 점': '실습이 정적' })
    expect(b!.title).toBe('')
  })
  it('값에 든 쌍점은 값이다 («11:30»)', () => {
    const b = compare('title: 시간\n# 오전\n시작: 11:30\n# 오후\n시작: 14:00')
    expect(b!.title).toBe('시간')
    expect(b!.options[0].rows['시작']).toBe('11:30')
  })
  it('이름에 든 시각은 이름이다 — 숫자 사이 쌍점에서는 가르지 않는다 · 글머리표는 뗀다', () => {
    const b = compare('# 오전\n11:30 회차: 12명\n- 준비: 2시간\n# 오후\n14:00 회차: 9명')
    expect(b!.keys).toEqual(['11:30 회차', '준비', '14:00 회차'])
    expect(b!.options[0].rows['11:30 회차']).toBe('12명')
  })
  it('🔴 같은 항목이 두 줄이면 그리지 않는다 — 앞줄이 조용히 사라진다 (2026-11-13 독립 검토)', () => {
    expect(compare('# A\n걸리는 점: 계정 필요\n걸리는 점: 비용\n# B\n걸리는 점: 없음')).toBeNull()
  })
  it('항목 이름이 `constructor` 여도 다른 안의 칸에 물려받은 값이 없다', () => {
    const b = compare('# A\nconstructor: 있음\n값: 1\n# B\n값: 2')
    expect(b!.options[1].rows['constructor']).toBeUndefined()
    expect(b!.options[1].rows['toString']).toBeUndefined()
  })
  it('안이 하나뿐 · 항목 없는 안 · 모양이 다른 줄은 그리지 않는다', () => {
    expect(compare('# 하나\n준비: 1')).toBeNull()
    expect(compare('# 하나\n준비: 1\n# 둘')).toBeNull()
    expect(compare('# 하나\n준비: 1\n# 둘\n쌍점 없는 줄')).toBeNull()
    expect(compare('준비: 1\n# 하나\n준비: 1\n# 둘\n준비: 2')).toBeNull()   // 안 이름 앞에 온 항목
    expect(compare(Array.from({ length: 7 }, (_, i) => `# 안${i}\n값: ${i}`).join('\n'))).toBeNull()
  })
})

describe('chart — 숫자', () => {
  it('목업의 예시를 읽는다 · 가장 큰 값이 100', () => {
    const b = chart('title: 회차별 신청\nunit: 명\n1회: 24\n2회: 33\n3회: 41\n4회(모집 중): 29 ~\n5회(모집 중): 15 ~')
    expect(b!.title).toBe('회차별 신청'); expect(b!.unit).toBe('명')
    expect(b!.points.map((p) => p.value)).toEqual([24, 33, 41, 29, 15])
    expect(b!.points.map((p) => p.soft)).toEqual([false, false, false, true, true])
    expect(b!.points[2].pct).toBe(100)
    expect(b!.points[0].pct).toBeCloseTo(58.5, 1)
    expect(b!.points[3].text).toBe('29')
    expect(b!.layout).toBe('cols')
  })
  it('쉼표 · 소수 · 음수 · 단위가 붙은 숫자', () => {
    const b = chart('매출: 1,200만\n비용: -350.5만\n이익: 849.5만')
    expect(b!.points.map((p) => p.value)).toEqual([1200, -350.5, 849.5])
    expect(b!.points[0].text).toBe('1,200만')
    expect(b!.points[1].pct).toBeCloseTo(29.2, 1)   // 길이는 절댓값
    expect(chart('달성: 82%\n목표: 100%')!.points.map((p) => p.text)).toEqual(['82%', '100%'])
    expect(chart('- 1회: 24\n* 2회: 33')!.points.map((p) => p.label)).toEqual(['1회', '2회'])   // 글머리표는 뗀다
  })
  it('🔴 조용히 틀리게 읽지 않는다 — 숫자 하나가 아닌 값은 그리지 않는다 (2026-11-13 독립 검토)', () => {
    expect(chart('매출: 1.2억\n비용: 8,000만'), '단위가 줄마다 다르다 — 막대가 실제와 거꾸로 나온다').toBeNull()
    expect(chart('매출: 1,200만\n비용: 350'), '한 줄에만 단위').toBeNull()
    expect(chart('1회: 24명 (11:30 마감)\n2회: 33명'), '덧붙인 글 속 시각').toBeNull()
    expect(chart('시작: 11:30\n끝: 14:00'), '시각').toBeNull()
    expect(chart('접수 마감: 11/22\n행사: 11/29'), '날짜').toBeNull()
    expect(chart('마감: 2026-11-22\n행사: 2026-11-29'), '날짜').toBeNull()
    expect(chart('참가: 20-30명\n대기: 5명'), '범위').toBeNull()
    expect(chart('가: 1234,567\n나: 3'), '잘못 찍힌 쉼표').toBeNull()
    expect(chart('가: 3,5\n나: 3'), '소수 쉼표').toBeNull()
    expect(chart('가: 1.234.567\n나: 3'), '점 두 개').toBeNull()
    expect(chart('가: 1e6\n나: 3'), '지수').toBeNull()
    expect(chart('가: ₩1,200\n나: ₩300'), '앞에 붙은 기호').toBeNull()
  })
  it('단위가 숫자뿐일 수는 없다 — «단위: 5» 는 값이다', () => {
    const b = chart('title: 2026\n단위: 5\n가: 3\n나: 4')
    expect(b!.title).toBe('2026'); expect(b!.unit).toBe('')
    expect(b!.points.map((p) => [p.label, p.value])).toEqual([['단위', 5], ['가', 3], ['나', 4]])
  })
  it('이름에 든 쌍점은 이름이다 — 마지막 쌍점에서 가른다', () => {
    const b = chart('11:30 회차: 12\n14:00 회차: 9')
    expect(b!.points[0]).toMatchObject({ label: '11:30 회차', value: 12 })
  })
  it('값이 많거나 이름 · 값이 길면 가로 막대 — 폰 폭의 세로 막대 한 칸에 글이 들어가야 한다', () => {
    expect(chart(Array.from({ length: 6 }, (_, i) => `${i}월: ${i + 1}`).join('\n'))!.layout).toBe('cols')
    expect(chart(Array.from({ length: 7 }, (_, i) => `${i}월: ${i + 1}`).join('\n'))!.layout).toBe('rows')
    expect(chart('아주 긴 이름을 가진 항목 하나: 3\n짧음: 5')!.layout).toBe('rows')
    expect(chart('가: 1,200,000원\n나: 300원')!.layout).toBe('rows')
  })
  it('숫자가 아닌 값 · 하나뿐 · 너무 많음 · 전부 0 은 그리지 않는다', () => {
    expect(chart('가: 많음\n나: 3')).toBeNull()
    expect(chart('가: 3')).toBeNull()
    expect(chart(Array.from({ length: 25 }, (_, i) => `${i}: ${i}`).join('\n'))).toBeNull()
    expect(chart('가: 0\n나: 0')).not.toBeNull()   // 0 만 있어도 숫자 표로는 뜻이 있다
    expect(chart('가: 0\n나: 0')!.points.every((p) => p.pct === 0)).toBe(true)
  })
})

describe('parseVisual', () => {
  it('모르는 이름은 null', () => { expect(parseVisual('mermaid', 'graph TD')).toBeNull(); expect(parseVisual('', '[x] a\n[ ] b')).toBeNull() })
  it('윈도우 줄바꿈과 앞뒤 빈 줄을 견딘다', () => { expect(steps('\r\n[x] 하나\r\n[ ] 둘\r\n\r\n')!.steps.length).toBe(2) })
})

describe('미니 창 — 격리된 틀에 넣을 글', () => {
  it('html 은 미디어 종류다 · 혼자 선 html 은 카드가 된다', () => {
    expect(mediaKind('02_작업/수강료-계산기.html')).toBe('html'); expect(mediaKind('index.HTML')).toBe('html')
    expect(mediaKind('옛.htm'), '호스트가 모르는 확장자 — 문서 창에서 안 열린다').toBeNull()
    const p = planCards([{ refs: [{ rel: '계산기.html', kind: mediaKind('계산기.html') }], only: true }])
    expect(p.cards).toEqual([{ type: 'html', rels: ['계산기.html'], at: 0 }])
  })
  it('파일 이름만 적힌 html 도 칩 후보가 된다 (FILE_EXT)', () => {
    expect(bareFileNames('값을 움직여 보세요: 수강료-계산기.html')).toContain('수강료-계산기.html')
  })
  it('referrer 를 싣지 않는다 · 정책 메타가 그보다 앞이다', () => {
    const d = miniDoc('<p>글</p>')
    expect(d).toContain('<meta name="referrer" content="no-referrer">')
    expect(d.indexOf('Content-Security-Policy')).toBeLessThan(d.indexOf('name="referrer"'))
  })
  it('바깥 자료를 부르는 html 을 알아본다 — 미니 창에서는 그 부분이 빠진다', () => {
    expect(miniOutside('<script src="https://cdn.example.com/chart.js"></script>')).toBe(true)
    expect(miniOutside("<link rel=stylesheet href='./style.css'>")).toBe(true)
    expect(miniOutside('<img src=logo.png>')).toBe(true)
    expect(miniOutside('<style>@import "fonts.css"; body { background:url(https://x.example/bg.png) }</style>')).toBe(true)
    expect(miniOutside('<style>body{background:url(data:image/png;base64,AAAA)}</style><img src="data:image/gif;base64,R0lG"><script>var u = new URL("https://a.example")</script>')).toBe(false)
    expect(miniOutside('<a href="https://example.com">링크</a><p>글</p>'), '링크는 자료가 아니다').toBe(false)
    expect(miniOutside('')).toBe(false)
  })
})

describe('끊긴 답 — 닫히지 않은 울타리', () => {
  it('닫혔으면 false · 안 닫혔으면 true', () => {
    expect(fenceOpen('글\n```steps\n[x] 하나\n[ ] 둘\n```\n끝')).toBe(false)
    expect(fenceOpen('글\n```steps\n[x] 하나\n[>] 둘')).toBe(true)
    expect(fenceOpen('```js\na\n```\n\n```chart\n가: 1')).toBe(true)
    expect(fenceOpen('')).toBe(false)
  })
  it('안쪽의 짧은 울타리 · 다른 글자 울타리는 닫는 줄이 아니다', () => {
    expect(fenceOpen('````md\n```steps\n[x] a\n```\n````')).toBe(false)
    expect(fenceOpen('````md\n```steps\n[x] a\n```')).toBe(true)
    expect(fenceOpen('~~~\n```\n~~~')).toBe(false)
    expect(fenceOpen('줄 가운데 ``` 는 울타리가 아니다')).toBe(false)
  })
  it('🔴 CSP 메타는 어느 스크립트보다 앞에 온다 — doctype 은 맨 앞에 남는다', () => {
    const d = miniDoc('<!DOCTYPE html>\n<script>early()</script><html><head><title>x</title></head><body>hi</body></html>')
    expect(d.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(d.indexOf('Content-Security-Policy')).toBeGreaterThan(0)
    expect(d.indexOf('Content-Security-Policy')).toBeLessThan(d.indexOf('<script>'))
    expect(d).toContain('<body>hi</body>')
  })
  it('doctype 이 없으면 맨 앞에 · 정책은 바깥을 전부 막는다', () => {
    const d = miniDoc('<p>글</p><script>x()</script>')
    expect(d.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(MINI_CSP).toContain("default-src 'none'")
    expect(MINI_CSP).not.toMatch(/https?:|\*|connect-src|'self'/)   // 바깥 주소 · 호스트 자신 어느 쪽도 열지 않는다
    expect(MINI_CSP).toContain("form-action 'none'")
  })
})

describe('봇에게 알려 주는 규칙', () => {
  it('세 블록의 이름이 글에 다 있다', () => { for (const l of VISUAL_LANGS) expect(VISUAL_RULES_MD).toContain('```' + l) })
  it('🔴 규칙에 적힌 예시가 실제로 읽힌다 — 규칙과 읽기가 어긋나지 않게', () => {
    const blocks = [...VISUAL_RULES_MD.matchAll(/```(steps|compare|chart)\n([\s\S]*?)\n```/g)]
    expect(blocks.map((m) => m[1]).sort()).toEqual(['chart', 'compare', 'steps'])
    for (const m of blocks) expect(parseVisual(m[1], m[2]), m[1]).not.toBeNull()
  })
  it('모든 세션이 받는 글이다 — 짧게 둔다', () => { expect(VISUAL_RULES_MD.length).toBeLessThan(1100) })
  it('어디에 쓰는지 · 개수 한도가 글에 있다 — 한도는 상수에서 온다', () => {
    expect(VISUAL_RULES_MD).toMatch(/채팅에서 읽는 답/)
    expect(VISUAL_RULES_MD).toMatch(/파일 · 편지 · 루틴 보고/)
    expect(VISUAL_RULES_MD).toContain(`2~${STEPS_MAX}개`); expect(VISUAL_RULES_MD).toContain(`2~${COMPARE_MAX}개`); expect(VISUAL_RULES_MD).toContain(`2~${CHART_MAX}개`)
    expect(VISUAL_RULES_MD).toMatch(/단위는 `unit:`/)
  })
})
