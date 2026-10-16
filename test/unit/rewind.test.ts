import { describe, expect, it } from 'vitest'
import { rewindPoint } from '../../src/core/rewind'

const U = (uuid: string, content: unknown, extra: Record<string, unknown> = {}) => ({ type: 'user', uuid, message: { content }, ...extra })
const A = (uuid: string) => ({ type: 'assistant', uuid, message: { content: [{ type: 'text', text: '답' }] } })

describe('CL-1 B · 되감을 자리 — 멈춘 말 바로 앞 답', () => {
  it('멈춘 말(기기 블록이 앞에 붙어도) 바로 앞 답의 uuid', () => {
    const e = [U('u1', '첫 말'), A('a1'), U('u2', [{ type: 'text', text: '[기기: 맥]\n\n멈춘   말' }]), A('a2')]
    expect(rewindPoint(e, '멈춘 말')).toEqual({ at: 'a1' })
  })
  it('도구 결과·메타·압축 요약 줄은 사람 말로 보지 않는다', () => {
    const e = [U('u1', '첫 말'), A('a1'), U('u2', '멈춘 말'), A('a2'), U('t', [{ type: 'tool_result', content: 'ok' }]), U('m', '메타', { isMeta: true })]
    expect(rewindPoint(e, '멈춘 말')).toEqual({ at: 'a1' })
  })
  it('세션 첫 말을 멈췄으면 새로 시작', () => { expect(rewindPoint([U('u1', '멈춘 말'), A('a1')], '멈춘 말')).toEqual({ fresh: true }) })
  it('🔴 기록의 마지막 사람 말이 멈춘 말이 아니면(멈추기가 너무 빨랐다) null — 엉뚱한 자리로 되감지 않는다', () => {
    expect(rewindPoint([U('u1', '앞 말'), A('a1')], '멈춘 말')).toBeNull()
    expect(rewindPoint([], '멈춘 말')).toBeNull()
  })
  it('🔴 멈추면 실 CLI 가 남기는 «[Request interrupted by user]» 줄은 사람 말이 아니다 — 그 줄 때문에 B 가 안 되던 것(리뷰 10/16)', () => {
    const e = [U('u1', '첫 말'), A('a1'), U('u2', '멈춘 말'), U('i', [{ type: 'text', text: '[Request interrupted by user]' }]), U('i2', [{ type: 'text', text: '[Request interrupted by user for tool use]' }])]
    expect(rewindPoint(e, '멈춘 말')).toEqual({ at: 'a1' })
  })
  it('도구를 부르다 멈춘 답(tool_use) 직후로는 가르지 않는다 — 그 앞 글 답으로', () => {
    const T = (uuid: string) => ({ type: 'assistant', uuid, message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }] } })
    const e = [U('u1', '첫 말'), A('a1'), U('u2', '둘째'), T('t2'), U('r', [{ type: 'tool_result', tool_use_id: 'x', content: 'no' }]), U('i', [{ type: 'text', text: '[Request interrupted by user for tool use]' }]), U('u3', '멈춘 말'), T('t3')]
    expect(rewindPoint(e, '멈춘 말')).toEqual({ at: 'a1' })
  })
})
