import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { authVerdict } from '../core/authVerdict'
import type { AuthState } from '../core/types'
import { claudeBin, cleanClaudeEnv } from './session'
import { providers } from './providers'

function credentialsExpiresAt(): number | null {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  const f = join(dir, '.credentials.json')
  if (!existsSync(f)) return null
  try {
    const j = JSON.parse(readFileSync(f, 'utf8')) as { claudeAiOauth?: { expiresAt?: number } }
    return j.claudeAiOauth?.expiresAt ?? null
  } catch { return null }
}

/**
 * 인증 상태 — 🔴 **두 번 묻는다.**
 * ① 평소 환경 그대로(= 워커가 보는 것) ② **장기 토큰을 뺀 채**(= 키체인만).
 * ②가 참이면 `cleanClaudeEnv` 가 토큰을 안 넣고, 그래야 claude.ai 커넥터가 뜬다
 * (`session.ts` 의 `cleanClaudeEnv` 머리말 — Dave 의 Akiflow MCP 사고).
 * ⚠ 토큰이 설정돼 있지 않으면 ②를 따로 묻지 않는다 — 같은 답이라 프로세스만 하나 더 뜬다.
 */
export async function checkAuth(bin?: string): Promise<AuthState> {
  const main = await probe(bin)
  const hasToken = !!cleanClaudeEnv().CLAUDE_CODE_OAUTH_TOKEN
  if (!hasToken) return { ...main, keychain: main.verdict === 'loggedin' }
  const bare = await probe(bin, { noToken: true })
  return { ...main, keychain: bare.verdict === 'loggedin' }
}

/**
 * `claude auth status --json` 의 답을 읽는다.
 *
 * 🔴 **여러 줄로 온다.** 종전에는 «마지막 줄» 만 잘라서 `JSON.parse` 했는데, CLI 2.1.270 은
 *    **들여쓴 여러 줄 JSON** 을 뱉는다 — 마지막 줄이 `}` 하나라 파싱이 터지고, 로그인이 멀쩡한데도
 *    판정이 `unknown` 으로 떨어졌다(2026-09-13 Dave 진단 결과로 확인).
 *    그 여파가 작지 않다: `unknown` 이면 «키체인을 못 읽음» 으로 보여 **장기 토큰이 계속 실리고**,
 *    그래서 claude.ai 커넥터가 안 붙는다.
 * ⚠ **첫 `{` 부터 마지막 `}` 까지**를 본다 — CLI 가 앞에 경고 한 줄을 찍는 판도 있어서,
 *    통째로 파싱하면 그때 또 터진다. 그 두 경우를 한 번에 덮는 잘라내기다.
 * ⛔ 정규식으로 `loggedIn` 만 긁지 않는다 — 그러면 `"loggedIn": false` 도 참으로 읽는 사고가 난다.
 */
export function parseStatus(out: string): { loggedIn?: boolean; email?: string; subscriptionType?: string; authMethod?: string } | null {
  const a = out.indexOf('{'), b = out.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(out.slice(a, b + 1)) as { loggedIn?: boolean; authMethod?: string } } catch { return null }
}

function probe(bin?: string, opts: { noToken?: boolean } = {}): Promise<AuthState> {
  return new Promise((resolve) => {
    execFile(claudeBin(bin), ['auth', 'status', '--json'], { env: cleanClaudeEnv(opts), timeout: 15000 }, (err, stdout) => {
      const now = Date.now()
      if (err && !stdout) return resolve({ verdict: 'unknown', checkedAt: now, reason: err.message.slice(0, 200) })
      const j = parseStatus(String(stdout))
      if (!j) return resolve({ verdict: 'unknown', checkedAt: now, reason: String(stdout).slice(0, 200) })
      const loggedIn = j.loggedIn === true
      return resolve({ verdict: authVerdict({ asked: true, loggedIn, credentialsExpiresAt: loggedIn ? null : credentialsExpiresAt(), now }), email: j.email, plan: j.subscriptionType, checkedAt: now })
    })
  })
}

/**
 * Codex 인증 — **우리가 로그인시키지 않는다.** `codex login` 은 브라우저를 여는 대화형 절차라
 * 헤드리스 호스트에서 우리가 대신 해 줄 수 없다. 그래서 여기서는 **상태만 읽고**, 화면은
 * ① 「터미널에서 `codex login`」 을 안내하거나 ② API 키를 받아 워커 환경에 넣는다(Claude 의 장기 토큰과 같은 구조).
 *
 * ⚠ 판정은 **파일이 있나** 다 — `codex` 에 「상태만 알려 주는」 비대화형 명령이 판마다 다르고,
 *    없으면 프로세스가 대화형으로 멈춰 버려서 호스트가 붙잡힌다. 파일은 조용하고 빠르다.
 */
export const codexHome = (): string => process.env.CODEX_HOME ?? join(homedir(), '.codex')

