import { describe, it, expect } from 'vitest'
import { agoShort, dueShort, finderGroups, lastReadOf, paraOf } from '../../src/core/folderFind'

/**
 * DE · 폴더봇 찾기 A안 (2026-10-19 Dave · 목업 03_디자인/2026-10-18_폴더찾기-PARA-목업)
 * 오케스트레이터 → «최근» 최대 5 → PARA 칸. 최근 = 사람이 세션을 마지막으로 연 시각(readAt).
 */
const bot = (id: string, rel: string, orchestrator = false) => ({ id, rel, section: rel.split('/')[0] === rel ? '' : rel.split('/')[0], orchestrator })

describe('DE · paraOf — rel 앞머리의 낱말로', () => {
  it('번호가 바뀌어도(2026-09-28 한 칸씩 내림) 낱말로 판정한다', () => {
    expect(paraOf('1. Projects/2026-10_해커톤')).toBe('P')
    expect(paraOf('2. Projects/옛 번호')).toBe('P')
    expect(paraOf('2. Area/제품_FolderBot')).toBe('A')
    expect(paraOf('3. Area/x')).toBe('A')
    expect(paraOf('3. Resources/x')).toBe('R')
    expect(paraOf('4. Archive/x')).toBe('X')
  })
  it('PARA 밖·관제는 null — «Areas of life» 같은 다른 낱말에 걸리지 않게 앞머리만 본다', () => {
    expect(paraOf('')).toBeNull()
    expect(paraOf('0. Inbox/x')).toBeNull()
    expect(paraOf('dev/projects-old')).toBeNull()
    expect(paraOf('Projectile/x')).toBeNull()
  })
})

describe('DE · lastReadOf', () => {
  it('세션 readAt 중 가장 큰 값 · 없으면 0', () => {
    expect(lastReadOf([{ readAt: 5 }, {}, { readAt: 9 }])).toBe(9)
    expect(lastReadOf([])).toBe(0)
    expect(lastReadOf(undefined)).toBe(0)
  })
})

describe('DE · finderGroups — A안 칸 나누기', () => {
  const bots = [
    bot('orch', '', true),
    bot('p1', '1. Projects/2026-10-31_자문'), bot('p2', '1. Projects/2026-09_강의'), bot('p3', '1. Projects/2026-10-17_해커톤'),
    bot('a1', '2. Area/제품_FolderBot'), bot('a2', '2. Area/재무_CFO'), bot('a3', '2. Area/개인_북극성'), bot('a4', '2. Area/글쓰기'),
    bot('a5', '2. Area/자문'), bot('a6', '2. Area/모임'),
    bot('r1', '3. Resources/브랜딩'), bot('x1', 'dev/코드'),
  ]
  const read: Record<string, number> = { a1: 100, p3: 90, a4: 80, a5: 70, p1: 60, a6: 50, a3: 40, orch: 999 }
  const g = finderGroups(bots, (id) => read[id] ?? 0)
  const keys = g.map((x) => x.key)
  it('관제 → 최근 → P → A → R → 그 밖 차례 · 빈 칸은 없다', () => {
    expect(keys).toEqual(['orch', 'recent', 'P', 'A', 'R', 'other'])
    expect(g[0].bots.map((b) => b.id)).toEqual(['orch'])
  })
  it('최근은 readAt 최신 순 다섯 · 오케스트레이터는 최근에 들지 않는다', () => {
    expect(g[1].bots.map((b) => b.id)).toEqual(['a1', 'p3', 'a4', 'a5', 'p1'])
  })
  it('최근에 든 폴더는 아래 칸에서 빠진다 — 두 번 나오지 않는다', () => {
    const all = g.flatMap((x) => x.bots.map((b) => b.id))
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(bots.length)
    expect(g.find((x) => x.key === 'P')!.bots.map((b) => b.id)).toEqual(['p2'])
  })
  it('칸 안은 최근 순, 한 번도 안 연 폴더는 그 뒤에 원래(레일) 순서', () => {
    expect(g.find((x) => x.key === 'A')!.bots.map((b) => b.id)).toEqual(['a6', 'a3', 'a2'])
  })
  it('칸 이름은 볼트의 실제 폴더명', () => {
    expect(g.find((x) => x.key === 'A')!.label).toBe('2. Area')
    expect(g.find((x) => x.key === 'other')!.label).toBe('그 밖')
  })
  it('아무것도 안 열었으면 «최근» 칸이 없다', () => {
    expect(finderGroups(bots, () => 0).map((x) => x.key)).toEqual(['orch', 'P', 'A', 'R', 'other'])
  })
})

describe('DE · 짧은 표기', () => {
  it('dueShort — 목업의 «10-17» · «09»', () => {
    expect(dueShort({ date: '2026-10-17', precision: 'day' })).toBe('10-17')
    expect(dueShort({ date: '2026-09', precision: 'month' })).toBe('09')
    expect(dueShort({ date: '2026', precision: 'year' })).toBe('2026')
    expect(dueShort(undefined)).toBe('')
  })
  it('agoShort — 방금 · N분 · N시간 · 어제 · 요일 · M/D', () => {
    const now = new Date(2026, 9, 19, 15, 0).getTime()   // 10/19 (월) 15:00
    expect(agoShort(now - 20_000, now)).toBe('방금')
    expect(agoShort(now - 5 * 60_000, now)).toBe('5분')
    expect(agoShort(now - 2 * 3_600_000, now)).toBe('2시간')
    expect(agoShort(new Date(2026, 9, 18, 23, 0).getTime(), now)).toBe('어제')
    expect(agoShort(new Date(2026, 9, 15, 9, 0).getTime(), now)).toBe('목')
    expect(agoShort(new Date(2026, 9, 2, 9, 0).getTime(), now)).toBe('10/2')
    expect(agoShort(0, now)).toBe('')
  })
})
