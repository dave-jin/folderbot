import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ORCH_COLOR, OLD_AMBER, PALETTE_HEX, colorAllowed, isOrchLike, leastUsed } from '../../src/core/botColor'
import { Registry } from '../../src/host/registry'

/** CN · 폴더봇 색은 사람이 고른다 · 주황은 오케스트레이터만 (2026-10-16) */
describe('CN · 판과 주황', () => {
  it('판은 12색 · 주황·앰버가 없다', () => {
    expect(PALETTE_HEX).toHaveLength(12)
    expect(PALETTE_HEX).not.toContain(ORCH_COLOR)
    expect(PALETTE_HEX).not.toContain(OLD_AMBER)
    for (const h of PALETTE_HEX) expect(isOrchLike(h)).toBe(false)
  })
  it('주황 언저리를 알아본다', () => {
    expect(isOrchLike(ORCH_COLOR)).toBe(true)
    expect(isOrchLike('#e07040')).toBe(true)
    expect(isOrchLike('#6ea6f7')).toBe(false)
    expect(isOrchLike('#8a9bb0')).toBe(false)     // 채도 낮은 회청
    expect(isOrchLike('nope')).toBe(false)
  })
  it('판 밖 색은 못 고른다', () => {
    expect(colorAllowed('#6EA6F7')).toBe(true)
    expect(colorAllowed(ORCH_COLOR)).toBe(false)
    expect(colorAllowed(OLD_AMBER)).toBe(false)
    expect(colorAllowed('#123456')).toBe(false)
  })
  it('가장 덜 쓰인 색 — 같으면 판 순서', () => {
    expect(leastUsed([])).toBe(PALETTE_HEX[0])
    expect(leastUsed([PALETTE_HEX[0]])).toBe(PALETTE_HEX[1])
    expect(leastUsed(PALETTE_HEX.filter((h) => h !== PALETTE_HEX[5]))).toBe(PALETTE_HEX[5])
  })
})

describe('CN · 레지스트리', () => {
  const vault = () => { const root = mkdtempSync(join(tmpdir(), 'fb-col-')); writeFileSync(join(root, 'CLAUDE.md'), ''); for (const r of ['2. Projects/a', '2. Projects/b']) mkdirSync(join(root, r), { recursive: true }); return root }
  it('새 봇은 서로 다른 판 색을 받는다', () => {
    const root = vault(); const reg = new Registry(root)
    const a = reg.start('2. Projects/a'), b = reg.start('2. Projects/b')
    expect(PALETTE_HEX).toContain(a.color); expect(PALETTE_HEX).toContain(b.color); expect(a.color).not.toBe(b.color)
    rmSync(root, { recursive: true, force: true })
  })
  it('고른 색은 .bot.yml 에 적히고 주황·판 밖·오케스트레이터는 거절', () => {
    const root = vault(); const reg = new Registry(root)
    const a = reg.start('2. Projects/a')
    expect(reg.setColor(a.id, '#5fd3b5').color).toBe('#5fd3b5')
    expect(readFileSync(join(root, '2. Projects/a/.bot.yml'), 'utf8')).toMatch(/color: "?#5fd3b5/)
    expect(() => reg.setColor(a.id, ORCH_COLOR)).toThrow(/오케스트레이터 전용/)
    expect(() => reg.setColor(a.id, '#123456')).toThrow(/12색/)
    expect(() => reg.setColor('orch', '#5fd3b5')).toThrow(/오케스트레이터/)
    rmSync(root, { recursive: true, force: true })
  })
  it('옛 앰버 봇은 뜰 때 한 번 옮기고 · .bot.yml 의 주황은 무시한다', () => {
    const root = vault()
    mkdirSync(join(root, '.folderbot'), { recursive: true })
    writeFileSync(join(root, '.folderbot/bots.yml'), `bots:\n  - id: b_a\n    rel: 2. Projects/a\n    color: "${OLD_AMBER}"\n    startedAt: 1\n  - id: b_b\n    rel: 2. Projects/b\n    color: "${PALETTE_HEX[0]}"\n    startedAt: 2\n`)
    writeFileSync(join(root, '2. Projects/b/.bot.yml'), `color: "${ORCH_COLOR}"\n`)
    const reg = new Registry(root)
    const bots = reg.bots().filter((b) => !b.orchestrator)
    const a = bots.find((b) => b.id === 'b_a')!, b = bots.find((x) => x.id === 'b_b')!
    expect(a.color).toBe(PALETTE_HEX[1])                      // 덜 쓰인 색으로
    expect(readFileSync(join(root, '.folderbot/bots.yml'), 'utf8')).not.toContain(OLD_AMBER)   // 파일에도 — 다음에 또 옮기지 않는다
    expect(b.color).toBe(PALETTE_HEX[0])                      // .bot.yml 의 주황은 받지 않는다
    rmSync(root, { recursive: true, force: true })
  })
})
