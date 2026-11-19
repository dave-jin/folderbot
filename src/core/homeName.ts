/**
 * 여러 맥 — 폰 홈 화면 이름 (2026-11-19).
 *
 * 폰은 맥마다 홈 화면 앱을 따로 설치한다(11/19 Dave). 그런데 어느 맥에서 설치해도 이름이 «FolderBot» 이라
 * 두 개를 깔면 홈 화면에서 구분이 안 됐다. 그래서 호스트가 매니페스트와 `index.html` 의 iOS 제목을 그 맥 이름으로 채워 준다.
 * ⚠ 12자는 «글자 수 그대로» 다(한글·영문 모두 1) — 볼트 todo 제목 규칙(영문 2자=1자)과 다르다. iPhone 아이콘 밑이 그만큼이다.
 */
export const HOME_MAX = 12
const cut = (s: string) => [...s].slice(0, HOME_MAX).join('').trim()

export function homeShort(hostName: string, homeName?: string): string {
  const own = (homeName ?? '').trim()
  return cut(own || `FB ${hostName.trim()}`)
}

export function manifestFor(base: Record<string, unknown>, hostName: string, homeName?: string): Record<string, unknown> {
  return { ...base, name: `Folder Bot · ${hostName.trim()}`, short_name: homeShort(hostName, homeName) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function titleIn(html: string, short: string): string {
  return html.replace(/(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*(")/, (_m, a: string, b: string) => `${a}${esc(short)}${b}`)
}
