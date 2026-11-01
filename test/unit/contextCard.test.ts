import { describe, it, expect } from 'vitest'
import type { ChatItem } from '../../src/core/types'
import {
  CARD_MARK, CARD_TOKEN_CAP, maskSensitive, itemsSince, transcript, cardPrompt, parseCard, routineCard,
  type CardBody
} from '../../src/core/contextCard'

const u = (id: string, text: string, t = 1): ChatItem => ({ id, t, kind: 'user', text })
const a = (id: string, text: string, t = 1): ChatItem => ({ id, t, kind: 'assistant', text })

describe('maskSensitive', () => {
  it('주민번호·전화·계좌·키·긴 토큰을 가린다', () => {
    expect(maskSensitive('주민 900101-1234567')).toBe('주민 [가림]')
    expect(maskSensitive('010-1234-5678')).toBe('[가림]')
    expect(maskSensitive('01012345678')).toBe('[가림]')
    expect(maskSensitive('계좌 110-123-456789')).toBe('계좌 [가림]')
    expect(maskSensitive('sk-ant-abcdefghijklmnopqrstu')).toBe('[가림]')
    expect(maskSensitive('token: 0123456789abcdef0123456789abcdef')).toBe('token: [가림]')
  })
  it('날짜·버전·짧은 커밋 해시·전체 커밋 해시는 건드리지 않는다', () => {
    for (const s of ['2026-11-01', 'v206', 'd8809db', '2026-11-01_맥락-상황판', 'b5060cd8809db1234567890abcdef1234567890a', 'icon@2x.png'])
      expect(maskSensitive(s)).toBe(s)
  })
})

describe('itemsSince', () => {
  const items = [u('u1', 'a'), a('a1', 'b'), u('u2', 'c'), a('a2', 'd')]
  it('커서 뒤의 item 만 돌려준다', () => expect(itemsSince(items, 'u2').map((i) => i.id)).toEqual(['a2']))
  it('커서가 없거나 못 찾으면 전부', () => {
    expect(itemsSince(items).length).toBe(4)
    expect(itemsSince(items, 'zzz').length).toBe(4)
  })
})

describe('transcript', () => {
  it('사람·봇·도구 줄이 되고 thinking·todos·rewind 는 빠진다', () => {
    const items: ChatItem[] = [
      u('u1', '배포해 줘'), a('a1', '네'),
      { id: 't1', t: 1, kind: 'tool', name: 'Bash', summary: 'npm test' },
      { id: 't2', t: 1, kind: 'tool', name: 'Edit', summary: 'a.ts', isError: true },
      { id: 'k1', t: 1, kind: 'thinking', text: '비밀 생각' },
      { id: 'd1', t: 1, kind: 'todos', items: [] },
      { id: 'r1', t: 1, kind: 'rewind', from: 'u1' }
    ]
    const lines = transcript(items).split('\n')
    expect(lines).toEqual(['[사람] 배포해 줘', '[봇] 네', '[도구 Bash 성공 #t1] npm test', '[도구 Edit 오류 #t2] a.ts'])
  })
  it('4만 자 넘는 대화는 cap*2 안쪽으로 줄고 첫 줄이 «(앞 N줄 생략)»', () => {
    const items: ChatItem[] = Array.from({ length: 400 }, (_, i) => u(`u${i}`, `${i} ` + '가'.repeat(150)))
    expect(items.map((i) => (i as { text: string }).text).join('').length).toBeGreaterThan(CARD_TOKEN_CAP * 2)
    const out = transcript(items)
    expect(out.length).toBeLessThanOrEqual(CARD_TOKEN_CAP * 2)
    expect(out.split('\n')[0]).toMatch(/^\(앞 \d+줄 생략\)$/)
    expect(out).toContain('[사람] 399 ')
    expect(transcript(items, 1000).length).toBeLessThanOrEqual(2000)
  })
  it('짧은 대화는 그대로', () => expect(transcript([u('u1', 'hi')])).toBe('[사람] hi'))
})

