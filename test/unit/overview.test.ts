import { describe, expect, it } from 'vitest'
import { buildOverview, goalOf, nearestDue, recentOf } from '../../src/core/overview'

describe('개요 — state.md 의 «현재 목표» 줄', () => {
  it('규약대로 적힌 줄을 그대로 읽는다', () => {
    const md = '# Project State\n\n> 마지막 갱신: 2026-11-13 15:42\n> 상태: 진행 중\n> 현재 목표: PRD v1.0 확정을 앞두고 Q2·Q5 답을 기다리는 중\n\n## 완료\n'
    expect(goalOf(md)).toBe('PRD v1.0 확정을 앞두고 Q2·Q5 답을 기다리는 중')
  })
  it('인용 표시가 없거나 굵게·불릿이어도 읽는다', () => {
    expect(goalOf('현재 목표: 가격표 확정')).toBe('가격표 확정')
    expect(goalOf('- **현재 목표**: 가격표 확정')).toBe('가격표 확정')
    expect(goalOf('> **현재 목표:** 가격표 확정')).toBe('가격표 확정')
    expect(goalOf('> 현재 목표： 전각 쌍점')).toBe('전각 쌍점')
  })
  it('줄이 없거나 비어 있으면 없다고 한다', () => {
    expect(goalOf('# Project State\n> 상태: 진행 중\n')).toBeUndefined()
    expect(goalOf('> 현재 목표:   \n')).toBeUndefined()
    expect(goalOf('')).toBeUndefined()
  })
  it('본문 깊은 곳의 인용은 집지 않는다(앞 40줄만)', () => {
    const md = Array.from({ length: 45 }, (_, i) => `줄 ${i}`).join('\n') + '\n> 현재 목표: 옛 기록의 인용\n'
    expect(goalOf(md)).toBeUndefined()
  })
  it('문장 가운데의 «현재 목표» 는 줄 머리가 아니라 안 읽는다', () => {
    expect(goalOf('여기서 현재 목표: 라고 쓴 문장')).toBeUndefined()
  })
})

describe('개요 — 가장 가까운 마감', () => {
  it('열린 정식 할 일 가운데 가장 이른 날', () => {
    expect(nearestDue([{ done: false, due: '2026-11-22' }, { done: false, due: '2026-11-18' }, { done: false }])).toBe('2026-11-18')
  })
  it('끝난 줄과 제안은 세지 않는다', () => {
    expect(nearestDue([{ done: true, due: '2026-11-01' }, { done: false, proposed: true, due: '2026-11-02' }, { done: false, due: '2026-11-30' }])).toBe('2026-11-30')
  })
  it('지난 마감도 그대로 돌려준다', () => {
    expect(nearestDue([{ done: false, due: '2026-10-18' }, { done: false, due: '2026-12-01' }])).toBe('2026-10-18')
  })
  it('마감이 없거나 모양이 틀리면 없다', () => {
    expect(nearestDue([{ done: false }, { done: false, due: '내일' }])).toBeUndefined()
    expect(nearestDue([])).toBeUndefined()
  })
})

describe('개요 — 봇이 최근 고친 파일', () => {
  const root = '/v/2. Area/제품_X'
  it('새것부터 셋 · 봇 폴더 기준 경로', () => {
    const r = recentOf([
      { t: 100, paths: [`${root}/a.md`] },
      { t: 300, paths: [`${root}/01_기획/c.md`, `${root}/d.md`] },
      { t: 200, paths: [`${root}/b.md`] }
    ], root)
    expect(r).toEqual([{ rel: 'd.md', at: 300 }, { rel: '01_기획/c.md', at: 300 }, { rel: 'b.md', at: 200 }])
  })
  it('같은 파일은 가장 최근 한 번만', () => {
    const r = recentOf([{ t: 100, paths: [`${root}/a.md`] }, { t: 200, paths: [`${root}/a.md`, `${root}/b.md`] }], root)
    expect(r).toEqual([{ rel: 'b.md', at: 200 }, { rel: 'a.md', at: 200 }])
  })
  it('상태 파일과 폴더 밖 파일은 뺀다', () => {
    const r = recentOf([{ t: 100, paths: [`${root}/state.md`, `${root}/todo.md`, `${root}/state-past.md`, '/Volumes/dev/repo/src/x.ts', `${root}-옆/y.md`, `${root}/하위/todo.md`] }], root)
    expect(r).toEqual([{ rel: '하위/todo.md', at: 100 }])
  })
  it('자모가 분리된(NFD) 한글 경로도 같은 폴더로 본다', () => {
    const nfd = `${root}/기획안.md`.normalize('NFD')
    expect(recentOf([{ t: 1, paths: [nfd] }], root.normalize('NFC'))).toEqual([{ rel: '기획안.md', at: 1 }])
  })
  it('없으면 빈 목록', () => {
    expect(recentOf([], root)).toEqual([])
  })
})

describe('개요 — 한 번에 짓기', () => {
  it('state.md 가 없으면 hasState 가 거짓이고 목표·시각이 없다', () => {
    const o = buildOverview({ stateMd: null, stateAt: 5, asks: 0, todos: [], chips: [], root: '/v/x' })
    expect(o).toEqual({ mine: { asks: 0, proposed: 0 }, recent: [], hasState: false })
  })
  it('있는 것을 모아 준다', () => {
    const o = buildOverview({
      stateMd: '> 현재 목표: 가격표 확정\n', stateAt: 1700,
      asks: 2,
      todos: [{ done: false, proposed: true }, { done: false, due: '2026-11-21' }, { done: true, proposed: true }],
      chips: [{ t: 9, paths: ['/v/x/기획안-v2.md'] }], root: '/v/x'
    })
    expect(o).toEqual({ goal: '가격표 확정', goalAt: 1700, mine: { asks: 2, proposed: 1, due: '2026-11-21' }, recent: [{ rel: '기획안-v2.md', at: 9 }], hasState: true })
  })
  it('state.md 는 있는데 목표 줄이 없으면 hasState 만 참', () => {
    const o = buildOverview({ stateMd: '# 메모\n', stateAt: 3, asks: 0, todos: [], chips: [], root: '/v/x' })
    expect(o.hasState).toBe(true); expect(o.goal).toBeUndefined(); expect(o.goalAt).toBe(3)
  })
})
