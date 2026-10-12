import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

/**
 * CF-1 · 화면 자산을 압축해 메모리에 둔다 (2026-10-12 퍼포먼스 실측 A1).
 * 첫 실행에 JS·CSS 800KB 가 무압축으로 나가, 폰 원격 첫 대화 1.4초 중 1.0초가 자산 받기였다(br 이면 192KB).
 * ⚠ 파일이 바뀌면(mtime·크기) 다시 만든다 — 업데이트 뒤 옛 압축본을 내주면 화면이 깨진다.
 * ⚠ 작은 파일·이미 압축된 꼴(png·woff2)은 그대로 낸다.
 */
export type Enc = 'br' | 'gzip'
export function pickEncoding(accept: string | undefined): Enc | null {
  const a = String(accept ?? '')
  if (/\bbr\b/.test(a)) return 'br'
  if (/\bgzip\b/.test(a)) return 'gzip'
  return null
}
const TEXTY = /\.(js|mjs|css|html|json|svg|webmanifest|txt|map)$/i
interface Ent { key: string; raw: Buffer; etag: string; br?: Buffer; gzip?: Buffer }
export class StaticCache {
  private m = new Map<string, Ent>()
  /** 파일 하나 — 같은 판이면 메모리 것을 쓴다 */
  get(f: string): Ent {
    const st = statSync(f); const key = `${st.mtimeMs}:${st.size}`
    const had = this.m.get(f); if (had && had.key === key) return had
    const raw = readFileSync(f)
    const ent: Ent = { key, raw, etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"` }
    this.m.set(f, ent); return ent
  }
  /** 받는 쪽이 말한 꼴로 — 압축이 의미 없는 파일이면 null */
  encoded(f: string, ent: Ent, enc: Enc | null): Buffer | null {
    if (!enc || ent.raw.length < 1024 || !TEXTY.test(f)) return null
    if (enc === 'br') return (ent.br ??= brotliCompressSync(ent.raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: ent.raw.length } }))
    return (ent.gzip ??= gzipSync(ent.raw, { level: 9 }))
  }
}
