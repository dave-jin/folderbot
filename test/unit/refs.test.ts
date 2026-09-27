import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../../src/host/registry'
import { extraDirs } from '../../src/host/session'

/** BC · 참조 폴더 — 볼트 안 폴더를 «읽으려고» 붙인다. 작업 폴더(cwd)는 그대로 (2026-09-27) */
function vault() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fb-refs-')))   // 맥 /var → /private/var
  writeFileSync(join(root, 'CLAUDE.md'), '')
  for (const d of ['2. Projects/a/sub', '3. Area/r1/in', '3. Area/r2', '3. Area/r3', '3. Area/r4', '3. Area/r5', '3. Area/r6', '4. Resources/x'])
    mkdirSync(join(root, d), { recursive: true })
  const reg = new Registry(root)
  const bot = reg.start('2. Projects/a')
  return { root, reg, id: bot.id }
}
const yml = (root: string) => readFileSync(join(root, '2. Projects/a/.bot.yml'), 'utf8')

describe('registry.addRef / removeRef (BC)', () => {
  it('더하면 bot.refs 에 절대 경로가 나오고 .bot.yml 에는 볼트 기준 상대 경로로 남는다', () => {
    const { root, reg, id } = vault()
    const b = reg.addRef(id, join(root, '3. Area/r1'))
    expect(b.refs).toEqual([join(root, '3. Area/r1')])
    expect(yml(root)).toBe('refs:\n  - 3. Area/r1\n')          // 볼트 기준 상대 경로 · 접지 않음
    expect(b.repo).toBeUndefined()                        // 🔴 코드 리포(cwd) 칸은 건드리지 않는다
    rmSync(root, { recursive: true, force: true })
  })
  it('정규화 안 된 경로(맥 /var ↔ /private/var)로 들어와도 볼트 기준 상대 경로로 남는다 — ../ 로 빠져나가지 않는다', () => {
    const { root, reg, id } = vault()
    if (!root.startsWith('/private/')) return            // 맥이 아니면 이 갈래가 없다
    reg.addRef(id, join(root.slice('/private'.length), '3. Area/r1'))
    expect(yml(root)).toBe('refs:\n  - 3. Area/r1\n')
    rmSync(root, { recursive: true, force: true })
  })
  it('여러 개를 더할 수 있고 6번째는 거부된다', () => {
    const { root, reg, id } = vault()
    for (const r of ['r1', 'r2', 'r3', 'r4', 'r5']) reg.addRef(id, join(root, `3. Area/${r}`))
    expect(reg.bot(id)!.refs).toHaveLength(5)
    expect(() => reg.addRef(id, join(root, '3. Area/r6'))).toThrow(/5개까지/)
    rmSync(root, { recursive: true, force: true })
  })
  it('볼트 밖 · 봇 폴더 안 · 봇 폴더를 품은 상위 · 이미 있는 것 · 그 안쪽은 거부된다', () => {
    const { root, reg, id } = vault()
    expect(() => reg.addRef(id, tmpdir())).toThrow(/볼트 안 폴더만/)
    expect(() => reg.addRef(id, join(root, '2. Projects/a/sub'))).toThrow(/이 봇의 폴더 안/)
    expect(() => reg.addRef(id, join(root, '2. Projects'))).toThrow(/상위 폴더/)
    reg.addRef(id, join(root, '3. Area/r1'))
    expect(() => reg.addRef(id, join(root, '3. Area/r1'))).toThrow(/이미 참조 중인 폴더/)
    expect(() => reg.addRef(id, join(root, '3. Area/r1/in'))).toThrow(/안의 폴더/)
    rmSync(root, { recursive: true, force: true })
  })
  it('기존 참조를 품는 상위 폴더를 더하면 안쪽 것을 흡수한다(겹쳐 붙지 않는다)', () => {
    const { root, reg, id } = vault()
    reg.addRef(id, join(root, '3. Area/r1'))
    const b = reg.addRef(id, join(root, '3. Area'))
    expect(b.refs).toEqual([join(root, '3. Area')])
    rmSync(root, { recursive: true, force: true })
  })
  it('빼면 목록에서 사라지고, 마지막 것을 빼면 refs 칸이 .bot.yml 에서 없어진다', () => {
    const { root, reg, id } = vault()
    reg.addRef(id, join(root, '3. Area/r1')); reg.addRef(id, join(root, '4. Resources/x'))
    expect(reg.removeRef(id, join(root, '3. Area/r1')).refs).toEqual([join(root, '4. Resources/x')])
    reg.removeRef(id, '4. Resources/x')                   // 볼트 기준 상대 경로로도 뺄 수 있다
    expect(reg.bot(id)!.refs).toBeUndefined()
    expect(yml(root)).not.toMatch(/refs/)
    expect(() => reg.removeRef(id, '4. Resources/x')).toThrow(/목록에 없는/)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('extraDirs — 세션에 붙는 --add-dir (BC)', () => {
  it('참조 폴더만 있으면 참조 폴더만 붙고, 작업 폴더는 봇 폴더 그대로다', () => {
    expect(extraDirs({ abs: '/v/a', refs: ['/v/r1', '/v/r2'] })).toEqual(['/v/r1', '/v/r2'])
  })
  it('코드 리포가 있으면 봇 폴더도 붙는다(작업 폴더가 리포로 가므로)', () => {
    expect(extraDirs({ abs: '/v/a', repo: '/dev/x', refs: ['/v/r1'] })).toEqual(['/v/r1', '/v/a'])
  })
  it('둘 다 없으면 아무것도 붙이지 않는다', () => {
    expect(extraDirs({ abs: '/v/a' })).toBeUndefined()
  })
})
