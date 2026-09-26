import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, createReadStream, renameSync , openSync, readSync, closeSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { join, extname, parse, relative, resolve, win32, posix } from 'node:path'
import { atomicWrite } from './paths'

export interface TreeNode { name: string; rel: string; dir: boolean; size?: number; mtime: number; children?: TreeNode[]; harness?: boolean; botId?: string; role?: 'inbox' | 'active' | 'reference' | 'archive' }

/** API와 볼트 상태의 상대 경로는 OS에 관계없이 `/`를 쓴다. */
export function portableRelative(base: string, abs: string, paths: Pick<typeof win32, 'relative' | 'sep'> = process.platform === 'win32' ? win32 : posix): string {
  return paths.relative(base, abs).split(paths.sep).join('/')
}

/** Native path containment, including case-insensitive Windows drives and UNC shares. */
export function withinPath(root: string, abs: string, paths: Pick<typeof win32, 'relative' | 'isAbsolute' | 'sep'> = process.platform === 'win32' ? win32 : posix): boolean {
  const rel = paths.relative(root.normalize('NFC'), abs.normalize('NFC'))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${paths.sep}`) && !paths.isAbsolute(rel))
}

const SKIP = new Set(['node_modules', '.git', '.DS_Store', '.folderbot', '.projectbot', 'dist', '.next'])
const TEXT_EXT = new Set(['.md', '.txt', '.yml', '.yaml', '.json', '.ts', '.tsx', '.js', '.mjs', '.py', '.sh', '.css', '.html', '.csv', '.toml', '.env.example', '.canvas'])
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

/** 허용 루트(볼트·연결 리포) 안인지 — 밖이면 던진다 */
export function guard(roots: string[], abs: string): string {
  // ⚠ 비교만 NFC 로 하고, 돌려주는 경로는 원문 그대로 — NFC 로 바꿔 돌려주면 NFD 로 저장된 파일(맥 파일명·Dropbox·리눅스)이 ENOENT 가 난다 (스모크 실측)
  const a = resolve(abs)
  for (const r of roots) if (withinPath(resolve(r), a)) return a
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
      const node: TreeNode = { name, rel: portableRelative(base, abs), dir: st.isDirectory(), size: st.isDirectory() ? undefined : st.size, mtime: st.mtimeMs }
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
/**
 * 한 폴더의 항목들. `all` 이면 **숨김 파일(`.` 로 시작)도** 보여 준다.
 * ⛔ `SKIP`(node_modules · .git · .folderbot …)은 `all` 이어도 안 보여 준다 — 기계의 것이지
 *    사람이 열어 볼 것이 아니고, 수만 개가 트리를 잠재운다.
 */
export function listDir(base: string, rel: string, all = false): TreeNode[] {
  const dir = rel ? join(base, rel) : base
  let names: string[] = []
  try { names = readdirSync(dir) } catch { return [] }
  const out: TreeNode[] = []
  for (const name of names) {
    if (SKIP.has(name) || (!all && name.startsWith('.'))) continue
    const abs = join(dir, name)
    let st; try { st = statSync(abs) } catch { continue }
    const bundle = /\.(app|key|numbers|pages|bundle|framework)$/i.test(name)
    out.push({ name, rel: portableRelative(base, abs), dir: st.isDirectory() && !bundle, size: st.isDirectory() ? undefined : st.size, mtime: st.mtimeMs })
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
      else out.push({ name, rel: portableRelative(base, abs), dir: false, size: st.size, mtime: st.mtimeMs })
    }
  }
  walk(base, 3)
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

export function kindOf(abs: string): 'text' | 'image' | 'pdf' | 'html' | 'canvas' | 'other' {
  const e = extname(abs).toLowerCase()
  // ⚠ `.canvas` 는 JSON 이라 TEXT_EXT 로 떨어지면 원문이 보인다 — 먼저 가른다(Obsidian JSON Canvas)
  if (e === '.canvas') return 'canvas'
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
/** 앞 64KB 의 sha256 — 원격 기기의 사본과 «같은 파일인가» 를 재는 자(desktop/localfs.js `headHash` 와 같은 식). mtime 은 동기화가 바꾼다 */
export function headHash(abs: string): string {
  const fd = openSync(abs, 'r')
  try { const buf = Buffer.alloc(65536); const n = readSync(fd, buf, 0, 65536, 0); return createHash('sha256').update(buf.subarray(0, n)).digest('hex') } finally { closeSync(fd) }
}
/** 이름으로 찾기 (G) — 파일명만 적힌 칩을 위해. SKIP 폴더는 안 들어가고 깊이 8 · limit 개에서 끊는다. 이름은 NFC 로 비교 */
export function findFiles(base: string, name: string, limit = 5, depth = 8): string[] {
  const want = name.normalize('NFC').toLowerCase(); const out: string[] = []
  const walk = (dir: string, d: number) => {
    if (d < 0 || out.length >= limit) return
    let ents; try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (out.length >= limit) return
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(join(dir, e.name), d - 1) }
      else if (e.name.normalize('NFC').toLowerCase() === want) out.push(join(dir, e.name))
    }
  }
  walk(base, depth); return out
}
export function stream(abs: string) { return createReadStream(abs) }
export function exists(abs: string): boolean { return existsSync(abs) }

/**
 * 🔴 **한글 파일 이름은 두 벌로 산다** — 맥이 만든 이름은 자모가 풀려 있고(NFD), 우리가 만든
 * 이름·화면을 거쳐 온 이름은 합쳐져 있다(NFC). 같은 이름인데 바이트가 달라 **디스크에서 못 찾는다**
 * (실측: 오버 미리보기 한 번에 404, 문서 열기도 같은 자리).
 *
 * ⚠ 한쪽으로 «맞추는» 것은 답이 아니다 — 디스크가 어느 쪽인지 우리가 못 정한다(맥이 정한다).
 *    그래서 **있는 쪽을 찾아 준다**: 준 그대로 → NFC → NFD 순서로 본다.
 * ⛔ 이름만 본다(폴더 경로는 그대로) — 경로 전체를 훑으면 깊은 트리에서 값이 커진다.
 */
/**
 * 🔴 **마디마다** NFC/NFD 를 맞춘다. `resolveNF` 는 마지막 이름만 보는데, 맥 볼트에서는 **폴더 이름**이
 *    NFD 로 저장돼 있어 `3. Area/기반_워크스테이션/x.md` 처럼 중간 마디가 한글이면 거기서 끊겼다
 *    (2026-09-15 — 칩이 «있는 파일» 을 없다고 하던 이유 중 하나).
 */
export function resolveNFDeep(base: string, rel: string): string {
  let cur = base
  for (const seg of rel.split(/[\\/]/).filter(Boolean)) {
    if (seg === '..') { cur = dirname(cur); continue }
    if (seg === '.') continue
    const direct = join(cur, seg)
    if (existsSync(direct)) { cur = direct; continue }
    const alt = [seg.normalize('NFC'), seg.normalize('NFD')].find((a) => a !== seg && existsSync(join(cur, a)))
    cur = join(cur, alt ?? seg)
  }
  return cur
}
/** 드라이브/UNC 루트도 보존하면서 NFD/NFC 파일 이름을 찾는다. */
export function resolveNFAbsolute(abs: string): string {
  const root = parse(abs).root
  return resolveNFDeep(root, relative(root, abs))
}
export function resolveNF(abs: string): string {
  if (existsSync(abs)) return abs
  const d = dirname(abs), b = basename(abs)
  for (const alt of [b.normalize('NFC'), b.normalize('NFD')]) {
    if (alt === b) continue
    const p = join(d, alt)
    if (existsSync(p)) return p
  }
  return abs
}
export function mime(abs: string): string {
  const e = extname(abs).toLowerCase()
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' } as Record<string, string>)[e] ?? 'application/octet-stream'
}
