/**
 * DL · 질문 카드의 미리보기 블록 — 보낼 글을 카드 안에 블록으로 보이고, 사람이 그 자리에서 고친 글이 에이전트에게 그대로 간다.
 *
 * 🔴 (2026-10-26 Dave: *«미리 확인하는 내용이 블록에 들어가 예쁘게 보였으면 좋겠어. 그 안의 내용은 필요할 때 내가 수정도 가능했으면
 *    좋겠어. 내가 수정한 게 바로 반영돼서 들어갈 수 있게까지 되면 완벽할 것 같은데»*) — 박찬수 대표 확정 메일 카드가 «보낼까요?» 만
 *    보였고 초안은 접힌 «생각» 줄에 숨었다(스크린샷_1706). 카드는 `preview` 를 아예 안 읽었다.
 *
 * 에이전트 입력(Claude Code AskUserQuestion 그대로):
 *   - `questions[].options[].preview` — 그 선택지의 보낼 글 전문. 이것이 블록이 된다(추천 자리).
 *   - `questions[].preview` — 질문 자체에 붙은 글(스키마 밖이라 CLI 가 받을지는 판에 따라 다르다 · 있으면 같은 블록으로 그린다).
 * 돌려주는 답(CLI 가 그대로 에이전트에게 넘긴다 — `"질문"="답" selected preview:\n… notes: …`):
 *   - `answers[질문]` — 고른 선택지. 고쳤으면 끝에 « (고친 글로)».
 *   - `annotations[질문] = { preview: 고친 전문, notes: EDIT_NOTE }` — 고쳤을 때만.
 */

export interface AskOption { label?: string; description?: string; preview?: string }
export interface AskQuestion { question?: string; header?: string; options?: AskOption[]; multiSelect?: boolean; preview?: string }
export interface AskAnnotation { preview?: string; notes?: string }

export const EDIT_MARK = ' (고친 글로)'
export const EDIT_NOTE = 'Dave 가 미리보기 글을 직접 고쳤다 — 진행한다면 위 «selected preview» 의 고친 글을 한 글자도 바꾸지 말고 그대로 쓸 것'

/** 블록 하나 — `owner` 는 그 글이 붙은 선택지 이름(질문 자체에 붙은 글이면 '') */
export interface PreviewBlock { owner: string; text: string }

const has = (s: unknown): s is string => typeof s === 'string' && s.trim() !== ''

/**
 * 지금 보일 블록 — 고른 선택지에 글이 있으면 그것, 없으면(예: «고쳐서 실행»·«하지 않음») 마지막으로 보이던 것을 그대로 둔다.
 * ⚠ 고른 것에 글이 없다고 블록을 치우면, «고쳐서 실행» 을 고르는 순간 고치던 글이 사라진다.
 */
export function activePreview(q: AskQuestion, picked: string[], last?: string | null): PreviewBlock | null {
  const opts = (q.options ?? []).filter((o) => has(o.preview))
  for (const p of [...picked].reverse()) { const o = opts.find((x) => x.label === p); if (o) return { owner: o.label ?? '', text: o.preview! } }
  if (last != null) { const o = opts.find((x) => (x.label ?? '') === last); if (o) return { owner: last, text: o.preview! }; if (last === '' && has(q.preview)) return { owner: '', text: q.preview } }
  if (has(q.preview)) return { owner: '', text: q.preview }
  return opts[0] ? { owner: opts[0].label ?? '', text: opts[0].preview! } : null
}

/** 같은 글인가 — 끝 공백·줄바꿈 모양(CRLF)만 다른 것은 «안 고침» 으로 본다 */
export const sameText = (a: string, b: string): boolean => a.replace(/\r\n/g, '\n').replace(/\s+$/, '') === b.replace(/\r\n/g, '\n').replace(/\s+$/, '')

/** 고정폭으로 그릴 글인가 — 상자 그림·코드 울타리·들여 쓴 표는 비례 글꼴에서 줄이 어긋난다. 메일 본문은 읽기 좋은 본문 글꼴로 */
export const monoText = (s: string): boolean => /[│┃┌┐└┘├┤┬┴┼─━═║╔╗╚╝]|```|^ {2,}\S.*\n {2,}\S/m.test(s)

/**
 * 보낼 답 — 질문마다 `answers` 한 줄과, 고쳤으면 `annotations`.
 * @param edits 질문 키 → 지금 블록의 고친 글(안 고쳤으면 없음)
 */
export function askReply(answers: Record<string, string>, edits: Record<string, { block: PreviewBlock; text: string } | undefined>): { answers: Record<string, string>; annotations?: Record<string, AskAnnotation> } {
  const out = { ...answers }; const ann: Record<string, AskAnnotation> = {}
  for (const [k, e] of Object.entries(edits)) {
    if (!e || !out[k] || sameText(e.text, e.block.text)) continue
    out[k] = out[k] + EDIT_MARK
    ann[k] = { preview: e.text, notes: EDIT_NOTE }
  }
  return Object.keys(ann).length ? { answers: out, annotations: ann } : { answers: out }
}

/** 호스트가 받은 annotations 를 거른다 — 글자만 · 질문 키는 답이 있는 것만 · 전문 상한 64KB */
export function cleanAnnotations(raw: unknown, answers: Record<string, string>): Record<string, AskAnnotation> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, AskAnnotation> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in answers) || !v || typeof v !== 'object') continue
    const a = v as Record<string, unknown>; const x: AskAnnotation = {}
    if (typeof a.preview === 'string' && a.preview.trim()) x.preview = a.preview.slice(0, 65536)
    if (typeof a.notes === 'string' && a.notes.trim()) x.notes = a.notes.slice(0, 2000)
    if (x.preview || x.notes) out[k] = x
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * 미뤄진 질문(`tool_deferred`)의 답 글 — 이 길은 호스트가 `tool_result` 를 직접 쓰므로 CLI 의 글 모양을 흉내 낸다.
 * ⚠ 종전에는 `JSON.stringify(answers)` 만 넣었다 — 고친 글을 실을 자리가 없었다.
 */
export function askResultText(answers: Record<string, string>, annotations?: Record<string, AskAnnotation>): string {
  const parts = Object.entries(answers).map(([q, a]) => {
    const n = annotations?.[q]; const p = [`"${q}"="${a}"`]
    if (n?.preview) p.push(`selected preview:\n${n.preview}`)
    if (n?.notes) p.push(`notes: ${n.notes}`)
    return p.join(' ')
  })
  return annotations ? `The user answered: ${parts.join(', ')}. Read the answers carefully and follow them.` : `Your questions have been answered: ${parts.join(', ')}. You can now continue with these answers in mind.`
}

/** 대화에 남길 사람 줄 — 고친 글이 있으면 그 전문까지(무엇을 승인했는지 나중에 대조할 수 있게) */
export function askEcho(answers: Record<string, string>, annotations?: Record<string, AskAnnotation>): string {
  const head = Object.values(answers).join(' · ')
  const fixed = Object.values(annotations ?? {}).map((a) => a.preview).filter(has)
  return fixed.length ? `${head}\n\n고친 글:\n${fixed.join('\n\n---\n\n')}` : head
}
