import { describe, it, expect } from 'vitest'
import { type AkFile, type AkLedger, dueCandidates, emptyLedger, planSync, pullRemote, remoteDesc } from '../../src/core/akiflowSync'
import { asksTodo, lastHumanText, parseTodo, setMetaLine, splitMeta, staleProposal } from '../../src/core/todo'
import { bareDayAsk, dueCandidate } from '../../src/core/due'
import { botDueChip } from '../../src/core/botName'
import type { ChatItem } from '../../src/core/types'

/** 10/16 기획안의 남은 것 — 제안 날짜·접기 · 정식 줄 예외 · 마감 후보 · 맨 숫자 묻기 · 레일 칩 · Akiflow 다시 열기·설명 */
const T = new Date(2026, 9, 16, 10)
const NOW = T.getTime()
const VAULT = '/Users/dave/Library/CloudStorage/Dropbox/PARA'
const file = (rel: string, md: string): AkFile => ({ rel, name: rel.split('/').pop()!, items: parseTodo(md) })
const live = (l: Partial<AkLedger>): AkLedger => ({ ...emptyLedger(), mode: 'live', scanned: true, startedAt: 1, ...l })

describe('CK-3 · 제안 날짜와 7일 접기', () => {
  it('제안 표식에 날짜를 읽고 쓴다 · 정식이 되면 날짜도 지운다', () => {
    expect(splitMeta('x <!-- bot:proposed 2026-10-09 -->').meta).toEqual({ by: 'bot', proposed: true, proposedAt: '2026-10-09' })
    expect(setMetaLine('- [ ] 제안 <!-- bot:proposed 2026-10-09 -->', 0, { proposed: false })).toBe('- [ ] 제안 <!-- bot -->')
    expect(setMetaLine('- [ ] 제안 <!-- bot:proposed 2026-10-09 -->', 0, { due: '2026-10-20' })).toBe('- [ ] 제안 📅 2026-10-20 <!-- bot:proposed 2026-10-09 -->')
  })
  it('7일 지난 제안만 접는다 · 날짜 없는 옛 제안은 안 접는다', () => {
    expect(staleProposal({ proposed: true, proposedAt: '2026-10-09' }, T)).toBe(true)
    expect(staleProposal({ proposed: true, proposedAt: '2026-10-10' }, T)).toBe(false)
    expect(staleProposal({ proposed: true }, T)).toBe(false)
    expect(staleProposal({ proposedAt: '2026-01-01' }, T)).toBe(false)
  })
})

describe('CK-3 · 규칙 2의 예외 — 사람이 «할 일로 적어 줘» 한 턴만 정식', () => {
  it.each([['이거 할 일로 적어 줘', true], ['todo 에 추가해', true], ['할일 정리해 줘', true], ['체크리스트에 넣어 둬', true], ['todo.md 에 넣어 줘', true], ['todo.md에 추가해', true],
    ['배포해 줘', false], ['할 일 마감 기능을 개발해 줘', false], ['태스크 매니저 비교해 봐', false]])('%s → %s', (t, want) => { expect(asksTodo(t)).toBe(want) })
  it('마지막 사람 말', () => {
    const items = [{ id: 'u', t: 1, kind: 'user', text: '앞' }, { id: 'a', t: 2, kind: 'assistant', text: '답' }, { id: 'u2', t: 3, kind: 'user', text: '뒤' }, { id: 's', t: 4, kind: 'system', text: 's' }] as ChatItem[]
    expect(lastHumanText(items)).toBe('뒤'); expect(lastHumanText([])).toBe('')
  })
})

describe('CK-1 · 마감 후보 · 맨 숫자 · 레일 칩', () => {
  it('«까지·마감·제출» 이 붙은 날짜만 — 기록 날짜(«10/12 재현»)는 아니다', () => {
    expect(dueCandidate('PDF 를 10/20 까지 보내기', T)).toEqual({ date: '2026-10-20', quote: '10/20 까지' })
    expect(dueCandidate('마감: 11월 3일(화) 제출', T)).toEqual({ date: '2026-11-03', quote: '11월 3일(화) 제출' })
    expect(dueCandidate('신청서 2026-10-24 마감', T)?.date).toBe('2026-10-24')
    expect(dueCandidate('10/12 재현 · 오케스트레이터 제안', T)).toBeNull()
    expect(dueCandidate('10/14 까지 보내기', T)?.date).toBe('2026-10-14')     // 지난 마감도 후보(«2일 지남»)
    expect(dueCandidate('1/10 마감', T)?.date).toBe('2027-01-10')              // 석 달 전 날짜는 내년으로
  })
  it('마감 없는 열린 정식 줄만 · «아님» 한 줄은 다시 안 묻는다', () => {
    const f = file('2. Area/x', '- [ ] 보내기: 10/20 까지\n- [ ] 이미: 10/20 까지 📅 2026-10-21\n- [ ] 제안: 10/20 까지 <!-- bot:proposed -->\n- [x] 끝: 10/20 까지\n- [ ] 아님: 10/22 마감\n')
    expect(dueCandidates([f], ['2. Area/x\n아님'], T).map((c) => [c.title, c.date])).toEqual([['보내기', '2026-10-20']])
  })
  it('끝이 맨 숫자면 묻는다 · 날짜 말이면 안 묻는다', () => {
    expect(bareDayAsk('회의실 예약 20')).toBe(20)
    expect(bareDayAsk('강의안 20일')).toBeNull()
    expect(bareDayAsk('강의안 10/20')).toBeNull()
    expect(bareDayAsk('20')).toBeNull()
    expect(bareDayAsk('예약 45')).toBeNull()
  })
  it('레일 칩 — 줄 마감이 폴더 마감보다 이르면 그 날', () => {
    expect(botDueChip({ due: { date: '2026-10-31', precision: 'day' }, todoDue: '2026-10-18' }, T)).toMatchObject({ text: '10/18 D-2', line: true })
    expect(botDueChip({ due: { date: '2026-10-17', precision: 'day' }, todoDue: '2026-10-18' }, T)).toMatchObject({ text: '10/17 D-1', line: false })
    expect(botDueChip({ todoDue: '2026-10-15' }, T)).toMatchObject({ tone: 'past', line: true })
    expect(botDueChip({}, T)).toBeNull()
  })
})

