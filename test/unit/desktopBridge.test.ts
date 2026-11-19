import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
/**
 * 🔴 **셸의 두 쪽이 갈라지면 조용히 아무 일도 안 일어난다** (2026-09-21 · M 복사가 «다 안 됨» 으로 보고된 뒤에 세웠다).
 *    preload 가 `ipcRenderer.invoke('fb:x')` 를 부르는데 main 에 `ipcMain.handle('fb:x')` 가 없으면,
 *    화면에서는 promise 가 거절될 뿐이라 «그냥 안 되는» 기능이 된다. 이름 대조는 사람이 할 일이 아니다.
 */
const read = (f: string) => readFileSync(join(process.cwd(), 'desktop', f), 'utf8')
describe('셸 통로 — preload ↔ main 이름이 같다', () => {
  it('preload 가 부르는 invoke 채널은 모두 main 에 핸들러가 있다', () => {
    const pre = read('preload.js'), main = read('main.js')
    const invoked = [...pre.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1])
    const handled = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]))
    expect(invoked.length).toBeGreaterThan(10)
    expect(invoked.filter((c) => !handled.has(c))).toEqual([])
  })
  it('복사 통로가 둘 다 있다 — copyImage · copyFiles · copyDiag', () => {
    const pre = read('preload.js')
    for (const k of ['fb:local-copy-image', 'fb:local-copy-files', 'fb:copy-diag']) expect(pre).toContain(k)
  })
  /**
   * 🔴 Electron 44 의 clipboard 는 W3C 식 비동기 API 다 — 옛 함수를 하나라도 부르면 그 핸들러는 TypeError 로 죽는다
   *    (2026-09-22 맥미니 실측 · M «다 안 된다» 의 뿌리). 이 검사는 «옛 함수 0건 + 새 길 + 되읽기» 를 못 박는다.
   */
  it('맥 복사는 Electron 44 의 새 clipboard API 만 쓰고, 쓴 뒤 되읽어 판정한다', () => {
    const main = read('main.js')
    // 코드 줄에서만 센다(머리말 주석은 옛 이름을 설명하느라 적는다)
    const code = main.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/clipboard\.(writeImage|readImage|writeBuffer|readBuffer|availableFormats)\(/)
    expect(code).toMatch(/new ClipboardItem\(\{ 'image\/png':/)          // 그림 — image/png 로
    expect(code).toMatch(/new ClipboardItem\(\{ 'text\/uri-list':/)      // 파일 — 파일 URL 목록으로(Finder 가 읽는 형식)
    expect(code).not.toMatch(/'text\/uri-list': [^}]*'text\/plain'/)     // ⛔ 파일 URL 과 글자를 한 항목에 같이 싣지 않는다
    expect(code).toMatch(/clipTypes\(\)/)                               // 되읽기
    expect(code).toMatch(/clipCore\.hasFile\(/); expect(code).toMatch(/clipCore\.hasImage\(/)
    expect(code).toMatch(/set the clipboard to POSIX file/)              // 폴백 — 파일 하나(괄호 없이)
    expect(code).not.toMatch(/set the clipboard to \{/)                 // ⛔ {목록} 은 'list' 형식만 올라가 Finder 가 못 읽는다
  })
})

/**
 * 여러 맥 (2026-11-19) — 셸이 «호스트 하나» 를 가정하던 자리를 «지금 맥 + 맥 목록» 으로 옮겼는지.
 * 옛 `settings.hostUrl`·`settings.token` 을 다시 읽기 시작하면 맥을 바꿔도 옛 맥의 토큰·주소가 새어 들어간다.
 */
describe('여러 맥 — 셸이 지금 맥을 쓴다', () => {
  const code = read('main.js').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  it('옛 hostUrl 을 읽지 않는다(옮겨 담기 한 곳만)', () => expect((code.match(/settings\.hostUrl(?!\s*=[^=])/g) || []).length).toBeLessThanOrEqual(1))
  it('옛 token 을 읽지 않는다', () => expect((code.match(/settings\.token(?!\s*=[^=])/g) || []).length).toBe(0))
  it('원격 사본 폴더는 맥 id 로 나눈다', () => {
    const calls = [...code.matchAll(/cachePath\(([^,]+),\s*([^,]+),/g)].map((m) => m[2].trim())
    expect(calls.length).toBeGreaterThan(0); for (const a of calls) expect(a).toMatch(/\.id\b/)
  })
  it('업데이트의 «바쁜가» 는 이 맥 호스트만 센다', () => expect(code).toMatch(/const busyCount = \(\) => links\.busy\('local'\)/))
})

describe('여러 맥 — 맥 메뉴 · 통로 · 연결 화면', () => {
  it('preload 가 맥 통로를 연다', () => {
    const pre = read('preload.js')
    for (const k of ["'fb:macs-list'", "'fb:macs-add'", "'fb:macs-remove'", "'fb:macs-switch'", "'fb:macs'"]) expect(pre).toContain(k)
  })
  it('네이티브 «맥» 메뉴가 ⌃⌘숫자로 맥을 고른다', () => {
    const main = read('main.js')
    expect(main).toMatch(/label: '맥', submenu/); expect(main).toContain("`Ctrl+Cmd+${")
  })
  it('연결 화면은 맥 목록과 새 맥 추가(주소 + 페어링 코드)', () => {
    const c = read('connect.html')
    expect(c).toContain('folderbotDesktop.macs'); expect(c).toContain('id="code"'); expect(c).toContain('새 맥 추가')
  })
})

/** 여러 맥 — 최종 검토(11/19)에서 고친 것들. 셸 코드는 실 앱 밖에서 못 돌려 글로 못 박는다(실 앱은 qa:mac) */
describe('여러 맥 — 검토 뒤 고친 것', () => {
  const code = read('main.js').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  it('토큰 사본은 열쇠고리(safeStorage)가 아니라 0600 파일 — 임시 서명이라 판마다 열쇠고리 창이 뜬다', () => { expect(code).not.toMatch(/safeCodec\(/); expect(code).toMatch(/createTokenStore\(.*plainCodec\)/) })
  it('로그아웃(빈 토큰)은 그 맥 토큰을 지운다 — 첫 로드(#token=)는 빼고', () => { const h = code.split('\n').find((l) => l.includes("ipcMain.on('fb:token'")) || ''; expect(h).toMatch(/tokens\.del\(m\.id\)/); expect(h).toMatch(/token=/) })
  it('원격 맥은 열기 전에 시한 있는 확인부터 — 꺼진 맥에 75초 매달리지 않게', () => expect(code).toMatch(/AbortSignal\.timeout\(/))
  it('아무도 안 쓰는 folderbot-connect:// 길이 없다', () => expect(code).not.toMatch(/folderbot-connect:\/\//))
  it('맥 추가·빼기는 연결 화면(file://)에서 온 요청만', () => { for (const ch of ['fb:macs-add', 'fb:macs-remove']) expect(code.split('\n').find((l) => l.includes(`ipcMain.handle('${ch}'`)) || '').toMatch(/fromConnect\(e\)/) })
  it('호스트는 SSE 에 심박을 보내고 헬스에 호스트 id 를 싣는다', () => { const g = readFileSync(join(process.cwd(), 'src/host/gateway.ts'), 'utf8'); expect(g).toContain("': ping\\n\\n'"); expect(g).toMatch(/hostId:/) })
})
