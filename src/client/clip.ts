/**
 * 복사 — 🔴 **원격에서만 안 되던 이유** (2026-09-13 Dave: *«복사기능이 원격에서만 안돼»*).
 *
 * `navigator.clipboard` 는 **보안 컨텍스트**(https 또는 localhost)에서만 있다. 호스트 맥에서는
 * `http://127.0.0.1:7373` 이라 localhost 예외로 살아 있지만, 폰·다른 맥에서 여는 주소는
 * `http://100.x.x.x:7373`(Tailscale) 이라 **그 객체 자체가 없다** — `?.` 때문에 조용히 아무 일도
 * 안 일어났다(오류도 안 났다. 그래서 «가끔 안 되는 것» 처럼 보였다).
 *
 * ⚠ 그래서 **두 길**을 둔다: 있으면 표준 API, 없으면 숨은 `textarea` + `execCommand('copy')`.
 *    옛 방식이지만 보안 컨텍스트를 안 따진다 — 이 자리에서는 그게 유일한 길이다.
 * ⚠ 붙여넣는 곳이 글자를 받으므로 **되돌아오는 값으로 성공을 판정**한다 — «복사했어요» 를 먼저
 *    띄우고 실패하면 사람이 빈 클립보드를 붙여넣는다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* 권한 거부 · 비보안 컨텍스트 — 아래로 떨어진다 */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // ⚠ 화면 밖으로 보내되 `display:none` 은 안 된다 — 안 보이는 요소는 선택이 안 잡힌다
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.select(); ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

/** 복사하고 그 결과를 말해 준다 — 실패를 조용히 넘기지 않는다(원격에서 그게 이 버그였다) */
export async function copySay(text: string, say: (m: string) => void, what = '복사했어요'): Promise<void> {
  say(await copyText(text) ? what : '복사를 못 했어요 — 길게 눌러 직접 복사해 주세요')
}
