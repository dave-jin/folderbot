import { existsSync, readdirSync, readFileSync, statSync, createReadStream, renameSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { join, extname, relative, resolve, sep } from 'node:path'
import { atomicWrite } from './paths'

export interface TreeNode { name: string; rel: string; dir: boolean; size?: number; mtime: number; children?: TreeNode[]; harness?: boolean; botId?: string; role?: 'inbox' | 'active' | 'reference' | 'archive' }

const SKIP = new Set(['node_modules', '.git', '.DS_Store', '.folderbot', '.projectbot', 'dist', '.next'])
const TEXT_EXT = new Set(['.md', '.txt', '.yml', '.yaml', '.json', '.ts', '.tsx', '.js', '.mjs', '.py', '.sh', '.css', '.html', '.csv', '.toml', '.env.example', '.canvas'])
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

/** 허용 루트(볼트·연결 리포) 안인지 — 밖이면 던진다 */
export function guard(roots: string[], abs: string): string {
  // ⚠ 비교만 NFC 로 하고, 돌려주는 경로는 원문 그대로 — NFC 로 바꿔 돌려주면 NFD 로 저장된 파일(맥 파일명·Dropbox·리눅스)이 ENOENT 가 난다 (스모크 실측)
  const a = resolve(abs); const an = a.normalize('NFC')
  for (const r of roots) { const rr = resolve(r).normalize('NFC'); if (an === rr || an.startsWith(rr + sep)) return a }
  throw new Error('허용된 폴더 밖이에요')
}

export function tree(base: string, depth = 2, max = 400): TreeNode[] {
  let count = 0
  const walk = (dir: string, d: number): TreeNode[] => {
    let names: string[] = []
    try { names = readdirSync(dir) } catch { return [] }
    const out: TreeNode[] = []
    for (const name of names) {
      if (SKIP.has(name) || name.startsWith('.')) continue
      if (++count > max) break
      const abs = join(dir, name)
      let st; try { st = statSync(abs) } catch { continue }
      const node: TreeNode = { name, rel: relative(base, abs), dir: st.isDirectory(), size: st.isDirectory() ? undefined : st.size, mtime: st.mtimeMs }
      if (node.dir && d > 1) node.children = walk(abs, d - 1)
      out.push(node)
    }
    return out.sort((a, b) => (a.dir === b.dir ? b.mtime - a.mtime : a.dir ? -1 : 1))
  }
  return walk(base, depth)
}

/**
 * 폴더만 평평하게 — «폴더 찾기» 가 쓰는 목록.
 * 🔴 종전에는 `tree(base, 4)` 를 썼는데 그 함수는 **파일까지 세면서 400개에서 끊는다**.
 * 볼트 앞쪽 400개만 색인되어 뒤쪽 폴더는 «검색이 아예 안 되는» 상태였다(2026-09-13 Dave 보고).
 * 여기서는 파일을 세지 않으므로 같은 상한으로 훨씬 깊고 넓게 닿는다.
 */
export function allDirs(base: string, depth = 6, max = 4000): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (dir: string, rel: string, d: number): void => {
    if (d <= 0 || out.length >= max) return
    let names: string[] = []
    try { names = readdirSync(dir) } catch { return }
    for (const name of names) {
      if (out.length >= max) return
      if (SKIP.has(name) || name.startsWith('.')) continue
      if (/\.(app|key|numbers|pages|bundle|framework)$/i.test(name)) continue
      const abs = join(dir, name)
      let st; try { st = statSync(abs) } catch { continue }
      if (!st.isDirectory()) continue
      const r = rel ? `${rel}/${name}` : name
      out.push({ name, rel: r, dir: true, mtime: st.mtimeMs })
      walk(abs, r, d - 1)
    }
  }
  walk(base, '', depth)
  return out
}

/** 한 단계만 읽는다 — 트리는 펼칠 때마다 이걸 부른다(게으른 로드). 폴더 먼저 · 한글 이름순 · 숨김·.git 제외 · 번들(.app/.key)은 파일 취급 */
export function listDir(base: string, rel: string): TreeNode[] {
  const dir = rel ? join(base, rel) : base
  let names: string[] = []
  try { names = readdirSync(dir) } catch { return [] }
  const out: TreeNode[] = []
  for (const name of names) {
    if (SKIP.has(name) || name.startsWith('.')) continue
    const abs = join(dir, name)
    let st; try { st = statSync(abs) } catch { continue }
    const bundle = /\.(app|key|numbers|pages|bundle|framework)$/i.test(name)
    out.push({ name, rel: relative(base, abs), dir: st.isDirectory() && !bundle, size: st.isDirectory() ? undefined : st.size, mtime: st.mtimeMs })
  }
  return out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'ko') : a.dir ? -1 : 1))
}

/** 최근 변경순 평평한 목록 */
export function recent(base: string, limit = 12): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (dir: string, d: number) => {
    let names: string[] = []
    try { names = readdirSync(dir) } catch { return }
    for (const name of names) {
      if (SKIP.has(name) || name.startsWith('.')) continue
      const abs = join(dir, name)
      let st; try { st = statSync(abs) } catch { continue }
      if (st.isDirectory()) { if (d > 0) walk(abs, d - 1) }
      else out.push({ name, rel: relative(base, abs), dir: false, size: st.size, mtime: st.mtimeMs })
    }
  }
  walk(base, 3)
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

export function kindOf(abs: string): 'text' | 'image' | 'pdf' | 'html' | 'other' {
  const e = extname(abs).toLowerCase()
  // ⚠ html 은 TEXT_EXT 에도 들어 있다 — **먼저** 보지 않으면 원문으로 떨어진다.
  //    에이전트가 만든 리포트·차트를 앱 안에서 그대로 보려는 것이 이 갈래의 존재 이유다.
  if (e === '.html' || e === '.htm') return 'html'
  if (TEXT_EXT.has(e) || e === '') return 'text'
  if (IMG_EXT.has(e)) return 'image'
  if (e === '.pdf') return 'pdf'
  return 'other'
}

export function readText(abs: string, max = 2_000_000): { text: string; truncated: boolean } {
  const st = statSync(abs)
  const buf = readFileSync(abs)
  const text = buf.subarray(0, max).toString('utf8')
  return { text, truncated: st.size > max }
}

/** 바이트 보존 쓰기 — 개행 스타일은 호출부가 유지한다 */
export function writeText(abs: string, text: string): void { atomicWrite(abs, text) }

/** 같은 폴더 안에서 이름만 바꾼다 — 덮어쓰지 않는다 */
export function renameEntry(abs: string, newName: string): string {
  const clean = newName.replace(/[\/\\:\u0000-\u001f]/g, '_').trim()
  if (!clean || clean === basename(abs)) return abs
  const to = join(dirname(abs), clean)
  if (existsSync(to)) throw new Error('같은 이름이 이미 있어요')
  renameSync(abs, to)
  return to
}
export function stream(abs: string) { return createReadStream(abs) }
export function exists(abs: string): boolean { return existsSync(abs) }
export function mime(abs: string): string {
  const e = extname(abs).toLowerCase()
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' } as Record<string, string>)[e] ?? 'application/octet-stream'
}
