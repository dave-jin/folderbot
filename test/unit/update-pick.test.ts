import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { pickLatest, cmp } = createRequire(import.meta.url)('../../desktop/update-pick.js') as { pickLatest: (r: unknown[], cur: string) => { version: string; newer: boolean; zipUrl: string; shaUrl?: string; tag: string } | null; cmp: (a: string, b: string) => number }

const rel = (tag: string, ver: string, extra: Record<string, unknown> = {}) => ({ tag_name: tag, draft: false, body: `notes ${ver}`, assets: [
  { name: `Folder.Bot-${ver}-arm64.dmg`, browser_download_url: `u/${ver}.dmg`, size: 1 },
  { name: `Folder.Bot-${ver}-arm64-mac.zip`, browser_download_url: `u/${ver}.zip`, size: 2 },
  { name: `Folder.Bot-${ver}-arm64-mac.zip.sha256`, browser_download_url: `u/${ver}.zip.sha256`, size: 3 }
], ...extra })

describe('update-pick — 릴리스 목록에서 받을 것 하나', () => {
  it('버전은 태그가 아니라 zip 이름에서 읽고, 가장 높은 것을 고른다', () => {
    const r = pickLatest([rel('desktop-v5', '0.2.5'), rel('desktop-v7', '0.2.7'), rel('desktop-v6', '0.2.6')], '0.2.6')!
    expect(r.version).toBe('0.2.7'); expect(r.tag).toBe('desktop-v7'); expect(r.newer).toBe(true)
    expect(r.zipUrl).toBe('u/0.2.7.zip'); expect(r.shaUrl).toBe('u/0.2.7.zip.sha256')
  })
  it('지금과 같거나 낮으면 newer=false', () => {
    expect(pickLatest([rel('desktop-v7', '0.2.7')], '0.2.7')!.newer).toBe(false)
    expect(pickLatest([rel('desktop-v7', '0.2.7')], '0.3.0')!.newer).toBe(false)
  })
  it('초안 · zip 없는 릴리스 · 다른 태그는 건너뛴다', () => {
    const noZip = { tag_name: 'desktop-v9', draft: false, assets: [{ name: 'Folder.Bot-0.2.9-arm64.dmg', browser_download_url: 'x', size: 1 }] }
    const draft = rel('desktop-v8', '0.2.8', { draft: true })
    const other = rel('folderbot-cli-v1', '9.9.9')
    expect(pickLatest([noZip, draft, other, rel('desktop-v7', '0.2.7')], '0.2.6')!.version).toBe('0.2.7')
    expect(pickLatest([noZip, draft], '0.2.6')).toBeNull()
  })
  it('cmp 는 세 자리 숫자 비교', () => { expect(cmp('0.2.10', '0.2.9')).toBeGreaterThan(0); expect(cmp('1.0.0', '0.9.9')).toBeGreaterThan(0); expect(cmp('0.2.7', '0.2.7')).toBe(0) })
})
