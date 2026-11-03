/**
 * 폰에서 바깥으로 열기 (OL · 2026-11-04 Dave: «모바일에서 파일이나 웹페이지를 열었을 때 외부에서 열기 혹은 사파리에서 열기 등의 세부 메뉴»
 * · 캡처: 홈 화면 웹 앱에서 링크가 앱 안 브라우저로만 열리고 그 안의 «Safari 로» 가 안 됐다).
 *
 * 🔴 **홈 화면 웹 앱(standalone)의 `_blank` 는 Safari 가 아니라 iOS 의 앱 안 브라우저로 간다.** 그래서 그 앱에서는
 *    링크를 누르면 바로 열지 않고 우리 시트를 띄운다 — Safari 에서 열기 · 앱 안에서 보기 · 다른 앱으로 · 링크 복사.
 * ⚠ Safari 로 넘기는 길은 `x-safari-https://` 주소 하나뿐이다. iOS 판마다 된다·안 된다 보고가 엇갈린다(2026-11 검색 —
 *    iOS 15·17·18·26 에서 됐다는 보고, 16·18.5 에서 안 됐다는 보고). 그래서 시트에 «링크 복사» 를 늘 함께 둔다.
 */

/** `https://…` → `x-safari-https://…` (http 도). 다른 주소면 null */
export function safariUrl(url: string): string | null {
  const m = /^(https?):\/\/(.+)$/i.exec(url.trim())
  return m ? `x-safari-${m[1].toLowerCase()}://${m[2]}` : null
}

/**
 * 호스트의 절대 경로 → Dropbox 웹 주소. Dropbox 밖이면 null.
 * - 폴더: `https://www.dropbox.com/home/<경로>`
 * - 파일: `https://www.dropbox.com/home/<폴더>?preview=<이름>` (Dropbox 웹의 미리보기 주소)
 * ⚠ 토큰이 든 호스트 주소(`/api/…/raw?token=`)를 Safari 나 클립보드로 내보내지 않으려는 길이다 — 기록·동기화에 토큰이 남는다.
 */
export function dropboxWebUrl(abs: string, dir = false): string | null {
  const m = /\/(?:Library\/CloudStorage\/)?Dropbox(?:-[^/]+)?\/(.+)$/.exec(abs.normalize('NFC').replace(/\/+$/, ''))
  if (!m) return null
  const parts = m[1].split('/').filter(Boolean)
  if (!parts.length) return null
  const enc = (ps: string[]) => ps.map((p) => encodeURIComponent(p)).join('/')
  if (dir) return `https://www.dropbox.com/home/${enc(parts)}`
  const name = parts.pop()!
  return `https://www.dropbox.com/home/${enc(parts)}?preview=${encodeURIComponent(name)}`
}

/** 이 링크를 우리 시트로 받을까 — 바깥(http) 링크이고, 같은 호스트의 API 가 아닐 때 */
export function isExternalLink(href: string, origin: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false
  try { const u = new URL(href); return u.origin !== origin } catch { return false }
}
