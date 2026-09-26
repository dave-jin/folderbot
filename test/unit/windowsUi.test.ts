import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { getPermMeta } from '../../src/client/Perms'
import { getKeys, toPlatformShortcut } from '../../src/client/App'

describe('Windows 11 UI adaptation · Permissions (Perms.tsx)', () => {
  it('Windows 11 환경에서 파일 탐색기 문구와 우측 하단 알림 안내를 제공한다', () => {
    const winMeta = getPermMeta(true)
    expect(winMeta['local-open'].why).toContain('파일 탐색기에서 보기')
    expect(winMeta['local-open'].why).toContain('이 PC에서 열려요')
    expect(winMeta['local-open'].why).toContain('OneDrive')
    expect(winMeta['full-disk'].title).toBe('파일 및 폴더 접근')
    expect(winMeta['notifications'].how.some((h) => h.includes('오른쪽 아래'))).toBe(true)
  })

  it('macOS 환경의 기존 권한 안내와 Finder 문구를 그대로 보존한다', () => {
    const macMeta = getPermMeta(false)
    expect(macMeta['local-open'].why).toContain('Finder 에서 보기')
    expect(macMeta['local-open'].why).toContain('메인 맥')
    expect(macMeta['local-open'].why).toContain('iCloud')
    expect(macMeta['full-disk'].title).toBe('전체 디스크 접근')
    expect(macMeta['notifications'].how.some((h) => h.includes('오른쪽 위'))).toBe(true)
  })
})

describe('Windows 11 UI adaptation · Shortcuts (App.tsx)', () => {
  it('toPlatformShortcut 이 Windows 에서 ⌘/⌥/⇧/↩/⎋ 를 적절한 키로 변환한다', () => {
    expect(toPlatformShortcut('⌘B', true)).toBe('Ctrl+B')
    expect(toPlatformShortcut('⌘⇧D', true)).toBe('Ctrl+Shift+D')
    expect(toPlatformShortcut('⌥⌘[', true)).toBe('Alt+Ctrl+[')
    expect(toPlatformShortcut('⌘↩', true)).toBe('Ctrl+Enter')
    expect(toPlatformShortcut('⎋', true)).toBe('Esc')
    expect(toPlatformShortcut('⌘B', false)).toBe('⌘B')
  })

  it('Windows 단축키 목록은 Ctrl 조합과 Windows 기본 실행 취소를 제공한다', () => {
    const winKeys = getKeys(true)
    const ctrlB = winKeys.find((k) => k.t === '폴더 목록 접기')
    expect(ctrlB?.k).toBe('Ctrl+B')
    const ctrlD = winKeys.find((k) => k.t === '문서 열 접기')
    expect(ctrlD?.k).toBe('Ctrl+Shift+D')
    const undo = winKeys.find((k) => k.t === '실행 취소')
    expect(undo?.k).toBe('Ctrl+Z')
    expect(undo?.d).toContain('Windows 기본')
  })

  it('macOS 단축키 목록은 ⌘ 기호와 맥 기본 실행 취소를 유지한다', () => {
    const macKeys = getKeys(false)
    const cmdB = macKeys.find((k) => k.t === '폴더 목록 접기')
    expect(cmdB?.k).toBe('⌘B')
    const cmdD = macKeys.find((k) => k.t === '문서 열 접기')
    expect(cmdD?.k).toBe('⌘⇧D')
    const undo = macKeys.find((k) => k.t === '실행 취소')
    expect(undo?.k).toBe('⌘Z')
    expect(undo?.d).toContain('맥 기본')
  })
})

describe('Windows 11 UI adaptation · Updates and Generic Host Labels', () => {
  const appTsx = readFileSync(new URL('../../src/client/App.tsx', import.meta.url), 'utf8')
  const settingsTsx = readFileSync(new URL('../../src/client/Settings.tsx', import.meta.url), 'utf8')

  it('App.tsx 에 Windows 수동 업데이트 상태 안내 및 supported 검사가 포함되어 있다', () => {
    expect(appTsx).toContain('Windows 앱 업데이트는 새 설치 파일로 진행해 주세요')
    expect(appTsx).toContain('Windows 수동 업데이트 · 새 설치 파일로 진행')
    expect(appTsx).toContain('st.supported === false')
  })

  it('Settings.tsx 에서 일반 호스트(generic host) 라벨과 Windows 맞춤 라벨을 제공한다', () => {
    expect(settingsTsx).toContain('호스트 터미널에서 claude → /login 을 해 주세요')
    expect(settingsTsx).toContain('파일 탐색기에서 보기')
    expect(settingsTsx).toContain('isWin ? "«파일 탐색기에서 보기»')
    expect(settingsTsx).toContain('isWin ? "시스템을 고르면 Windows 의 밝기 설정을 따라갑니다."')
  })
})

describe('Windows 11 UI adaptation · First-run connection (connect.html)', () => {
  const html = readFileSync(new URL('../../desktop/connect.html', import.meta.url), 'utf8')

  it('로컬 호스트(PC/Mac)와 원격 호스트 진입점 분리가 명확히 제공된다', () => {
    expect(html).toContain('id="host-title"')
    expect(html).toContain('id="host-desc"')
    expect(html).toContain('id="remote-desc"')
    expect(html).toContain('이 PC에서 호스트 실행 (Windows 로컬 호스트)')
    expect(html).toContain('네이티브 <span style=')
    expect(html).toContain('claude.exe</span> 설치와 로그인이 필요해요')
    expect(html).toContain('원격 호스트에 연결')
  })

  it('Windows 시스템 트레이를 안내한다', () => {
    expect(html).toContain('시스템 트레이')
  })
})

describe('Windows 11 UI adaptation · Window frame spacing (styles.css)', () => {
  const css = readFileSync(new URL('../../src/client/styles.css', import.meta.url), 'utf8')

  it('macOS는 좌측 신호등 여백(84px)을 유지한다', () => {
    expect(css).toMatch(/\.app\.desktop:not\(\.win\)\s+\.col\.side\.left\s+\.hdr[^}]*padding-left:\s*84px/)
  })

  it('Windows 11은 기본 창 프레임을 쓰므로 좌측 신호등 여백만 제거한다', () => {
    expect(css).toMatch(/\.app\.desktop\.win\s+\.col\.side\.left\s+\.hdr[^}]*padding-left:\s*14px/)
    expect(css).not.toMatch(/\.app\.desktop\.win[^}]*padding-right:\s*140px/)
  })
})
