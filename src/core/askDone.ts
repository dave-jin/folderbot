import { EDIT_MARK, type AskQuestion } from './askPreview'

/**
 * 질문 카드에 **답한 뒤** 대화에 남기는 요약 (2026-11-12 Dave: *«Ask User Question 의 답변 후 뭘 답변했는지 제대로 내용이 안보인다»*).
 * 종전에는 답을 보내면 카드가 사라지고 «보냈어요» 한 줄 · 그 뒤로는 `AskUserQuestion` 도구 줄만 남았다.
 *
 * 🔴 **새로 저장하는 것이 없다** — 대화 기록에 이미 있는 도구 줄의 `input`(질문·선택지)과 `result`(답 글)만 읽는다.
 *    그래서 지난 세션의 질문에도 그대로 적용된다.
 * 답 글의 모양(`askPreview.askResultText` · CLI 도 같은 꼴):
 *   `… : "질문"="답", "질문2"="답2". You can now continue …`
 *   고친 글이 있으면 `"질문"="답 (고친 글로)" selected preview:\n… notes: …`
 * 🔴 **질문 글을 아는 채로 읽는다** — `"질문"="` 를 찾아 다음 질문 표식 앞까지가 그 답이다. 답 안에 따옴표·쉼표가 있어도 깨지지 않는다.
 * ⚠ 호스트는 결과를 2000자에서 자른다 — 못 찾은 질문이 있으면 `partial`. 하나도 못 읽으면 `null`(화면은 종전 도구 줄로 돌아간다 — 조용히 틀리지 않는다).
 */
export interface AskRow {
  header: string; question: string; multi: boolean
  /** 고른 선택지 — 고른 순서대로 */
  picks: string[]
  /** 선택지에 없는 답(«기타» 칸에 직접 쓴 글) */
  free: string
  /** 고르지 않은 선택지 */
  rest: string[]
  /** 미리보기 글을 고쳐서 답했다 */
  edited: boolean
  /** 답 글 그대로(나누기 전) — 호스트가 대화에 남기는 사람 줄(`askEcho`)과 맞춰 볼 때 쓴다 */
  answer: string
}
export interface AskSummary { rows: AskRow[]; partial: boolean }

// 꼬리 문장 — 지금 CLI·호스트는 «these answers» · 옛 CLI 는 «the user's answers» 였다(둘 다 받는다)
const TAILS = [/"\. You can now continue with [^"]{0,60}\.\s*$/, /"\. Read the answers carefully and follow them\.\s*$/, /",\s*$/, /"\.?\s*$/]

/** `"질문"="` 뒤부터 다음 질문 앞까지의 토막에서 답만 남긴다 */
function cutAnswer(seg: string): { text: string; closed: boolean } {
  const ann = seg.search(/" (?:selected preview:\n|notes: )/)
  if (ann >= 0) return { text: seg.slice(0, ann), closed: true }
  for (const t of TAILS) { const m = t.exec(seg); if (m) return { text: seg.slice(0, m.index), closed: true } }
  return { text: seg, closed: false }   // 닫는 따옴표가 없다 — 2000자에서 잘린 답
}

function split(answer: string, q: AskQuestion): Pick<AskRow, 'picks' | 'free' | 'edited'> {
  const labels = (q.options ?? []).map((o) => o.label ?? '').filter(Boolean).sort((a, b) => b.length - a.length)   // 긴 이름부터 — «A» 가 «A 와 B» 를 먼저 먹지 않게
  let a = answer; let edited = false
  if (a.endsWith(EDIT_MARK)) { a = a.slice(0, -EDIT_MARK.length); edited = true }
  if (!q.multiSelect) return labels.includes(a) ? { picks: [a], free: '', edited } : { picks: [], free: a, edited }
  // 여럿 — 앞에서부터 선택지 이름을 떼어 내고, 남은 것이 직접 쓴 글이다(직접 쓴 글에 쉼표가 있어도 된다)
  const picks: string[] = []
  for (;;) {
    const l = labels.find((x) => !picks.includes(x) && (a === x || a.startsWith(x + ', ')))
    if (!l) break
    picks.push(l); a = a === l ? '' : a.slice(l.length + 2)
  }
  return { picks, free: a, edited }
}

export function askSummary(input: Record<string, unknown> | undefined, result: string | undefined): AskSummary | null {
  const qs = (Array.isArray(input?.questions) ? (input!.questions as AskQuestion[]) : []).filter((q) => q && typeof q.question === 'string' && q.question)
  if (!qs.length || typeof result !== 'string' || !result) return null
  // 질문마다 표식 자리 — 같은 질문 글이 둘이면 앞에서부터 차례로 짝짓는다
  const marks: { q: AskQuestion; at: number; from: number }[] = []
  let cursor = 0
  for (const q of qs) {
    const key = `"${q.question}"="`
    const at = result.indexOf(key, cursor)
    if (at < 0) continue
    marks.push({ q, at, from: at + key.length }); cursor = at + key.length
  }
  if (!marks.length) return null
  let partial = marks.length < qs.length
  const rows = marks.map((m, i) => {
    const seg = result.slice(m.from, i + 1 < marks.length ? marks[i + 1].at : result.length)
    const cut = cutAnswer(seg)
    if (!cut.closed) partial = true
    const all = (m.q.options ?? []).map((o) => o.label ?? '').filter(Boolean)
    const s = split(cut.text, m.q)
    return { header: m.q.header ?? '', question: m.q.question ?? '', multi: !!m.q.multiSelect, ...s, rest: all.filter((l) => !s.picks.includes(l)), answer: cut.text }
  })
  return { rows, partial }
}
