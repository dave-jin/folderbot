import { describe, it, expect } from 'vitest'
import { splitAttach } from '../../src/core/attach'

describe('splitAttach', () => {
  it('첨부가 없으면 그대로', () => expect(splitAttach('안녕')).toEqual({ body: '안녕', files: [] }))
  it('꼬리의 첨부 블록을 파일·폴더로 가른다', () => {
    const r = splitAttach('이거 봐 줘\n\n첨부 파일 (읽어서 참고해):\n- /v/bot/a.md\n- /v/bot/사진/ (폴더 — 안의 파일들)')
    expect(r.body).toBe('이거 봐 줘')
    expect(r.files).toEqual([{ abs: '/v/bot/a.md', dir: false, name: 'a.md' }, { abs: '/v/bot/사진', dir: true, name: '사진' }])
  })
  it('본문이 비면 자리글이 본문이다', () => expect(splitAttach('첨부한 파일을 봐 줘.\n\n첨부 파일 (읽어서 참고해):\n- /v/x.txt').body).toBe('첨부한 파일을 봐 줘.'))
})
