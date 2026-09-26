import { describe, expect, it } from 'vitest'
import { win32 } from 'node:path'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dataDir } from '../../src/host/paths'
import { portableRelative, resolveNFAbsolute, withinPath } from '../../src/host/files'
import { usageHookCommand } from '../../src/host/usage'

describe('Windows host paths', () => {
  it('CLI state lives under roaming AppData', () => {
    expect(dataDir({ platform: 'win32', home: 'C:\\Users\\dave', appData: 'D:\\Profile\\Roaming', override: '' })).toBe('D:\\Profile\\Roaming\\folderbot')
  })
  it('API and registry paths remain slash separated', () => {
    expect(portableRelative('C:\\Vault', 'C:\\Vault\\2. Projects\\Bot\\todo.md', win32)).toBe('2. Projects/Bot/todo.md')
    expect(portableRelative('C:\\Vault\\Bot', 'C:\\Vault\\Notes\\a.md', win32)).toBe('../Notes/a.md')
  })
  it('keeps Windows paths inside the selected drive or UNC share, ignoring case', () => {
    expect(withinPath('C:\\Vault', 'c:\\vault\\Notes\\a.md', win32)).toBe(true)
    expect(withinPath('C:\\Vault', 'C:\\Vault Copy\\a.md', win32)).toBe(false)
    expect(withinPath('C:\\Vault', 'D:\\Vault\\a.md', win32)).toBe(false)
    expect(withinPath('\\\\server\\share\\Vault', '\\\\SERVER\\SHARE\\vault\\a.md', win32)).toBe(true)
    expect(withinPath('\\\\server\\share\\Vault', '\\\\server\\other\\Vault\\a.md', win32)).toBe(false)
  })
  it('quotes a hook script under a Windows user profile with spaces', () => {
    expect(usageHookCommand('C:\\Users\\Jane Doe\\.folderbot\\usage-hook.mjs', 'win32')).toBe('node "C:\\Users\\Jane Doe\\.folderbot\\usage-hook.mjs"')
  })
  it('resolves composed names at every directory segment from an absolute path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-nf-'))
    const folder = join(dir, '가나다'.normalize('NFD'))
    mkdirSync(folder)
    writeFileSync(join(folder, '메모.md'.normalize('NFD')), 'x')
    try { expect(resolveNFAbsolute(join(dir, '가나다', '메모.md'))).toBe(join(folder, '메모.md'.normalize('NFD'))) }
    finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
