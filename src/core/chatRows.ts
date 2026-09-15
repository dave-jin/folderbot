import type { ChatItem } from './types'
type Tool = Extract<ChatItem, { kind: 'tool' }>

export type ChatRow = { k: 'item'; it: ChatItem } | { k: 'group'; items: Tool[]; endT?: number }
/**
 * 대화를 줄로 편다 — 「A · 문서처럼」(2026-09-13 Dave 확정).
 *
 * 🔴 **기계는 접힌다.** 도구는 <b>한 번만 써도</b> 한 줄로 접는다. 종전에는 4회 이상일 때만 묶고
 *    그보다 적으면 도구마다 한 줄씩 폈는데, 그러면 짧은 턴일수록 대화가 로그처럼 보였다 —
 *    Dave 가 «Rondo 처럼 화려해지지 않게» 라고 한 것이 바로 이 결이다.
 * ⛔ **문턱으로 접기를 정하지 않는다.** «몇 개부터 묶나» 는 늘 틀린 질문이다 — 기계는 언제나 접히고,
 *    펼치는 것은 사람이 정한다.
 * ⚠ 도는 동안 무엇을 하는지는 <b>상태 한 줄</b>(`.live`)이 맡는다. 그게 접기의 대가를 갚는 유일한 장치라
 *    지우면 안 된다.
 */
export function buildRows(items: ChatItem[], drill: string | null): ChatRow[] {
  const out: ChatRow[] = []; let run: Tool[] = []
  /** ⚠ 도구 줄에는 «끝난 시각» 이 없다 — 묶음이 끝난 시각은 **다음 줄이 생긴 시각**으로 잰다 */
  const flush = (endT?: number) => { if (run.length) out.push({ k: 'group', items: run, endT }); run = [] }
  /**
   * 🔴 **손댄 파일 칩은 «답 아래»로 내려간다** (2026-09-15 Dave: *«채팅 상단이 아니라 채팅 본문에 칩이
   *    있어야 해»*). 호스트는 도구가 파일을 건드리는 **그 순간** 칩 줄을 넣는다(session.ts) — 답보다
   *    먼저다. 그래서 칩이 답 위 기계 구역에 얹혀 있었고, 답을 다 읽고 나면 눈이 **위로 되돌아가야** 했다.
   * ⚠ 모아 두었다가 **다음 답 바로 뒤**에 놓는다. 답 없이 턴이 끝나면(도구만 돌고 끝) 맨 끝에 놓는다 —
   *   안 그러면 방금 쓴 파일이 아예 안 보인다.
   * ⚠ 같은 파일을 여러 번 건드려도 칩은 하나다.
   */
  let held: string[] = []
  const chips = () => { if (held.length) out.push({ k: 'item', it: { id: `f_${out.length}`, t: 0, kind: 'files', paths: held } as ChatItem }); held = [] }
  for (const it of items) {
    if (drill) { if ((it.kind === 'tool' && it.parentId === drill)) out.push({ k: 'item', it }); continue }
    if (it.kind === 'tool' && it.parentId) continue
    if (it.kind === 'result' && it.ok) continue
    if (it.kind === 'tool') { run.push(it); continue }
    if (it.kind === 'files') { for (const p of it.paths) if (!held.includes(p)) held.push(p); continue }
    flush(it.t); out.push({ k: 'item', it })
    if (it.kind === 'assistant' && !it.streaming) chips()
  }
  flush(); chips(); return out
}
