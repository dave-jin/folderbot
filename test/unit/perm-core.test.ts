import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { fdaVerdict, permsSatisfied, permsActionable, permissionRows } = createRequire(import.meta.url)('../../desktop/perm-core.js') as { fdaVerdict: (c: (string | null)[]) => string; permsSatisfied: (i: { required: boolean; status: string }[]) => boolean; permsActionable: (i: { required: boolean; status: string }[]) => boolean; permissionRows: (o: { os: string; packaged: boolean; host: boolean; openMode?: string; ack: { notifications?: boolean }; diskStatus: string }) => { id: string; status: string; required: boolean }[] }

describe('perm-core', () => {
  it('fdaVerdict — 하나라도 열리면 있음, EPERM 이면 없음, 전부 ENOENT 면 모름(없음으로 내리지 않는다)', () => {
    expect(fdaVerdict([null, 'EPERM'])).toBe('granted')
    expect(fdaVerdict(['EPERM', 'ENOENT'])).toBe('missing')
    expect(fdaVerdict(['EACCES'])).toBe('missing')
    expect(fdaVerdict(['ENOENT', 'ENOENT'])).toBe('unknown')
  })
  it('permsSatisfied — 필수만 본다 · permsActionable — 권장의 모름은 할 일이 아니다', () => {
    const fd = (status: string, required = true) => ({ id: 'full-disk', required, status })
    expect(permsSatisfied([fd('granted'), { required: false, status: 'unknown' }])).toBe(true)
    expect(permsSatisfied([fd('missing')])).toBe(false)
    expect(permsSatisfied([fd('unknown')])).toBe(false)
    expect(permsSatisfied([fd('missing', false)])).toBe(true)
    expect(permsActionable([{ required: false, status: 'unknown' }])).toBe(false)
    expect(permsActionable([{ required: false, status: 'missing' }])).toBe(true)
    expect(permsActionable([{ required: true, status: 'unknown' }])).toBe(true)
  })
  it('Windows 호스트에는 macOS 전체 디스크 접근을 요구하지 않는다', () => {
    const win = permissionRows({ os: 'win32', packaged: true, host: true, ack: {}, diskStatus: 'missing' })
    expect(win.map((r) => r.id)).toEqual(['notifications'])
    const mac = permissionRows({ os: 'darwin', packaged: true, host: true, ack: {}, diskStatus: 'missing' })
    expect(mac.map((r) => r.id)).toEqual(['full-disk', 'notifications'])
    expect(permissionRows({ os: 'win32', packaged: true, host: false, openMode: 'download', ack: { notifications: true }, diskStatus: 'unknown' }).map((r) => r.status)).toEqual(['granted', 'granted'])
  })
})
