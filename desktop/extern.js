/**
 * 바깥(기본 브라우저 · 메일 · 전화)으로 넘겨도 되는 주소인가 (2026-11-12).
 *
 * 셸은 화면의 새 창 요청(`window.open` · `target=_blank`)을 앱 안에서 열지 않고 `shell.openExternal` 로 넘긴다.
 * 종전에는 주소를 거르지 않았다. 그래서 문서 창의 html 보기(격리 틀 · `allow-popups`) 안의 스크립트가
 * `window.open("smb://…")` 을 부르면 그 주소가 그대로 맥으로 넘어갔다(2026-11-12 실제 앱에서 잼 · `test/mac-qa.mjs` ⑭).
 * `smb:` · `afp:` 는 공유 폴더를 붙이고, 다른 앱의 주소(`shortcuts:` 등)는 그 앱을 띄운다.
 * (`file:` 은 크롬이 먼저 막아 여기까지 오지 않았다 — 그래도 목록에 없으니 와도 안 넘긴다.)
 *
 * 🔴 **허용 목록이다 — 막을 것을 세지 않는다.** 맥에 깔린 앱마다 주소 종류가 늘어나므로 막을 목록은 늘 모자란다.
 * ⛔ 여기에 `file:` 을 더하지 않는다. 파일은 **셸의 제 길**(IPC `fb:local-open` · `fb:local-reveal`)로만 연다.
 * - 봇 답의 링크는 거르개가 http · https · mailto · tel 만 남기고, 편집기 링크는 http(s)만 잡는다 — 이 목록이 깨는 기능은 없다.
 * ⚠ 정책은 여기 순수 함수로 둔다 — 유닛테스트(`test/unit/extern.test.ts`)가 고정한다.
 */
const OK = new Set(['https:', 'http:', 'mailto:', 'tel:'])

/** 주소가 아니거나(빈 글 · 상대 경로 · 글이 아닌 값) 목록 밖 종류면 false. 종류는 `URL` 이 읽은 대로 본다 — 앞뒤 공백 · 대문자 · 사이에 낀 줄바꿈에 속지 않는다 */
function externalOk(url) {
  if (typeof url !== 'string') return false
  try { return OK.has(new URL(url.trim()).protocol) } catch { return false }
}

module.exports = { externalOk }
