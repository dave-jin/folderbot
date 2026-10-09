import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { spawnSync, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { applyScript } = require('../../desktop/apply-script.js') as { applyScript: () => string }

/**
 * BX · 업데이트 적용 뒤 되돌리기 (2026-10-09). 9/15 결정(«자동 적용은 하지 않는다»)은 그대로 — 사람이 누른 적용이
 * 새 판을 못 켜면 옛 판으로 돌아온다. 실제 bash·ditto 로 가짜 앱을 갈아 끼워 잰다(맥에서만).
 */
const mac = process.platform === 'darwin'
async function run(healthOk: boolean | null) {
  const d = mkdtempSync(join(tmpdir(), 'fb-apply-'))
  const mkApp = (dir: string, mark: string) => { mkdirSync(join(dir, 'Contents/MacOS'), { recursive: true }); writeFileSync(join(dir, 'Contents/MARK'), mark) }
  mkApp(join(d, 'src', 'Folder Bot.app'), 'new')
  const zip = join(d, 'updates', 'new.zip'); mkdirSync(join(d, 'updates'))
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', join(d, 'src', 'Folder Bot.app'), zip])
  const target = join(d, 'Applications', 'Folder Bot.app'); mkApp(target, 'old')
  const script = join(d, 'apply.sh'); writeFileSync(script, applyScript(), { mode: 0o755 })
  let url = '', srv: ReturnType<typeof createServer> | null = null
  if (healthOk !== null) {
    srv = createServer((_q, s) => { if (healthOk) { s.writeHead(200); s.end('{"ok":true,"name":"folderbot"}') } else { s.writeHead(500); s.end('{}') } })
    await new Promise<void>((r) => srv!.listen(0, '127.0.0.1', () => r()))
    url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/api/health`
  }
  const res = await new Promise<{ status: number | null }>((resolve) => {
    const p = require('node:child_process').spawn('/bin/bash', [script, '999999', zip, target, join(d, 'work'), url], { env: { ...process.env, FB_OPEN: '/usr/bin/true', FB_HEALTH_TRIES: '3', FB_HEALTH_SLEEP: '0.1' } })
    p.on('exit', (status: number | null) => resolve({ status }))
  })
  srv?.close()
  const out = { status: res.status, mark: readFileSync(join(target, 'Contents/MARK'), 'utf8'), old: existsSync(`${target}.old`), log: readFileSync(join(d, 'updates', 'applied.txt'), 'utf8') }
  rmSync(d, { recursive: true, force: true })
  return out
}

describe('BX · apply.sh — 새 판이 안 켜지면 옛 판으로', () => {
  it.skipIf(!mac)('호스트가 답하면 새 판 · .old 지움 · applied', async () => {
    const r = await run(true)
    expect(r).toMatchObject({ status: 0, mark: 'new', old: false }); expect(r.log).toMatch(/^applied /)
  })
  it.skipIf(!mac)('🔴 호스트가 끝내 답하지 않으면 옛 판을 되살린다 · rolled back · 종료 코드 2', async () => {
    const r = await run(false)
    expect(r).toMatchObject({ status: 2, mark: 'old', old: false }); expect(r.log).toMatch(/^rolled back /)
  })
  it.skipIf(!mac)('원격 화면 모드(HEALTH 없음)는 종전처럼 바로 적용', async () => {
    const r = await run(null)
    expect(r).toMatchObject({ status: 0, mark: 'new', old: false })
  })
})

describe('🔴 패키지 목록 — 데스크톱 코드가 부르는 파일은 electron-builder.yml files 에 다 있어야 한다', () => {
  it('main.js 에서 require("./…") 로 닿는 파일이 모두 목록에 있다', () => {
    const dir = join(process.cwd(), 'desktop')
    const listed = new Set(readFileSync(join(dir, 'electron-builder.yml'), 'utf8').split('\n').map((l) => /^\s*-\s*([\w.-]+\.(?:js|html))\s*$/.exec(l)?.[1]).filter(Boolean) as string[])
    const seen = new Set<string>(), todo = ['main.js']
    while (todo.length) {
      const f = todo.pop()!; if (seen.has(f)) continue; seen.add(f)
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(/require\(\s*['"]\.\/([\w.-]+?)(\.js)?['"]\s*\)/g)) { const n = `${m[1]}.js`; if (readdirSync(dir).includes(n)) todo.push(n) }
    }
    const missing = [...seen].filter((f) => !listed.has(f))
    expect(missing).toEqual([])
    expect(seen.has('apply-script.js')).toBe(true)
  })
})
