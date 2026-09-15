/**
 * 지난 대화 찾기 (루프 7/10) — 볼트 전체의 세션에서 **이름과 말**을 훑는다.
 *
 * 🔴 **순수 함수다** — 호스트가 세션 기록을 넘기고, 여기서 고른다. 어느 봇의 것이든 한 목록이다.
 * ⚠ 비교는 `core/search` 와 같은 NFC·소문자 규칙이다 — 폴더 찾기에서 걸리는 말이 여기서 안 걸리면 안 된다.
 * ⚠ 이름 일치가 말 일치보다 위, 같은 등급이면 **최근 것**이 위. 한 세션은 한 번만(가장 좋은 자리로).
 * ⚠ 토막(snippet)은 걸린 자리 앞뒤 40자 — 문서가 아니라 «어느 대화였지» 를 떠올리는 실마리다.
 */
import { norm } from './search'

export interface ConvItem { kind: string; text?: string }
export interface ConvSession { id: string; botId: string; name: string; lastActivity: number; items: ConvItem[] }
export interface ConvHit { sessionId: string; botId: string; name: string; snippet: string; t: number; where: 'name' | 'text' }

export function snippetAround(text: string, at: number, len: number, pad = 40): string {
  const s = Math.max(0, at - pad); const e = Math.min(text.length, at + len + pad)
  return `${s > 0 ? '…' : ''}${text.slice(s, e).replace(/\s+/g, ' ')}${e < text.length ? '…' : ''}`
}

export function searchConversations(q: string, sessions: ConvSession[], limit = 20): ConvHit[] {
  const nq = norm(q.trim())
  if (nq.length < 2) return []
  const hits: (ConvHit & { score: number })[] = []
  for (const s of sessions) {
    const nn = norm(s.name)
    const ni = nn.indexOf(nq)
    if (ni >= 0) { hits.push({ sessionId: s.id, botId: s.botId, name: s.name, snippet: '', t: s.lastActivity, where: 'name', score: 2 }); continue }
    // 말은 뒤에서부터 — 가장 최근에 나온 자리가 실마리로 낫다
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i]
      if ((it.kind !== 'user' && it.kind !== 'assistant') || !it.text) continue
      const nt = norm(it.text)
      const j = nt.indexOf(nq)
      if (j < 0) continue
      hits.push({ sessionId: s.id, botId: s.botId, name: s.name, snippet: snippetAround(it.text.normalize('NFC'), j, nq.length), t: s.lastActivity, where: 'text', score: 1 })
      break
    }
  }
  hits.sort((a, b) => b.score - a.score || b.t - a.t)
  return hits.slice(0, limit).map(({ score: _s, ...h }) => h)
}
