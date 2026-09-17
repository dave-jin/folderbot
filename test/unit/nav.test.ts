import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { navHash, withHash } = require_('../../desktop/nav.js') as {
  navHash: (n: { botId?: string; sessionId?: string } | null) => string
  withHash: (url: string, hash: string) => string
}

/** 알림 → 그 대화로 (2026-09-17 Dave: «알람 버튼 클릭하면 해당 세션으로 이동해야 해») */
describe('navHash — 알림 한 건이 가리키는 화면', () => {
  it('세션이 있으면 폴더 + 세션', () => expect(navHash({ botId: 'b1', sessionId: 's9' })).toBe('bot=b1&s=s9'))
  it('세션이 없는 알림(로그인·할 일)은 폴더까지만', () => expect(navHash({ botId: 'orch' })).toBe('bot=orch'))
  it('폴더가 없으면 갈 곳이 없다', () => { expect(navHash({})).toBe(''); expect(navHash(null)).toBe('') })
  it('이상한 글자는 인코딩한다', () => expect(navHash({ botId: 'a b', sessionId: 'x&y' })).toBe('bot=a%20b&s=x%26y'))
})

describe('withHash — 첫 로드 URL 에 목적지를 싣는다 (토큰 리로드와 경합하지 않게)', () => {
  it('해시가 없는 URL 에는 # 로 연다', () => expect(withHash('http://mini:7373', 'bot=b1&s=s9')).toBe('http://mini:7373#bot=b1&s=s9'))
  it('🔴 이미 #token=… 이 있으면 & 로 잇는다 — 화면이 토큰만 떼고 bot·s 는 남긴다', () =>
    expect(withHash('http://127.0.0.1:7373/#token=abc', 'bot=b1&s=s9')).toBe('http://127.0.0.1:7373/#token=abc&bot=b1&s=s9'))
  it('앞의 # 는 하나만', () => expect(withHash('http://mini:7373', '#bot=b1')).toBe('http://mini:7373#bot=b1'))
  it('빈 목적지면 URL 그대로', () => { expect(withHash('http://mini:7373', '')).toBe('http://mini:7373'); expect(withHash('http://mini:7373/#token=abc', null as unknown as string)).toBe('http://mini:7373/#token=abc') })
  it('빈 해시(`#`)로 끝나면 바로 붙인다', () => expect(withHash('http://mini:7373/#', 'bot=b1')).toBe('http://mini:7373/#bot=b1'))
})