describe('cardPrompt', () => {
  const prev: CardBody = { intent: '이전 의도', done: [], promised: [], ending: 'running', taskHint: '' }
  it('표지·금지문·정의가 든다', () => {
    const p = cardPrompt(null, '[사람] hi', { folder: '제품_FolderBot' })
    expect(p).toContain(CARD_MARK)
    expect(p).toContain('대화에 없는 것은 쓰지 말 것')
    expect(p).toContain('모르면 비울 것')
    for (const e of ['finished', 'claimed', 'cut', 'waiting_dave', 'running']) expect(p).toContain(e)
    expect(p).toContain('[사람] hi')
    expect(p).not.toContain('folder 칸')
  })
  it('지난 카드는 JSON 으로 들어간다', () => expect(cardPrompt(prev, 'x', { folder: 'f' })).toContain(JSON.stringify(prev)))
  it('후보가 있으면 folder 칸을 고르라고 한다', () => {
    const p = cardPrompt(null, 'x', { folder: 'f', candidates: [{ id: 'bot1', name: '이네이트' }] })
    expect(p).toContain('folder 칸')
    expect(p).toContain('bot1')
    expect(p).toContain('이네이트')
  })
})

describe('parseCard', () => {
  const body = { intent: '배포', done: [{ text: '빌드 끝', ev: [{ kind: 'file', ref: 'a/b.md' }] }], promised: ['내일 확인'], ending: 'finished', taskHint: '배포' }
  it('울타리와 군말을 견딘다', () => {
    const raw = '네, 결과입니다.\n```json\n' + JSON.stringify(body) + '\n```\n이상입니다.'
    expect(parseCard(raw)?.ending).toBe('finished')
    expect(parseCard('앞말 ' + JSON.stringify(body) + ' 뒷말')?.done[0].ev).toEqual([{ kind: 'file', ref: 'a/b.md' }])
    expect(parseCard(JSON.stringify(body))?.intent).toBe('배포')
  })
  it('JSON 이 아니면 null', () => { expect(parseCard('없음')).toBeNull(); expect(parseCard('{깨진')).toBeNull() })
  it('ending 이 다섯 값 밖이면 null', () => expect(parseCard(JSON.stringify({ ...body, ending: 'done' }))).toBeNull())
  it('근거 kind 가 넷 밖이면 그 근거만 버린다', () => {
    const r = parseCard(JSON.stringify({ ...body, done: [{ text: 'x', ev: [{ kind: 'url', ref: 'http://a' }, { kind: 'commit', ref: 'd8809db' }] }] }))
    expect(r?.done[0].ev).toEqual([{ kind: 'commit', ref: 'd8809db' }])
  })
  it('folder 는 있을 때만 싣는다', () => {
    expect(parseCard(JSON.stringify({ ...body, folder: 'bot1' }))?.folder).toBe('bot1')
    expect(parseCard(JSON.stringify(body))).not.toHaveProperty('folder')
  })
  it('모든 글 칸에 마스킹이 걸린다', () => {
    const r = parseCard(JSON.stringify({ intent: '전화 010-1234-5678', done: [{ text: '연락 010-1234-5678', ev: [] }], promised: ['010-1234-5678'], ending: 'cut', taskHint: '010-1234-5678' }))!
    expect(r.done[0].text).toBe('연락 [가림]')
    expect(r.intent).toBe('전화 [가림]'); expect(r.promised).toEqual(['[가림]']); expect(r.taskHint).toBe('[가림]')
  })
})

describe('routineCard', () => {
  const mk = (items: ChatItem[]) => routineCard({ id: 'r1', botId: 'b1', items, lastActivity: 99 }, '아침 점검', 'mac-mini', 1000)
  it('결과: ok → finished + 도구 근거', () => {
    const c = mk([u('u1', '실행'), a('a1', '점검 끝\n결과: ok')])
    expect(c.ending).toBe('finished')
    expect(c.done[0].ev).toEqual([{ kind: 'tool', ref: 'a1' }])
    expect(c.llm).toBe(false); expect(c.channel).toBe('routine'); expect(c.taskHint).toBe('루틴 · 아침 점검')
    expect(c.id).toBe('r1'); expect(c.sessionId).toBe('r1'); expect(c.botId).toBe('b1'); expect(c.machine).toBe('mac-mini')
    expect(c.cursor).toBe('a1'); expect(c.updatedAt).toBe(1000)
  })
  it('결과: fail — 이유 → cut + intent 에 이유', () => {
    const c = mk([a('a1', '시도\n결과: fail — 로그인 만료')])
    expect(c.ending).toBe('cut'); expect(c.intent).toContain('로그인 만료'); expect(c.llm).toBe(false)
  })
  it('결과 줄이 없으면 claimed', () => {
    const c = mk([a('a1', '끝났습니다')])
    expect(c.ending).toBe('claimed'); expect(c.done).toEqual([]); expect(c.taskHint).toBe('루틴 · 아침 점검')
  })
  it('봇 글이 없어도 카드는 만든다', () => {
    const c = mk([])
    expect(c.ending).toBe('claimed'); expect(c.cursor).toBe('')
  })
})
