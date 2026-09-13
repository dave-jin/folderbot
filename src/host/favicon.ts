import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bestIcon, faviconHost, parentHost, parseIconLinks } from '../core/favicon'
import { dataDir, ensureDir } from './paths'

/**
 * 파비콘 받아오기 — 호스트가 대신 받아서 **data URL 한 개**로 내준다.
 *
 * 🔴 **왜 호스트가 받나**: 화면은 폰 브라우저일 수도 있고 원격 맥일 수도 있다. 각자 받게 두면
 *    ① 같은 아이콘을 기기 수만큼 받고 ② 폰이 볼트 밖 사이트를 직접 두드리게 된다. 창구는 하나다.
 * ⚠ **먼저 `/favicon.ico` 를 찔러 본다** — 대부분 거기 있다. 그러면 그 사이트의 HTML 을 안 받아도 되니
 *    빠르고, 우리가 보는 것도 적다. 없을 때만 문서를 받아 `<link rel=icon>` 을 고른다.
 * ⚠ **없다는 사실도 캐시한다**(빈 파일). 안 그러면 아이콘 없는 사이트를 화면을 열 때마다 다시 두드린다.
 * ⛔ 큰 파일은 버린다(64KB) — 줄 앞 13px 에 쓰려고 받는 것이다.
 */

const MAX = 64 * 1024
const TIMEOUT = 4000
const mem = new Map<string, string | null>()
const dir = (): string => ensureDir(join(dataDir(), 'favicons'))

async function get(url: string, accept: string): Promise<Response | null> {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), TIMEOUT)
    const r = await fetch(url, { signal: c.signal, redirect: 'follow', headers: { accept, 'user-agent': 'FolderBot/1.0' } })
    clearTimeout(t)
    return r.ok ? r : null
  } catch { return null }
}

async function asDataUrl(r: Response): Promise<string | null> {
  const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  // ⚠ 이미지가 맞는지 **내려온 타입**으로 본다 — `/favicon.ico` 에 HTML 을 주는 사이트가 흔하다
  if (!type.startsWith('image/')) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (!buf.length || buf.length > MAX) return null
  return `data:${type};base64,${buf.toString('base64')}`
}

async function fetchFor(host: string): Promise<string | null> {
  const ico = await get(`https://${host}/favicon.ico`, 'image/*')
  if (ico) { const d = await asDataUrl(ico); if (d) return d }
  const page = await get(`https://${host}/`, 'text/html')
  if (page) {
    const html = (await page.text()).slice(0, 200_000)
    const href = bestIcon(parseIconLinks(html))
    if (href) {
      let abs: string
      try { abs = new URL(href, page.url || `https://${host}/`).toString() } catch { abs = '' }
      if (abs) { const r = await get(abs, 'image/*'); if (r) { const d = await asDataUrl(r); if (d) return d } }
    }
  }
  const up = parentHost(host)
  return up ? fetchFor(up) : null
}

/** 캐시(메모리 → 디스크) → 네트워크. 같은 호스트는 한 번만 나간다. */
export async function favicon(url: string): Promise<string | null> {
  const host = faviconHost(url)
  if (!host) return null
  if (mem.has(host)) return mem.get(host) ?? null
  const f = join(dir(), `${host}.txt`)
  if (existsSync(f)) {
    try { const t = readFileSync(f, 'utf8'); const v = t || null; mem.set(host, v); return v } catch { /* 다시 받는다 */ }
  }
  const data = await fetchFor(host)
  mem.set(host, data)
  try { mkdirSync(dir(), { recursive: true }); writeFileSync(f, data ?? '') } catch { /* 캐시는 있으면 좋은 것 */ }
  return data
}
