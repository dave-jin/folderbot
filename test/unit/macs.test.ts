import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

type Mac = { id: string; url: string; name: string; lastSeen: number; lastHash: string; openMode: '' | 'sync' | 'download'; vaultLocal: string; local?: true; version?: string; auth?: 'ok' | 'lost' }
const require_ = createRequire(import.meta.url)
const M = require_('../../desktop/macs.js') as {
  LOCAL_ID: string
  normUrl: (u: string) => string
  migrate: (old: Record<string, unknown>, newId: () => string) => { macs: Mac[]; activeMac: string; moveToken?: { id: string; token: string } }
  addMac: (macs: Mac[], url: string, newId: () => string) => { macs: Mac[]; mac: Mac; existed: boolean }
  removeMac: (macs: Mac[], id: string) => Mac[]
  setSeen: (macs: Mac[], id: string, p: Partial<Mac>) => Mac[]
  findDuplicate: (macs: Mac[], id: string, name: string, version: string) => Mac | null
  ordered: (macs: Mac[]) => Mac[]
  displayName: (macs: Mac[], mac: Mac) => string
  noteTitle: (macs: Mac[], mac: Mac, title: string) => string
  winTitle: (macs: Mac[], mac: Mac, old: boolean) => string
  trayMacId: (macs: Mac[], activeId: string, reachable: Record<string, boolean>) => string
  offlineDue: (since: number, alerted: boolean, now: number) => boolean
}

const mk = (id: string, name: string, url = `http://${id}.tail944ed8.ts.net:7373`, extra: Partial<Mac> = {}): Mac =>
  ({ id, url, name, lastSeen: 0, lastHash: '', openMode: 'download', vaultLocal: '', ...extra })

describe('macs — 옮겨 담기', () => {
  it('호스트 모드면 «이 맥» 한 줄', () => {
    const r = M.migrate({ mode: 'host', hostUrl: 'http://127.0.0.1:7373', token: 'L', openMode: '', vaultLocal: '' }, () => 'x')
    expect(r.macs).toHaveLength(1)
    expect(r.macs[0].id).toBe('local'); expect(r.macs[0].local).toBe(true)
    expect(r.activeMac).toBe('local'); expect(r.moveToken).toBeUndefined()
  })
  it('원격이면 새 id 한 줄과 토큰 옮기기', () => {
    const r = M.migrate({ mode: '', hostUrl: 'http://mac-mini.tail944ed8.ts.net:7373/', token: 'T', openMode: 'sync', vaultLocal: '/V' }, () => 'a1')
    expect(r.macs[0]).toMatchObject({ id: 'a1', url: 'http://mac-mini.tail944ed8.ts.net:7373', openMode: 'sync', vaultLocal: '/V' })
    expect(r.activeMac).toBe('a1'); expect(r.moveToken).toEqual({ id: 'a1', token: 'T' })
  })
  it('이미 옮겼으면 그대로', () => {
    const macs = [mk('a1', 'A')]
    const r = M.migrate({ mode: '', hostUrl: 'http://x', token: '', macs, activeMac: 'a1' }, () => 'zz')
    expect(r.macs).toEqual(macs); expect(r.activeMac).toBe('a1'); expect(r.moveToken).toBeUndefined()
  })
  it('빈 설정이면 빈 목록', () => {
    expect(M.migrate({ mode: '', hostUrl: '', token: '' }, () => 'x')).toEqual({ macs: [], activeMac: '' })
  })
})

