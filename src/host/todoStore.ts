import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addLine, deleteLine, editLine, parseTodo, toggleLine } from '../core/todo'
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
  atomicWrite(p, toggleLine(readFileSync(p, 'utf8'), line, done))
  return readTodo(botAbs)
}
export function todoAdd(botAbs: string, title: string, desc: string, by: 'me' | 'bot'): TodoItem[] {
  const p = todoPath(botAbs)
  const md = existsSync(p) ? readFileSync(p, 'utf8') : ''
  atomicWrite(p, addLine(md, title, desc, by))
  return readTodo(botAbs)
}
export function todoEdit(botAbs: string, line: number, title: string, desc: string): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, editLine(readFileSync(p, 'utf8'), line, title, desc))
  return readTodo(botAbs)
}
export function todoDelete(botAbs: string, line: number): TodoItem[] {
  const p = todoPath(botAbs)
  if (!existsSync(p)) return []
  atomicWrite(p, deleteLine(readFileSync(p, 'utf8'), line))
  return readTodo(botAbs)
}
export function todoContext(botAbs: string): string {
  const items = readTodo(botAbs).filter((t) => !t.done)
  if (!items.length) return ''
  return `현재 todo.md 미완료 ${items.length}건:\n` + items.map((t) => `- ${t.title}${t.desc ? `: ${t.desc}` : ''}${t.by === 'bot' ? ' (봇이 남김)' : ''}`).join('\n')
}
