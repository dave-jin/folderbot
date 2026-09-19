import { describe, expect, it } from 'vitest'
import { emptyTurnNote, isModelRejected, mapCodex, supportedFlags, type CodexCtx } from '../../src/core/codexMap'

const ctx = (): CodexCtx => ({ sid: null, text: '', unknown: new Set() })
const texts = (lines: unknown[]): string[] => lines.flatMap((l) => {
  const x = l as { type: string; message?: { content?: { text?: string }[] }; event?: { delta?: { text?: string; thinking?: string } } }
  if (x.type === 'assistant' && x.message?.content?.[0]?.text) return [x.message.content[0].text]
  if (x.type === 'stream_event' && x.event?.delta?.text) return [x.event.delta.text]
  return []
})

describe('Codex 줄 옮기기 — 판마다 모양이 다르다', () => {
  // ① 옛 EventMsg 모양
  it('EventMsg — agent_message 를 답으로 읽는다', () => {
    const c = ctx()
    const out = mapCodex({ id: '0', msg: { type: 'agent_message', message: '안녕하세요' } }, c)
    expect(texts(out)).toEqual(['안녕하세요'])
    expect(c.text).toBe('안녕하세요')
  })

  it('EventMsg — 조각(delta)이 쌓인다', () => {
    const c = ctx()
    mapCodex({ msg: { type: 'agent_message_delta', delta: '안' } }, c)
    mapCodex({ msg: { type: 'agent_message_delta', delta: '녕' } }, c)
    expect(c.text).toBe('안녕')
  })

  /**
   * ② 🔴 새 item/turn 모양 (codex-cli 0.4x+) — **이게 «답이 안 오던» 자리다.**
   *    글자가 `item.text` 에 있는데 우리는 `msg.text` 만 봤다.
   */
  it('item.completed — item.text 에서 답을 꺼낸다', () => {
    const c = ctx()
    const out = mapCodex({ type: 'item.completed', item: { id: 'item_0', item_type: 'assistant_message', text: '새 판의 답' } }, c)
    expect(texts(out)).toEqual(['새 판의 답'])
  })

  it('thread.started 에서 세션 id 를 집는다', () => {
    const c = ctx()
    mapCodex({ type: 'thread.started', thread_id: 'th_123' }, c)
    expect(c.sid).toBe('th_123')
  })

  it('command_execution 은 도구 줄이 된다', () => {
    const c = ctx()
    const begin = mapCodex({ type: 'item.started', item: { id: 'i1', item_type: 'command_execution', command: 'ls -al' } }, c)
    expect((begin[0] as unknown as { message: { content: { name: string }[] } }).message.content[0].name).toBe('Bash')
    const end = mapCodex({ type: 'item.completed', item: { id: 'i1', item_type: 'command_execution', exit_code: 0, aggregated_output: 'a\nb' } }, c)
    expect((end[0] as unknown as { message: { content: { content: string }[] } }).message.content[0].content).toBe('a\nb')
  })

  it('turn.completed 의 사용량을 읽는다', () => {
    const c = ctx()
    const out = mapCodex({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 3 } }, c)
    expect((out[0] as unknown as { usage: { input_tokens: number } }).usage.input_tokens).toBe(10)
  })

  // ⛔ 모르는 줄을 버리지 않는다 — 이름을 모아 두었다가 «답 없는 턴» 의 이유로 쓴다
  it('모르는 줄은 이름을 남긴다', () => {
    const c = ctx()
    const out = mapCodex({ type: 'something_new' }, c)
    expect([...c.unknown]).toEqual(['something_new'])
    expect((out[0] as unknown as { subtype: string }).subtype).toBe('activity')
  })

  it('turn.failed 는 이유를 모은다', () => {
    const c = ctx()
    mapCodex({ type: 'turn.failed', error: { message: '한도 초과' } }, c)
    expect([...c.unknown][0]).toContain('한도 초과')
  })
})

