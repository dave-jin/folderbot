import { describe, it, expect } from 'vitest'
import { isDaveSaid, letterBatch, parseLetter } from '../../src/core/fbmf'
import { channelSpawn, channelVerdict, parseBridges } from '../../src/core/bridges'
import { turnBlock } from '../../src/core/turnGuard'

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
    expect(turnBlock('folder_create', 'bot', ['folder_create'])).toMatch(/사람이 시킨 턴/)   // grant 는 바깥 상대의 턴에만 뜻이 있다
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
