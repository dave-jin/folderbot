import { describe, it, expect } from 'vitest'
import { copyIntent } from '../../src/core/copyIntent'

// Y · 2026-09-22 Dave: «md 한 개만 복사가 안 된다» — 편집기가 초점을 가져간 뒤의 ⌘C
const base = { picked: 1, hasSelection: false, inTree: false, editable: false, inDoc: false, armed: false }
describe('copyIntent — ⌘C 가 파일 복사인지 양보인지', () => {
  it('트리 행에 초점 → 파일', () => { expect(copyIntent({ ...base, inTree: true })).toBe('files') })
  it('md 를 눌러 편집기가 초점을 가져갔지만 문서 창은 안 만졌다(armed) → 파일 (Dave 보고의 그 경우)', () => { expect(copyIntent({ ...base, editable: true, inDoc: true, armed: true })).toBe('files') })
  it('문서 창을 클릭·타이핑해 armed 가 풀렸다 → 양보(편집기의 ⌘C)', () => { expect(copyIntent({ ...base, editable: true, inDoc: true, armed: false })).toBe('yield') })
  it('글을 골랐으면 어디서든 양보', () => {
    expect(copyIntent({ ...base, inTree: true, hasSelection: true })).toBe('yield')
    expect(copyIntent({ ...base, editable: true, inDoc: true, armed: true, hasSelection: true })).toBe('yield')
  })
  it('채팅 입력칸 등 문서 창 밖의 편집 칸은 armed 여도 양보', () => { expect(copyIntent({ ...base, editable: true, inDoc: false, armed: true })).toBe('yield') })
  it('고른 파일이 없으면 양보', () => { expect(copyIntent({ ...base, picked: 0, inTree: true })).toBe('yield') })
})
