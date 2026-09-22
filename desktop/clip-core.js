/**
 * 클립보드 판정 — 순수 함수. Electron 에 기대지 않는다(유닛 `test/unit/clipCore.test.ts`).
 *
 * 🔴 **Electron 44 는 clipboard 를 W3C 식으로 통째로 갈았다** (2026-09-22 맥미니 실측 · M «다 안 된다» 의 뿌리).
 *    `writeImage`·`readImage`·`writeBuffer`·`readBuffer`·`availableFormats` 가 **없다**. 남은 것은
 *    `read()`·`write([ClipboardItem])`·`readText`·`writeText`·`has(mime)`·`clear` 여섯 개뿐이고 전부 Promise 다.
 *    v126 까지의 복사 핸들러는 없어진 함수를 불러 한 줄씩 `TypeError` 로 죽었다 — 그림·파일·진단 전부.
 *
 * 실측으로 확인한 길 (Electron 44.3.0 · macOS · `the clipboard as «class furl»` 로 되읽음):
 *   · 그림  `ClipboardItem({'image/png': Blob})` → `image/png` + Apple PNG + TIFF 가 올라간다(메모·카톡이 받는 모양)
 *   · 파일  `ClipboardItem({'text/uri-list': 'file://…\r\nfile://…'})` → `public.file-url`(0x6675726C) + `NSFilenamesPboardType`
 *           — Finder ⌘V 가 읽는 바로 그 형식. 한글 이름·폴더·여러 개 모두 plist 에 들어간다.
 *   ⛔ 파일 URL 과 `text/plain` 을 **한 ClipboardItem 에 같이 쓰지 않는다** — 같이 쓰면 파일 URL 이 폴더까지만 남는다(실측).
 *   ⛔ `osascript … set the clipboard to {POSIX file …}` (목록) 은 `'list'` 형식만 올려 Finder 가 못 읽는다.
 *      파일 **하나**를 괄호 없이 주면 furl 이 올라간다 — 그래서 폴백은 한 개일 때만.
 *   · 되읽은 형식은 `electron application/osclipboard;format="<OS 이름>"` 으로 온다 — `shortTypes` 가 안쪽 이름만 남긴다.
 */
const OS_FMT = /^electron application\/osclipboard;format="(.*)"$/
/** `file://` URL — 공백·한글은 encodeURI, `?`·`#` 은 따로(encodeURI 가 안 건드린다) */
function fileUri(p) { return 'file://' + encodeURI(String(p)).replace(/[?#]/g, encodeURIComponent) }
/** `text/uri-list` 본문 — RFC 2483 은 CRLF */
function uriList(paths) { return paths.map(fileUri).join('\r\n') }
/** 되읽은 MIME 목록에서 OS 형식 이름만 남긴다 */
function shortTypes(types) { return (types || []).map((t) => { const m = OS_FMT.exec(t); return m ? m[1] : t }) }
/** Finder·카톡이 파일로 읽을 수 있는 형식이 하나라도 있나 */
function hasFile(types) { return shortTypes(types).some((t) => /NSFilenamesPboardType|public\.file-url|0x6675726C|^text\/uri-list$/i.test(t)) }
/** 메모·카톡이 그림으로 붙일 수 있는 형식이 하나라도 있나 */
function hasImage(types) { return shortTypes(types).some((t) => /^image\/(png|tiff)$|Apple PNG|TIFF/i.test(t)) }
module.exports = { fileUri, uriList, shortTypes, hasFile, hasImage }
