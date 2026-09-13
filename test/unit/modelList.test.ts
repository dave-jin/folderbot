import { describe, expect, it } from 'vitest'
import { MODEL_RE, extractModels, mergeModels, modelsFromHelp } from '../../src/core/modelList'

describe('모델 목록 — 기계에서 주워 온다', () => {
  it('값에서도 키에서도 줍는다', () => {
    const j = { models: [{ id: 'gpt-5-codex' }, { id: 'gpt-5.1-codex-mini' }], cache: { 'o3-mini': { ok: true } } }
    expect(extractModels(j, MODEL_RE.codex).sort()).toEqual(['gpt-5-codex', 'gpt-5.1-codex-mini', 'o3-mini'])
  })

  // ⛔ 아무 글자나 주우면 목록이 쓰레기가 된다
  it('모양이 안 맞는 글자는 안 줍는다', () => {
    const j = { note: 'hello world', path: '/Users/x/.codex', model: 'claude-opus-5' }
    expect(extractModels(j, MODEL_RE.codex)).toEqual([])
    expect(extractModels(j, MODEL_RE.claude)).toEqual(['claude-opus-5'])
  })

  // ⚠ 설정 파일에는 고리가 흔하다 — 거기서 멈추지 않으면 호스트가 붙잡힌다
  it('고리가 있어도 멈춘다', () => {
    const a: Record<string, unknown> = { m: 'gpt-5-codex' }
    a.self = a
    expect(extractModels(a, MODEL_RE.codex)).toEqual(['gpt-5-codex'])
  })

  it('도움말의 possible values 도 읽는다', () => {
    expect(modelsFromHelp('--model <M>  [possible values: gpt-5-codex, gpt-5.1-codex]', MODEL_RE.codex))
      .toEqual(['gpt-5-codex', 'gpt-5.1-codex'])
    expect(modelsFromHelp('--model <M>', MODEL_RE.codex)).toEqual([])
  })
})

describe('합치기 — 받아 온 것 먼저, 빌트인은 빈 자리를 메운다', () => {
  const builtin = [{ v: '', t: 'CLI 기본', d: '권장' }, { v: 'gpt-5-codex', t: 'GPT-5 Codex', d: '설명' }]

  it('«CLI 기본»(빈 값)은 늘 맨 앞에 남는다', () => {
    expect(mergeModels(['gpt-9-new'], builtin)[0].v).toBe('')
  })

  it('받아 온 이름이 빌트인보다 먼저 온다 · 설명은 빌려 쓴다', () => {
    const out = mergeModels(['gpt-5-codex', 'gpt-9-new'], builtin)
    expect(out.map((o) => o.v)).toEqual(['', 'gpt-5-codex', 'gpt-9-new'])
    expect(out[1].d).toBe('설명')      // 빌트인 설명을 빌렸다
    expect(out[2].t).toBe('gpt-9-new') // 모르는 이름은 이름 그대로
  })

  it('아무것도 못 주우면 빌트인 그대로', () => {
    expect(mergeModels([], builtin).map((o) => o.v)).toEqual(['', 'gpt-5-codex'])
  })
})
