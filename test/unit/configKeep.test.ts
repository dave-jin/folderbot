import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** DB · 설정은 다시 켜도 남는다 (2026-10-17 Dave «새 채팅 기본 권한이 업데이트 할때마다 이전 설정으로 돌아가») */
describe('DB loadConfig 왕복', () => {
  beforeAll(() => { process.env.FOLDERBOT_DATA = mkdtempSync(join(tmpdir(), 'fb-cfg-')) })
  it('새 채팅 기본 권한·자동 잠재우기가 다시 읽어도 남는다', async () => {
    const { loadConfig, saveConfig } = await import('../../src/host/paths')
    const c = loadConfig()
    saveConfig({ ...c, root: '/x', defaultPermissionMode: 'bypassPermissions', idleMinutes: 45 })
    const back = loadConfig()
    expect(back.defaultPermissionMode).toBe('bypassPermissions')
    expect(back.idleMinutes).toBe(45)
    expect(back.root).toBe('/x')
  })
  it('모르는 칸도 지우지 않는다(새 설정을 더할 때 목록을 잊어도)', async () => {
    const { loadConfig, saveConfig } = await import('../../src/host/paths')
    saveConfig({ ...loadConfig(), futureThing: 7 } as never)
    expect((loadConfig() as unknown as { futureThing: number }).futureThing).toBe(7)
  })
})