describe('답 없이 끝난 턴 — 이유를 답 자리에 적는다', () => {
  it('끝난 코드 · CLI 말 · 받은 줄 이름이 들어간다', () => {
    const n = emptyTurnNote({ code: 1, stderr: 'error: unknown flag --skip-git-repo-check', unknown: new Set(['thread.started', 'item.started']) })
    expect(n).toContain('답 없이')
    expect(n).toContain('끝난 코드 1')
    expect(n).toContain('unknown flag')
    expect(n).toContain('thread.started')
  })

  it('아무 정보가 없어도 빈 말을 하지 않는다', () => {
    expect(emptyTurnNote({ code: 0, stderr: '', unknown: new Set() })).toContain('연결 진단')
  })
})

describe('쓸 수 있는 깃발만 넘긴다', () => {
  const help = 'Usage: codex exec [OPTIONS]\n  --json  Print events\n  --model <M>\n'
  it('도움말에 있는 것만 고른다', () => {
    const f = supportedFlags(help, ['--json', '--sandbox', '--skip-git-repo-check', '--model'])
    expect([...f].sort()).toEqual(['--json', '--model'])
  })
  // ⚠ 못 읽었으면 다 있다고 본다 — 못 읽었다고 빼면 멀쩡한 판에서 샌드박스가 통째로 빠진다
  it('도움말을 못 읽으면 다 있다고 본다', () => {
    expect(supportedFlags('', ['--json', '--sandbox']).size).toBe(2)
  })
})

describe('계정이 모델을 거절했나', () => {
  // 🔴 2026-09-13 실측 — ChatGPT 계정에서 우리가 박아 넘긴 모델이 400 으로 죽었다
  it('진짜 오류 글을 알아본다', () => {
    expect(isModelRejected(`{"type":"error","status":400,"error":{"message":"The 'gpt-5.1-codex' model is not supported when using Codex with a ChatGPT account."}}`)).toBe(true)
    expect(isModelRejected('unknown model: gpt-9')).toBe(true)
    expect(isModelRejected('Model not available for your plan')).toBe(true)
  })
  // ⚠ 이름을 외우지 않는다 — «말의 모양» 을 본다. 다른 오류를 모델 탓으로 돌리면 안 된다
  it('다른 오류를 모델 탓으로 돌리지 않는다', () => {
    expect(isModelRejected('rate limit exceeded')).toBe(false)
    expect(isModelRejected('sandbox denied: write outside workspace')).toBe(false)
    expect(isModelRejected('')).toBe(false)
    expect(isModelRejected('not supported')).toBe(false)   // «모델» 이라는 말이 없다
  })
})

describe('Codex 파일 고치기 — 경로가 실려야 파일 칩·트리 갱신이 탄다 (2026-09-18)', () => {
  it('item.started file_change 의 changes[].path 가 file_path 로', () => {
    const out = mapCodex({ type: 'item.started', item: { id: 'fc1', item_type: 'file_change', changes: [{ path: '/v/a.md', kind: 'add' }, { path: '/v/b.md', kind: 'update' }] } } as never, ctx())
    const tu = out.find((l) => (l as { type: string }).type === 'assistant') as { message: { content: { name: string; input: Record<string, unknown> }[] } } | undefined
    expect(tu?.message.content[0].name).toBe('Edit')
    expect(tu?.message.content[0].input.file_path).toBe('/v/a.md')
    expect(tu?.message.content[0].input.paths).toEqual(['/v/a.md', '/v/b.md'])
  })
  it('옛 판 patch_apply_begin 의 changes 는 경로가 키다', () => {
    const out = mapCodex({ msg: { type: 'patch_apply_begin', call_id: 'c1', changes: { '/v/c.md': { add: { content: 'x' } } } } } as never, ctx())
    const tu = out.find((l) => (l as { type: string }).type === 'assistant') as { message: { content: { input: Record<string, unknown> }[] } } | undefined
    expect(tu?.message.content[0].input.file_path).toBe('/v/c.md')
  })
})
