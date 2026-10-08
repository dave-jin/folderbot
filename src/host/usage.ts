import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
import { DEFAULT_BUDGET, parseEvent, report, type Budget, type PlanUsage, type UsageEvent, type UsageReport } from '../core/usage'

/**
 * 사용량 모으기 — 훅이 쌓아 둔 줄을 읽어 창별로 접는다.
 * 훅이 없어도 **기록을 직접 훑어** 첫 화면부터 숫자가 나온다(30초 캐시 · 새로 붙은 줄만 · BO).
 */
/** 홈은 환경변수로 갈아 끼운다 — 검사가 **Dave 의 실제 기록**을 읽지 않게 한다 (§5 QA 안전 수칙) */
const HOME = process.env.FOLDERBOT_HOME || homedir()
const DIR = join(HOME, '.folderbot')
export const USAGE_FILE = join(DIR, 'usage.jsonl')
const BUDGET_FILE = join(DIR, 'budget.json')
const CLAUDE_DIR = join(HOME, '.claude')
const CODEX_DIR = join(HOME, '.codex')
/** 기록은 7일치만 남긴다 — 그보다 오래된 줄은 어느 창에도 안 들어간다 */
const KEEP_MS = 7 * 24 * 3600_000

export function budget(): Budget {
  try { return { ...DEFAULT_BUDGET, ...(JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as Partial<Budget>) } } catch { return DEFAULT_BUDGET }
}
/** 예산을 사람이 정했나(설정 파일) — 화면이 «내 예산(설정)» / «기본값» 을 구분해 적는다 (L) */
export function budgetSource(): 'settings' | 'default' { return existsSync(BUDGET_FILE) ? 'settings' : 'default' }
export function setBudget(b: Partial<Budget>): Budget {
  const next = { ...budget(), ...b }
  mkdirSync(DIR, { recursive: true }); writeFileSync(BUDGET_FILE, JSON.stringify(next, null, 2))
  return next
}

function readFile(): UsageEvent[] {
  if (!existsSync(USAGE_FILE)) return []
  const out: UsageEvent[] = []
  for (const l of readFileSync(USAGE_FILE, 'utf8').split('\n')) { const e = parseEvent(l); if (e) out.push(e) }
  return out
}

/** 기록 한 줄에서 usage 를 긁는다 — 훅이 없을 때의 대비책. 잘린 줄·usage 없는 줄은 null */
function parseLine(line: string, tool: 'claude' | 'codex', sid: string, since: number): UsageEvent | null {
  if (!line.includes('"usage"')) return null
  try {
    const d = JSON.parse(line) as { timestamp?: string; message?: { model?: string; usage?: Record<string, number> } }
    const u = d.message?.usage; if (!u) return null
    const t = d.timestamp ? Date.parse(d.timestamp) : NaN; if (!Number.isFinite(t) || t < since) return null
    return {
      t, tool, model: String(d.message?.model ?? ''),
      input: +(u.input_tokens ?? 0), output: +(u.output_tokens ?? 0),
      cacheRead: +(u.cache_read_input_tokens ?? 0), cacheWrite: +(u.cache_creation_input_tokens ?? 0),
      sid
    }
  } catch { return null }
}

/**
 * 🔴 **BO · 기록은 «새로 붙은 줄만», 끊어서, 비동기로 읽는다** (2026-10-08 맥미니 실측).
 *    종전에는 30초마다·턴이 끝날 때마다 최근 7일 기록을 **통째로 동기로** 읽었다 — Dave 의 기록 643MB 에
 *    한 번 2.5초. 그동안 호스트는 아무 요청도 못 받아서(스트리밍·클릭·«＋ 새 세션» 이 다 섰다), 턴이 끝나고 0.8초 뒤
 *    모든 화면이 사용량을 묻는 순간 — **사람이 답을 읽고 다음 것을 누르는 순간** — 에 정확히 멈췄다.
 * - 대화 기록은 덧붙이기만 하는 파일이다. 파일마다 «완전한 줄까지 읽은 바이트 위치» 를 기억하고 그 뒤만 읽는다.
 *   덜 쓰인 마지막 줄은 다음 번에 다시 읽는다(위치를 그 줄 앞에 둔다). 줄 끝은 바이트 0x0A 로 찾는다 — UTF-8 의
 *   여러 바이트 글자 안에는 0x0A 가 없으므로 한국어가 조각 경계에서 깨지지 않는다.
 * - 파일이 줄었으면 덮어쓴 것이다 — 처음부터 다시 읽는다. 7일 밖으로 나간 파일은 잊는다.
 * - 2MB 씩 끊고 조각 사이마다 양보한다(`setImmediate`) — 처음 한 번 다 읽을 때도 다른 요청이 끼어든다.
 * ⛔ 여기에 `readFileSync` 를 다시 들이지 않는다. `test/repro-usage-stall.mjs` 가 멈춤을 잰다.
 */
interface FileScan { offset: number; size: number; mtime: number; events: UsageEvent[] }
const scans = new Map<string, FileScan>()
const CHUNK = 2 * 1024 * 1024
const yieldNow = () => new Promise<void>((r) => setImmediate(r))
/** 검사용 — 지금까지 기록에서 읽은 바이트 수 */
export const scanStats = { bytesRead: 0 }

