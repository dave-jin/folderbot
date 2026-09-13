import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { allDirs, tree } from '../../src/host/files'

/**
 * 폴더 색인 — «검색이 아예 안 되는 폴더» 사고의 회귀 방어 (2026-09-13).
 * 종전 피커는 `tree(base, 4)` 를 색인으로 썼는데 그 함수는 파일까지 세며 400개에서 끊는다.
 */
let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fb-dirs-'))
  // 파일이 많은 폴더가 앞에 오면 종전 색인은 여기서 예산을 다 쓴다
  mkdirSync(join(root, '0. 대량'), { recursive: true })
  for (let i = 0; i < 450; i++) writeFileSync(join(root, '0. 대량', `메모${i}.md`), 'x')
  // 뒤쪽에 있는, 깊은, NFD 이름의 폴더
  mkdirSync(join(root, '2. Projects', '2026-09_트레바리-북클럽'.normalize('NFD'), '01_기획', '자료'), { recursive: true })
})
afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }) })

describe('allDirs', () => {
  it('파일이 400개를 넘어도 뒤쪽 폴더까지 닿는다 (종전 tree 색인은 못 닿았다)', () => {
    const old = tree(root, 4).flatMap(function f(n): string[] { return [n.rel, ...(n.children ?? []).flatMap(f)] })
    expect(old.some((r) => r.includes('트레바리'.normalize('NFD')))).toBe(false) // 원인 재현
    const now = allDirs(root).map((n) => n.rel)
    expect(now.some((r) => r.includes('트레바리'.normalize('NFD')))).toBe(true)
  })

  it('폴더만 담는다 — 파일은 색인하지 않는다', () => {
    expect(allDirs(root).every((n) => n.dir)).toBe(true)
    expect(allDirs(root).some((n) => n.name.startsWith('메모'))).toBe(false)
  })

  it('깊이 4 아래도 담는다 (2. Projects/…/01_기획/자료 = 4단계)', () => {
    expect(allDirs(root).map((n) => n.rel).some((r) => r.endsWith('01_기획/자료'))).toBe(true)
  })
})
