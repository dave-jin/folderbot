/**
 * 알림 → 그 대화로 (2026-09-17 Dave: «알람 버튼 클릭하면 해당 세션으로 이동해야 해. 현재는 뭔가 버그가 있어»).
 *
 * 🔴 **창이 없을 때가 문제였다.** 메뉴바 앱이라 창을 닫아 두는 게 보통인데, 그때 배너를 누르면 셸은 목적지만
 *    적어 두고(`pendingNav`) **창을 안 만들었다** — 아무 일도 안 일어나고, 한참 뒤 트레이로 창을 열면 그제야
 *    묵은 목적지로 튀었다. 창이 없으면 만들고, 목적지는 **첫 로드 URL 에 실어** 보낸다.
 * ⚠ URL 에 싣는 이유: 호스트 모드의 첫 로드는 `#token=…` 을 달고 오고 화면은 토큰을 떼며 **한 번 리로드**한다.
 *    창이 뜬 뒤 `location.hash` 를 따로 놓으면 그 리로드와 경합해 지거나 이긴다(어느 쪽인지는 그날 운이다).
 *    같은 해시에 함께 실으면 화면이 토큰만 떼고 나머지(`bot`·`s`)는 그대로 둔다 — 경합이 없다.
 * ⚠ 정책을 순수 함수로 둔다 — 셸은 넘겨 받아 쓰기만 하고 유닛테스트가 고정한다(`winBounds.js` 와 같은 결).
 */

/** 알림 한 건 → 화면 해시. 세션이 없는 알림(로그인·할 일)은 폴더까지만 */
function navHash(n) {
  if (!n || !n.botId) return ''
  const enc = encodeURIComponent
  return `bot=${enc(n.botId)}${n.sessionId ? `&s=${enc(n.sessionId)}` : ''}`
}

/** URL 에 해시를 싣는다 — 이미 해시(`#token=…`)가 있으면 `&` 로 잇고, 없으면 `#` 로 연다. 빈 해시면 그대로 */
function withHash(url, hash) {
  const h = String(hash || '').replace(/^#/, '')
  if (!h) return url
  const i = url.indexOf('#')
  if (i < 0) return `${url}#${h}`
  const cur = url.slice(i + 1)
  return cur ? `${url}&${h}` : `${url}${h}`
}

module.exports = { navHash, withHash }
