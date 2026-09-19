import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
const lf = createRequire(import.meta.url)('../../desktop/localfs.js') as {
  tails: (r: string) => string[]; syncRoots: (h: string, e: string[]) => string[]; rank: (f: { path: string; real: string; files: number }[]) => { path: string; shell: boolean }[]
  detect: (hostRoot: string, home: string) => { path: string; real: string; files: number; shell: boolean }[]
  stat: (p: string) => { exists: boolean; size?: number; head?: string; placeholder?: boolean }; headHash: (p: string) => string
  waitFor: (p: string, want: { size: number; head: string }, ms: number) => Promise<boolean>; cachePath: (u: string, h: string, r: string) => string; placeholderName: (p: string) => string
}

/** E · 원격에서 파일 열기 — 이 기기의 볼트 찾기 · 신선도 재기 · 도착 기다리기 (임시 디렉터리로 흉내) */
describe('tails · syncRoots · rank', () => {
  it('꼬리 1~3조각 · 표준 자리', () => {
    expect(lf.tails('/Users/mini/Library/CloudStorage/Dropbox/PARA')).toEqual(['PARA', 'Dropbox/PARA', 'CloudStorage/Dropbox/PARA'])
    expect(lf.syncRoots('/h', ['Dropbox', 'Dropbox-Cbsjin', 'OneDrive'])).toEqual(['/h/Library/CloudStorage/Dropbox', '/h/Library/CloudStorage/Dropbox-Cbsjin', '/h/Dropbox', '/h/Library/Mobile Documents/com~apple~CloudDocs'])
  })
  it('같은 실체는 정본 자리 하나로 · 파일 많은 쪽 먼저 · 껍데기 표시', () => {
    const out = lf.rank([
      { path: '/h/Library/CloudStorage/Dropbox-Cbsjin/PARA', real: '/h/Library/CloudStorage/Dropbox-Cbsjin/PARA', files: 3 },
      { path: '/h/Dropbox/PARA', real: '/h/Library/CloudStorage/Dropbox/PARA', files: 1200 },
      { path: '/h/Library/CloudStorage/Dropbox/PARA', real: '/h/Library/CloudStorage/Dropbox/PARA', files: 1200 }
    ])
    expect(out.map((c) => [c.path, c.shell])).toEqual([['/h/Library/CloudStorage/Dropbox/PARA', false], ['/h/Library/CloudStorage/Dropbox-Cbsjin/PARA', true]])
  })
})

describe('detect — Dave 의 환경을 임시 폴더로: 정본 Dropbox/PARA · 껍데기 Dropbox-Cbsjin/…/PARA · ~/Dropbox 심링크', () => {
  it('정본이 1순위 · 껍데기는 뒤에 shell 표시 · 심링크는 하나로', () => {
    const home = mkdtempSync(join(tmpdir(), 'fb-home-'))
    const real = join(home, 'Library/CloudStorage/Dropbox/PARA'); mkdirSync(join(real, '2. Projects/a'), { recursive: true })
    for (let i = 0; i < 12; i++) writeFileSync(join(real, '2. Projects/a', `f${i}.md`), 'x')
    const shell = join(home, 'Library/CloudStorage/Dropbox-Cbsjin/진대연 (Dave)/PARA'); mkdirSync(shell, { recursive: true }); writeFileSync(join(shell, 'readme.md'), 'x')
    symlinkSync(join(home, 'Library/CloudStorage/Dropbox'), join(home, 'Dropbox'))
    try {
      const out = lf.detect('/Users/mini/Library/CloudStorage/Dropbox/PARA', home)
      expect(out[0].path).toBe(real); expect(out[0].shell).toBe(false); expect(out[0].files).toBe(12)
      expect(out.some((c) => c.path === join(home, 'Dropbox/PARA'))).toBe(false)   // 심링크는 정본으로 합쳐졌다
      const sh = out.find((c) => /Dropbox-Cbsjin/.test(c.path)); expect(sh?.shell).toBe(true)
    } finally { rmSync(home, { recursive: true, force: true }) }
  })
  it('아무 데도 없으면 빈 목록', () => { const home = mkdtempSync(join(tmpdir(), 'fb-home-')); try { expect(lf.detect('/x/PARA', home)).toEqual([]) } finally { rmSync(home, { recursive: true, force: true }) } })
})

describe('stat · headHash · placeholder · waitFor · cachePath', () => {
  it('앞 64KB sha256 · 자리표시자 · 도착 기다리기', async () => {
    const d = mkdtempSync(join(tmpdir(), 'fb-lf-'))
    try {
      const big = Buffer.alloc(70000, 7); writeFileSync(join(d, 'a.bin'), big)
      const s = lf.stat(join(d, 'a.bin')); expect(s.exists).toBe(true); expect(s.size).toBe(70000)
      expect(s.head).toBe(createHash('sha256').update(big.subarray(0, 65536)).digest('hex'))
      expect(lf.placeholderName(join(d, 'b.pdf'))).toBe(join(d, '.b.pdf.icloud'))
      writeFileSync(join(d, '.b.pdf.icloud'), '')
      expect(lf.stat(join(d, 'b.pdf'))).toEqual({ exists: false, placeholder: true })
      expect(lf.stat(join(d, 'c.pdf'))).toEqual({ exists: false, placeholder: false })
      const want = { size: 3, head: createHash('sha256').update('abc').digest('hex') }
      setTimeout(() => writeFileSync(join(d, 'late.txt'), 'abc'), 250)
      expect(await lf.waitFor(join(d, 'late.txt'), want, 3000)).toBe(true)
      expect(await lf.waitFor(join(d, 'never.txt'), want, 400)).toBe(false)
      expect(lf.cachePath('/ud', 'Mini', '../3. Area/x/a.pdf')).toBe('/ud/remote-cache/Mini/3. Area/x/a.pdf')
    } finally { rmSync(d, { recursive: true, force: true }) }
  })
})
