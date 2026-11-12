import { describe, it, expect } from 'vitest'
import { buildRows } from '../../src/core/chatRows'
import type { ChatItem } from '../../src/core/types'

const u = (id: string, text = '해 줘'): ChatItem => ({ id, t: 1, kind: 'user', text })
const a = (id: string, text = '했어요', streaming?: boolean): ChatItem => ({ id, t: 2, kind: 'assistant', text, ...(streaming ? { streaming: true } : {}) } as ChatItem)
const tool = (id: string): ChatItem => ({ id, t: 2, kind: 'tool', name: 'Write', summary: 'x', input: {} } as ChatItem)
const f = (id: string, paths: string[]): ChatItem => ({ id, t: 2, kind: 'files', paths } as ChatItem)
const kinds = (rows: ReturnType<typeof buildRows>) => rows.map((r) => (r.k === 'group' ? 'group' : r.k === 'prior' ? 'prior' : r.it.kind))

describe('buildRows — 손댄 파일 칩은 답 아래로', () => {
  it('답보다 먼저 온 칩 줄이 답 뒤로 내려간다', () => {
    const rows = buildRows([u('u1'), tool('t1'), f('f1', ['a.md']), a('a1')], null)
    expect(kinds(rows)).toEqual(['user', 'group', 'assistant', 'files'])
  })
  it('같은 파일은 한 번만', () => {
    const rows = buildRows([u('u1'), f('f1', ['a.md', 'b.md']), f('f2', ['a.md']), a('a1')], null)
    const files = rows.find((r) => r.k === 'item' && r.it.kind === 'files')
    expect(files && files.k === 'item' && files.it.kind === 'files' && files.it.paths).toEqual(['a.md', 'b.md'])
  })
  it('답 없이 끝난 턴이면 맨 끝에 — 쓴 파일이 아예 안 보이면 안 된다', () => {
    expect(kinds(buildRows([u('u1'), tool('t1'), f('f1', ['a.md'])], null))).toEqual(['user', 'group', 'files'])
  })
  it('아직 흐르는 답 뒤에는 안 붙인다 (다 온 뒤에)', () => {
    expect(kinds(buildRows([u('u1'), f('f1', ['a.md']), a('a1', '쓰는 중', true)], null))).toEqual(['user', 'assistant', 'files'])
  })
  it('턴이 둘이면 각 답 아래로 나뉜다', () => {
    expect(kinds(buildRows([u('u1'), f('f1', ['a.md']), a('a1'), u('u2'), f('f2', ['b.md']), a('a2')], null)))
      .toEqual(['user', 'assistant', 'files', 'user', 'assistant', 'files'])
  })
})

describe('CL-1 B · 되감기로 빠진 턴은 «이전 시도» 한 줄로 접힌다', () => {
  it('멈춘 사람 말부터 되감기 표시 줄 앞까지 · 고친 파일은 모아 둔다 · 새 말은 그 뒤에', () => {
    const rw: ChatItem = { id: 'rw', t: 3, kind: 'rewind', from: 'u2' }
    const rows = buildRows([u('u1'), a('a1'), u('u2', '멈춘 말'), tool('t1'), f('f1', ['/v/x.md']), a('a2', '반쯤'), rw, u('u3', '고친 말'), a('a3')], null)
    expect(kinds(rows)).toEqual(['user', 'assistant', 'prior', 'user', 'assistant'])
    const p = rows[2] as Extract<typeof rows[number], { k: 'prior' }>
    expect(p.items.map((x) => x.id)).toEqual(['u2', 't1', 'f1', 'a2'])
    expect(p.files).toEqual(['/v/x.md'])
  })
  it('표시 줄이 가리키는 말이 없으면 그냥 지나간다(표시 줄은 안 그린다)', () => {
    const rows = buildRows([u('u1'), a('a1'), { id: 'rw', t: 3, kind: 'rewind', from: 'zz' } as ChatItem, u('u3')], null)
    expect(kinds(rows)).toEqual(['user', 'assistant', 'user'])
  })
})


describe('답한 질문은 묶음 밖 제 줄로 (2026-11-12)', () => {
  const ask = (id: string, result?: string, isError?: boolean): ChatItem => ({ id, t: 5, kind: 'tool', name: 'AskUserQuestion', summary: '', input: { questions: [{ question: '무엇으로 할까요?', header: '하나', options: [{ label: '가 안' }, { label: '나 안' }] }] }, result, isError })
  const read = (id: string): ChatItem => ({ id, t: 4, kind: 'tool', name: 'Read', summary: 'a.md', result: 'ok' })
  it('답이 읽히면 도구 묶음을 끊고 제 줄이 된다 — 앞뒤 도구는 따로 묶인다', () => {
    const rows = buildRows([read('r1'), ask('q1', 'Your questions have been answered: "무엇으로 할까요?"="가 안". You can now continue with these answers in mind.'), read('r2')], null)
    expect(rows.map((r) => (r.k === 'group' ? `g${r.items.length}` : r.k === 'item' ? r.it.id : r.k))).toEqual(['g1', 'q1', 'g1'])
  })
  it('아직 답 전 · 취소 · 못 읽는 답은 종전대로 묶음 안', () => {
    for (const q of [ask('q1'), ask('q1', '사용자가 질문을 취소했습니다.', true), ask('q1', '{"무엇":"가 안"}')]) {
      const rows = buildRows([read('r1'), q, read('r2')], null)
      expect(rows.map((r) => (r.k === 'group' ? `g${r.items.length}` : r.k))).toEqual(['g3'])
    }
  })
  it('요약이 선 질문의 되읊는 사람 줄은 감춘다 — 다른 말 · 고친 글이 붙은 줄은 그대로', () => {
    const ans = 'Your questions have been answered: "무엇으로 할까요?"="가 안". You can now continue with these answers in mind.'
    const usr = (id: string, text: string): ChatItem => ({ id, t: 6, kind: 'user', text })
    const ids = (items: ChatItem[]) => buildRows(items, null).map((r) => (r.k === 'item' ? r.it.id : r.k))
    expect(ids([ask('q1', ans), usr('e1', '가 안'), usr('u2', '가 안')])).toEqual(['q1', 'u2'])   // 바로 뒤 한 줄만
    expect(ids([ask('q1', ans), usr('e1', '가 안\n\n고친 글:\n전문')])).toEqual(['q1', 'e1'])
    expect(ids([ask('q1', ans), usr('u1', '다른 말'), usr('u2', '가 안')])).toEqual(['q1', 'u1', 'u2'])
    expect(ids([usr('u0', '가 안')])).toEqual(['u0'])
  })
  it('읽는 순서 그대로 — 질문 앞의 답 글 · 내가 답한 것 · 그 뒤의 답 글', () => {
    // 실 CLI 는 글 블록을 닫고 질문을 내고, 답을 받은 뒤 새 글을 낸다. 요약이 제 자리(질문이 있던 곳)에 서야 «무엇을 답했고 그래서 어떻게 됐나» 가 위에서 아래로 읽힌다
    const ans = 'Your questions have been answered: "무엇으로 할까요?"="가 안". You can now continue with these answers in mind.'
    const rows = buildRows([u('u1'), a('a1', '먼저 여쭙겠습니다'), ask('q1', ans), { id: 'e1', t: 6, kind: 'user', text: '가 안' } as ChatItem, a('a2', '가 안으로 진행합니다')], null)
    expect(rows.map((r) => (r.k === 'item' ? r.it.id : r.k))).toEqual(['u1', 'a1', 'q1', 'a2'])
  })
})
