import { describe, expect, it } from 'vitest'
import { tabActive } from '../../src/core/tabbar'

describe('AD · 폰 하단 탭', () => {
  it('🔴 탭은 숨지 않는다 — 숨어도 채팅 높이가 안 변해 버는 자리가 없다(2026-09-23 Dave)', async () => {
    const mod = (await import('../../src/core/tabbar')) as Record<string, unknown>
    expect(mod.tabVisible).toBeUndefined()
  })
  it('할 일과 폴더는 **다른 화면**이라 화면 값 하나로 갈린다', () => {
    expect(tabActive('chat')).toBe('chat'); expect(tabActive('doc')).toBe('doc')
    expect(tabActive('panel', 'todo')).toBe('todo'); expect(tabActive('panel', 'files')).toBe('files')
    expect(tabActive('panel')).toBe('files')
    expect(tabActive('list')).toBeNull()   // 봇 목록에는 탭이 없다
  })
})
