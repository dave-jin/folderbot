import { useEffect, useState } from 'react'

export type Theme = 'auto' | 'light' | 'dark'
/**
 * 화면 테마 — 토큰(:root[data-theme]) 만 갈아끼운다. «시스템» 이면 matchMedia 로 지금 값을 정해 넣는다
 * (CSS 에 같은 팔레트를 두 벌 두지 않으려고 JS 가 정한다). 상태바 색(theme-color)도 함께 바꾼다.
 */
export function applyTheme(t: Theme): void {
  const dark = t === 'dark' || (t === 'auto' && !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches))
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#141414' : '#ffffff')
}
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('fb:theme') as Theme) || 'auto')
  useEffect(() => {
    applyTheme(theme); localStorage.setItem('fb:theme', theme)
    if (theme !== 'auto' || typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: light)'); const f = () => applyTheme('auto')
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f)
  }, [theme])
  return [theme, setTheme]
}


/**
 * 레일 폴더봇 크기 — 표정이 이 제품의 상태 표시다. 16px 에서는 눈·입이 안 보인다
 * (2026-09-13 Dave: *"너무 작게 보여서 귀여운 폴더 표정이 잘 안 보여"*).
 * 값은 이 기기에만 남는다(localStorage). 줄 높이가 아이콘을 따라가도록 CSS 변수(--fbi)로도 내보낸다.
 */
export type IconSize = 's' | 'm' | 'l'
export const ICON_PX: Record<IconSize, number> = { s: 16, m: 24, l: 32 }
export const ICON_LABEL: Record<IconSize, string> = { s: '작게', m: '보통', l: '크게' }
export function readIconSize(): IconSize {
  const v = (typeof localStorage !== 'undefined' && localStorage.getItem('fb:icon')) as IconSize | null
  return v === 's' || v === 'm' || v === 'l' ? v : 'm'
}
export function useIconSize(): [IconSize, (v: IconSize) => void] {
  const [sz, set] = useState<IconSize>(readIconSize)
  useEffect(() => {
    const f = () => set(readIconSize()); window.addEventListener('fb:iconsize', f)
    return () => window.removeEventListener('fb:iconsize', f)
  }, [])
  useEffect(() => { document.documentElement.style.setProperty('--fbi', `${ICON_PX[sz]}px`) }, [sz])
  const save = (v: IconSize) => { localStorage.setItem('fb:icon', v); set(v); window.dispatchEvent(new Event('fb:iconsize')) }
  return [sz, save]
}
