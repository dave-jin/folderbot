import { describe, it, expect } from 'vitest'
import { isDaveSaid, letterBatch, parseLetter } from '../../src/core/fbmf'
import { channelSpawn, channelVerdict, parseBridges } from '../../src/core/bridges'
import { turnBlock, daveSaidOf, daveSaidLine, ORCH_GRANTABLE } from '../../src/core/turnGuard'
import { applyNaming } from '../../src/core/rules'

/**
 * CN · «Dave 말» 편지 (2026-10-19 Dave «만들기는 바로·옮기기는 폰 승인»).
 * 할일이가 Dave 의 말을 옮긴 편지면 새 폴더 만들기·봇 켜기는 그 턴에서 바로 한다. 옮기기·은퇴는 여전히 막힌다.
 */
const head = (extra: string) => `---\nfbmf: 1\nid: x\nfrom: halili\nto: orch\nkind: report\n${extra}\n---\n본문`

describe('CN · Dave 말 편지', () => {
  it('제목 «Dave 말 · …» 이나 머리말 dave_said: true 면 Dave 말', () => {
    expect(isDaveSaid(parseLetter(head('title: Dave 말 · 새 프로젝트 사이렌의밧줄'), { id: 'a', from: 'halili' }))).toBe(true)
    expect(isDaveSaid(parseLetter(head('title: 폴더 만들어 줘\ndave_said: true'), { id: 'b', from: 'halili' }))).toBe(true)
    expect(isDaveSaid(parseLetter(head('title: 지금 확인 · 제품_FolderBot'), { id: 'c', from: 'halili' }))).toBe(false)
    expect(isDaveSaid(parseLetter(head('title: 할일이 생각 — Dave 말 · 아님'), { id: 'd', from: 'halili' }))).toBe(false)   // 맨 앞이어야 한다
  })
  it('bridges.yml dave_may — 만들기·켜기만 받고, 옮기기·은퇴는 오류로 버린다', () => {
    const c = parseBridges('bridges:\n  - id: halili\n    mailbox: m\n    dave_may: [folder_create, bot_start, folder_move, bot_retire]\n')
    expect(c.peers[0].daveMay).toEqual(['folder_create', 'bot_start'])
    expect(c.errors.join('|')).toMatch(/folder_move.*사람 승인/)
    expect(parseBridges('bridges:\n  - id: halili\n    mailbox: m\n').peers[0].daveMay).toEqual([])   // 안 적으면 종전 그대로
  })
  it('🔴 울타리 — dave_may 가 있어도 옮기기·은퇴·쓰기는 그대로 막힌다', () => {
    const sp = channelSpawn('propose', ['folder_create', 'bot_start'])
    expect(sp.allowed).toEqual(expect.arrayContaining(['mcp__folderbot__folder_create', 'mcp__folderbot__bot_start']))
    for (const t of ['mcp__folderbot__folder_move', 'mcp__folderbot__bot_retire', 'Bash', 'Write']) expect(sp.disallowed).toContain(t)
    expect(sp.allowed.filter((t) => sp.disallowed.includes(t))).toEqual([])
    expect(channelVerdict('propose', 'mcp__folderbot__folder_create', ['folder_create']).allow).toBe(true)
    expect(channelVerdict('propose', 'mcp__folderbot__folder_create').allow).toBe(false)              // dave_may 없으면 종전대로
    expect(channelVerdict('propose', 'mcp__folderbot__folder_move', ['folder_move']).allow).toBe(false) // 목록 밖 값은 무시
    expect(channelSpawn('propose').disallowed).toContain('mcp__folderbot__folder_create')
  })
  it('🔴 턴 — 바깥 상대의 턴은 그 턴의 grant 에 있을 때만 만들기·켜기, 옮기기는 grant 가 있어도 막힌다', () => {
    expect(turnBlock('folder_create', 'peer', ['folder_create', 'bot_start'])).toBe(null)
    expect(turnBlock('bot_start', 'peer', ['folder_create', 'bot_start'])).toBe(null)
    expect(turnBlock('folder_create', 'peer')).toMatch(/Dave 말/)
    expect(turnBlock('bot_start', 'peer', [])).toMatch(/Dave 말/)            // Dave 말 아닌 편지 턴에서 봇 켜기도 막힌다
    expect(turnBlock('folder_move', 'peer', ['folder_move'])).toMatch(/사람이 시킨 턴/)
    expect(turnBlock('folder_create', 'bot')).toMatch(/사람이 시킨 턴/)                 // 봇의 턴은 Dave 원문이 붙은 orch_ask(CS)가 아니면 막힌다
    expect(turnBlock('bot_start', 'bot')).toBe(null)                          // 오케스트레이터가 봇을 켜는 종전 길은 그대로
  })
  it('묶음 머리 — grant 가 있으면 무엇을 해도 되는지와 여전히 안 되는 것을 함께 적는다', () => {
    const l = parseLetter(head('title: Dave 말 · x'), { id: 'a', from: 'halili' })
    const t = letterBatch('할일이', [{ letter: l, rel: 'm/a.md' }], ['folder_create', 'bot_start'])
    expect(t).toMatch(/folder_create·bot_start/)
    expect(t).toMatch(/옮기기·이름 바꾸기·은퇴/)
    expect(letterBatch('할일이', [{ letter: l, rel: 'm/a.md' }])).toMatch(/사람의 승인이 아니다/)
  })
})

