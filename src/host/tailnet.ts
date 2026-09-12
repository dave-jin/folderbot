import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

const CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./
export function bindAddresses(): string[] {
  const out = ['127.0.0.1']
  for (const list of Object.values(networkInterfaces())) for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal && CGNAT.test(ni.address)) out.push(ni.address)
  if (process.env.FOLDERBOT_BIND_ALL) out.push('0.0.0.0')
  return out
}
export interface TailnetInfo { state: 'absent' | 'stopped' | 'needs-login' | 'running' | 'unknown'; ip?: string; dnsName?: string; version?: string }
export function tailnetInfo(): Promise<TailnetInfo> {
  const bin = ['/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale'].find((p) => existsSync(p))
  if (!bin) return Promise.resolve({ state: 'absent' })
  return new Promise((resolve) => {
    execFile(bin, ['status', '--json'], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ state: 'unknown' })
      try {
        const j = JSON.parse(stdout) as { BackendState?: string; Self?: { TailscaleIPs?: string[]; DNSName?: string }; Version?: string }
        const st = j.BackendState
        const state: TailnetInfo['state'] = st === 'Running' ? 'running' : st === 'NeedsLogin' ? 'needs-login' : st === 'Stopped' ? 'stopped' : 'unknown'
        resolve({ state, ip: j.Self?.TailscaleIPs?.[0], dnsName: j.Self?.DNSName?.replace(/\.$/, ''), version: j.Version })
      } catch { resolve({ state: 'unknown' }) }
    })
  })
}
