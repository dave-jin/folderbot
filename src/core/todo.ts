import type { TodoItem } from './types'

const LINE = /^(\s*)- \[( |x|X)\] (.*)$/
const HEAD = /^#{1,6}\s+(.*)$/
/** «완료» 절인가 — 한국어·영어 둘 다 */
export const isDoneSection = (s: string): boolean => /^(완료|done|completed)/i.test(s.trim())
const BOT_MARK = /\s*<!--\s*bot\s*-->\s*$/
/**
 * 줄 끝 표식 — 보이는 마감(`📅 날짜` · CK-1)과 보이지 않는 주석들(`<!-- ak:ID -->` 짝 · `<!-- bot -->`/`<!-- bot:proposed -->` 주인).
 * 쓰는 차례는 늘 `본문 📅 날짜 <!-- ak:ID --> <!-- bot -->` 이고, 읽을 때는 주석 차례를 따지지 않는다(사람이 옵시디언에서 옮겨 적어도 읽힌다).
 */
export interface LineMeta { by: TodoItem['by']; due?: string; ak?: string; proposed?: boolean }
const TAIL_NOTE = /\s*<!--\s*([^>]*?)\s*-->\s*$/
const TAIL_DUE = /\s*📅\s*(\d{4}-\d{2}-\d{2})\s*$/
export function splitMeta(body: string): { text: string; meta: LineMeta } {
  const meta: LineMeta = { by: 'me' }
  let t = body
  // ⚠ 📅 가 표식 뒤에 와도 읽는다 — 옵시디언 Tasks 는 줄 맨 끝에 📅 를 붙인다(리뷰 10/16: 그때 짝 표식을 잃고 Akiflow 에 두 벌이 생겼다)
  for (let i = 0; i < 5; i++) {
    const d = !meta.due ? TAIL_DUE.exec(t) : null
    if (d) { meta.due = d[1]; t = t.slice(0, d.index); continue }
    const m = TAIL_NOTE.exec(t); if (!m) break
    const v = m[1].trim()
    if (v === 'bot') meta.by = 'bot'
    else if (v === 'bot:proposed') { meta.by = 'bot'; meta.proposed = true }
    else if (/^ak:\S+$/.test(v)) meta.ak = v.slice(3)
    else break                                   // 모르는 주석은 본문으로 둔다
    t = t.slice(0, m.index)
  }
  return { text: t.trim(), meta }
}
export function metaTail(meta: Partial<LineMeta>): string {
  return `${meta.due ? ` 📅 ${meta.due}` : ''}${meta.ak ? ` <!-- ak:${meta.ak} -->` : ''}${meta.by === 'bot' ? (meta.proposed ? ' <!-- bot:proposed -->' : ' <!-- bot -->') : ''}`
}

/** `- [ ] 제목: 설명 <!-- bot -->` 줄들을 읽는다. 중첩은 평평하게. 각 줄에 위쪽 `## 제목`(절)을 붙인다. */
export function parseTodo(md: string): TodoItem[] {
  const out: TodoItem[] = []
  const lines = md.split(/\r?\n/)
  let section = ''
  lines.forEach((raw, i) => {
    const hm = HEAD.exec(raw)
    if (hm) { const t = hm[1].trim(); if (!/^todo$/i.test(t)) section = t; return } // 맨 위 «# todo» 는 문서 제목이지 절이 아니다
    const m = LINE.exec(raw)
    if (!m) return
    const { text: body, meta } = splitMeta(m[3])
    const c = body.indexOf(':')
    const title = c > 0 ? body.slice(0, c).trim() : body
    const desc = c > 0 ? body.slice(c + 1).trim() : ''
    out.push({ line: i, done: m[2] !== ' ', title, desc, by: meta.by, section, ...(meta.due ? { due: meta.due } : {}), ...(meta.ak ? { ak: meta.ak } : {}), ...(meta.proposed ? { proposed: true } : {}) })
  })
  return out
}

export function formatLine(title: string, desc: string, by: TodoItem['by'], done = false, meta: Omit<Partial<LineMeta>, 'by'> = {}): string {
  const t = title.trim().replace(/\s*:\s*$/, '')
  const body = desc.trim() ? `${t}: ${desc.trim()}` : t
  return `- [${done ? 'x' : ' '}] ${body}${metaTail({ ...meta, by })}`
}

/** 체크 토글 — 그 줄만 바꾼다(바이트 보존: 다른 줄·개행은 그대로) */
export function toggleLine(md: string, line: number, done: boolean): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.split(/\r?\n/)
  const m = LINE.exec(lines[line] ?? '')
  if (!m) return md
  lines[line] = `${m[1]}- [${done ? 'x' : ' '}] ${m[3]}`
  return lines.join(nl)
}

/**
 * 제목·설명 편집 — 그 줄만. 완료 상태와 표식(봇·짝·제안)은 유지.
 * `due` — 안 주면(undefined) 마감도 그대로, `null` 이면 지운다, 날짜면 바꾼다.
 */
