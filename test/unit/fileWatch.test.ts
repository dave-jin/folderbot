import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ignoredChange } from '../../src/core/fileWatch'
import { FolderWatch } from '../../src/host/watch'

/**
 * 폴더 감시 (2026-09-18 Dave: «대화를 통해 파일이 생성되는 경우 원격환경에서 생성된 파일이 폴더에 바로
 * 반영이 안 되는 문제»). 종전에는 «세션이 Write 도구를 불렀다» 가 유일한 신호였고 그마저 쓰기 *전* 에
 * 나갔다. 호스트가 봇 폴더를 직접 보고 알린다 — Bash·Codex·Dropbox·Finder 가 만든 파일도 잡힌다.
 */
describe('ignoredChange — 앱 자신의 상태와 도구 폴더는 신호가 아니다', () => {
  it('.folderbot · .projectbot · .git · node_modules · .DS_Store 는 무시', () => {
    for (const p of ['.folderbot/sessions/x.json', '.projectbot/a', '.git/index', 'sub/.git/HEAD', 'node_modules/x/index.js', 'a/.DS_Store', 'docs/.obsidian/workspace.json']) expect(ignoredChange(p)).toBe(true)
  })
  it('보통 파일·폴더는 신호', () => {
    for (const p of ['04_독후감_최종.md', 'files/a.png', '.claude/skills/x/SKILL.md', 'a.git.md', '']) expect(ignoredChange(p)).toBe(false)
  })
})

const until = async (f: () => boolean, ms = 2500) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 40)) } return true }

describe('FolderWatch — 봇 폴더에 뭔가 생기면 봇 id 로 알린다 (디바운스 · 겹치는 봇은 둘 다)', () => {
  it('파일을 만들면 300ms 안팎에 한 번 · 무시 폴더는 조용 · 지운 봇은 더 이상 안 온다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fb-watch-')); mkdirSync(join(root, 'sub'), { recursive: true }); mkdirSync(join(root, '.folderbot'), { recursive: true })
    const got: string[] = []
    const w = new FolderWatch((botId) => got.push(botId))
    w.sync([{ id: 'root', abs: root }, { id: 'sub', abs: join(root, 'sub') }])
    try {
      writeFileSync(join(root, 'sub', 'new.md'), 'x')
      expect(await until(() => got.includes('sub') && got.includes('root'))).toBe(true)
      await new Promise((r) => setTimeout(r, 600))
      const n = got.length
      expect(got.filter((b) => b === 'sub').length).toBe(1)   // 디바운스 — 한 파일에 한 번
      writeFileSync(join(root, '.folderbot', 'state.json'), '{}')
      await new Promise((r) => setTimeout(r, 700))
      expect(got.length).toBe(n)                                 // 앱 상태 파일은 신호가 아니다
      w.sync([{ id: 'root', abs: root }])
      writeFileSync(join(root, 'sub', 'again.md'), 'y')
      expect(await until(() => got.length > n)).toBe(true)
      expect(got.slice(n)).not.toContain('sub')                  // 지운 봇은 더 이상 안 온다
    } finally { w.close(); rmSync(root, { recursive: true, force: true }) }
  })
})
