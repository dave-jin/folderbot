import { describe, it, expect } from 'vitest'
import { chatVer } from '../../src/core/chatVer'
import { pickEncoding, StaticCache } from '../../src/host/staticCache'
import { tailnetInfoCached } from '../../src/host/tailnet'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gunzipSync, brotliDecompressSync } from 'node:zlib'

/** CF-1 · 퍼포먼스 — 다시 붙을 때 안 바뀐 대화는 안 받고 · 자산은 압축본 · tailscale 은 30초에 한 번 (2026-10-12 실측) */
describe('CF-1 chatVer', () => {
  const items = [{ id: 'a', kind: 'user', text: '안녕' }, { id: 'b', kind: 'tool', status: 'run' }]
  it('같은 대화는 같은 판', () => { expect(chatVer(items, 'running', 5, 0)).toBe(chatVer([...items], 'running', 5, 0)) })
  it('끝 줄이 제자리에서 바뀌어도 판이 바뀐다', () => {
    expect(chatVer([items[0], { id: 'b', kind: 'tool', status: 'done' }], 'running', 5, 0)).not.toBe(chatVer(items, 'running', 5, 0))
  })
  it('상태·대기 질문이 바뀌어도 판이 바뀐다', () => {
    expect(chatVer(items, 'done', 5, 0)).not.toBe(chatVer(items, 'running', 5, 0))
    expect(chatVer(items, 'running', 5, 1)).not.toBe(chatVer(items, 'running', 5, 0))
  })
})

describe('CF-1 정적 자산 압축', () => {
  it('br 먼저, 없으면 gzip', () => {
    expect(pickEncoding('gzip, deflate, br')).toBe('br')
    expect(pickEncoding('gzip, deflate')).toBe('gzip')
    expect(pickEncoding('identity')).toBe(null)
    expect(pickEncoding(undefined)).toBe(null)
  })
  it('압축본은 원문으로 풀리고 · 파일이 바뀌면 다시 만든다', () => {
    const d = mkdtempSync(join(tmpdir(), 'fb-static-')); const f = join(d, 'main.js')
    writeFileSync(f, 'const a = 1;\n'.repeat(500))
    const c = new StaticCache(); const e1 = c.get(f)
    expect(gunzipSync(c.encoded(f, e1, 'gzip')!).toString()).toBe(e1.raw.toString())
    expect(brotliDecompressSync(c.encoded(f, e1, 'br')!).toString()).toBe(e1.raw.toString())
    writeFileSync(f, 'const b = 2;\n'.repeat(600)); utimesSync(f, new Date(), new Date(Date.now() + 5000))
    const e2 = c.get(f)
    expect(e2.etag).not.toBe(e1.etag)
    expect(gunzipSync(c.encoded(f, e2, 'gzip')!).toString()).toContain('const b')
  })
  it('작은 파일·이미지는 그대로', () => {
    const d = mkdtempSync(join(tmpdir(), 'fb-static-')); const f = join(d, 'a.png'); writeFileSync(f, Buffer.alloc(5000))
    const c = new StaticCache(); expect(c.encoded(f, c.get(f), 'gzip')).toBe(null)
  })
})

describe('CF-1 tailscale 상태는 30초 안이면 다시 안 묻는다', () => {
  it('한 번만 띄운다', async () => {
    let n = 0; const load = async () => { n++; return { state: 'running' as const } }
    const t = Date.now() + 10_000_000   // 다른 검사의 기억과 안 겹치게 먼 미래에서 시작
    await Promise.all([tailnetInfoCached(30_000, t, load), tailnetInfoCached(30_000, t, load)])
    expect(n).toBe(1)
  })
})