/**
 * CS · 폴더 봇 세션에서 Dave 가 직접 친 말이 붙은 orch_ask (2026-10-22 Dave 결정).
 * 원문은 호스트가 세션 기록에서 옮긴다 — 봇이 지어 넣을 수 없다. 그 턴에서만 만들기·옮기기·켜기·은퇴가 열리고, 삭제·외부 발송은 여전히 묻는다.
 */
describe('CS · orch_ask 에 붙는 Dave 원문', () => {
  const mac = { device: 'Mac', main: true, tier: 'desktop' as const }
  const t0 = new Date(2026, 9, 22, 14, 6).getTime()
  it('사람이 시킨 턴의 마지막 user 항목이 기기에서 온 말일 때만 원문을 붙인다', () => {
    const items = [{ kind: 'user', text: '옛말', t: 1, from: mac }, { kind: 'assistant', text: '두 단계로 할까요?', t: 2 }, { kind: 'user', text: ' 일단 만들어. ', t: t0, from: mac }, { kind: 'tool', t: t0 + 1 }]
    expect(daveSaidOf(items, 'human')).toEqual({ text: '일단 만들어.', t: t0, device: 'Mac' })
    expect(daveSaidOf(items, 'routine')).toBe(null)                                     // 루틴 턴
    expect(daveSaidOf(items, 'bot')).toBe(null)                                         // 다른 봇이 연 턴
    expect(daveSaidOf(items, undefined)).toBe(null)                                     // 출처 모름 — 열어 주지 않는다
    expect(daveSaidOf([...items, { kind: 'user', text: 'API 로 들어온 말', t: t0 + 2 }], 'human')).toBe(null)   // 마지막 말이 기기에서 온 게 아니면 옛말을 끌어오지 않는다
  })
  it('요청 머리 둘째 줄 — 시각·기기·원문, 없으면 없다고', () => {
    expect(daveSaidLine({ text: '일단 만들어.', t: t0, device: 'Mac' }, new Date(2026, 9, 22))).toBe('[Dave 가 직접 한 말 · 10/22 14:06 · Mac] 「일단 만들어.」')
    expect(daveSaidLine(null)).toMatch(/^\[Dave 가 직접 한 말 없음/)
    expect(daveSaidLine({ text: 'x'.repeat(700), t: t0, device: 'iPhone' }, new Date(2026, 9, 22))).toMatch(/…\(줄임\)」$/)
  })
  it('🔴 턴 — 원문이 붙은 요청이 연 도구만 열리고, 그 밖의 봇 턴은 그대로 막힌다', () => {
    const g = [...ORCH_GRANTABLE]
    for (const t of ['folder_create', 'folder_move', 'bot_retire']) { expect(turnBlock(t, 'bot', g)).toBe(null); expect(turnBlock(t, 'bot')).toMatch(/사람이 시킨 턴/); expect(turnBlock(t, 'routine', g)).toMatch(/사람이 시킨 턴/) }
    expect(turnBlock('folder_move', 'bot', ['folder_create'])).toMatch(/사람이 시킨 턴/)   // 열린 것만
    expect(turnBlock('folder_move', 'peer', g)).toMatch(/사람이 시킨 턴/)                 // 편지 턴의 «Dave 말» 은 종전대로 만들기·켜기만
  })
})

describe('CS-3 · 새 폴더 이름의 날짜 접두', () => {
  const d = new Date(2026, 9, 22)
  it('이미 날짜로 시작하면 그대로 — 이중 접두를 만들지 않는다', () => {
    expect(applyNaming('{YYYY}-{MM}_{이름}', '2026-11_강의-카카오페이-LLM위키', d)).toBe('2026-11_강의-카카오페이-LLM위키')
    expect(applyNaming('{YYYY}-{MM}_{이름}', '2026-11-07_강의-PARA-AI', d)).toBe('2026-11-07_강의-PARA-AI')
    expect(applyNaming('{YYYY}-{MM}_{이름}', '2026_멘토링-디캠프', d)).toBe('2026_멘토링-디캠프')
    expect(applyNaming('{YYYY}-{MM}_{이름}', '강의-카카오페이', d)).toBe('2026-10_강의-카카오페이')
    expect(applyNaming('{YYYY}-{MM}_{이름}', '2026년-회고', d)).toBe('2026-10_2026년-회고')        // 날짜 꼴이 아니면 붙인다
    expect(applyNaming('{이름}_{YYYY}', '2026-11_x', d)).toBe('2026-11_x_2026')                  // 템플릿이 날짜로 시작할 때만
  })
})
