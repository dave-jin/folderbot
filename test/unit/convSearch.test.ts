import { describe, it, expect } from 'vitest'
import { searchConversations, snippetAround } from '../../src/core/convSearch'

const S = (id: string, name: string, t: number, texts: string[]) => ({ id, botId: 'b', name, lastActivity: t, items: texts.map((text, i) => ({ kind: i % 2 ? 'assistant' : 'user', text })) })

describe('searchConversations', () => {
  it('두 글자 미만은 안 찾는다', () => expect(searchConversations('ㄱ', [S('1', '가', 1, ['가나'])])).toEqual([]))
  it('이름 일치가 말 일치보다 위 · 같은 등급이면 최근 것이 위', () => {
    const r = searchConversations('예산', [S('old', '예산 정리', 1, []), S('txt', '잡담', 9, ['예산 얘기 좀 하자']), S('new', '2분기 예산', 5, [])])
    expect(r.map((h) => h.sessionId)).toEqual(['new', 'old', 'txt'])
    expect(r[2].where).toBe('text'); expect(r[2].snippet).toContain('예산 얘기')
  })
  it('NFD 이름도 NFC 질의로 걸린다 · 대소문자 무시', () => {
    const r = searchConversations('트레바리', [S('a', '트레바리'.normalize('NFD'), 1, [])]).concat(searchConversations('todo', [S('b', 'TODO 정리', 1, [])]))
    expect(r.map((h) => h.sessionId)).toEqual(['a', 'b'])
  })
  it('한 세션은 한 번만 · 도구 줄은 안 본다', () => {
    const s = { ...S('x', '이름', 1, ['키워드 하나', '키워드 둘']), items: [{ kind: 'tool', text: '키워드' }, { kind: 'user', text: '키워드 하나' }, { kind: 'assistant', text: '키워드 둘' }] }
    const r = searchConversations('키워드', [s])
    expect(r.length).toBe(1); expect(r[0].snippet).toBe('키워드 둘')
    expect(searchConversations('키워드', [{ ...s, items: [{ kind: 'tool', text: '키워드' }] }])).toEqual([])
  })
  it('토막은 앞뒤 40자, 넘치면 …', () => {
    const long = 'a'.repeat(100) + '표적' + 'b'.repeat(100)
    const sn = snippetAround(long, 100, 2)
    expect(sn.startsWith('…') && sn.endsWith('…')).toBe(true); expect(sn.length).toBe(2 + 2 + 80)
  })
  it('limit 을 지킨다', () => expect(searchConversations('말씀', Array.from({ length: 30 }, (_, i) => S(String(i), '말씀 ' + i, i, [])), 5).length).toBe(5))
})
