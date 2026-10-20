import { describe, it, expect } from 'vitest'
import { DOC_REPLAY_MS, docKey, pendingDoc, type DocReq } from '../../src/core/docReq'

/**
 * J-4 · 문서 창 열기 요청은 남는다 (2026-10-21 Dave: «문서 창에 띄웠습니다 — 실제로 안 띄워져 있어»)
 * 다른 봇을 보고 있었거나 연결이 끊겼어도, 그 봇으로 돌아오면 이 기기 몫의 안 연 요청을 한 번 연다.
 */
const NOW = 10_000_000
const req = (o: Partial<DocReq> = {}): DocReq => ({ at: NOW - 1000, rel: 'a.pdf', action: 'open', turn: 1, ...o })
const none = () => false

describe('J-4 · pendingDoc', () => {
  it('다른 봇을 보던 사이에 온 열기 요청 — 그 봇으로 오면 연다', () => {
    expect(pendingDoc([{ id: 's1', docReq: req({ device: 'Mac' }) }], 'Mac', none, NOW)).toMatchObject({ sid: 's1', req: { rel: 'a.pdf' } })
  })
  it('다른 기기 몫이면 안 연다 · 기기가 비었으면 어느 기기든', () => {
    expect(pendingDoc([{ id: 's1', docReq: req({ device: 'iPhone' }) }], 'Mac', none, NOW)).toBeNull()
    expect(pendingDoc([{ id: 's1', docReq: req() }], 'host', none, NOW)).not.toBeNull()
  })
  it('이 기기에서 이미 연 것은 다시 안 연다(닫은 창을 되살리지 않는다)', () => {
    const r = req({ device: 'Mac' })
    expect(pendingDoc([{ id: 's1', docReq: r }], 'Mac', (k) => k === docKey('s1', r), NOW)).toBeNull()
  })
  it('30분 넘은 요청은 뒤늦게 열지 않는다', () => {
    expect(pendingDoc([{ id: 's1', docReq: req({ at: NOW - DOC_REPLAY_MS - 1 }) }], 'Mac', none, NOW)).toBeNull()
  })
  it('Finder 로 보여 달라(reveal)는 뒤늦게 하지 않는다 — 열기만', () => {
    expect(pendingDoc([{ id: 's1', docReq: req({ action: 'reveal' }) }], 'Mac', none, NOW)).toBeNull()
  })
  it('여러 세션이면 가장 새 요청 하나', () => {
    const got = pendingDoc([{ id: 's1', docReq: req({ at: NOW - 5000, rel: 'old.md' }) }, { id: 's2', docReq: req({ at: NOW - 100, rel: 'new.pdf' }) }, { id: 's3' }], 'Mac', none, NOW)
    expect(got).toMatchObject({ sid: 's2', req: { rel: 'new.pdf' } })
  })
})
