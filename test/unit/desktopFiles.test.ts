import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * 🔴 **패키징 목록이 실제 require 를 다 덮는가** (2026-09-13 실사고).
 *
 * `electron-builder.yml` 의 `files` 는 **허용 목록**이다 — 새 파일을 만들고 적는 걸 잊으면
 * `npm run dev` 에서는 멀쩡하고 **DMG 로 깐 앱만** «Cannot find module './trayIcon'» 으로
 * 뜨자마자 죽는다. 빌드도 QA 도 못 잡는 자리라서, 여기서 main.js 부터 로컬 require 를 타고
 * 내려가 **하나라도 목록 밖이면 빨갛게** 만든다.
 */
const DESK = resolve(__dirname, '../../desktop')

function listed(): string[] {
  const yml = readFileSync(join(DESK, 'electron-builder.yml'), 'utf8')
  // ⚠ `body` 는 `\nfiles:` 부터다 — 쪼개면 ['', 'files:', '  - …'] 이라 **둘**을 버려야 한다
  //    (하나만 버리면 첫 줄이 'files:' 라 «들여쓰기 없음» 으로 읽혀 그 자리에서 끝난다)
  const body = yml.slice(yml.indexOf('\nfiles:'))
  const out: string[] = []
  for (const line of body.split('\n').slice(2)) {
    if (/^\s*#/.test(line)) continue                 // ⚠ 주석 줄에서 목록이 끝났다고 보면 안 된다
    const m = /^ {2}- (.+)$/.exec(line)
    if (!m) { if (/^\S/.test(line)) break; continue }
    out.push(m[1].trim())
  }
  return out
}

function copiedResources(): Set<string> {
  const yml = parseYaml(readFileSync(join(DESK, 'electron-builder.yml'), 'utf8')) as { extraResources?: { from: string }[] }
  return new Set((yml.extraResources ?? []).map((r) => r.from))
}

/**
 * main.js 에서 타고 갈 수 있는 로컬 파일 전부.
 * ⚠ `require('./x')` 만으로는 모자란다 — **preload 와 정적 파일은 경로 문자열로 참조된다**
 *    (`join(__dirname, 'tray-preload.js')`). 그것도 빠지면 앱이 뜨고 나서 조용히 안 먹는다.
 */
function localDeps(entry: string): Set<string> {
  const seen = new Set<string>()
  const walk = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const base = resolve(dirname(file), m[1])
      const cand = [base, `${base}.js`, join(base, 'index.js')].find((f) => existsSync(f))
      if (cand) walk(cand)
    }
    for (const m of src.matchAll(/__dirname\s*,\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g)) {
      const f = join(DESK, m[1], m[2] ?? '')
      if (existsSync(f) && !f.endsWith('/')) seen.add(f)
    }
  }
  walk(entry)
  return seen
}

describe('데스크톱 패키징 목록', () => {
  it('main.js 가 부르는 로컬 파일이 전부 files 에 있다', () => {
    const files = listed()
    const resources = copiedResources()
    const globbed = files.filter((f) => f.includes('*')).map((f) => f.replace(/\/?\*\*?.*$/, ''))
    const missing: string[] = []
    for (const dep of localDeps(join(DESK, 'main.js'))) {
      const rel = relative(DESK, dep)
      if (files.includes(rel)) continue
      if (resources.has(rel)) continue
      if (globbed.some((g) => rel === g || rel.startsWith(`${g}/`))) continue
      missing.push(rel)
    }
    expect(missing, `electron-builder.yml 의 files 에 빠진 파일: ${missing.join(', ')}`).toEqual([])
  })

  // ⚠ 목록에 적어 놓고 **파일이 없는** 것도 사고다 — 빌드가 조용히 건너뛴다
  it('files 에 적힌 것이 실제로 있다', () => {
    const gone = listed().filter((f) => !f.includes('*') && !existsSync(join(DESK, f)))
    expect(gone, `electron-builder.yml 에 적혔지만 없는 파일: ${gone.join(', ')}`).toEqual([])
  })
})
