import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cleanLlmTitle, titlePrompt } from '../core/sessionTitle'
import { claudeBin, cleanClaudeEnv } from './session'

/**
 * DC · 세션 제목을 Haiku 가 짓는다 (2026-10-17 Dave: *«세션 이름은 처음 질문과 답변 내용 바탕으로 hiku 이용해서 LLM으로 생성해줘»*).
 *
 * 9/15 에는 «모델에게 묻지 않는다»(토큰 · 보낸 순간 떠야 함)로 첫 말을 다듬었는데, 긴 지시문의 앞머리만 남아
 * «퍼포먼스 개선을 위한 캐시 기능을 추가하려고 해» 같은 제목이 됐다(스크린샷_2353). 그래서 둘을 겹친다 —
 * 보낸 순간엔 종전처럼 첫 말로 서고, **첫 답이 끝나면** 질문과 답을 Haiku 에 한 번 보내 그 이름으로 바꾼다.
 *
 * · `queryPlan`(planUsage.ts)과 같은 격리 — 빈 임시 폴더 · 세션 기록 안 남김 · 사용자 설정·MCP 없음. 사람의 CLI 로그인을 쓴다.
 * · 실패(로그인 없음·시간 초과·이상한 답)면 조용히 첫 말 제목을 그대로 둔다. 다시 묻지 않는다.
 */
const TIMEOUT = 45_000
export function llmTitle(question: string, answer: string, bin?: string): Promise<string | null> {
  if (process.env.FOLDERBOT_TITLE_LLM === '0') return Promise.resolve(null)
  return new Promise((resolve) => {
    const cwd = join(tmpdir(), 'folderbot-title'); try { mkdirSync(cwd, { recursive: true }) } catch { /* */ }
    const args = ['-p', '--model', 'haiku', '--output-format', 'text', '--no-session-persistence', '--setting-sources', 'project', '--strict-mcp-config', '--max-turns', '1',
      // 도구를 다 끄고 짧은 시스템 프롬프트만 — 기본 프롬프트·도구 정의를 싣지 않아 싸고, Haiku 가 도구를 부르다 빈 답으로 끝나지 않는다(실측 2.7초)
      '--tools', '', '--system-prompt', 'You write short session titles. Reply with the title only.']
    let out = '', done = false
    const finish = (v: string | null) => { if (done) return; done = true; clearTimeout(timer); try { p.kill() } catch { /* */ } resolve(v) }
    const p = spawn(claudeBin(bin), args, { cwd, env: cleanClaudeEnv() })
    const timer = setTimeout(() => finish(null), TIMEOUT); timer.unref?.()   // 호스트가 내려갈 때 붙잡지 않는다
    p.on('error', () => finish(null))
    p.stdout.on('data', (c: Buffer) => { out += c.toString(); if (out.length > 4000) out = out.slice(0, 4000) })
    p.on('close', (code) => finish(code === 0 ? cleanLlmTitle(out) || null : null))
    p.stdin.on('error', () => { /* 일찍 죽은 CLI */ })
    p.stdin.end(titlePrompt(question, answer))
  })
}