describe('macs — 목록', () => {
  it('같은 주소 다른 모양은 같은 맥', () => {
    const base = [mk('a1', 'A', 'http://mac-mini.tail944ed8.ts.net:7373')]
    const r = M.addMac(base, ' HTTP://Mac-Mini.tail944ed8.ts.net:7373/ ', () => 'b2')
    expect(r.existed).toBe(true); expect(r.macs).toHaveLength(1); expect(r.mac.id).toBe('a1')
  })
  it('스킴이 없으면 http', () => expect(M.normUrl('studio-mini:7373')).toBe('http://studio-mini:7373'))
  it('새 맥은 «받아서 열기» 로 시작', () => {
    const r = M.addMac([], 'http://studio-mini:7373', () => 'b2')
    expect(r.existed).toBe(false); expect(r.mac).toMatchObject({ id: 'b2', openMode: 'download', url: 'http://studio-mini:7373' })
  })
  it('«이 맥» 은 뺄 수 없다', () => {
    const macs = [mk('local', '이 맥', 'http://127.0.0.1:7373', { local: true }), mk('a1', 'A')]
    expect(M.removeMac(macs, 'local')).toEqual(macs)
    expect(M.removeMac(macs, 'a1').map((m) => m.id)).toEqual(['local'])
  })
  it('setSeen 은 새 배열을 준다', () => {
    const macs = [mk('a1', 'A')]
    const out = M.setSeen(macs, 'a1', { name: '집 미니', version: '0.3.9', lastSeen: 5 })
    expect(out[0]).toMatchObject({ name: '집 미니', version: '0.3.9', lastSeen: 5 }); expect(macs[0].name).toBe('A')
  })
  it('같은 이름·판의 다른 줄을 찾는다', () => {
    const macs = [mk('a1', '집 미니', undefined, { version: '0.3.9' }), mk('b2', '', 'http://100.71.156.11:7373')]
    expect(M.findDuplicate(macs, 'b2', '집 미니', '0.3.9')?.id).toBe('a1')
    expect(M.findDuplicate(macs, 'a1', '집 미니', '0.3.9')).toBeNull()
  })
  it('«이 맥» 이 맨 앞', () => {
    const macs = [mk('a1', 'A'), mk('b2', 'B'), mk('local', 'L', 'http://127.0.0.1:7373', { local: true })]
    expect(M.ordered(macs).map((m) => m.id)).toEqual(['local', 'a1', 'b2'])
  })
  it('이름이 겹치면 주소로 가른다', () => {
    const a = mk('a1', 'Mac mini', 'http://mac-mini.tail944ed8.ts.net:7373'), b = mk('b2', 'Mac mini', 'http://studio-mini.tail944ed8.ts.net:7373')
    const c = mk('c3', 'Mac mini', 'http://100.71.156.11:7373')
    expect(M.displayName([a, b, c], a)).toBe('Mac mini (mac-mini)')
    expect(M.displayName([a, b, c], b)).toBe('Mac mini (studio-mini)')
    expect(M.displayName([a, b, c], c)).toBe('Mac mini (100.71.156.11)')
    expect(M.displayName([a], a)).toBe('Mac mini')
  })
})

describe('macs — 글자', () => {
  const one = [mk('a1', '사무실 미니')], two = [mk('a1', '사무실 미니'), mk('b2', '집 미니')]
  it('알림 제목 — 1대면 그대로', () => expect(M.noteTitle(one, one[0], 'B사 제안')).toBe('B사 제안'))
  it('알림 제목 — 2대면 맥 이름', () => expect(M.noteTitle(two, two[1], 'B사 제안')).toBe('집 미니 · B사 제안'))
  it('창 제목', () => {
    expect(M.winTitle(one, one[0], false)).toBe('Folder Bot')
    expect(M.winTitle(two, two[0], false)).toBe('Folder Bot — 사무실 미니')
    expect(M.winTitle(two, two[1], true)).toBe('Folder Bot — 집 미니 (옛 판 — 맥 메뉴로 바꾸세요)')
  })
})

describe('macs — 트레이 맥 · 끊김 알림', () => {
  const macs = [mk('a1', 'A'), mk('local', 'L', 'http://127.0.0.1:7373', { local: true }), mk('c3', 'C')]
  it('지금 맥이 끊기면 «이 맥»', () => expect(M.trayMacId(macs, 'a1', { a1: false, local: true, c3: true })).toBe('local'))
  it('둘 다 끊기면 닿는 첫 줄', () => expect(M.trayMacId(macs, 'a1', { a1: false, local: false, c3: true })).toBe('c3'))
  it('다 끊기면 지금 맥', () => expect(M.trayMacId(macs, 'a1', {})).toBe('a1'))
  it('지금 맥이 닿으면 지금 맥', () => expect(M.trayMacId(macs, 'a1', { a1: true, local: true })).toBe('a1'))
  it('5분 경계', () => {
    expect(M.offlineDue(0, false, 299999)).toBe(false)
    expect(M.offlineDue(0, false, 300000)).toBe(true)
    expect(M.offlineDue(0, true, 999999)).toBe(false)
  })
})
