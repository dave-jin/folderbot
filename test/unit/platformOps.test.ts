import { describe, expect, it } from 'vitest'
import { windowsLoginCommand, windowsOpenCommand, zipCommand } from '../../src/host/platformOps'

describe('Windows host commands', () => {
  it('uses the built-in zip-capable tar without a command shell', () => {
    expect(zipCommand('win32', 'My Vault')).toEqual({ bin: 'tar.exe', args: ['--format', 'zip', '-cf', '-', '--exclude', '.*', '--exclude', '*/.*', 'My Vault'] })
    expect(zipCommand('darwin', 'My Vault').bin).toBe('zip')
  })
  it('passes local paths and login directory as data, not PowerShell source', () => {
    const path = 'C:\\Vault & Notes\\a.md'
    const open = windowsOpenCommand(path)
    expect(open.args.join(' ')).not.toContain(path)
    expect(open.env?.FOLDERBOT_OPEN_PATH).toBe(path)
    expect(windowsOpenCommand(path, true)).toEqual({ bin: 'explorer.exe', args: [`/select,${path}`] })
    const login = windowsLoginCommand('C:\\Vault & Notes', 'claude')
    expect(login.args.join(' ')).not.toContain('C:\\Vault & Notes')
    expect(login.env.FOLDERBOT_LOGIN_ROOT).toBe('C:\\Vault & Notes')
    expect(login.env.FOLDERBOT_LOGIN_AGENT).toBe('claude')
  })
})
