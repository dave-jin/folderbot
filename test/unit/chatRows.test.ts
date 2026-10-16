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

