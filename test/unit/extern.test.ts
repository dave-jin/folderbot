import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { externalOk } = require('../../desktop/extern.js') as { externalOk: (url: unknown) => boolean }

/**
 * 셸이 화면의 새 창 요청(`window.open` · `target=_blank`)을 기본 브라우저로 넘길 때 거르는 문 (2026-11-12).
 * 종전에는 거르지 않아, 문서 창의 html 보기(격리 틀) 안의 스크립트가 `window.open("smb://…")` 같은 주소를 맥으로 넘길 수 있었다(`file:` 은 크롬이 먼저 막았다).
 */
describe('바깥으로 넘겨도 되는 주소', () => {
  it('웹 · 메일 · 전화는 넘긴다', () => {
    for (const u of ['https://example.com/a?b=1#c', 'http://127.0.0.1:7373/api/bots/x/raw?rel=a.pdf', 'HTTPS://EXAMPLE.COM', 'mailto:a@example.com', 'tel:+821012345678']) expect(externalOk(u)).toBe(true)
  })
  it('파일 · 공유 폴더 · 스크립트 · 다른 앱을 여는 주소는 넘기지 않는다', () => {
    for (const u of ['file:///Users/x/evil.command', 'FILE:///etc/hosts', 'smb://host/share', 'afp://host/share', 'ftp://host/x', 'javascript:alert(1)', 'data:text/html,<script>1</script>', 'blob:http://x/y', 'x-apple.systempreferences:com.apple.preference.security', 'shortcuts://run-shortcut?name=x', 'ssh://host', 'vnc://host']) expect(externalOk(u)).toBe(false)
  })
  it('주소가 아니면 넘기지 않는다', () => {
    for (const u of ['', '   ', 'not a url', '/api/bots', '//example.com/x', undefined, null, 42, {}]) expect(externalOk(u)).toBe(false)
  })
  it('앞뒤 공백 · 제어 글자로 감춘 스킴도 같은 답이다', () => {
    expect(externalOk('  https://example.com  ')).toBe(true)
    expect(externalOk('\tfile:///x')).toBe(false)
    expect(externalOk('java\nscript:alert(1)')).toBe(false)
  })
})
