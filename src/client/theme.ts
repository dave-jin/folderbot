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

