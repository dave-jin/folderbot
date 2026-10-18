import { api } from './api'

/**
 * 「이 이름 있어?」 답을 기억한다 (2026-10-18 · 파일 칸 느림).
 *
 * 봇 답은 다시 그려질 때마다(세션 오가기·스크롤·새 답) 같은 후보를 또 물었다. 세션 하나에 답이 수십 개라 호스트가
 * 같은 질문을 수백 번 받았다. 이제 한 번 들은 답은 여기서 꺼내고, 모르는 것만 묶어서 묻는다.
 * - 「있다」 는 `HIT_MS` 동안 믿는다 — 지워진 파일이면 칩이 열 때 없다고 말해 준다.
 * - 「없다」 는 어딘가 파일이 바뀌면(`files` 프레임) 버린다 — 봇이 방금 만든 파일이 칩이 되게.
 *   이름만 적힌 것은 볼트 전체에서 찾으므로 어느 봇의 바뀜이든 다 버린다.
 * - 같은 이름을 동시에 묻는 두 답은 요청 하나를 함께 기다린다.
 */
export type ExistsHit = { rel: string; dir: boolean; matches?: string[] }
type Ans = ExistsHit | false
const HIT_MS = 5 * 60_000
/** 「없다」 도 이만큼만 믿는다 — 감시가 안 닿는 곳(연결 리포·봇 없는 폴더)에 생긴 파일도 결국 칩이 되게 */
const MISS_MS = 60_000
/** `forgetMissing` 이 오를 때마다 +1 — 그 전에 떠난 요청의 「없다」 는 받아 적지 않는다 */
let epoch = 0
const known = new Map<string, { a: Ans; at: number }>()
const flying = new Map<string, Promise<Ans>>()
const k = (botId: string, c: string) => `${botId}\u0000${c}`

/** 파일이 바뀌었다 — 「없다」 답을 버린다 */
export function forgetMissing(): void { epoch++; for (const [key, v] of known) if (!v.a) known.delete(key) }

export async function askExists(botId: string, cands: string[]): Promise<Record<string, Ans>> {
  const out: Record<string, Ans> = {}; const wait: Array<[string, Promise<Ans>]> = []; const ask: string[] = []
  const now = Date.now()
  for (const c of cands) {
    const v = known.get(k(botId, c))
    if (v && now - v.at < (v.a ? HIT_MS : MISS_MS)) { out[c] = v.a; continue }
    const f = flying.get(k(botId, c)); if (f) { wait.push([c, f]); continue }
    ask.push(c)
  }
  if (ask.length) {
    const req = api<Record<string, Ans>>(`/bots/${botId}/exists`, { body: { rels: ask } }); const sent = epoch
    for (const c of ask) {
      // ⚠ 묻는 사이 파일이 바뀌었으면(`files` 프레임) 이 「없다」 는 낡았을 수 있다 — 이번 답으로만 쓰고 적지 않는다
      const p = req.then((r) => { const a = r[c] ?? false; if (a || sent === epoch) known.set(k(botId, c), { a, at: Date.now() }); return a })
        .finally(() => flying.delete(k(botId, c)))
      flying.set(k(botId, c), p); wait.push([c, p])
    }
  }
  const vals = await Promise.all(wait.map(([, p]) => p))   // ⚠ 하나씩 await 하면 요청이 실패했을 때 나머지가 «처리 안 된 거절» 로 남는다
  wait.forEach(([c], i) => { out[c] = vals[i] })
  return out
}

/** 검사용 */
export function _resetExists(): void { known.clear(); flying.clear(); epoch = 0 }
