import type { TodoItem } from './types'

const LINE = /^(\s*)- \[( |x|X)\] (.*)$/
const HEAD = /^#{1,6}\s+(.*)$/
/** «완료» 절인가 — 한국어·영어 둘 다 */
export const isDoneSection = (s: string): boolean => /^(완료|done|completed)/i.test(s.trim())
const BOT_MARK = /\s*<!--\s*bot\s*-->\s*$/

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
    let body = m[3]
    const by: TodoItem['by'] = BOT_MARK.test(body) ? 'bot' : 'me'
    body = body.replace(BOT_MARK, '').trim()
    const c = body.indexOf(':')
    const title = c > 0 ? body.slice(0, c).trim() : body
    const desc = c > 0 ? body.slice(c + 1).trim() : ''
    out.push({ line: i, done: m[2] !== ' ', title, desc, by, section })
  })
  return out
}

export function formatLine(title: string, desc: string, by: TodoItem['by'], done = false): string {
  const t = title.trim().replace(/\s*:\s*$/, '')
  const body = desc.trim() ? `${t}: ${desc.trim()}` : t
  return `- [${done ? 'x' : ' '}] ${body}${by === 'bot' ? ' <!-- bot -->' : ''}`
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

/** 제목·설명 편집 — 그 줄만. 완료 상태와 봇 표식은 유지 */
export function editLine(md: string, line: number, title: string, desc: string): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.split(/\r?\n/)
  const m = LINE.exec(lines[line] ?? '')
  if (!m || !title.trim()) return md
  const by: TodoItem['by'] = BOT_MARK.test(m[3]) ? 'bot' : 'me'
  lines[line] = `${m[1]}${formatLine(title, desc, by, m[2] !== ' ')}`
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
export function addLine(md: string, title: string, desc: string, by: TodoItem['by'], section = ''): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.length ? md.split(/\r?\n/) : []
  const entry = formatLine(title, desc, by)
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

export const TODO_RULES_PROMPT = `이 폴더의 todo.md 는 사람과 봇이 같이 쓰는 할 일 목록이다. 규약:
1. 세션을 시작하면 미완료 항목을 읽는다.
2. 네가 남긴 항목(<!-- bot --> 표식)은 먼저 처리하거나, 왜 못 했는지 설명을 갱신한다.
3. 사용자가 해야 할 일이 생기면 한 줄로 적고 대화에서 알린다. 네가 다음 세션에서 할 일도 적을 수 있다.
4. 한 줄 = "- [ ] 제목: 설명" 이고, 네가 적는 줄 끝에는 " <!-- bot -->" 을 붙인다. 완료한 항목은 "- [x]" 로 바꾼다.
5. 중첩·우선순위·기한 문법을 만들지 않는다. 필요하면 설명에 쓴다.`
