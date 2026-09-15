import { describe, it, expect } from 'vitest'
import { chipParts, chipPartsRel } from '../../src/core/chipName'

const BOT = '/v/2. Projects/2026-09-30_컨설팅'
describe('chipParts', () => {
  it('봇 폴더 바로 아래 파일은 표식이 없다', () => expect(chipParts(`${BOT}/readme.md`, BOT)).toEqual({ name: 'readme.md', folder: '', dir: false }))
  it('하위 폴더 파일은 직전 폴더 한 칸만', () => expect(chipParts(`${BOT}/04_세션기록/에프오씨씨/20260915_스크립트.md`, BOT)).toEqual({ name: '20260915_스크립트.md', folder: '에프오씨씨', dir: false }))
  it('볼트의 다른 곳도 같은 규칙', () => expect(chipParts('/v/1. Inbox/메모.md', BOT).folder).toBe('1. Inbox'))
  it('폴더는 이름 뒤에 / 와 그 위 폴더', () => expect(chipParts(`${BOT}/자료/사진`, BOT, true)).toEqual({ name: '사진/', folder: '자료', dir: true }))
  it('상대 경로(../ 포함)도 같은 답', () => {
    expect(chipPartsRel('../../1. Inbox/메모.md', BOT)).toEqual({ name: '메모.md', folder: '1. Inbox', dir: false })
    expect(chipPartsRel('todo.md', BOT)).toEqual({ name: 'todo.md', folder: '', dir: false })
    expect(chipPartsRel('첨부/사진.png', BOT).folder).toBe('첨부')
  })
})
