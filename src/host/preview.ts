import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { faviconHost } from '../core/favicon'
import { clean, fallbackMeta, parseMeta, type LinkMeta } from '../core/preview'
import { dataDir, ensureDir } from './paths'

/**
 * 링크 미리보기 받아오기 — 파비콘과 **같은 이유로 호스트가 받는다**(`host/favicon.ts` 머리말):
 * 창구를 하나로 두어야 폰이 볼트 밖 사이트를 직접 두드리지 않고, 같은 링크를 기기 수만큼 안 받는다.
 *
 * ⚠ **썸네일도 우리가 받아 data URL 로 박아 준다** — 남의 이미지 주소를 화면에 그대로 주면
 *    폰이 그 사이트로 나가고, 사이트가 referer 로 우리 대화를 들여다볼 수 있다.
 * ⚠ **못 받은 것도 캐시한다** — 죽은 링크를 화면 열 때마다 다시 두드리지 않게. 다만 그때도
 *    주소로 만든 최소 미리보기(`fallbackMeta`)를 돌려주어 **박스가 비지 않는다**.
 * ⛔ HTML 은 앞 256KB 만 본다 — 메타는 `<head>` 에 있다. 이미지도 400KB 를 넘으면 버린다(썸네일이다).
 */

const HTML_MAX = 256 * 1024
const IMG_MAX = 400 * 1024
const TIMEOUT = 5000
const TTL = 7 * 24 * 3600 * 1000

const mem = new Map<string, LinkMeta | null>()
const dir = (): string => ensureDir(join(dataDir(), 'previews'))
const keyOf = (url: string): string => createHash('sha1').update(url).digest('hex').slice(0, 20)

async function get(url: string, accept: string): Promise<Response | null> {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), TIMEOUT)
    const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { accept, 'user-agent': 'FolderBot/1.0 (+link preview)' } })
    clearTimeout(t)
    return r.ok ? r : null
  } catch { return null }
}

async function thumb(src: string, base: string): Promise<string | null> {
  let abs: string
  try { abs = new URL(src, base).toString() } catch { return null }
  const r = await get(abs, 'image/*')
  if (!r) return null
  const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!type.startsWith('image/')) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (!buf.length || buf.length > IMG_MAX) return null
  return `data:${type};base64,${buf.toString('base64')}`
}

async function fetchFor(url: string): Promise<LinkMeta | null> {
  const base = fallbackMeta(url)
  if (!base) return null
  const r = await get(url, 'text/html,application/xhtml+xml')
  if (!r) return base
  const type = (r.headers.get('content-type') ?? '').toLowerCase()
  // ⚠ HTML 이 아니면(PDF·이미지 직링크) 메타가 없다 — 주소만으로 만든 박스를 그대로 쓴다
  if (!type.includes('html')) return { ...base, desc: clean(type.split(';')[0]) }
  const html = (await r.text()).slice(0, HTML_MAX)
  const meta = parseMeta(html)
  const image = meta.image ? await thumb(meta.image, r.url || url) : null
  return { ...base, title: meta.title || base.title, desc: meta.desc, image, site: meta.site }
}

/** 캐시(메모리 → 디스크, 7일) → 네트워크. 같은 주소는 한 번만 나간다. */
export async function preview(url: string): Promise<LinkMeta | null> {
  if (!faviconHost(url)) return null
  if (mem.has(url)) return mem.get(url) ?? null
  const f = join(dir(), `${keyOf(url)}.json`)
  if (existsSync(f)) {
    try {
      const j = JSON.parse(readFileSync(f, 'utf8')) as { at: number; meta: LinkMeta | null }
      if (Date.now() - j.at < TTL) { mem.set(url, j.meta); return j.meta }
    } catch { /* 망가진 캐시는 다시 받는다 */ }
  }
  const meta = await fetchFor(url)
  mem.set(url, meta)
  try { writeFileSync(f, JSON.stringify({ at: Date.now(), meta })) } catch { /* 캐시는 있으면 좋은 것 */ }
  return meta
}