export function editLine(md: string, line: number, title: string, desc: string, due?: string | null): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.split(/\r?\n/)
  const m = LINE.exec(lines[line] ?? '')
  if (!m || !title.trim()) return md
  const { meta } = splitMeta(m[3])
  const next = due === undefined ? meta.due : due ?? undefined
  lines[line] = `${m[1]}${formatLine(title, desc, meta.by, m[2] !== ' ', { ...meta, due: next })}`
  return lines.join(nl)
}
/** CK-1 · 마감만 바꾼다 — 본문·표식은 바이트 그대로. `null` 이면 지운다 */
export function setDueLine(md: string, line: number, due: string | null): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.split(/\r?\n/)
  const m = LINE.exec(lines[line] ?? '')
  if (!m) return md
  if (due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return md
  const { text, meta } = splitMeta(m[3])
  lines[line] = `${m[1]}- [${m[2]}] ${text}${metaTail({ ...meta, due: due ?? undefined })}`
  return lines.join(nl)
}
/** 표식만 바꾼다(짝 id · 제안 → 정식) — 본문은 그대로 */
export function setMetaLine(md: string, line: number, patch: Partial<LineMeta>): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.split(/\r?\n/)
  const m = LINE.exec(lines[line] ?? '')
  if (!m) return md
  const { text, meta } = splitMeta(m[3])
  lines[line] = `${m[1]}- [${m[2]}] ${text}${metaTail({ ...meta, ...patch })}`
  return lines.join(nl)
}
/** 줄 삭제 — 그 줄만 지운다 (되돌리기는 화면이 addLine 으로) */
export function deleteLine(md: string, line: number): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.split(/\r?\n/)
  if (!LINE.test(lines[line] ?? '')) return md
  lines.splice(line, 1)
  return lines.join(nl)
}

/** 새 항목 추가 — `section` 이 있으면 그 절의 마지막 항목 뒤, 없으면 첫 `## 완료` 절 앞 → 마지막 체크박스 뒤 → 파일 끝. */
export function addLine(md: string, title: string, desc: string, by: TodoItem['by'], section = '', meta: Omit<Partial<LineMeta>, 'by'> = {}): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.length ? md.split(/\r?\n/) : []
  const entry = formatLine(title, desc, by, false, meta)
  if (section) { // 그 절 안 마지막 항목 뒤 (절 끝의 빈 줄 위)
    const start = lines.findIndex((l) => { const hm = HEAD.exec(l); return !!hm && hm[1].trim() === section })
    if (start >= 0) {
      let end = lines.length
      for (let i = start + 1; i < lines.length; i++) if (HEAD.test(lines[i])) { end = i; break }
      let at = end
      while (at > start + 1 && lines[at - 1].trim() === '') at--
      lines.splice(at, 0, entry)
      return lines.join(nl)
    }
  }
  const doneIdx = lines.findIndex((l) => /^##\s*완료/.test(l))
  if (doneIdx >= 0) {
    let at = doneIdx
    while (at > 0 && lines[at - 1].trim() === '') at--
    lines.splice(at, 0, entry)
    return lines.join(nl)
  }
  let last = -1
  lines.forEach((l, i) => { if (LINE.test(l)) last = i })
  if (last >= 0) {
    lines.splice(last + 1, 0, entry)
    return lines.join(nl)
  }
  if (lines.length === 0) return `# todo${nl}${nl}${entry}${nl}`
  if (lines[lines.length - 1] !== '') lines.push('')
  lines.push(entry)
  return lines.join(nl)
}

/**
 * 줄 하나를 다른 자리로 옮긴다 — 끌어서 순서 바꾸기(V15). `before` 줄 **앞**에 놓고, null 이면 마지막 항목 뒤.
 * 다른 줄(절 제목·빈 줄·주석)은 건드리지 않는다. 옮기면 줄 번호가 바뀌므로 화면은 다시 parseTodo 한 결과를 쓴다.
 */
export function moveLine(md: string, from: number, before: number | null): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.split(/\r?\n/)
  if (!LINE.test(lines[from] ?? '')) return md
  if (before === from || before === from + 1) return md
  const [row] = lines.splice(from, 1)
  let at: number
  if (before === null) { let last = -1; lines.forEach((l, i) => { if (LINE.test(l)) last = i }); at = last + 1 }
  else at = Math.max(0, Math.min(lines.length, before > from ? before - 1 : before))
  lines.splice(at, 0, row)
  return lines.join(nl)
}

/**
 * 체크 — `[x]` 로 바꾸고 «완료» 절이 있으면 그 절 끝으로 내린다 (V15).
 * 체크를 풀 때는 제자리에서 `[ ]` 로만 바꾼다 — 원래 어느 절이었는지는 파일에 없으니 지어내지 않는다.
 */
