import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const cc = require('../../desktop/clip-core.js')

// 2026-09-22 맥미니 · Electron 44.3.0 에서 되읽은 실제 형식 목록
const FILE_TYPES = ['text/uri-list', 'electron application/osclipboard;format="Apple URL pasteboard type"', 'electron application/osclipboard;format="CorePasteboardFlavorType 0x6675726C"', 'electron application/osclipboard;format="NSFilenamesPboardType"']
const IMAGE_TYPES = ['image/png', 'electron application/osclipboard;format="Apple PNG pasteboard type"', 'electron application/osclipboard;format="NeXT TIFF v4.0 pasteboard type"']
const TEXT_TYPES = ['text/plain', 'text/html', 'electron application/osclipboard;format="NSStringPboardType"']
const OSA_LIST_TYPES = ['electron application/osclipboard;format="CorePasteboardFlavorType 0x6C697374"', 'electron application/osclipboard;format="dyn.ah62d4rv4gk8024pxsu"']

describe('clip-core — Electron 44 클립보드 판정', () => {
  it('fileUri: 공백·한글은 encodeURI, ?·# 은 따로', () => {
    expect(cc.fileUri('/tmp/한 파일.txt')).toBe('file:///tmp/%ED%95%9C%20%ED%8C%8C%EC%9D%BC.txt')
    expect(cc.fileUri('/a/b#c?d.md')).toBe('file:///a/b%23c%3Fd.md')
    expect(cc.fileUri('C:\\My Vault\\a#b.md')).toBe('file:///C:/My%20Vault/a%23b.md')
    expect(cc.fileUri('\\\\server\\share\\a.md')).toBe('file://server/share/a.md')
  })
  it('uriList: CRLF 로 잇는다', () => { expect(cc.uriList(['/a', '/b c'])).toBe('file:///a\r\nfile:///b%20c') })
  it('shortTypes: osclipboard 포장을 벗긴다', () => {
    expect(cc.shortTypes(FILE_TYPES)).toEqual(['text/uri-list', 'Apple URL pasteboard type', 'CorePasteboardFlavorType 0x6675726C', 'NSFilenamesPboardType'])
  })
  it('hasFile: 파일 URL 목록은 ✅ · 글자만은 ❌ · osascript 목록({})의 list 형식은 ❌', () => {
    expect(cc.hasFile(FILE_TYPES)).toBe(true)
    expect(cc.hasFile(TEXT_TYPES)).toBe(false)
    expect(cc.hasFile(OSA_LIST_TYPES)).toBe(false)
    expect(cc.hasFile([])).toBe(false)
    expect(cc.hasFile(['electron application/osclipboard;format="CF_HDROP"'])).toBe(true)
  })
  it('Windows 파일 드롭 목록은 경로를 명령 문자열에 넣지 않는다', () => {
    const paths = ['C:\\A & B\\x.md', 'C:\\Users\\한글.txt']
    const c = cc.windowsFileDropCommand(paths)
    expect(c.bin).toBe('powershell.exe')
    expect(c.args.join(' ')).not.toContain(paths[0])
    expect(JSON.parse(Buffer.from(c.env.FOLDERBOT_CLIP_FILES, 'base64').toString('utf8'))).toEqual(paths)
  })
  it('hasImage: PNG/TIFF 는 ✅ · 파일·글자는 ❌', () => {
    expect(cc.hasImage(IMAGE_TYPES)).toBe(true)
    expect(cc.hasImage(FILE_TYPES)).toBe(false)
    expect(cc.hasImage(TEXT_TYPES)).toBe(false)
  })
})
