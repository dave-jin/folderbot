import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../../src/host/registry'

/** A · bots_reorder — 오케스트레이터가 레일 순서를 정한다 (2026-09-19) */
function vault(): { root: string; reg: Registry; rels: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'fb-reg-'))
  writeFileSync(join(root, 'CLAUDE.md'), '')
  const rels = ['2. Projects/a', '2. Projects/b', '2. Projects/c', '2. Projects/d']
  for (const r of rels) mkdirSync(join(root, r), { recursive: true })
  const reg = new Registry(root)
  for (const r of rels) reg.start(r)
  return { root, reg, rels }
}
const order = (reg: Registry) => reg.bots().filter((b) => !b.orchestrator).map((b) => b.rel.split('/')[1])

describe('registry.reorderByAgent (A)', () => {
  it('순서를 바꾸고 orderedBy 가 orchestrator 로 찍힌다', () => {
    const { root, reg } = vault()
    reg.reorderByAgent(['2. Projects/c', '2. Projects/a'])
    expect(order(reg)).toEqual(['c', 'a', 'b', 'd'])          // 안 준 것은 기존 차례로 뒤에
    expect(reg.bots().filter((b) => !b.orchestrator).map((b) => b.orderedBy)).toEqual(['orchestrator', 'orchestrator', undefined, undefined])
    rmSync(root, { recursive: true, force: true })
  })
  it('없는 rel 이 섞이면 실패하고 순서는 그대로다', () => {
    const { root, reg } = vault()
    expect(() => reg.reorderByAgent(['2. Projects/b', '2. Projects/없음'])).toThrow(/없음/)
    expect(order(reg)).toEqual(['a', 'b', 'c', 'd'])
    expect(reg.bots().some((b) => b.orderedBy)).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })
  it('사람이 끌어 놓은 봇은 자리를 지킨다', () => {
    const { root, reg } = vault()
    const ids = reg.bots().filter((b) => !b.orchestrator).map((b) => b.id)
    reg.reorder([ids[1], ids[0], ids[2], ids[3]], ids[1])   // b 를 맨 위로 끌었다 → b 는 «사람이 정한» 자리
    expect(order(reg)).toEqual(['b', 'a', 'c', 'd'])
    reg.reorderByAgent(['2. Projects/d', '2. Projects/c', '2. Projects/b', '2. Projects/a'])
    expect(order(reg)).toEqual(['b', 'd', 'c', 'a'])          // 0번 칸은 b 가 지키고 나머지만 d c a
    const by = Object.fromEntries(reg.bots().filter((b) => !b.orchestrator).map((b) => [b.rel.split('/')[1], b.orderedBy]))
    expect(by).toEqual({ b: 'user', d: 'orchestrator', c: 'orchestrator', a: 'orchestrator' })
    reg.unfix(ids[1])
    reg.reorderByAgent(['2. Projects/d', '2. Projects/c', '2. Projects/b', '2. Projects/a'])
    expect(order(reg)).toEqual(['d', 'c', 'b', 'a'])
    rmSync(root, { recursive: true, force: true })
  })
  it('restore 는 첫 재정렬 전 차례로 돌린다 · 다시 시작해도 순서가 남는다', () => {
    const { root, reg } = vault()
    reg.reorderByAgent(['2. Projects/d'])
    reg.reorderByAgent(['2. Projects/c'])
    expect(order(reg)).toEqual(['c', 'd', 'a', 'b'])
    expect(readFileSync(join(root, '.folderbot', 'bots.yml'), 'utf8')).toMatch(/orderBackup/)
    const again = new Registry(root)
    expect(order(again)).toEqual(['c', 'd', 'a', 'b'])
    again.reorderByAgent([], true)
    expect(order(again)).toEqual(['a', 'b', 'c', 'd'])
    expect(again.bots().some((b) => b.orderedBy)).toBe(false)
    expect(readFileSync(join(root, '.folderbot', 'bots.yml'), 'utf8')).not.toMatch(/orderBackup/)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('installRules · J-2 기기 규칙', () => {
  it('새 볼트의 CLAUDE.md 머리말에 규칙 절이 든다 · 이미 있는 CLAUDE.md 는 규칙 블록만 갈아 끼운다', () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-reg-j-'))
    const reg = new Registry(root); reg.installRules('para')
    const md = readFileSync(join(root, 'CLAUDE.md'), 'utf8')
    expect(md).toContain('## 발신 기기 (Folder Bot)'); expect(md).toContain('rondo_open')
    const root2 = mkdtempSync(join(tmpdir(), 'fb-reg-j2-')); writeFileSync(join(root2, 'CLAUDE.md'), '# 내 볼트\n\n내 규칙\n')
    new Registry(root2).installRules('para')
    const md2 = readFileSync(join(root2, 'CLAUDE.md'), 'utf8'); expect(md2.startsWith('# 내 볼트')).toBe(true); expect(md2).not.toContain('## 발신 기기')   // 있는 글은 건드리지 않는다 — 규칙은 시스템 프롬프트로도 간다
    rmSync(root, { recursive: true, force: true }); rmSync(root2, { recursive: true, force: true })
  })
})

describe('scaffold · 볼트 공통 지침(new-folder 블록)', () => {
  const TG = '## 📣 루틴 결과는 텔레그램으로 보고한다\n\n- 끝날 때마다 `tg-report` 로 보낸다.'
  it('루트 CLAUDE.md 의 ```md new-folder``` 블록을 새 폴더 CLAUDE.md 끝에 붙인다 · createFolder 와 start 둘 다', () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-reg-tpl-'))
    writeFileSync(join(root, 'CLAUDE.md'), `# 볼트\n\n\`\`\`md new-folder\n${TG}\n\`\`\`\n`)
    mkdirSync(join(root, '2. Projects'), { recursive: true }); mkdirSync(join(root, '3. Area/b'), { recursive: true })
    const reg = new Registry(root)
    const rel = reg.createFolder('2. Projects', 'a')
    const a = readFileSync(join(root, rel, 'CLAUDE.md'), 'utf8')
    expect(a).toContain('orch_ask'); expect(a.trimEnd().endsWith('`tg-report` 로 보낸다.')).toBe(true)
    reg.start('3. Area/b')
    expect(readFileSync(join(root, '3. Area/b/CLAUDE.md'), 'utf8')).toContain('## 📣 루틴 결과는 텔레그램으로 보고한다')
    rmSync(root, { recursive: true, force: true })
  })
  it('블록이 없으면 기본 틀 그대로 · 본문에 ``` 가 있으면 더 긴 울타리로 싼다', () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-reg-tpl2-'))
    writeFileSync(join(root, 'CLAUDE.md'), '# 볼트\n')
    mkdirSync(join(root, '2. Projects'), { recursive: true })
    const reg = new Registry(root)
    const a = readFileSync(join(root, reg.createFolder('2. Projects', 'a'), 'CLAUDE.md'), 'utf8')
    expect(a.trimEnd().endsWith('답은 이 세션으로 돌아온다.')).toBe(true)
    writeFileSync(join(root, 'CLAUDE.md'), '# 볼트\n\n````markdown new-folder\n## 예\n\n```\ntg-report\n```\n````\n')
    const b = readFileSync(join(root, reg.createFolder('2. Projects', 'b'), 'CLAUDE.md'), 'utf8')
    expect(b).toContain('## 예\n\n```\ntg-report\n```')
    rmSync(root, { recursive: true, force: true })
  })
})
