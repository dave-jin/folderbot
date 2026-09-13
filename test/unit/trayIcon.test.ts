import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { inflateSync } from 'node:zlib'

const require_ = createRequire(import.meta.url)
const { folderIcon } = require_('../../desktop/trayIcon.js') as { folderIcon: (p: number | null, s?: number) => Buffer }

/** 만든 PNG 를 다시 풀어 알파만 읽는다 — «얼마나 찼나» 를 눈이 아니라 숫자로 잰다 */
function alphas(png: Buffer, size: number): number[][] {
  let o = 8
  const idat: Buffer[] = []
  while (o < png.length) {
    const len = png.readUInt32BE(o)
    if (png.subarray(o + 4, o + 8).toString() === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = 1 + size * 2
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => raw[y * stride + 1 + x * 2 + 1]))
}
const filled = (png: Buffer, size: number) => alphas(png, size).flat().filter((a) => a > 200).length

describe('메뉴바 아이콘 — 남은 사용량만큼 찬 폴더', () => {
  it('진짜 PNG 다 (시그니처 · IHDR · IEND)', () => {
    const b = folderIcon(50, 44)
    expect([...b.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(b.subarray(12, 16).toString()).toBe('IHDR')
    expect(b.subarray(b.length - 8, b.length - 4).toString()).toBe('IEND')
  })

  // 🔴 배터리와 같은 방향이다 — 많이 남으면 많이 차 있다. 반대로 가면 «다 썼는데 가득» 이 된다
  it('많이 남을수록 더 찬다', () => {
    const a = [0, 27, 50, 100].map((p) => filled(folderIcon(p, 44), 44))
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1])
  })

  it('0% 와 100% 는 눈에 띄게 다르다 — 테두리만 남아도 폴더로는 읽힌다', () => {
    const zero = filled(folderIcon(0, 44), 44)
    const full = filled(folderIcon(100, 44), 44)
    expect(zero).toBeGreaterThan(0)            // 테두리는 남는다
    expect(full).toBeGreaterThan(zero * 2.5)
  })

  // ⚠ 템플릿 이미지다 — 색은 전부 검정이고 알파만 다르다(맥이 라이트/다크에 맞춰 칠한다)
  it('회색값은 전부 0 이다 (템플릿 이미지)', () => {
    const b = folderIcon(60, 22)
    let o = 8; const idat: Buffer[] = []
    while (o < b.length) { const len = b.readUInt32BE(o); if (b.subarray(o + 4, o + 8).toString() === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len)); o += 12 + len }
    const raw = inflateSync(Buffer.concat(idat))
    const stride = 1 + 22 * 2
    for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) expect(raw[y * stride + 1 + x * 2]).toBe(0)
  })

  it('아직 모르면 빈 폴더 (던지지 않는다)', () => {
    expect(() => folderIcon(null, 44)).not.toThrow()
  })
})
