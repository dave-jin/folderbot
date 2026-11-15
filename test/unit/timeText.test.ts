import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ago, clock, dayClock, elapsedText } from '../../src/core/timeText'
import { agoShort } from '../../src/core/folderFind'
import { agoText } from '../../src/core/bridgeView'
import { askLabel } from '../../src/core/askMark'
import { taskTook } from '../../src/core/bgTasks'

/**
 * 🔴 **표기** (2026-11-15 · UX/UI 정리 «말» 걸음의 둘째 묶음) — 시각 · 지난 시각 · 경과 · Enter 글자.
 * 11/12 리뷰: 지난 시간을 적는 함수가 일곱 개라 «59분 전» 이 화면에 따라 «방금» 으로 나왔고, 시각은 12시간제와 24시간제가 섞였고,
 * 경과는 도는 동안만 «3m 06s» 였고, Enter 글자는 ⏎ · ↩ · ↵ · «엔터» · «Enter» 다섯 가지였다.
 */
const at = (h: number, m: number, d = 15): number => new Date(2026, 10, d, h, m, 0).getTime()
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000

describe('시각 — 24시간제 두 자리', () => {
  it('09:05 · 15:05 · 00:00', () => {
    expect(clock(at(9, 5))).toBe('09:05')
    expect(clock(at(15, 5))).toBe('15:05')
    expect(clock(at(0, 0))).toBe('00:00')
    expect(dayClock(at(15, 5, 9))).toBe('11/9 15:05')
  })
})

describe('지난 시각 — 한 규칙', () => {
  const now = at(15, 0)
  it('1분 미만만 «방금» · 그 위는 내림', () => {
    expect(ago(now - 59_000, now)).toBe('방금')
    expect(ago(now - MIN, now)).toBe('1분 전')
    expect(ago(now - (59 * MIN + 59_000), now)).toBe('59분 전')   // 🔴 «방금» 도 «1시간 전» 도 아니다
    expect(ago(now - HOUR, now)).toBe('1시간 전')
    expect(ago(now - (23 * HOUR + 59 * MIN), now)).toBe('23시간 전')
    expect(ago(now - DAY, now)).toBe('1일 전')
    expect(ago(now - 3 * DAY - HOUR, now)).toBe('3일 전')
  })
  it('앞날(시계가 어긋난 값)은 «방금»', () => { expect(ago(now + 5 * MIN, now)).toBe('방금') })
  it('좁은 자리는 «전» 을 뺀다 — «방금» 은 그대로', () => {
    expect(ago(now - 3 * MIN, now, { short: true })).toBe('3분')
    expect(ago(now - 2 * HOUR, now, { short: true })).toBe('2시간')
    expect(ago(now - 3 * DAY, now, { short: true })).toBe('3일')
    expect(ago(now - 10_000, now, { short: true })).toBe('방금')
  })
  it('달력으로 적기 — 오늘은 분·시간 · 어제 · 요일(이레 안) · 날짜', () => {
    const o = { far: 'date' as const }
    expect(ago(at(14, 30), now, o)).toBe('30분 전')
    expect(ago(at(9, 0), now, o)).toBe('6시간 전')
    expect(ago(at(23, 50, 14), at(0, 10, 15), o)).toBe('어제')      // 자정을 넘겼으면 20분 전이어도 어제
    expect(ago(at(15, 0, 12), now, o)).toBe('목')                  // 2026-11-12 는 목요일
    expect(ago(at(15, 0, 1), now, o)).toBe('11/1')
  })
  it('화면들이 같은 규칙을 쓴다 — 찾기 창 · 연결 · 바깥 질문 줄', () => {
    expect(agoShort(now - 59 * MIN - 30_000, now)).toBe('59분')
    expect(agoText(now - 59 * MIN - 30_000, now)).toBe('59분')
    expect(askLabel({ state: 'done', by: '상대', doneAt: now - 3 * MIN } as never, now)).toBe('답함 · 3분 전')
    expect(askLabel({ state: 'done', by: '상대', doneAt: now - 20_000 } as never, now)).toBe('답함 · 방금')
  })
})