async function scanFile(file: string, tool: 'claude' | 'codex', since: number): Promise<void> {
  let st; try { st = await stat(file) } catch { scans.delete(file); return }
  let s = scans.get(file)
  if (s && st.size < s.offset) s = undefined
  if (!s) { s = { offset: 0, size: 0, mtime: 0, events: [] }; scans.set(file, s) }
  if (st.size === s.size && st.mtimeMs === s.mtime) return
  const sid = basename(file, '.jsonl')
  let fh
  try { fh = await open(file, 'r') } catch { return }
  try {
    let pos = s.offset; let carry: Buffer = Buffer.alloc(0)
    while (pos < st.size) {
      const buf = Buffer.allocUnsafe(Math.min(CHUNK, st.size - pos))
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos)
      if (!bytesRead) break
      pos += bytesRead; scanStats.bytesRead += bytesRead
      const all = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead)
      const nl = all.lastIndexOf(10)
      if (nl < 0) { carry = all; continue }
      for (const line of all.toString('utf8', 0, nl).split('\n')) { const e = parseLine(line, tool, sid, since); if (e) s.events.push(e) }
      carry = all.subarray(nl + 1)
      s.offset = pos - carry.length
      await yieldNow()
    }
    s.size = st.size; s.mtime = st.mtimeMs
  } finally { await fh.close() }
}

/**
 * 🔴 **최근 것만 센다 — 개수 상한은 없다** (L · 2026-09-19 실측 `test/unit/usageScan.test.ts`).
 *    종전에는 «400개까지» 였는데, 기록이 많은 사람은 옛 파일 400개가 목록을 다 채워 **오늘 기록이 못 들어왔다** —
 *    원격 패널이 «아직 쓴 게 없어요 · 쓴 0» 이었던 이유(스크린샷 1238). 파일은 mtime 이 7일 안인 것만 모으고,
 *    그 안에서만 넉넉한 상한(2000)을 둔다. 폴더가 아무리 커도 stat 만 하므로 몇십 ms 다.
 */
function walkJsonl(dir: string, depth: number, out: string[], since: number, max = 2000): void {
  if (depth < 0 || out.length >= max) return
  let names: string[] = []
  try { names = readdirSync(dir) } catch { return }
  for (const n of names) {
    if (out.length >= max) return
    const p = join(dir, n)
    let st; try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walkJsonl(p, depth - 1, out, since, max)
    else if (n.endsWith('.jsonl') && st.mtimeMs >= since) out.push(p)
  }
}

async function rescan(now: number): Promise<UsageEvent[]> {
  const since = now - KEEP_MS
  const want = new Map<string, 'claude' | 'codex'>()
  const files: string[] = []; walkJsonl(join(CLAUDE_DIR, 'projects'), 2, files, since)
  for (const f of files) want.set(f, 'claude')
  const cfiles: string[] = []; walkJsonl(join(CODEX_DIR, 'sessions'), 3, cfiles, since)   // Codex 기록 — 없으면 아무것도 안 나온다
  for (const f of cfiles) want.set(f, 'codex')
  for (const f of [...scans.keys()]) if (!want.has(f)) scans.delete(f)
  for (const [f, tool] of want) await scanFile(f, tool, since)
  const out: UsageEvent[] = []
  for (const f of want.keys()) { const s = scans.get(f); if (s) { s.events = s.events.filter((e) => e.t >= since); out.push(...s.events) } }
  return out
}

let cache: { at: number; events: UsageEvent[] } | null = null
/** 진행 중인 훑기 — 여러 화면이 한꺼번에 물어도 기록은 한 번만 읽는다 */
let inflight: Promise<UsageEvent[]> | null = null
/** 캐시를 버린 횟수 — 훑는 사이에 턴이 끝났으면 그 결과는 캐시에 안 둔다(다음 번이 새 줄을 읽는다) */
let gen = 0
/** 훅 줄 + (캐시된) 기록 훑기. 같은 턴이 양쪽에 있으면 시각·토큰이 같아 하나로 접힌다 */
export async function events(now = Date.now()): Promise<UsageEvent[]> {
  const since = now - KEEP_MS
  if (!cache || now - cache.at > 30_000) {
    if (!inflight) {
      const g = gen
      inflight = rescan(now).then((ev) => { if (g === gen) cache = { at: now, events: ev }; return ev }).finally(() => { inflight = null })
    }
    await inflight
  }
  const scanned = cache?.events ?? [...scans.values()].flatMap((s) => s.events)
  const fromFile = readFile().filter((e) => e.t >= since)
  const seen = new Set<string>()
  const all: UsageEvent[] = []
  for (const e of [...fromFile, ...scanned]) {
    if (e.t < since) continue
    const k = `${e.t}|${e.tool}|${e.input}|${e.output}|${e.cacheRead}|${e.cacheWrite}`
    if (seen.has(k)) continue
    seen.add(k); all.push(e)
  }
  return all.sort((a, b) => a.t - b.t)
}