export function toggleAndMove(md: string, line: number, done: boolean): string {
  const next = toggleLine(md, line, done)
  if (!done || next === md) return next
  const lines = next.split(/\r?\n/)
  let secStart = -1
  for (let i = 0; i < lines.length; i++) { const hm = HEAD.exec(lines[i]); if (hm && isDoneSection(hm[1])) { secStart = i; break } }
  if (secStart < 0) return next // 완료 절이 없으면 제자리
  if (line > secStart && !lines.slice(secStart + 1, line).some((l) => HEAD.test(l))) return next // 이미 완료 절 안
  let end = lines.length
  for (let i = secStart + 1; i < lines.length; i++) if (HEAD.test(lines[i])) { end = i; break }
  let at = end
  while (at > secStart + 1 && lines[at - 1].trim() === '') at--
  return moveLine(next, line, at)
}

/**
 * 🔴 **CK-3 · 할 일 만들기 규칙의 기본값** (2026-10-16 Dave «추천대로» · 기획안 §4). 볼트 루트 CLAUDE.md 에 ```md todo-rules``` 블록이 있으면
 * 그것이 이긴다(`Registry.todoRules`). 종전 규약 3번(«다음 세션에서 할 일도 적을 수 있다»)과 5번(«기한 문법을 만들지 않는다»)을 바꿨다.
 */
export const TODO_RULES_PROMPT = `이 폴더의 todo.md 는 사람과 봇이 같이 쓰는 할 일 목록이다. 규약:
1. 할 일 한 줄 = 누군가 해야 할 행동 하나. 기다리는 일·확인 필요는 체크박스가 아니라 일반 불릿("- ")으로 쓴다.
2. 봇은 줄을 직접 쓰지 않고 todo_propose 로 제안한다. 사람이 [넣기] 한 것만 정식 할 일이 되고 Akiflow 로 간다. 예외: 사람이 대화에서 «할 일로 적어 줘» 라고 한 것은 todo_add 로 바로 쓴다.
3. 봇 자신이 다음 세션에 할 일은 todo.md 가 아니라 state.md «다음 작업» 에 쓴다.
4. 줄 모양은 "- [ ] 제목(한글 15자 이내): 설명 — 약 N분 · 첫 행동: …" 이다. 마감은 바깥에서 정해진 날(제출일·행사일·약속일)만 due 로 준다 — 줄 끝에 "📅 YYYY-MM-DD" 로 붙는다. 지어내지 않는다.
5. 같은 일이 이미 있으면 새로 만들지 않는다 — 그 줄 설명에 덧붙이자고 대화에서 말한다.
네가 남긴 정식 줄(<!-- bot -->)은 먼저 처리하거나 왜 못 했는지 설명을 갱신한다. 완료한 항목은 "- [x]" 로 바꾼다. 줄 끝 표식(📅 · <!-- … -->)은 지우거나 고치지 않는다.`

/**
 * 🔴 **AK · 안 끝난 일이 맨 위에 온다** (2026-09-24 Dave: *«아직 끝내지 않은 항목이 맨 상단에 떠야 돼.
 *    지금 완료된 게 굳이 너무 많이 나와서 아직 안 끝낸 리스트가 뭔지 파악하기가 너무 어려워»*).
 * 종전 차례는 **파일 순서 그대로**였다. 「완료」 절 하나는 접혀 있었지만, 절 안에서 그 자리에 체크한 항목은
 *   (완료 절이 없는 파일에서는 `toggleAndMove` 가 제자리에 둔다) 안 끝난 일 사이에 그대로 섞여 있었다.
 * ⚠ **파일은 건드리지 않는다.** 이건 보여 주는 차례일 뿐이라, todo.md 를 다른 도구로 열면 쓴 그대로다.
 */
export const DONE_PEEK = 3

/** 한 절 안 — 안 끝난 것이 위, 끝난 것이 아래. 각 무리 안 차례는 **파일 그대로** (끌어 옮긴 순서를 지킨다) */
export function orderItems<T extends { done: boolean }>(list: T[]): T[] {
  return [...list.filter((t) => !t.done), ...list.filter((t) => t.done)]
}

/** 절 차례 — 안 끝난 일이 하나라도 있는 절이 먼저. 그 안에서는 파일 순서 그대로 */
export function orderSections<T extends { done: boolean }>(secs: [string, T[]][]): [string, T[]][] {
  const live = (l: T[]) => l.some((t) => !t.done)
  return [...secs.filter(([, l]) => live(l)), ...secs.filter(([, l]) => !live(l))]
}

/**
 * 끝난 것은 **최근 몇 개만** 보이고 나머지는 「더보기」 뒤로.
 * ⚠ 완료 시각은 파일에 없다 — 지어내지 않는다. 대신 `toggleAndMove` 가 체크한 줄을 **완료 절 끝**으로 보내므로
 *    **파일에서 뒤에 있는 것이 최근**이다. 그래서 «마지막 `peek` 개» 를 보여 준다.
 */
export function peekDone<T extends { done: boolean }>(list: T[], peek = DONE_PEEK, all = false): { rows: T[]; hidden: number } {
  const done = list.filter((t) => t.done)
  if (all || done.length <= peek) return { rows: done, hidden: 0 }
  return { rows: done.slice(done.length - peek), hidden: done.length - peek }
}
