import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { FILL_BLOCK, MAX_ASK, cleanAsk, joinFill } from '../../src/core/deepAsk'

const require_ = createRequire(import.meta.url)
const { deepLinkHash } = require_('../../desktop/nav.js') as { deepLinkHash: (u: string) => string }
const q = (h: string) => Object.fromEntries(new URLSearchParams(h))

/** DQ · 딥링크로 «물을 말» 채우기 (2026-11-04 Alfred 요청 · Dave «지금 만들고 v211 배포») */
describe('DQ 딥링크 해석 — 셸', () => {
  it('봇만', () => expect(q(deepLinkHash('folderbot://bot/orch'))).toEqual({ bot: 'orch' }))
  it('봇 + 세션 (종전 그대로)', () => expect(q(deepLinkHash('folderbot://bot/orch?s=s_abc'))).toEqual({ bot: 'orch', s: 's_abc' }))
  it('ask — %20 · + · 한글 · 줄바꿈 모두 풀린다', () => {
    const u = `folderbot://bot/orch?ask=${encodeURIComponent('이번 주 마감\n뭐야?')}`
    expect(q(deepLinkHash(u))).toEqual({ bot: 'orch', ask: '이번 주 마감\n뭐야?' })
    expect(q(deepLinkHash('folderbot://bot/orch?ask=a+b%20c')).ask).toBe('a b c')
  })
  it('4,000자 넘는 ask 는 싣지 않는다 · 봇은 연다', () => expect(q(deepLinkHash(`folderbot://bot/orch?ask=${'가'.repeat(MAX_ASK + 1)}`))).toEqual({ bot: 'orch' }))
  it('모르는 모양은 빈 값', () => {
    expect(deepLinkHash('folderbot://settings')).toBe('')
    expect(deepLinkHash('https://bot/orch?ask=x')).toBe('')
    expect(deepLinkHash('엉뚱')).toBe('')
    expect(deepLinkHash('folderbot://bot/')).toBe('')
  })
})

describe('DQ 채울 글 — 화면', () => {
  it('제어 문자는 빼고 줄바꿈·탭은 둔다', () => expect(cleanAsk('a\u0007b\r\nc\td​')).toBe('ab\nc\td​'))
  it('비었거나 너무 길면 null', () => {
    expect(cleanAsk('  \n ')).toBeNull()
    expect(cleanAsk(undefined)).toBeNull()
    expect(cleanAsk('가'.repeat(MAX_ASK + 1))).toBeNull()
    expect(cleanAsk('가'.repeat(MAX_ASK))).toHaveLength(MAX_ASK)
  })
  it('빈 입력칸이면 그대로 · 쓰다 만 글은 덮지 않고 빈 줄 하나 뒤에', () => {
    expect(joinFill('', FILL_BLOCK + '질문')).toBe('질문')
    expect(joinFill('  \n', FILL_BLOCK + '질문')).toBe('질문')
    expect(joinFill('쓰던 글  \n', FILL_BLOCK + '질문')).toBe('쓰던 글\n\n질문')
  })
  it('다른 채우기(파일 봐 줘 등)는 종전대로 한 칸 띄움', () => {
    expect(joinFill('', 'a.md 파일 봐 줘: ')).toBe('a.md 파일 봐 줘: ')
    expect(joinFill('먼저', 'a.md')).toBe('먼저 a.md')
  })
})
