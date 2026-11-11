import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { homedir } from 'node:os'
import { StringDecoder } from 'node:string_decoder'
import { LineCutter, TextTail, assistantTextsOf, validTaskId } from '../core/bgTasks'
import { transcriptPath } from './session'

/**
 * EA · **서브에이전트가 쓴 글** (2026-11-11 Dave 승인). 종전에는 서브에이전트의 글이 어디에도 안 남았다 — 호스트는 마지막
 * 80자(`sub.last`)만 들고 있었고, 열어 보는 화면에는 시킨 말과 도구 줄뿐이었다. CLI 는 서브에이전트마다 기록 파일을 쓴다:
 * `<설정 폴더>/projects/<폴더 slug>/<CLI 세션 id>/subagents/agent-<task_id>.jsonl` (2.1.322 실측).
 *
 * 🔴 **경로는 호스트가 만든다** — 화면에서 받는 것은 작업 id 하나뿐이고, 그것도 `validTaskId`(글자·숫자·`_`·`-`)를 통과해야 한다.
 *    폴더는 그 세션이 아는 CLI 세션 id 로 찾는다. 화면이 준 경로·파일 이름은 한 글자도 쓰지 않는다.
 * 🔴 **심링크를 따라 밖으로 나가지 않는다** — 다 풀어 본 진짜 경로가 `projects/` 아래일 때만 읽는다.
 * 🔴 **통째로 읽지 않는다** — 기록은 수 MB 다. 64KB 씩 읽어 줄로 자르고(1MB 넘는 줄은 버린다), 글은 끝에서부터 상한까지만 든다.
 *    파일이 `SCAN_MAX` 보다 크면 뒤쪽만 훑는다. 돌려주는 것도 개수·글자 수 상한이 있다.
 */
export const SUB_TEXT_MAX_COUNT = 200
export const SUB_TEXT_MAX_CHARS = 400_000
const SCAN_MAX = 48 * 1024 * 1024
const CHUNK = 64 * 1024
const LINE_MAX = 1_000_000
/** CLI 세션 id 도 폴더 이름이 된다 — 같은 규칙으로 거른다(점·빗금 없음) */
const SID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$/

export interface SubTranscript {
  /** `missing` = 기록 파일이 없다(오래돼 지워졌거나 · 시작 신호를 못 받았거나 · 다른 기기의 세션) */
  state: 'ok' | 'missing'
  texts: string[]
  /** 기록에 있던 글 덩이 수 — `texts` 보다 크면 앞을 줄인 것이다 */
  total: number
  truncated: boolean
}

function projectsRoot(): string { return process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, 'projects') : join(homedir(), '.claude', 'projects') }

/** 기록 파일의 진짜 경로 — 없거나, 규칙에 안 맞거나, `projects/` 밖을 가리키면 null */
export function subTranscriptFile(cwd: string, cliSid: string | null | undefined, taskId: unknown): string | null {
  if (!validTaskId(taskId) || typeof cliSid !== 'string' || !SID_RE.test(cliSid)) return null
  const main = transcriptPath(cwd, cliSid); if (!main || !main.endsWith('.jsonl')) return null
  const f = join(main.slice(0, -'.jsonl'.length), 'subagents', `agent-${taskId}.jsonl`)
  try {
    const real = realpathSync(f); const base = realpathSync(projectsRoot())
    if (!real.startsWith(base + sep)) return null
    return statSync(real).isFile() ? real : null
  } catch { return null }
}

/**
 * 기록 파일에서 서브에이전트의 글만 모은다. 조각마다 이벤트 루프에 자리를 내준다 — 큰 파일을 읽는 동안 호스트가 멈추지 않게.
 */
export async function readSubTranscript(file: string | null, o: { maxCount?: number; maxChars?: number } = {}): Promise<SubTranscript> {
  if (!file) return { state: 'missing', texts: [], total: 0, truncated: false }
  let fd: number
  try { fd = openSync(file, 'r') } catch { return { state: 'missing', texts: [], total: 0, truncated: false } }
  try {
    const size = statSync(file).size
    let pos = Math.max(0, size - SCAN_MAX)
    const skippedHead = pos > 0
    const cutter = new LineCutter(LINE_MAX); const tail = new TextTail(o.maxCount ?? SUB_TEXT_MAX_COUNT, o.maxChars ?? SUB_TEXT_MAX_CHARS)
    const dec = new StringDecoder('utf8'); const buf = Buffer.allocUnsafe(CHUNK)
    let first = skippedHead   // 뒤쪽만 훑을 때 첫 줄은 중간부터라 버린다
    const take = (lines: string[]) => { for (const l of lines) { if (first) { first = false; continue } for (const t of assistantTextsOf(l)) tail.push(t) } }
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK, pos); if (n <= 0) break
      pos += n
      take(cutter.push(dec.write(buf.subarray(0, n))))
      if (pos >= size) break
      await new Promise<void>((r) => setImmediate(r))
    }
    take(cutter.push(dec.end())); take(cutter.end())
    const r = tail.result()
    return { state: 'ok', texts: r.texts, total: r.total, truncated: r.truncated || skippedHead }
  } catch { return { state: 'missing', texts: [], total: 0, truncated: false } } finally { try { closeSync(fd) } catch { /* */ } }
}
