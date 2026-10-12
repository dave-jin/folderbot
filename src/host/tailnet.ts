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
/**
 * CF-1 · `/api/state` 가 부를 때마다 `tailscale status` 프로세스를 띄워 42ms 를 썼다(2026-10-12 실측 A3).
 * 30초 안의 값은 다시 쓰고, 동시에 온 요청은 한 번만 띄운다. 설정의 «Tailscale 확인» 은 `/api/tailnet` 이라 늘 새로 묻는다.
 */
let memo: { at: number; v: TailnetInfo } | null = null; let inflight: Promise<TailnetInfo> | null = null
export function tailnetInfoCached(maxAgeMs = 30_000, now = Date.now(), load: () => Promise<TailnetInfo> = tailnetInfo): Promise<TailnetInfo> {
  if (memo && now - memo.at < maxAgeMs) return Promise.resolve(memo.v)
  if (inflight) return inflight
  inflight = load().then((v) => { memo = { at: Date.now(), v }; return v }).finally(() => { inflight = null })
  return inflight
}
