import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NameIndex } from '../../src/host/nameIndex'

/** 10/18 · 파일 칸 느림 — `/exists` 가 이름만 적힌 것을 볼트 전체 동기 훑기로 찾던 것을 표로 바꿨다 */
describe('NameIndex', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fb-names-'))
    mkdirSync(join(root, 'a/b'), { recursive: true }); mkdirSync(join(root, 'node_modules/x'), { recursive: true }); mkdirSync(join(root, '.git'))
    writeFileSync(join(root, 'a/b/설명서.pdf'), ''); writeFileSync(join(root, 'a/Note.md'), '')
    writeFileSync(join(root, 'node_modules/x/Note.md'), ''); writeFileSync(join(root, '.git/Note.md'), '')
  })
  it('이름으로 찾는다 — 대소문자·NFC/NFD 무관, SKIP·점 폴더는 안 본다', async () => {
    const ix = new NameIndex()
    expect(await ix.find(root, 'note.md')).toEqual([join(root, 'a/Note.md')])
    expect(await ix.find(root, '설명서.pdf'.normalize('NFD'))).toEqual([join(root, 'a/b/설명서.pdf')])
    expect(await ix.find(root, '없는.tsx')).toEqual([])
  })
  it('없는 이름을 여러 번 물어도 다시 훑지 않는다', async () => {
    const ix = new NameIndex()
    for (const n of ['x1.ts', 'x2.ts', 'x3.ts', 'x4.ts']) await ix.find(root, n)
    expect(ix.builds).toBe(1)
  })
  it('동시에 온 요청은 짓기 한 번을 함께 기다린다', async () => {
    const ix = new NameIndex()
    await Promise.all(['a.md', 'b.md', 'c.md'].map((n) => ix.find(root, n)))
    expect(ix.builds).toBe(1)
  })
  it('감시가 «바뀜» 을 알리면 방금 만든 파일도 바로 찾는다', async () => {
    const ix = new NameIndex()
    expect(await ix.find(root, '새파일.md')).toEqual([])
    writeFileSync(join(root, 'a/새파일.md'), ''); ix.touch()
    expect(await ix.find(root, '새파일.md')).toEqual([join(root, 'a/새파일.md')])
    expect(ix.builds).toBe(2)
  })
  it('감시가 안 닿는 곳은 TTL 이 지나면 다시 짓는다', async () => {
    const ix = new NameIndex(); ix.ttlMs = 0
    await ix.find(root, 'a.md'); writeFileSync(join(root, 'late.md'), '')
    expect(await ix.find(root, 'late.md')).toEqual([join(root, 'late.md')])
  })
  it('이름당 앞 5개까지만', async () => {
    for (let i = 0; i < 8; i++) { mkdirSync(join(root, `d${i}`)); writeFileSync(join(root, `d${i}/same.md`), '') }
    expect((await new NameIndex().find(root, 'same.md')).length).toBe(5)
  })
})
