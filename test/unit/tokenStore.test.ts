import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Codec = { enc(s: string): string; dec(s: string): string }
type Store = { get(id: string): string; set(id: string, t: string): void; del(id: string): void; ids(): string[] }
const require_ = createRequire(import.meta.url)
const { createTokenStore, plainCodec } = require_('../../desktop/tokenStore.js') as { createTokenStore: (f: string, c: Codec) => Store; plainCodec: Codec }

const file = () => join(mkdtempSync(join(tmpdir(), 'fb-tok-')), 'mac-tokens.json')
const fake: Codec = { enc: (s) => 'x' + s, dec: (s) => s.slice(1) }

describe('tokenStore', () => {
  it('다시 열어도 남는다', () => {
    const f = file(); createTokenStore(f, plainCodec).set('a', 'T1')
    expect(createTokenStore(f, plainCodec).get('a')).toBe('T1')
  })
  it('파일에는 코덱을 거친 값만 남는다', () => {
    const f = file(); createTokenStore(f, fake).set('a', 'T1')
    const raw = readFileSync(f, 'utf8')
    expect(JSON.parse(raw)).toEqual({ a: 'xT1' }); expect(raw).not.toContain('"T1"')
    expect(createTokenStore(f, fake).get('a')).toBe('T1')
  })
  it('지우면 없다', () => {
    const f = file(); const s = createTokenStore(f, plainCodec); s.set('a', 'T1'); s.set('b', 'T2'); s.del('a')
    expect(s.get('a')).toBe(''); expect(s.ids()).toEqual(['b'])
  })
  it('깨진 파일이면 빈 값', () => {
    const f = file(); writeFileSync(f, '{oops'); expect(createTokenStore(f, plainCodec).get('a')).toBe('')
  })
  it('복호가 던지면 빈 값', () => {
    const f = file(); createTokenStore(f, plainCodec).set('a', 'T1')
    expect(createTokenStore(f, { enc: (s) => s, dec: () => { throw new Error('keychain') } }).get('a')).toBe('')
  })
})
