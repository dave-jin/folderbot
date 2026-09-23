import { describe, expect, it } from 'vitest'
import { canBack, canFwd, curOf, dismiss, fwd, goTo, navInit, type Nav } from '../../src/core/navstack'

const path = (n: Nav) => n.stack.join('>')

describe('AD · 온 길은 «기록» 으로만 남는다 (2026-09-23)', () => {
  it('🔴 되짚기(back·swipeMove)는 걷어냈다 — 길이 둘이면 Z-2 의 고장이 되살아난다', async () => {
    const mod = (await import('../../src/core/navstack')) as Record<string, unknown>
    expect(mod.back).toBeUndefined()
    expect(mod.swipeMove).toBeUndefined()
  })

  it('봇이 있으면 목록 위에 채팅이 얹혀 시작한다', () => {
    const n = navInit(true); expect(path(n)).toBe('list>chat'); expect(curOf(n)).toBe('chat')
    expect(canBack(navInit(false))).toBe(false)
  })

  it('👉 는 어디서든 봇 목록 — 지나온 쪽은 앞으로에 쌓여 닫을 때 쓰인다', () => {
    const deep = goTo(goTo(navInit(true), 'panel'), 'doc')   // list>chat>panel>doc
    expect(path(deep)).toBe('list>chat>panel>doc')
    const atList = goTo(deep, 'list')
    expect(path(atList)).toBe('list')
    expect(canFwd(atList)).toBe(true)
    expect(curOf(fwd(atList))).toBe('chat')                   // 닫으면 채팅으로 돌아온다
  })

  it('처음 가는 쪽이면 한 걸음 들어가고 앞으로 길은 버린다(브라우저와 같다)', () => {
    const n = goTo(navInit(true), 'panel')
    expect(path(n)).toBe('list>chat>panel'); expect(canFwd(n)).toBe(false)
    expect(path(goTo(n, 'panel'))).toBe('list>chat>panel')    // 같은 쪽이면 그대로
  })

  it('Esc·스크림은 «채팅으로 돌아가기» 다 — 봇 목록은 뒤로 열었으니 닫는 것은 앞이다', () => {
    const atList = goTo(navInit(true), 'list')
    expect(curOf(atList)).toBe('list')
    expect(curOf(dismiss(atList))).toBe('chat')
    const deep = goTo(goTo(navInit(true), 'panel'), 'doc')
    const d = dismiss(deep)
    expect(curOf(d)).toBe('chat'); expect(curOf(fwd(d))).toBe('panel')
    expect(dismiss(navInit(true))).toEqual(navInit(true))     // 이미 채팅이면 그대로
  })
})
