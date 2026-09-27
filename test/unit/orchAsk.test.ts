import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleMcp, mcpTools, resetOrchAskForTest } from '../../src/host/mcp'

/**
 * BH · orch_ask — 폴더 봇이 오케스트레이터에게 직접 요청한다 (2026-09-27 Dave).
 * 받는 쪽은 오케스트레이터로 고정 · 오케스트레이터 자신·위임 세션은 못 쓴다 · 세션마다 한 시간에 3건 · 요청 줄이 붙는다.
 */
const orch = { id: 'orch', name: '오케스트레이터', orchestrator: true }
const cfo = { id: 'b_cfo', name: '재무_CFO', rel: '3. Area/재무_CFO' }
const recs: Record<string, { id: string; botId: string; delegatedFrom?: string }> = {
  s_mine: { id: 's_mine', botId: 'b_cfo' },
  s_deleg: { id: 's_deleg', botId: 'b_cfo', delegatedFrom: 'orch' },
  s_orch: { id: 's_orch', botId: 'orch' }
}
let sendToBot: ReturnType<typeof vi.fn>
const host = () => ({ version: 't', registry: { bot: (id: string) => [orch, cfo].find((b) => b.id === id), bots: () => [orch, cfo] }, sessions: { get: (id: string) => recs[id] }, sendToBot } as never)
async function call(botId: string, sid: string, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean; rpcError?: string }> {
  let out = ''
  const res = { writeHead: () => res, end: (b: string) => { out = b } } as never
  await handleMcp(host(), botId, {} as never, res, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), sid)
  const j = JSON.parse(out)
  return { text: j.result?.content?.[0]?.text ?? '', isError: !!j.result?.isError, rpcError: j.error?.message }
}
beforeEach(() => { resetOrchAskForTest(); sendToBot = vi.fn(() => 's_new_orch') })

describe('orch_ask (BH)', () => {
  it('폴더 봇의 도구 목록에 orch_ask 는 있고 bot_send 는 여전히 없다', () => {
    const names = mcpTools('b_cfo').map((t) => t.name)
    expect(names).toContain('orch_ask')
    expect(names).not.toContain('bot_send')
    const t = mcpTools('b_cfo').find((x) => x.name === 'orch_ask')!
    expect((t.inputSchema as { required: string[] }).required).toEqual(['text'])
    expect(Object.keys((t.inputSchema as { properties: object }).properties)).toEqual(['text'])   // 받는 쪽을 고를 인자가 없다
    expect(mcpTools('orch').map((x) => x.name)).toContain('bot_send')
  })

  it('보내면 오케스트레이터에 «요청 ← 봇 이름» 세션으로, 본문 앞에 요청 줄이 붙는다', async () => {
    const r = await call('b_cfo', 's_mine', 'orch_ask', { text: '4. Resources 에 폴더 하나 만들어 줘' })
    expect(r.isError).toBe(false)
    expect(sendToBot).toHaveBeenCalledTimes(1)
    const [to, body, session, name, from] = sendToBot.mock.calls[0]
    expect(to.id).toBe('orch'); expect(session).toBeUndefined(); expect(name).toBe('요청 ← 재무_CFO'); expect(from).toBe('b_cfo')
    expect(body).toBe('[요청 ← 재무_CFO · b_cfo · s_mine]\n4. Resources 에 폴더 하나 만들어 줘')
  })

  it('오케스트레이터가 부르면 거절한다', async () => {
    const r = await call('orch', 's_orch', 'orch_ask', { text: 'x' })
    expect(r.isError).toBe(true); expect(r.text).toMatch(/오케스트레이터는 orch_ask 를 쓸 수 없어요/)
    expect(sendToBot).not.toHaveBeenCalled()
  })

  it('위임받은 세션에서는 거절한다 — 봇 ↔ 오케스트레이터 고리', async () => {
    const r = await call('b_cfo', 's_deleg', 'orch_ask', { text: 'x' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('위임받은 세션에서는 오케스트레이터에게 다시 요청할 수 없어요. 결과를 이 세션에 남기면 오케스트레이터가 읽어 갑니다.')
    expect(sendToBot).not.toHaveBeenCalled()
  })

  it('한 세션이 한 시간 안에 4번째로 부르면 거절하고 이유를 준다 · 다른 세션은 따로 센다', async () => {
    for (let i = 0; i < 3; i++) expect((await call('b_cfo', 's_mine', 'orch_ask', { text: `요청 ${i}` })).isError).toBe(false)
    const fourth = await call('b_cfo', 's_mine', 'orch_ask', { text: '요청 3' })
    expect(fourth.isError).toBe(true); expect(fourth.text).toMatch(/한 시간에 orch_ask 를 3건까지/)
    expect(sendToBot).toHaveBeenCalledTimes(3)
    recs.s_other = { id: 's_other', botId: 'b_cfo' }
    expect((await call('b_cfo', 's_other', 'orch_ask', { text: '다른 세션' })).isError).toBe(false)
  })

  it('한 시간이 지나면 다시 보낼 수 있다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 27, 18, 0))
    try {
      for (let i = 0; i < 3; i++) await call('b_cfo', 's_mine', 'orch_ask', { text: `요청 ${i}` })
      expect((await call('b_cfo', 's_mine', 'orch_ask', { text: 'x' })).isError).toBe(true)
      vi.setSystemTime(new Date(2026, 8, 27, 19, 0, 1))
      expect((await call('b_cfo', 's_mine', 'orch_ask', { text: 'x' })).isError).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('세션을 모르면(sid 없음) 답을 돌려받을 곳이 없으므로 거절한다', async () => {
    const r = await call('b_cfo', '', 'orch_ask', { text: 'x' })
    expect(r.isError).toBe(true); expect(sendToBot).not.toHaveBeenCalled()
  })
})
