import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { homedir } from 'node:os'
import { DEFAULT_BUDGET, parseEvent, report, type Budget, type UsageEvent, type UsageReport } from '../core/usage'

/**
 * 사용량 모으기 — 훅이 쌓아 둔 줄을 읽어 창별로 접는다.
 * 훅이 없어도 **기록을 직접 훑어** 첫 화면부터 숫자가 나온다(느리므로 30초 캐시).
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

/** 기록(jsonl) 하나에서 usage 를 긁는다 — 훅이 없을 때의 대비책 */
function scanTranscript(file: string, tool: 'claude' | 'codex', since: number): UsageEvent[] {
  const out: UsageEvent[] = []
  let text = ''
  try { if (statSync(file).mtimeMs < since) return out; text = readFileSync(file, 'utf8') } catch { return out }
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue
    try {
      const d = JSON.parse(line) as { timestamp?: string; message?: { model?: string; usage?: Record<string, number> } }
      const u = d.message?.usage; if (!u) continue
      const t = d.timestamp ? Date.parse(d.timestamp) : NaN; if (!Number.isFinite(t) || t < since) continue
      out.push({
        t, tool, model: String(d.message?.model ?? ''),
        input: +(u.input_tokens ?? 0), output: +(u.output_tokens ?? 0),
        cacheRead: +(u.cache_read_input_tokens ?? 0), cacheWrite: +(u.cache_creation_input_tokens ?? 0),
        sid: basename(file, '.jsonl')
      })
    } catch { /* 잘린 줄은 버린다 */ }
  }
  return out
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

let cache: { at: number; events: UsageEvent[] } | null = null
/** 훅 줄 + (캐시된) 기록 훑기. 같은 턴이 양쪽에 있으면 시각·토큰이 같아 하나로 접힌다 */
export function events(now = Date.now()): UsageEvent[] {
  const since = now - KEEP_MS
  const fromFile = readFile().filter((e) => e.t >= since)
  if (!cache || now - cache.at > 30_000) {
    const scanned: UsageEvent[] = []
    const files: string[] = []
    walkJsonl(join(CLAUDE_DIR, 'projects'), 2, files, since)
    for (const f of files) scanned.push(...scanTranscript(f, 'claude', since))
    const cfiles: string[] = []
    walkJsonl(join(CODEX_DIR, 'sessions'), 3, cfiles, since)   // Codex 기록 — 없으면 아무것도 안 나온다
    for (const f of cfiles) scanned.push(...scanTranscript(f, 'codex', since))
    cache = { at: now, events: scanned }
  }
  const seen = new Set<string>()
  const all: UsageEvent[] = []
  for (const e of [...fromFile, ...cache.events]) {
    const k = `${e.t}|${e.tool}|${e.input}|${e.output}|${e.cacheRead}|${e.cacheWrite}`
    if (seen.has(k)) continue
    seen.add(k); all.push(e)
  }
  return all.sort((a, b) => a.t - b.t)
}

/** `botOf` 는 CLI 세션 id → 봇 — 호스트가 세션 목록으로 넘긴다(봇별 내역 · L). 30초 캐시는 `events()` 안에 있다 */
export function usageReport(now = Date.now(), botOf?: (sid: string) => { botId: string; name: string } | undefined): UsageReport { return report(events(now), now, budget(), { budgetSource: budgetSource(), botOf }) }
/** 훅·기록이 새로 들어왔을 때 캐시를 비운다 — 턴이 끝나면 60초 안에 원격 패널이 바뀌어야 한다 (L) */
export function invalidateUsage(): void { cache = null }

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