/** `botOf` 는 CLI 세션 id → 봇 — 호스트가 세션 목록으로 넘긴다(봇별 내역 · L). 30초 캐시는 `events()` 안에 있다 */
export async function usageReport(now = Date.now(), botOf?: (sid: string) => { botId: string; name: string } | undefined, plan?: PlanUsage | null): Promise<UsageReport> { return report(await events(now), now, budget(), { budgetSource: budgetSource(), botOf, plan }) }
/** 훅·기록이 새로 들어왔을 때 캐시를 비운다 — 턴이 끝나면 60초 안에 원격 패널이 바뀌어야 한다 (L). 다시 세는 값은 이제 새 줄만큼이다(BO) */
export function invalidateUsage(): void { cache = null; gen++ }
/** BO · 호스트가 켜질 때 첫 훑기를 뒤에서 미리 — 첫 화면이 사용량을 기다리지 않는다 */
export function warmUsage(): void { void events().catch(() => {}) }

/** 훅이 부른다 — 한 줄 덧붙이고 7일보다 오래된 앞부분을 버린다 */
export function appendUsage(e: UsageEvent): void {
  mkdirSync(DIR, { recursive: true })
  appendFileSync(USAGE_FILE, JSON.stringify(e) + '\n')
  try {
    const st = statSync(USAGE_FILE)
    if (st.size > 2_000_000) {
      const keep = readFile().filter((x) => x.t >= Date.now() - KEEP_MS)
      writeFileSync(USAGE_FILE, keep.map((x) => JSON.stringify(x)).join('\n') + '\n')
    }
  } catch { /* 무시 */ }
}

/* ── Claude Code 훅 설치 ─────────────────────────────────────────────────
 * Stop 훅 하나가 턴 끝마다 `transcript_path` 의 **꼬리만** 읽어 이번 턴 usage 를 여기로 보낸다.
 * ⛔ 훅은 읽기만 하고, 실패해도 **조용히 끝난다**(종료 코드 0). 훅이 턴을 막으면 안 된다.
 */
const HOOK_SH = join(DIR, 'usage-hook.mjs')
const SETTINGS = join(CLAUDE_DIR, 'settings.json')
const HOOK_CMD = `node ${HOOK_SH}`

const HOOK_SRC = `#!/usr/bin/env node
// Folder Bot 사용량 훅 — 턴이 끝날 때 이번 턴의 usage 를 ~/.folderbot/usage.jsonl 에 한 줄 남긴다.
// 읽기만 하고, 무슨 일이 있어도 조용히 끝난다(0). Folder Bot 설정 › 사용량에서 설치·제거한다.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
let raw = ''
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  try {
    const inp = JSON.parse(raw || '{}')
    const p = inp.transcript_path
    if (!p) process.exit(0)
    const lines = readFileSync(p, 'utf8').split('\\n')
    const tail = lines.slice(-60).reverse()
    for (const l of tail) {
      if (!l.includes('"usage"')) continue
      const d = JSON.parse(l)
      const u = d.message && d.message.usage
      if (!u) continue
      const out = {
        t: d.timestamp ? Date.parse(d.timestamp) : Date.now(), tool: 'claude',
        model: (d.message && d.message.model) || '',
        input: u.input_tokens || 0, output: u.output_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0
      }
      const f = join(homedir(), '.folderbot', 'usage.jsonl')
      mkdirSync(dirname(f), { recursive: true })
      appendFileSync(f, JSON.stringify(out) + '\\n')
      break
    }
  } catch { /* 조용히 */ }
  process.exit(0)
})
`

export function hookState(): { installed: boolean; settings: string; script: string } {
  let installed = false
  try {
    const j = JSON.parse(readFileSync(SETTINGS, 'utf8')) as { hooks?: Record<string, unknown[]> }
    installed = JSON.stringify(j.hooks?.Stop ?? []).includes('usage-hook')
  } catch { /* 없으면 안 깔린 것 */ }
  return { installed: installed && existsSync(HOOK_SH), settings: SETTINGS, script: HOOK_SH }
}

/** 설치·제거 — 기존 settings.json 은 **합쳐서** 쓰고 백업을 남긴다 */
export function setHook(on: boolean): { installed: boolean } {
  mkdirSync(DIR, { recursive: true })
  if (on) writeFileSync(HOOK_SH, HOOK_SRC)
  let j: { hooks?: Record<string, { matcher?: string; hooks: { type: string; command: string }[] }[]> } = {}
  if (existsSync(SETTINGS)) {
    const cur = readFileSync(SETTINGS, 'utf8')
    try { j = JSON.parse(cur) as typeof j } catch { j = {} }
    writeFileSync(`${SETTINGS}.folderbot-backup`, cur)
  } else mkdirSync(dirname(SETTINGS), { recursive: true })
  const hooks = j.hooks ?? (j.hooks = {})
  const stop = (hooks.Stop ?? []).filter((g) => !JSON.stringify(g).includes('usage-hook'))
  if (on) stop.push({ hooks: [{ type: 'command', command: HOOK_CMD }] })
  hooks.Stop = stop
  writeFileSync(SETTINGS, JSON.stringify(j, null, 2))
  return { installed: on }
}
