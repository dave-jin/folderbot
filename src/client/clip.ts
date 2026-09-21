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
/**
 * 🔴 **http 로 연 화면에는 클립보드·공유 시트가 아예 없다** (2026-09-21 · Dave 의 «폰 공유가 안 된다» 보고에서 다시 확인).
 *    `navigator.clipboard`·`ClipboardItem`·`navigator.share` 는 **보안 컨텍스트**(https·localhost)에서만 산다.
 *    폰은 Tailscale 의 `http://100.x.x.x:7373` 로 열기 때문에 그 객체들이 없고, 종전에는 그저 «못 해요» 라고만 했다 —
 *    무엇을 해야 되는지가 빠져 있었다. 이제 **이유와 다음 걸음**을 같이 말한다.
 */
export function insecureWhy(): string | null {
  if (typeof window === 'undefined' || window.isSecureContext) return null
  return 'http 주소로 열어서(폰·다른 맥) 브라우저가 클립보드·공유를 막아요'
}

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

/**
 * 이미지를 클립보드에 (M-2 · 2026-09-19). 세 길 —
 * ① 맥 앱(호스트·원격 Electron): 셸의 `clipboard.writeImage`(nativeImage) — 호스트는 파일에서, 원격은 호스트 raw 를 받아서. 메모·슬랙에 ⌘V 로 그대로 붙는다.
 * ② Safari: `ClipboardItem` 에 **Promise<Blob>** 을 넣어야 한다 — 사용자 제스처 안에서 write 를 먼저 부르고 그림은 뒤에 온다. PNG 로 굽는다(JPEG 도).
 * ③ 그 밖 브라우저: 받아서 PNG 로 구운 뒤 `ClipboardItem`. 못 하는 환경이면 false — 부르는 쪽이 안내한다.
 */
export async function copyImage(url: string, abs?: string): Promise<boolean> { return (await copyImageWhy(url, abs)).ok }
/** 왜 못 했는지까지 — 맥 앱은 클립보드를 **되읽어** 판정한다(2026-09-21 Dave: «다 안되는거 같아») */
export async function copyImageWhy(url: string, abs?: string): Promise<{ ok: boolean; why?: string }> {
  const b = (window as unknown as { folderbotDesktop?: { local?: { copyImage?: (a: { url?: string; path?: string }) => Promise<{ ok: boolean; why?: string } | boolean> } } }).folderbotDesktop?.local
  if (b?.copyImage) { try { const r = await b.copyImage({ url: location.origin + url, path: abs }); return typeof r === 'boolean' ? { ok: r, why: r ? undefined : '맥 앱이 복사를 못 했어요' } : r } catch (e) { return { ok: false, why: `맥 앱 오류 — ${(e as Error).message}` } } }
  const toPng = async (): Promise<Blob> => {
    const res = await fetch(url); const blob = await res.blob()
    if (blob.type === 'image/png') return blob
    const bmp = await createImageBitmap(blob); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d')?.drawImage(bmp, 0, 0)
    return new Promise<Blob>((ok, no) => cv.toBlob((x) => (x ? ok(x) : no(new Error('png'))), 'image/png'))
  }
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return { ok: false, why: insecureWhy() ? `${insecureWhy()} — 그림을 길게 눌러 복사해 주세요` : '이 브라우저는 그림 복사를 못 해요 — 길게 눌러 복사해 주세요' }
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const item = safari ? new ClipboardItem({ 'image/png': toPng() }) : new ClipboardItem({ 'image/png': await toPng() })
    await navigator.clipboard.write([item]); return { ok: true }
  } catch (e) { return { ok: false, why: `그림 복사 실패 — ${(e as Error).message}` } }
}
