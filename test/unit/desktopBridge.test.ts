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