export function codexAuth(apiKey?: string): { ok: boolean; how: 'login' | 'key' | null; where?: string } {
  if (apiKey) return { ok: true, how: 'key' }
  if (process.env.OPENAI_API_KEY) return { ok: true, how: 'key', where: 'OPENAI_API_KEY' }
  const home = codexHome()
  /**
   * ⚠ **파일 이름을 외우지 않는다** (2026-09-13 Dave: «claude 는 잘 됐는데 codex 가 안되네»).
   *    종전에는 `auth.json`·`credentials.json` 둘만 봤는데, codex 판마다 이름이 바뀐다 —
   *    로그인을 마쳐도 **우리 눈에는 «안 됨»** 으로 보였다. 이제 그 폴더의 json 을 훑어
   *    **토큰처럼 생긴 열쇠가 들어 있는 파일**을 찾는다.
   * ⛔ 파일을 «읽어서 값을 쓰지» 않는다 — 있는지만 본다. 자격증명은 codex 것이지 우리 것이 아니다.
   */
  for (const f of ['auth.json', 'credentials.json', ...codexJsonFiles(home)]) {
    const p = join(home, f)
    if (!existsSync(p)) continue
    if (f === 'auth.json' || f === 'credentials.json' || looksLikeAuth(p)) return { ok: true, how: 'login', where: p }
  }
  return { ok: false, how: null }
}

/** CODEX_HOME 의 json 파일 이름들 — 없으면 빈 목록(폴더가 없을 수도 있다) */
export function codexJsonFiles(home = codexHome()): string[] {
  try { return readdirSync(home).filter((f) => f.endsWith('.json')) } catch { return [] }
}

/** 자격증명처럼 생겼나 — 키 이름만 본다(값은 안 읽는다) */
function looksLikeAuth(p: string): boolean {
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>
    return Object.keys(j).some((k) => /token|api_key|apikey|account|refresh/i.test(k))
  } catch { return false }
}

/**
 * **진단** (2026-09-13 Dave: *«상황을 어떻게 알아보고 알려줄까?»*).
 *
 * 🔴 **사람이 전령이 되면 안 된다.** 로그인이 안 될 때 우리가 물어야 할 것은 늘 같다 —
 *    바이너리가 어디 있나 · 판이 뭔가 · 자격증명 파일이 있나 · CLI 는 뭐라고 하나.
 *    그걸 한 번에 찍어 주면 스크린샷 대신 **글 한 덩이**를 붙여넣기만 하면 된다.
 * ⛔ **값은 안 찍는다** — 토큰·이메일 주소·API 키는 여기 안 들어온다. 파일이 «있다/없다» 와
 *    크기·시각까지다. 진단 글은 채팅에 붙여넣게 될 텐데, 그 자리에 열쇠가 있으면 안 된다.
 */
export async function diagnose(cfg: { claudeBin?: string; openaiApiKey?: string; tokenSet?: boolean }): Promise<string> {
  const L: string[] = []
  const ps = providers()
  const c = ps.find((x) => x.id === 'claude'); const x = ps.find((x2) => x2.id === 'codex')
  L.push(`플랫폼 ${process.platform} · node ${process.version}`)
  L.push('')
  L.push('[Claude Code]')
  L.push(`  바이너리 ${c?.bin ?? '못 찾음'}${c?.version ? ` · ${c.version}` : ''}`)
  const auth = await checkAuth(cfg.claudeBin)
  // ⚠ 이유는 **한 줄로** 접는다 — 여러 줄 JSON 이 그대로 나오면 진단 글이 통째로 그것뿐이 된다
  L.push(`  판정 ${auth.verdict}${auth.reason ? ` (${auth.reason.replace(/\s+/g, ' ').slice(0, 120)})` : ''}${auth.email ? ` · ${auth.email}` : ''}`)
  L.push(`  키체인 로그인 ${auth.keychain ? '읽힘' : '못 읽음'} · 장기 토큰 ${cfg.tokenSet ? '설정됨' : '없음'}`)
  const credDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  L.push(`  자격증명 파일 ${fileNote(join(credDir, '.credentials.json'))}`)
  L.push('')
  L.push('[Codex]')
  L.push(`  바이너리 ${x?.bin ?? '못 찾음'}${x?.version ? ` · ${x.version}` : ''}`)
  const home = codexHome()
  L.push(`  CODEX_HOME ${home} ${existsSync(home) ? '(있음)' : '(없음)'}`)
  const files = codexJsonFiles(home)
  L.push(`  json 파일 ${files.length ? files.map((f) => `${f}${fileSize(join(home, f))}`).join(' · ') : '없음'}`)
  const ca = codexAuth(cfg.openaiApiKey)
  L.push(`  판정 ${ca.ok ? `연결됨 (${ca.how})` : '안 됨'}${ca.where ? ` · ${ca.where}` : ''}`)
  L.push(`  OPENAI_API_KEY ${process.env.OPENAI_API_KEY ? '환경에 있음' : '없음'} · 앱에 저장된 키 ${cfg.openaiApiKey ? '있음' : '없음'}`)
  if (x?.bin) L.push(`  \`codex login status\` → ${await run(x.bin, ['login', 'status'])}`)
  return L.join('\n')
}

function fileNote(p: string): string {
  try { const st = statSync(p); return `있음 (${st.size}B · ${new Date(st.mtimeMs).toISOString().slice(0, 16).replace('T', ' ')})` } catch { return '없음' }
}
function fileSize(p: string): string {
  try { return `(${statSync(p).size}B)` } catch { return '' }
}
/** ⚠ 짧게 끊는다 — `codex` 는 판에 따라 대화형으로 멈춰서 호스트를 붙잡는다 */
function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, args, { env: cleanClaudeEnv({ noToken: true }), timeout: 6000 }, (err, stdout, stderr) => {
      const out = `${String(stdout)}${String(stderr)}`.trim().split('\n').slice(0, 4).join(' / ').slice(0, 300)
      resolve(out || (err ? `오류: ${err.message.slice(0, 120)}` : '(답 없음)'))
    })
  })
}
