import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addLine, deleteLine, editLine, moveLine, parseTodo, setDueLine, setMetaLine, toggleAndMove, type LineMeta } from '../core/todo'
import type { TodoItem } from '../core/types'
import { atomicWrite } from './paths'

export function todoPath(botAbs: string): string { return join(botAbs, 'todo.md') }
export function readTodo(botAbs: string): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  return parseTodo(readFileSync(p, 'utf8'))
}
export function todoToggle(botAbs: string, line: number, done: boolean): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, toggleAndMove(readFileSync(p, 'utf8'), line, done))
  return readTodo(botAbs)
}
export function todoAdd(botAbs: string, title: string, desc: string, by: 'me' | 'bot', section = '', meta: Omit<Partial<LineMeta>, 'by'> = {}): TodoItem[] {
  const p = todoPath(botAbs)
  const md = existsSync(p) ? readFileSync(p, 'utf8') : ''
  atomicWrite(p, addLine(md, title, desc, by, section, meta))
  return readTodo(botAbs)
}
export function todoEdit(botAbs: string, line: number, title: string, desc: string, due?: string | null): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, editLine(readFileSync(p, 'utf8'), line, title, desc, due))
  return readTodo(botAbs)
}
/** CK-1 · 마감만 바꾸기(칩 → 날짜 고르기) */
export function todoDue(botAbs: string, line: number, due: string | null): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, setDueLine(readFileSync(p, 'utf8'), line, due))
  return readTodo(botAbs)
}
/** 표식만 바꾸기 — 제안 → 정식(CK-3 [넣기]) · 짝 id 달기(CK-2) */
export function todoMeta(botAbs: string, line: number, patch: Partial<LineMeta>): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, setMetaLine(readFileSync(p, 'utf8'), line, patch))
  return readTodo(botAbs)
}
export function todoDelete(botAbs: string, line: number): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, deleteLine(readFileSync(p, 'utf8'), line))
  return readTodo(botAbs)
}
export function todoMove(botAbs: string, from: number, before: number | null): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, moveLine(readFileSync(p, 'utf8'), from, before))
  return readTodo(botAbs)
}
export function todoContext(botAbs: string): string {
  const items = readTodo(botAbs).filter((t) => !t.done)
  if (!items.length) return ''
  return `현재 todo.md 미완료 ${items.length}건:\n` + items.map((t) => `- ${t.title}${t.desc ? `: ${t.desc}` : ''}${t.due ? ` (마감 ${t.due})` : ''}${t.proposed ? ' (봇 제안 · 사람이 아직 안 넣음)' : t.by === 'bot' ? ' (봇이 남김)' : ''}`).join('\n')
}
