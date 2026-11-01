import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { claudeBin, cleanClaudeEnv } from './session'

/**
 * claude 한 번 묻기 — 격리된 단발 호출 (2026-11-01 · `titleLLM` 의 spawn 을 옮겨 공통으로 쓴다).
 *
 * `queryPlan`(planUsage.ts)·`llmTitle` 과 같은 격리 — 빈 임시 폴더 · 세션 기록 안 남김 · 사용자 설정·MCP 없음 · 도구 없음 · 한 턴.
 * 사람의 CLI 로그인을 쓴다. 실패(로그인 없음·시간 초과·0 아닌 종료)면 `ok:false` — 던지지 않는다.
 * `dir` 로 임시 폴더 이름을 가른다(제목 `folderbot-title` · 상황판 `folderbot-context`).
 */
const DEFAULT_TIMEOUT = 45_000
/** 답 상한 — 이만큼에서 자른다 */
export const ONE_SHOT_MAX_OUT = 64 * 1024

export interface OneShotOpts { model: 'haiku' | 'sonnet'; system: string; timeoutMs?: number; bin?: string; dir?: string }
export interface OneShotResult { ok: boolean; out: string; ms: number }

export function oneShot(prompt: string, o: OneShotOpts): Promise<OneShotResult> {
  const t0 = Date.now()
  return new Promise((resolve) => {
    const cwd = join(tmpdir(), o.dir ?? 'folderbot-oneshot'); try { mkdirSync(cwd, { recursive: true }) } catch { /* */ }
    const args = ['-p', '--model', o.model, '--output-format', 'text', '--no-session-persistence', '--setting-sources', 'project', '--strict-mcp-config', '--max-turns', '1',
      // 도구를 다 끄고 짧은 시스템 프롬프트만 — 기본 프롬프트·도구 정의를 싣지 않아 싸고, 모델이 도구를 부르다 빈 답으로 끝나지 않는다(실측 2.7초)
      '--tools', '', '--system-prompt', o.system]
    let out = '', done = false
    const finish = (ok: boolean) => { if (done) return; done = true; clearTimeout(timer); try { p.kill() } catch { /* */ } resolve({ ok, out: ok ? out : '', ms: Date.now() - t0 }) }
    const p = spawn(claudeBin(o.bin), args, { cwd, env: cleanClaudeEnv() })
    const timer = setTimeout(() => finish(false), o.timeoutMs ?? DEFAULT_TIMEOUT); timer.unref?.()   // 호스트가 내려갈 때 붙잡지 않는다
    p.on('error', () => finish(false))
    p.stdout.on('data', (c: Buffer) => { out += c.toString(); if (out.length > ONE_SHOT_MAX_OUT) out = out.slice(0, ONE_SHOT_MAX_OUT) })
    p.on('close', (code) => finish(code === 0))
    p.stdin.on('error', () => { /* 일찍 죽은 CLI */ })
    p.stdin.end(prompt)
  })
}
