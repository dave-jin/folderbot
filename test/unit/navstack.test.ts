import { describe, expect, it } from 'vitest'
import { back, canBack, canFwd, curOf, dismiss, fwd, goTo, navInit, sideOf, swipeMove, type Nav } from '../../src/core/navstack'

const path = (n: Nav) => n.stack.join('>')

describe('Z-2 · 온 길(스택) 내비게이션', () => {
  it('봇이 있으면 목록 위에 채팅이 얹혀 시작한다 — 👉 한 번이면 목록', () => {
    const n = navInit(true); expect(path(n)).toBe('list>chat'); expect(curOf(n)).toBe('chat')
    expect(curOf(back(n))).toBe('list'); expect(canBack(navInit(false))).toBe(false)
  })

  it('🔴 문서에서 👉 는 **온 길** 로 간다 — 폴더를 거쳐 왔으면 폴더로, 채팅 칩에서 왔으면 채팅으로', () => {
    const viaPanel = goTo(goTo(navInit(true), 'panel'), 'doc')
    expect(path(viaPanel)).toBe('list>chat>panel>doc')
    expect(curOf(back(viaPanel))).toBe('panel')            // 종전 band 는 여기서 채팅으로 갔다(폴더 건너뜀)
    const viaChip = goTo(navInit(true), 'doc')
    expect(path(viaChip)).toBe('list>chat>doc')
    expect(curOf(back(viaChip))).toBe('chat')
  })

  it('👉👉👉 는 온 길을 그대로 되짚고 뿌리에서 멈춘다', () => {
    let n = goTo(goTo(navInit(true), 'panel'), 'doc')
    n = back(n); expect(curOf(n)).toBe('panel')
    n = back(n); expect(curOf(n)).toBe('chat')
    n = back(n); expect(curOf(n)).toBe('list')
    n = back(n); expect(curOf(n)).toBe('list')             // 뿌리에서는 아무 일도 없다
  })

  it('👈 는 «방금 한 뒤로를 무르기» 다 — 새 곳으로 가면 앞으로 길은 버려진다', () => {
    const deep = goTo(goTo(navInit(true), 'panel'), 'doc')
    const b = back(back(deep))                              // doc → panel → chat
    expect(canFwd(b)).toBe(true)
    expect(curOf(fwd(b))).toBe('panel'); expect(curOf(fwd(fwd(b)))).toBe('doc')
    expect(canFwd(goTo(b, 'panel'))).toBe(false)            // 온 길에 없던 쪽으로 새로 가면 앞으로는 사라진다
  })

  it('이미 온 길 위의 쪽으로 가면 «거기까지 뒤로» 이고 지나온 쪽은 앞으로에 쌓인다', () => {
    const deep = goTo(goTo(navInit(true), 'panel'), 'doc')  // list>chat>panel>doc
    const n = goTo(deep, 'chat')
    expect(path(n)).toBe('list>chat')
    expect(curOf(fwd(n))).toBe('panel')                     // 먼저 폴더, 그 다음 문서
    expect(curOf(fwd(fwd(n)))).toBe('doc')
    expect(path(goTo(n, 'chat'))).toBe('list>chat')         // 같은 쪽으로 가면 그대로
  })

  it('그림이 어떻게 움직이나 — 서랍이 나오나(open) 들어가나(close) 내용만 바뀌나(swap)', () => {
    expect(sideOf('list')).toBe('left'); expect(sideOf('chat')).toBeNull(); expect(sideOf('panel')).toBe('right'); expect(sideOf('doc')).toBe('right')
    const chat = navInit(true)
    expect(swipeMove(chat, 'r')).toMatchObject({ to: 'list', side: 'left', mode: 'open' })
    expect(swipeMove(chat, 'l')).toBeNull()                 // 갈 데가 없으면 아무 일도 없다
    expect(swipeMove(goTo(chat, 'panel'), 'r')).toMatchObject({ to: 'chat', side: 'right', mode: 'close' })
    expect(swipeMove(goTo(goTo(chat, 'panel'), 'doc'), 'r')).toMatchObject({ to: 'panel', side: 'right', mode: 'swap' })
    expect(swipeMove(goTo(chat, 'list'), 'l')).toMatchObject({ to: 'chat', side: 'left', mode: 'close' })   // 목록에서 👈 = 방금 한 뒤로를 무름
  })

  it('Esc·스크림은 «채팅으로 돌아가기» 다 — 뒤로 와서 연 봇 목록은 앞으로 닫고, 온 길은 안 잃는다', () => {
    const atList = back(navInit(true))                      // 채팅에서 👉 로 연 봇 목록
    expect(curOf(atList)).toBe('list'); expect(curOf(back(atList))).toBe('list')   // 「뒤로」로는 못 닫는다(뿌리)
    expect(curOf(dismiss(atList))).toBe('chat')
    const deep = goTo(goTo(navInit(true), 'panel'), 'doc')   // 앞으로 가서 연 문서
    const d = dismiss(deep)
    expect(curOf(d)).toBe('chat'); expect(curOf(fwd(d))).toBe('panel'); expect(curOf(fwd(fwd(d)))).toBe('doc')
    expect(dismiss(navInit(true))).toEqual(navInit(true))   // 이미 채팅이면 그대로
  })
})
