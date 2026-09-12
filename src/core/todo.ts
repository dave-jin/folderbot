import type { TodoItem } from './types'

const LINE = /^(\s*)- \[( |x|X)\] (.*)$/
const BOT_MARK = /\s*<!--\s*bot\s*-->\s*$/

/** `- [ ] 제목: 설명 <!-- bot -->` 줄들을 읽는다. 중첩은 평평하게. */
export function parseTodo(md: string): TodoItem[] {
  const out: TodoItem[] = []
  const lines = md.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const m = LINE.exec(raw)
    if (!m) return
    let body = m[3]
    const by: TodoItem['by'] = BOT_MARK.test(body) ? 'bot' : 'me'
    body = body.replace(BOT_MARK, '').trim()
    const c = body.indexOf(':')
    const title = c > 0 ? body.slice(0, c).trim() : body
    const desc = c > 0 ? body.slice(c + 1).trim() : ''
    out.push({ line: i, done: m[2] !== ' ', title, desc, by })
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

/** 새 항목 추가 — 첫 `## 완료` 절 앞, 없으면 마지막 체크박스 뒤, 없으면 파일 끝. */
export function addLine(md: string, title: string, desc: string, by: TodoItem['by']): string {
  const nl = md.includes('\r\n') ? '\r\n' : '\n'
  const lines = md.length ? md.split(/\r?\n/) : []
  const entry = formatLine(title, desc, by)
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

export const TODO_RULES_PROMPT = `이 폴더의 todo.md 는 사람과 봇이 같이 쓰는 할 일 목록이다. 규약:
1. 세션을 시작하면 미완료 항목을 읽는다.
2. 네가 남긴 항목(<!-- bot --> 표식)은 먼저 처리하거나, 왜 못 했는지 설명을 갱신한다.
3. 사용자가 해야 할 일이 생기면 한 줄로 적고 대화에서 알린다. 네가 다음 세션에서 할 일도 적을 수 있다.
4. 한 줄 = "- [ ] 제목: 설명" 이고, 네가 적는 줄 끝에는 " <!-- bot -->" 을 붙인다. 완료한 항목은 "- [x]" 로 바꾼다.
5. 중첩·우선순위·기한 문법을 만들지 않는다. 필요하면 설명에 쓴다.`
