/**
 * 줄 단위 전후 비교 — 「파일 전후 diff」(루프 6/10).
 *
 * 🔴 **순수 함수다** — 호스트는 «건드리기 전» 을 붙잡아 두기만 하고, 비교는 화면이 한다(둘 다 이 파일).
 * ⚠ 앞뒤 같은 줄은 먼저 걷어낸다 — 큰 파일의 한 줄 고침이 O(n·m) 표를 만들지 않게.
 *    남은 가운데가 그래도 크면(칸 200만 개 초과) **통째로 «지움·넣음»** 으로 갈음한다 — 느린 정답보다 빠른 근사.
 */
export interface DiffLine { t: '=' | '+' | '-'; s: string }
export type DiffRow = DiffLine | { t: '~'; n: number; lines: string[] }

const CELLS = 2_000_000

function lines(s: string): string[] {
  if (!s) return []
  const a = s.split('\n')
  if (a[a.length - 1] === '') a.pop()
  return a
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = lines(before); const b = lines(after)
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const out: DiffLine[] = a.slice(0, head).map((s) => ({ t: '=', s }))
  const am = a.slice(head, a.length - tail); const bm = b.slice(head, b.length - tail)
  if (am.length && bm.length && am.length * bm.length <= CELLS) {
    // LCS 표 — 뒤에서 앞으로 채우고 앞에서 뒤로 읽는다
    const n = am.length; const m = bm.length
    const dp = new Uint32Array((n + 1) * (m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * (m + 1) + j] = am[i] === bm[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1])
    let i = 0; let j = 0
    while (i < n && j < m) {
      if (am[i] === bm[j]) { out.push({ t: '=', s: am[i] }); i++; j++ }
      else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) { out.push({ t: '-', s: am[i] }); i++ }
      else { out.push({ t: '+', s: bm[j] }); j++ }
    }
    while (i < n) out.push({ t: '-', s: am[i++] })
    while (j < m) out.push({ t: '+', s: bm[j++] })
  } else {
    for (const s of am) out.push({ t: '-', s })
    for (const s of bm) out.push({ t: '+', s })
  }
  for (const s of a.slice(a.length - tail)) out.push({ t: '=', s })
  return out
}

export function diffStat(d: DiffLine[]): { add: number; del: number } {
  let add = 0; let del = 0
  for (const l of d) { if (l.t === '+') add++; else if (l.t === '-') del++ }
  return { add, del }
}

/** 같은 줄이 길게 이어지면 가운데를 접는다 — 앞뒤 `ctx` 줄만 남기고 `~` 행(접힌 줄 수)으로 */
export function foldSame(d: DiffLine[], ctx = 3): DiffRow[] {
  const out: DiffRow[] = []
  let i = 0
  while (i < d.length) {
    if (d[i].t !== '=') { out.push(d[i]); i++; continue }
    let j = i
    while (j < d.length && d[j].t === '=') j++
    const run = d.slice(i, j)
    const first = i === 0; const last = j === d.length
    const keepHead = first ? 0 : ctx; const keepTail = last ? 0 : ctx
    if (run.length > keepHead + keepTail + 1) {
      out.push(...run.slice(0, keepHead))
      const mid = run.slice(keepHead, run.length - keepTail)
      out.push({ t: '~', n: mid.length, lines: mid.map((l) => l.s) })
      out.push(...run.slice(run.length - keepTail))
    } else out.push(...run)
    i = j
  }
  return out
}
