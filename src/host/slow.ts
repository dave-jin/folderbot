/**
 * 🔴 **CI-3 · 멈춘 동안 무엇이 돌았나** (2026-10-16 오케스트레이터 제보 — 22:25~22:28 «호스트가 N ms 멈췄어요» 가
 *    수십 번 찍혔는데 원인을 못 짚었다. 10/16 하루에 269번 · 그 전 날들은 20~40번).
 *
 * 멈춤 시계(gateway `watchLoop`)는 «얼마나» 만 안다. 여기서는 «무엇이» 를 남긴다 — 일 하나를 시작할 때 `mark(이름)` 을 부르면
 * `setImmediate` 가 그 동기 덩어리가 끝난 뒤에야 돌므로, 시작부터 그때까지가 그 일이 이벤트 루프를 쥔 시간이다.
 * 같은 창에서 다른 일이 막았으면 그 시간도 함께 잡히지만, 가장 먼저 시작해 가장 길게 잡힌 일이 범인이다.
 * 기록된 일이 하나도 없으면 범인은 호스트 밖(앱 화면·트레이·GC)이다 — 그것도 단서다.
 */
const KEEP = 40
const MIN_MS = 300
const recent: { label: string; ms: number; end: number }[] = []

export function mark(label: string): void {
  const t = performance.now()
  setImmediate(() => {
    const end = performance.now(); const ms = end - t
    if (ms < MIN_MS) return
    recent.push({ label, ms: Math.round(ms), end })
    if (recent.length > KEEP) recent.splice(0, recent.length - KEEP)
  })
}

/** 지금부터 `windowMs` 안에 끝난 긴 일 — 길이 순 셋 · 없으면 빈 글 */
export function slowSince(windowMs: number, now = performance.now()): string {
  const hit = recent.filter((x) => now - x.end <= windowMs).sort((a, b) => b.ms - a.ms).slice(0, 3)
  return hit.map((x) => `${x.label} ${x.ms}ms`).join(' · ')
}

/** 로그에 남길 경로 이름 — id 는 지운다(같은 경로끼리 묶이게 · 세션 id 는 기록할 값이 아니다) */
export function routeLabel(method: string | undefined, url: string | undefined): string {
  const p = (url ?? '').split('?')[0].replace(/\/(?:s|b)_[a-z0-9]+/g, '/:id').replace(/\/[0-9a-f-]{16,}/g, '/:id')
  return `${method ?? 'GET'} ${p}`
}