describe('CK-2 · Akiflow 다시 열기 · 설명', () => {
  it('Akiflow 설명 → todo 설명: <br /> · 출처 줄 떼기', () => {
    expect(remoteDesc('📍 출처: [x](u) · 10/16<br />설명 하나<br />둘')).toBe('설명 하나 · 둘')
    expect(remoteDesc('그냥 설명 &amp; 끝')).toBe('그냥 설명 & 끝')
    // 리뷰 10/16 — 사람이 쓴 <파일명> 은 지우지 않고, 문단 끝도 줄로 읽고, 엔티티는 한 번만 푼다
    expect(remoteDesc('A <-> B · <파일명> 확인')).toBe('A <-> B · <파일명> 확인')
    expect(remoteDesc('<p>📍 출처: [x](u) · 10/16</p><p>본문</p>')).toBe('본문')
    expect(remoteDesc('&amp;lt; 그대로')).toBe('&lt; 그대로')
  })
  it('🔴 todo.md 에서 다시 연 줄 — 끝난 옛 짝 대신 새 태스크(Akiflow MCP 는 완료를 못 되돌린다)', () => {
    const f = file('2. Area/x', '- [ ] 다시 할 일: 설명 <!-- ak:OLD -->\n')
    const { plan } = planSync([f], live({ pairs: { OLD: { rel: '2. Area/x', title: '다시 할 일', desc: '설명', done: true, due: null, bot: false, syncedAt: 1 } } }), { vaultAbs: VAULT, now: NOW })
    expect(plan.ops).toHaveLength(1)
    expect(plan.ops[0]).toMatchObject({ op: 'create', title: '다시 할 일', replaces: 'OLD' }); expect(plan.ops[0].key).toMatch(/\n↺OLD$/)
  })
  it('Akiflow 에서 다시 연 태스크 → todo.md 줄도 다시 연다', () => {
    const f = file('2. Area/x', '## 완료\n- [x] 끝낸 일 <!-- ak:A1 -->\n')
    const l = live({ pairs: { A1: { rel: '2. Area/x', title: '끝낸 일', desc: '', done: true, due: null, bot: false, syncedAt: 1 } } })
    const { fixes, ledger } = pullRemote([f], l, [{ id: 'A1', title: '끝낸 일', done: false }], NOW)
    expect(fixes).toEqual([{ kind: 'undone', rel: '2. Area/x', akId: 'A1' }]); expect(ledger.pairs.A1.done).toBe(false)
  })
  it('설명 — Akiflow 만 바뀌면 내려오고, 양쪽이 다르게 바뀌면 카드', () => {
    const base = { rel: '2. Area/x', title: '일', desc: '처음', done: false, due: null, bot: false, syncedAt: 1 }
    const same = file('2. Area/x', '- [ ] 일: 처음 <!-- ak:A1 -->\n')
    const r1 = pullRemote([same], live({ pairs: { A1: base } }), [{ id: 'A1', title: '일', done: false, description: '📍 출처: x · 10/16<br />Akiflow 에서 고침' }], NOW)
    expect(r1.fixes).toEqual([{ kind: 'desc', rel: '2. Area/x', akId: 'A1', desc: 'Akiflow 에서 고침' }])
    const both = file('2. Area/x', '- [ ] 일: 여기서 고침 <!-- ak:A1 -->\n')
    const r2 = pullRemote([both], live({ pairs: { A1: base } }), [{ id: 'A1', title: '일', done: false, description: '📍 출처: x · 10/16<br />Akiflow 에서 고침' }], NOW)
    expect(r2.fixes).toEqual([]); expect(r2.ledger.conflicts).toMatchObject([{ field: 'desc', local: '여기서 고침', remote: 'Akiflow 에서 고침' }])
    // 카드가 걸린 동안 설명은 밀지 않는다
    const { plan } = planSync([both], r2.ledger, { vaultAbs: VAULT, now: NOW })
    expect(plan.ops.filter((o) => o.op === 'update' && 'description' in o && o.description)).toHaveLength(0)
  })
  it('새 태스크가 내려올 때 설명도 같이', () => {
    const f = file('2. Area/x', '- [ ] 있던 일\n')
    const { fixes } = pullRemote([f], live({ projects: { '2. Area/x': 'P1' } }), [{ id: 'N1', title: '새 일', done: false, project_id: 'P1', description: '메모' }], NOW, { allowAdd: true })
    expect(fixes).toEqual([{ kind: 'add', rel: '2. Area/x', akId: 'N1', title: '새 일', due: null, desc: '메모' }])
  })
})
