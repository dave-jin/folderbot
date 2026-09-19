import { describe, it, expect } from 'vitest'
import { clientBlock, parseClientBlock, withClient } from '../../src/core/clientCtx'
describe('clientCtx (J)', () => {
  it('블록을 만들고 다시 읽는다 · 사람의 글은 그대로', () => {
    const c = { origin: 'remote' as const, device: 'iPhone "15"', tier: 'phone' as const, touch: true, canOpenOnDevice: false, openMode: '' as const }
    const t = withClient('안녕', c); expect(t.startsWith('<folderbot-client origin="remote" device="iPhone &quot;15&quot;" tier="phone" touch="true" canOpenOnDevice="false" openMode="none"/>\n\n')).toBe(true)
    const p = parseClientBlock(t)!; expect(p.ctx).toEqual(c); expect(p.rest).toBe('안녕')
    expect(parseClientBlock('안녕')).toBeNull(); expect(withClient('x', null)).toBe('x'); expect(clientBlock({ ...c, openMode: 'sync' })).toContain('openMode="sync"')
  })
})
