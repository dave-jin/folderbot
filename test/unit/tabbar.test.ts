import { describe, expect, it } from 'vitest'
import { TAB_DELTA, TAB_TOP, tabActive, tabVisible } from '../../src/core/tabbar'

describe('Z · 폰 하단 탭 (B · 내리면 숨음)', () => {
  it('내려가면 숨고 올라오면 돌아온다', () => {
    expect(tabVisible(true, 200, 200 + TAB_DELTA)).toBe(false)
    expect(tabVisible(false, 400, 400 - TAB_DELTA)).toBe(true)
  })
  it('손가락 떨림(문턱 미만)에는 깜빡이지 않는다 — 직전 상태를 지킨다', () => {
    expect(tabVisible(true, 300, 300 + TAB_DELTA - 1)).toBe(true)
    expect(tabVisible(false, 300, 300 - (TAB_DELTA - 1))).toBe(false)
    expect(tabVisible(false, 300, 300)).toBe(false)
  })
  it('꼭대기 언저리에서는 늘 보인다 — 맨 위에서 탭이 없으면 «사라졌다» 로 읽힌다', () => {
    expect(tabVisible(false, 0, TAB_TOP)).toBe(true)
    expect(tabVisible(false, 100, 0)).toBe(true)
  })
  it('할 일과 파일은 같은 「폴더」 화면이라 마지막에 연 칸까지 봐야 갈린다', () => {
    expect(tabActive('chat')).toBe('chat'); expect(tabActive('doc')).toBe('doc')
    expect(tabActive('panel', 'todo')).toBe('todo'); expect(tabActive('panel', 'files')).toBe('files')
    expect(tabActive('panel')).toBe('files')
    expect(tabActive('list')).toBeNull()   // 봇 목록에는 탭이 없다
  })
})
