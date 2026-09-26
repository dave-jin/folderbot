/** GUI가 없는 Node 호스트가 로컬 OS의 파일·터미널을 여는 명령. 사용자 경로는 명령 문자열에 보간하지 않는다. */
export function zipCommand(os: NodeJS.Platform, name: string): { bin: string; args: string[] } {
  if (os === 'win32') return { bin: 'tar.exe', args: ['--format', 'zip', '-cf', '-', '--exclude', '.*', '--exclude', '*/.*', name] }
  return { bin: 'zip', args: ['-r', '-q', '-', name, '-x', '*/.*', '.*'] }
}

export function windowsOpenCommand(abs: string, reveal = false): { bin: string; args: string[]; env?: Record<string, string> } {
  if (reveal) return { bin: 'explorer.exe', args: [`/select,${abs}`] }
  return {
    bin: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', 'Invoke-Item -LiteralPath $env:FOLDERBOT_OPEN_PATH'],
    env: { ...process.env, FOLDERBOT_OPEN_PATH: abs } as Record<string, string>
  }
}

export function windowsLoginCommand(root: string, agent: 'claude' | 'codex'): { bin: string; args: string[]; env: Record<string, string> } {
  return {
    bin: 'powershell.exe',
    args: ['-NoProfile', '-NoExit', '-Command', 'Set-Location -LiteralPath $env:FOLDERBOT_LOGIN_ROOT; & $env:FOLDERBOT_LOGIN_AGENT'],
    env: { ...process.env, FOLDERBOT_LOGIN_ROOT: root, FOLDERBOT_LOGIN_AGENT: agent } as Record<string, string>
  }
}
