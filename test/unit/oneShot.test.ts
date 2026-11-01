import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { oneShot, ONE_SHOT_MAX_OUT } from '../../src/host/oneShot'

/** 진짜 claude 를 부르지 않는다 — 가짜 실행 파일로 spawn 길을 그대로 탄다. 프롬프트 첫 줄이 동작을 고른다. */
let tmp = '', bin = '', saved: string | undefined
beforeAll(() => {
  saved = process.env.FOLDERBOT_CLI_BIN; delete process.env.FOLDERBOT_CLI_BIN   // 환경변수가 bin 인자보다 앞선다
  tmp = mkdtempSync(join(tmpdir(), 'fb-oneshot-'))
  bin = join(tmp, 'fake-claude')
  writeFileSync(bin, `#!${process.execPath}
let s = ''
process.stdin.on('data', (c) => { s += c })
process.stdin.on('end', () => {
  const mode = s.split('\\n')[0]
  if (mode === 'SLEEP') return setTimeout(() => {}, 10000)
  if (mode === 'FAIL') { process.stderr.write('Not logged in'); process.exit(1) }
  if (mode === 'BIG') { process.stdout.write('x'.repeat(200 * 1024)); return }
  if (mode === 'ARGS') { process.stdout.write(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() })); return }
  process.stdout.write('답: ' + s)
})
`)
  chmodSync(bin, 0o755)
})
afterAll(() => { if (saved !== undefined) process.env.FOLDERBOT_CLI_BIN = saved; rmSync(tmp, { recursive: true, force: true }) })

const o = (over = {}) => ({ model: 'haiku' as const, system: 'sys', bin, dir: 'folderbot-oneshot-test', ...over })

describe('oneShot', () => {
  it('정상 답은 ok:true 와 stdout 글', async () => {
    const r = await oneShot('안녕', o())
    expect(r.ok).toBe(true); expect(r.out).toBe('답: 안녕'); expect(r.ms).toBeGreaterThanOrEqual(0)
  })
  it('시간이 넘으면 ok:false', async () => {
    const t0 = Date.now()
    const r = await oneShot('SLEEP', o({ timeoutMs: 300 }))
    expect(r.ok).toBe(false); expect(r.out).toBe(''); expect(Date.now() - t0).toBeLessThan(5000)
  })
  it('0 아닌 종료는 ok:false', async () => expect((await oneShot('FAIL', o())).ok).toBe(false))
  it('없는 실행 파일도 던지지 않고 ok:false', async () => expect((await oneShot('x', o({ bin: join(tmp, 'nope') }))).ok).toBe(false))
  it('stdout 은 64KB 에서 자른다', async () => {
    const r = await oneShot('BIG', o())
    expect(r.ok).toBe(true); expect(r.out.length).toBe(ONE_SHOT_MAX_OUT); expect(ONE_SHOT_MAX_OUT).toBe(65536)
  })
  it('격리 인자와 dir 이름 폴더에서 돈다', async () => {
    const r = await oneShot('ARGS', o({ model: 'sonnet', system: '짧은 지시' }))
    const { args, cwd } = JSON.parse(r.out) as { args: string[]; cwd: string }
    for (const a of ['-p', '--no-session-persistence', '--strict-mcp-config']) expect(args).toContain(a)
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet')
    expect(args[args.indexOf('--max-turns') + 1]).toBe('1')
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--system-prompt') + 1]).toBe('짧은 지시')
    expect(cwd.endsWith('folderbot-oneshot-test')).toBe(true)
  })
})
