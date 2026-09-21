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
  it('맥 파일 복사는 osascript 길을 갖고 있고, 쓴 뒤 되읽어 판정한다', () => {
    const main = read('main.js')
    expect(main).toMatch(/osascript/)
    expect(main).toMatch(/set the clipboard to \{\$\{refs\}\}/)
    expect(main).toMatch(/availableFormats\(\)/)          // 파일이 올라갔는지 되읽기
    expect(main).toMatch(/readImage\(\)\.isEmpty\(\)/)     // 그림이 올라갔는지 되읽기
  })
})
