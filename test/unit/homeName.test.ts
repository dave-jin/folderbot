import { describe, it, expect } from 'vitest'
import { homeShort, manifestFor, titleIn } from '../../src/core/homeName'

describe('homeName — 폰 홈 화면 이름', () => {
  it('비우면 «FB » + 맥 이름', () => expect(homeShort('집 미니')).toBe('FB 집 미니'))
  it('12자에서 자른다', () => expect([...homeShort('스튜디오 미니 이층 작업실')]).toHaveLength(12))
  it('정한 이름은 그대로', () => expect(homeShort('x', '내 맥')).toBe('내 맥'))
  it('정한 이름도 12자에서 자른다', () => expect([...homeShort('x', '열세 글자가 넘는 아주 긴 이름')]).toHaveLength(12))
  it('공백뿐인 이름은 비운 것으로', () => expect(homeShort('집 미니', '   ')).toBe('FB 집 미니'))
  it('매니페스트는 이름 둘만 바꾼다', () => {
    const m = manifestFor({ name: 'Folder Bot', short_name: 'FolderBot', icons: [1] }, '집 미니') as Record<string, unknown>
    expect(m.name).toBe('Folder Bot · 집 미니'); expect(m.short_name).toBe('FB 집 미니'); expect(m.icons).toEqual([1])
  })
  it('iOS 제목 meta 의 content 만 바꾸고 이스케이프한다', () => {
    const out = titleIn('<head><meta name="apple-mobile-web-app-title" content="Folder Bot" /><title>Folder Bot</title></head>', 'A&B "q"')
    expect(out).toContain('<meta name="apple-mobile-web-app-title" content="A&amp;B &quot;q&quot;" />')
    expect(out).toContain('<title>Folder Bot</title>')
  })
})
