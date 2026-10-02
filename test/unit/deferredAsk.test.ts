import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * 미뤄진 질문이 둘 서지 않는다 (2026-10-02 Dave: «AskUserQuestion 을 두번씩 동일한 내용을 보낼때가 있어»).
 * ① 채팅을 보내면 남은 미뤄진 질문은 «채팅으로 답했다» 결과로 닫히고 글과 한 메시지로 간다
 * ② 같은 질문이 또 오면 앞의 미뤄진 카드는 걷힌다
 */
let ClaudeWorker: typeof import('../../src/host/session').ClaudeWorker
const made: { proc: { kill: () => void } }[] = []
beforeAll(async () => {
  process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-ask-'))
  process.env.FOLDERBOT_CLI_BIN = join(process.cwd(), 'test/fixtures/stub-claude.mjs')
  ;({ ClaudeWorker } = await import('../../src/host/session'))
})
afterAll(() => { for (const w of made) w.proc.kill() })

const Q = { questions: [{ question: '어느 쪽?', header: '고르기', options: [{ label: '가' }, { label: '나' }] }] }
const deferred = (id: string, input = Q) => JSON.stringify({ type: 'result', subtype: 'success', stop_reason: 'tool_deferred', deferred_tool_use: { id, name: 'AskUserQuestion', input } })
function worker() {
  const w = new ClaudeWorker({ cwd: tmpdir() } as never); made.push(w)
  const sent: unknown[] = []
  ;(w as unknown as { write: (o: unknown) => boolean }).write = (o) => { sent.push(o); return true }
  const feed = (line: string) => (w as unknown as { onLine: (s: string) => void }).onLine(line)
  return { w, sent, feed }
}

describe('미뤄진 질문 — 채팅으로 답하면 닫힌다 · 같은 질문은 하나만', () => {
  it('채팅을 보내면 남은 질문이 닫히고, 결과와 글이 한 메시지로 간다 · 다시 물어도 카드는 하나', () => {
    const { w, sent, feed } = worker()
    feed(deferred('toolu_A'))
    expect([...w.pending.keys()]).toEqual(['toolu_A'])
    expect(w.sendClosingAsks('가로 할게요')).toEqual(['toolu_A'])
    expect(w.pending.size).toBe(0)
    const m = sent[0] as { message: { content: { type: string; tool_use_id?: string; text?: string }[] } }
    expect(m.message.content.map((c) => c.type)).toEqual(['tool_result', 'text'])
    expect(m.message.content[0].tool_use_id).toBe('toolu_A'); expect(m.message.content[1].text).toBe('가로 할게요')
    feed(deferred('toolu_B'))
    expect([...w.pending.keys()]).toEqual(['toolu_B'])
  })
  it('같은 질문이 새 id 로 또 오면 앞의 미뤄진 카드는 걷는다 · 다른 질문은 둔다', () => {
    const { w, feed } = worker()
    feed(deferred('toolu_A')); feed(deferred('toolu_B'))
    expect([...w.pending.keys()]).toEqual(['toolu_B'])
    feed(deferred('toolu_C', { questions: [{ question: '다른 것?', header: 'x', options: [{ label: '예' }] }] }))
    expect([...w.pending.keys()].sort()).toEqual(['toolu_B', 'toolu_C'])
  })
  it('남은 질문이 없으면 보통 글로 보낸다', () => {
    const { w, sent } = worker()
    expect(w.sendClosingAsks('그냥 말')).toEqual([])
    expect((sent[0] as { message: { content: { type: string }[] } }).message.content.map((c) => c.type)).toEqual(['text'])
  })
})
