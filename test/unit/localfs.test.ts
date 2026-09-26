import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
const lf = createRequire(import.meta.url)('../../desktop/localfs.js') as {
  tails: (r: string) => string[]; syncRoots: (h: string, e: string[], os?: string, env?: Record<string, string>) => string[]; rank: (f: { path: string; real: string; files: number }[]) => { path: string; shell: boolean }[]
  detect: (hostRoot: string, home: string, os?: string, env?: Record<string, string>) => { path: string; real: string; files: number; shell: boolean }[]
  stat: (p: string) => { exists: boolean; size?: number; head?: string; placeholder?: boolean }; headHash: (p: string) => string
  waitFor: (p: string, want: { size: number; head: string }, ms: number) => Promise<boolean>; cachePath: (u: string, h: string, r: string) => string; placeholderName: (p: string) => string
}

/** E · 원격에서 파일 열기 — 이 기기의 볼트 찾기 · 신선도 재기 · 도착 기다리기 (임시 디렉터리로 흉내) */
describe('tails · syncRoots · rank', () => {
  it('꼬리 1~3조각 · 표준 자리', () => {
    expect(lf.tails('/Users/mini/Library/CloudStorage/Dropbox/PARA')).toEqual(['PARA', 'Dropbox/PARA', 'CloudStorage/Dropbox/PARA'])
    expect(lf.syncRoots('/h', ['Dropbox', 'Dropbox-Cbsjin', 'OneDrive'])).toEqual(['/h/Library/CloudStorage/Dropbox', '/h/Library/CloudStorage/Dropbox-Cbsjin', '/h/Dropbox', '/h/Library/Mobile Documents/com~apple~CloudDocs'])
  })
  it('Windows 호스트 경로와 OneDrive·Dropbox 후보를 읽는다', () => {
    expect(lf.tails('C:\\Users\\mini\\OneDrive - Team\\PARA')).toEqual(['PARA', 'OneDrive - Team/PARA', 'mini/OneDrive - Team/PARA'])
    expect(lf.syncRoots('/h', ['OneDrive - Team', 'Dropbox', 'Music'], 'win32', { OneDrive: '/h/OneDrive - Team' })).toEqual(['/h/OneDrive - Team', '/h/Dropbox'])
    const home = mkdtempSync(join(tmpdir(), 'fb-win-home-'))
    const root = join(home, 'OneDrive - Team', 'PARA')
    mkdirSync(root, { recursive: true }); writeFileSync(join(root, 'a.md'), 'a')
    try {
      const out = lf.detect('C:\\Users\\mini\\OneDrive - Team\\PARA', home, 'win32', {})
      expect(out[0].path).toBe(root)
      expect(out[0].files).toBe(1)
    } finally { rmSync(home, { recursive: true, force: true }) }
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

import { createServer } from 'node:http'
import { readFileSync as rfs, mkdtempSync as mkd, writeFileSync as wfs, mkdirSync as mkdS, existsSync as ex, utimesSync as ut } from 'node:fs'
import { join as j } from 'node:path'
import { tmpdir as td } from 'node:os'
const lf2 = createRequire(import.meta.url)('../../desktop/localfs.js') as { downloadStream: (u: string, h: Record<string, string>, d: string, p: (x: { done: number; total: number }) => void, s?: AbortSignal) => Promise<string>; cacheEntries: (d: string) => { path: string; size: number; atime: number }[]; evictPlan: (e: { path: string; size: number; atime: number }[], l: number) => string[]; cacheEvict: (d: string, l: number) => number; cacheInfo: (d: string) => { files: number; bytes: number }; cacheClear: (d: string) => { files: number; bytes: number } }
import { evictPlan as coreEvict } from '../../src/core/cache'

describe('localfs · 받기 진행 · 캐시 (M-4)', () => {
  it('조각마다 진행을 알리고 .part 로 받다가 제자리로 · 취소하면 부분 파일이 없다', async () => {
    const body = Buffer.alloc(200_000, 7)
    const srv = createServer((_q, r) => { r.writeHead(200, { 'content-length': String(body.length) }); let i = 0; const t = setInterval(() => { r.write(body.subarray(i, i + 50_000)); i += 50_000; if (i >= body.length) { clearInterval(t); r.end() } }, 15) })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
    const port = (srv.address() as { port: number }).port; const dir = mkd(j(td(), 'fb-dl-'))
    const seen: number[] = []
    const dest = await lf2.downloadStream(`http://127.0.0.1:${port}/a`, {}, j(dir, 'x', 'a.bin'), (p) => seen.push(p.done))
    expect(rfs(dest).length).toBe(body.length); expect(seen[seen.length - 1]).toBe(body.length); expect(seen.length).toBeGreaterThan(1); expect(ex(dest + '.part')).toBe(false)
    const ac = new AbortController(); setTimeout(() => ac.abort(), 20)
    await expect(lf2.downloadStream(`http://127.0.0.1:${port}/b`, {}, j(dir, 'b.bin'), () => {}, ac.signal)).rejects.toThrow()
    expect(ex(j(dir, 'b.bin'))).toBe(false); expect(ex(j(dir, 'b.bin.part'))).toBe(false)
    srv.close()
  })
  it('상한을 넘으면 오래 안 쓴 것부터 — 셸의 evict 와 core 의 evictPlan 이 같은 답', () => {
    const dir = mkd(j(td(), 'fb-cache-')); mkdS(j(dir, 'h'), { recursive: true })
    const mk = (n: string, size: number, age: number) => { const p = j(dir, 'h', n); wfs(p, Buffer.alloc(size)); const t = (Date.now() - age * 1000) / 1000; ut(p, t, t) }
    mk('old', 600, 300); mk('mid', 500, 200); mk('new', 400, 100)
    const e = lf2.cacheEntries(dir); expect(e.length).toBe(3)
    expect(lf2.evictPlan(e, 1000).map((p) => p.split('/').pop())).toEqual(['old'])
    expect(coreEvict(e, 1000).map((p) => p.split('/').pop())).toEqual(['old'])
    expect(lf2.cacheEvict(dir, 1000)).toBe(1); expect(lf2.cacheInfo(dir)).toEqual({ files: 2, bytes: 900 })
    expect(lf2.cacheClear(dir)).toEqual({ files: 0, bytes: 0 })
  })
})
