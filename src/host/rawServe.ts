/**
 * DA · 파일 원본(`/raw`) 을 «한 번 받은 것은 다시 안 받게» 내보낸다 (2026-10-17 Dave: *«PDF 열 때»* 가 원격에서 가장 오래 걸린다).
 *
 * 종전에는 `/raw` 가 `no-store` 였다 — 원격 맥이 같은 PDF 를 열 때마다, 탭을 오갈 때마다 파일 전체를 tailnet 너머로 다시 받았다.
 * ① **판 표식(ETag)** — 크기·수정 시각으로 만든다. 브라우저가 들고 있는 판과 같으면 304(몸통 없음)로 끝난다.
 *    `private, no-cache` 라 브라우저는 저장해 두되 **쓸 때마다 묻는다** — 봇이 고친 PDF 를 옛것으로 보여 주지 않는다.
 * ② **앞부분부터(Range)** — 크롬 PDF 보기는 서버가 `accept-ranges` 를 주면 첫 쪽에 필요한 조각부터 받는다.
 *    큰 PDF 를 다 받을 때까지 흰 판으로 기다리던 것이 첫 쪽부터 보인다.
 * ⛔ 내용 해시를 쓰지 않는다 — 수십 MB PDF 를 요청마다 읽게 된다. 크기+수정 시각이면 동기화·봇 쓰기를 다 잡는다.
 */
// ⚠ 강한 표식(W/ 없음)이다 — 크롬은 조각 응답을 이어 붙일 때(`If-Range`) 강한 표식만 믿는다
export function rawEtag(size: number, mtimeMs: number): string { return `"${size.toString(36)}-${Math.floor(mtimeMs).toString(36)}"` }

/**
 * `If-Range` — 조각을 받던 중 파일이 바뀌었으면 조각 대신 전체를 준다(옛 바이트와 새 바이트가 섞인 PDF 를 막는다).
 * 표식이면 같은지, 날짜면 수정 시각(초)이 그 날짜와 같은지 본다. 머리가 없으면 조각을 그대로 준다.
 */
export function ifRangeOk(header: string | undefined, tag: string, mtimeMs: number): boolean {
  if (!header) return true
  const h = header.trim()
  if (h.startsWith('"') || h.startsWith('W/')) return h === tag
  const t = Date.parse(h); return !Number.isNaN(t) && Math.floor(mtimeMs / 1000) === Math.floor(t / 1000)
}

/** `If-None-Match` 가 이 판을 들고 있나 — 여러 개(쉼표)와 `*` 도 받는다 */
export function etagHit(header: string | undefined, tag: string): boolean {
  if (!header) return false
  const bare = (t: string) => t.trim().replace(/^W\//, '')
  return header.split(',').some((t) => t.trim() === '*' || bare(t) === bare(tag))
}

/**
 * `Range: bytes=a-b` 한 조각만 받는다(여러 조각은 통째로 준다 — 크롬 PDF 보기는 한 조각씩 묻는다).
 * 돌려주는 값: 조각이면 `{ start, end }`(end 포함), 못 맞추면 `'bad'`(416), 없거나 모르는 꼴이면 `null`(전체).
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'bad' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  if (size <= 0) return 'bad'
  let start: number; let end: number
  if (m[1] === '') { const n = Number(m[2]); if (n <= 0) return 'bad'; start = Math.max(0, size - n); end = size - 1 }   // 끝에서 n 바이트
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1) }
  if (start >= size || start > end) return 'bad'
  return { start, end }
}
