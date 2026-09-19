import { describe, it, expect } from 'vitest'
import { mdBlocks } from '../../src/core/mdBlocks'
describe('mdBlocks (O)', () => {
  it('빈 줄로 가르고 마지막은 열린 채', () => {
    expect(mdBlocks('# 제목\n\n본문 하나\n\n- 목록 중')).toEqual({ closed: ['# 제목', '본문 하나'], open: '- 목록 중' })
    expect(mdBlocks('# 제목\n\n본문\n\n')).toEqual({ closed: ['# 제목', '본문'], open: '' })
  })
  it('펜스 안의 빈 줄은 경계가 아니다 · 열린 펜스는 통째로 열린 블록', () => {
    expect(mdBlocks('앞\n\n```js\na\n\nb\n```\n\n뒤')).toEqual({ closed: ['앞', '```js\na\n\nb\n```'], open: '뒤' })
    expect(mdBlocks('앞\n\n```js\na\n\nb')).toEqual({ closed: ['앞'], open: '```js\na\n\nb' })
  })
})
