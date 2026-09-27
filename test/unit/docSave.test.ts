import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, utimesSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConflictBook, saveDoc, sweep, fileVer, verOf, copyRel, CLASH_TTL } from '../../src/host/docSave'

/**
 * BF · 문서 창 저장은 «연 판» 위에만 (2026-09-27 Dave) — 12:34·12:41·16:06 에 문서 창이 남의 파일을 덮었다.
 * 충돌이면 원본은 그대로, 내 글은 «충돌 사본». 읽기만 했으면 쓰지 않는다. 필요 없어진 사본은 호스트가 치운다.
 */
let dir: string; let book: ConflictBook
const NOW = new Date(2026, 8, 27, 16, 40).getTime()
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fb-docsave-'))
  book = new ConflictBook(join(mkdtempSync(join(tmpdir(), 'fb-book-')), 'conflicts.json'))
  writeFileSync(join(dir, 'state.md'), '# 상태\n원래 글\n')
})
const save = (text: string, base?: string) => saveDoc({ botId: 'fb', botAbs: dir, rel: 'state.md', abs: join(dir, 'state.md'), text, base, now: NOW, book })

describe('saveDoc (BF)', () => {
  it('연 판 그대로면 쓰고 새 판을 준다', () => {
    const base = fileVer(join(dir, 'state.md'))
    const r = save('# 상태\n고친 글\n', base)
    expect(r).toEqual({ ok: true, ver: verOf('# 상태\n고친 글\n') })
    expect(readFileSync(join(dir, 'state.md'), 'utf8')).toBe('# 상태\n고친 글\n')
  })

  it('🔴 읽기만 했으면(글이 디스크와 같으면) 쓰지 않는다 — mtime 도 안 바뀐다', () => {
    const f = join(dir, 'state.md'); utimesSync(f, new Date(2020, 0, 1), new Date(2020, 0, 1))
    const before = statSync(f).mtimeMs
    const r = save('# 상태\n원래 글\n', fileVer(f))
    expect(r).toMatchObject({ ok: true, same: true })
    expect(statSync(f).mtimeMs).toBe(before)
  })

  it('🔴 그새 다른 곳이 바꿨으면 원본은 그대로, 내 글은 «충돌 사본» 으로 — 한 자도 안 잃는다', () => {
    const base = fileVer(join(dir, 'state.md'))
    writeFileSync(join(dir, 'state.md'), '# 상태\n봇이 쓴 새 글\n')          // 봇·다른 기기
    const r = save('# 상태\n내가 쓴 글\n', base)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.conflict.copy).toBe('state (충돌 사본 09-27 16.40).md')
    expect(r.conflict.ver).toBe(fileVer(join(dir, 'state.md')))
    expect(readFileSync(join(dir, 'state.md'), 'utf8')).toBe('# 상태\n봇이 쓴 새 글\n')
    expect(readFileSync(join(dir, r.conflict.copy), 'utf8')).toBe('# 상태\n내가 쓴 글\n')
    expect(book.of('fb', 'state.md').map((c) => c.copy)).toEqual([r.conflict.copy])
  })

  it('🔴 옛 글이 엉뚱한 파일로 와도(저장 뒤바뀜) 그 파일을 덮지 못한다 — todo.md 글이 state.md 로', () => {
    writeFileSync(join(dir, 'todo.md'), '# todo\n- [ ] 할 일\n')
    const todoBase = fileVer(join(dir, 'todo.md'))                           // 화면은 todo.md 를 열었다
    const r = save('# todo\n- [ ] 할 일\n', todoBase)                        // 그 판·글로 state.md 에 저장이 왔다
    expect(r.ok).toBe(false)
    expect(readFileSync(join(dir, 'state.md'), 'utf8')).toBe('# 상태\n원래 글\n')
  })

  it('판이 없는 저장(스크립트·검사)은 예전처럼 쓴다', () => {
    expect(save('새 글\n').ok).toBe(true)
    expect(readFileSync(join(dir, 'state.md'), 'utf8')).toBe('새 글\n')
  })

  it('사본 이름이 겹치면 번호를 붙인다(덮어쓰지 않는다)', () => {
    const taken = new Set(['a/state (충돌 사본 09-27 16.40).md'])
    expect(copyRel('a/state.md', NOW, (r) => taken.has(r))).toBe('a/state (충돌 사본 09-27 16.40 2).md')
  })
})

describe('sweep — 필요 없어진 사본만 치운다 (BF)', () => {
  const trashed: string[] = []
  const run = (now = NOW) => sweep(book, (id) => (id === 'fb' ? dir : null), (_id, rel) => { trashed.push(rel) }, now)
  const conflict = (mine: string) => { const base = fileVer(join(dir, 'state.md')); writeFileSync(join(dir, 'state.md'), `봇 ${Math.random()}\n`); const r = save(mine, base); if (r.ok) throw new Error('충돌이 아니다'); return r.conflict.copy }
  beforeEach(() => { trashed.length = 0 })

  it('고르기 전·7일 안이면 둔다', () => {
    conflict('내 글\n'); run()
    expect(trashed).toEqual([]); expect(book.all()).toHaveLength(1)
  })
  it('원본이 사본과 같아졌으면(내 글이 이미 들어가 있으면) 치운다', () => {
    const copy = conflict('내 글\n'); writeFileSync(join(dir, 'state.md'), '내 글\n'); run()
    expect(trashed).toEqual([copy]); expect(book.all()).toHaveLength(0)
  })
  it('7일이 지나면 치운다(휴지통 — 되살릴 수 있다)', () => {
    const copy = conflict('내 글\n'); run(NOW + CLASH_TTL + 1)
    expect(trashed).toEqual([copy])
  })
  it('🔴 사람이 사본을 고쳤으면 그 사람 것이다 — 파일은 두고 장부에서만 뺀다', () => {
    const copy = conflict('내 글\n'); writeFileSync(join(dir, copy), '내 글 + 더 쓴 것\n'); const r = run(NOW + CLASH_TTL + 1)
    expect(trashed).toEqual([]); expect(r.kept).toEqual([copy]); expect(existsSync(join(dir, copy))).toBe(true); expect(book.all()).toHaveLength(0)
  })
  it('사본이 이미 없으면 장부에서만 뺀다', () => {
    const copy = conflict('내 글\n'); rmSync(join(dir, copy)); run()
    expect(trashed).toEqual([]); expect(book.all()).toHaveLength(0); expect(readdirSync(dir)).not.toContain(copy)
  })
  it('장부는 파일에 남아 호스트를 다시 켜도 이어진다', () => {
    conflict('내 글\n')
    const again = new ConflictBook((book as unknown as { file: string }).file)
    expect(again.of('fb', 'state.md')).toHaveLength(1)
  })
})