describe('경과 — 한글 단위 · 도는 동안과 끝난 뒤가 같은 꼴', () => {
  it('7초 · 3분 6초 · 1시간 5분', () => {
    expect(elapsedText(0)).toBe('0초')
    expect(elapsedText(7_900)).toBe('7초')
    expect(elapsedText(3 * MIN + 6_000)).toBe('3분 6초')
    expect(elapsedText(HOUR + 5 * MIN + 30_000)).toBe('1시간 5분')
    expect(elapsedText(-5)).toBe('0초')
  })
  it('뒤에서 도는 일의 걸린 시간도 같은 함수다(1초 미만만 따로)', () => {
    expect(taskTook({ startedAt: 0, endedAt: 500 }, 1000)).toBe('1초 미만')
    expect(taskTook({ startedAt: 0, endedAt: 65_000 }, 0)).toBe('1분 5초')
  })
})

describe('화면 코드가 저마다 짓지 않는다', () => {
  const CLIENT = resolve(__dirname, '../../src/client')
  /** 주석을 걷는다 */
  const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  const files = readdirSync(CLIENT).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ f, s: code(readFileSync(join(CLIENT, f), 'utf8')) }))
  it('12시간제를 부르는 꼴이 없다 — `hour: \'numeric\'` · `hour12` 없는 toLocaleTimeString · «오전/오후» 를 붙이는 식', () => {
    const bad: string[] = []
    for (const { f, s } of files) {
      if (/hour: 'numeric'/.test(s)) bad.push(`${f}: hour: 'numeric'`)
      for (const m of s.matchAll(/toLocale(?:Time)?String\([^)]*\)/g)) if (/hour/.test(m[0]) && !/hour12: false/.test(m[0])) bad.push(`${f}: ${m[0]}`)
      if (/toLocaleString\('ko-KR'\)/.test(s)) bad.push(`${f}: toLocaleString('ko-KR') — 시각이 12시간제로 나온다`)
      if (/\? '오전' : '오후'/.test(s)) bad.push(`${f}: 오전/오후`)
    }
    expect(bad, bad.join('\n')).toEqual([])
  })
  it('지난 시각 · 경과를 직접 짓는 식이 없다 — `분 전` · `시간 전` 템플릿과 `m … s` 경과', () => {
    const bad: string[] = []
    for (const { f, s } of files) {
      if (/\}분 전`|\}시간 전`/.test(s)) bad.push(`${f}: «N분 전» 을 직접 짓는다 — core/timeText.ago 를 쓴다`)
      if (/\}m \$\{[^`]*\}s`|\}h \$\{[^`]*\}m`/.test(s)) bad.push(`${f}: 영어 단위 경과 — core/timeText.elapsedText 를 쓴다`)
    }
    expect(bad, bad.join('\n')).toEqual([])
  })
  it('Enter 글자는 ⏎ 하나다 — ↵ 는 없고, ↩ 는 편지의 «답장» 표식(Bridges)으로만', () => {
    const bad: string[] = []
    for (const { f, s } of files) {
      if (s.includes('↵')) bad.push(`${f}: ↵`)
      if (s.includes('↩') && f !== 'Bridges.tsx') bad.push(`${f}: ↩`)
      if (/엔터|\(Enter\)/.test(s)) bad.push(`${f}: «엔터» · «(Enter)»`)
    }
    expect(bad, bad.join('\n')).toEqual([])
    const br = files.find((x) => x.f === 'Bridges.tsx')!.s
    expect([...br.matchAll(/↩/g)].length, 'Bridges 의 ↩ 는 답장 표식 두 곳').toBe(2)
    expect(br).not.toMatch(/⌘↩|⌘↵/)
  })
})
