/**
 * 루틴 실행 기록 — 순수 판정 (BR-1 · 2026-10-09 소통 재설계).
 *
 * 세션 상태가 `error` 인 것만 실패로 세면, 루틴이 «카톡 sync 실패» 라고 **정상적으로 답한** 회차가 ok 로 남는다(검토 §2-⑫).
 * 그래서 루틴은 마지막 줄에 `결과: ok` · `결과: fail — 이유` · `결과: skip — 이유` 중 하나를 쓰고(볼트 규칙 · 루틴 문구),
 * 호스트가 그 줄을 읽는다. 없으면 `unknown` — 지어내지 않는다.
 */
export type RunResult = 'ok' | 'fail' | 'skip' | 'unknown'

export function routineResult(text: string | undefined): { result: RunResult; reason?: string } {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.replace(/[*`_]/g, '').trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 5; i--) {
    const m = /^결과\s*[:：]\s*(ok|fail|skip)\b\s*(?:[—–-]+\s*(.*))?$/i.exec(lines[i])
    if (m) return { result: m[1].toLowerCase() as RunResult, ...(m[2]?.trim() ? { reason: m[2].trim().slice(0, 200) } : {}) }
  }
  return { result: 'unknown' }
}

/** 루틴이 이만큼 넘게 돌면 timeout 으로 한 번 적는다(죽이지는 않는다 — 사람이 볼 수 있게 남긴다) */
export const RUN_TIMEOUT_MS = 60 * 60_000

/** 루틴 문구 끝에 붙는 한 줄 — 위 판정이 읽는 꼴을 루틴에게 알려 준다 */
export const RESULT_LINE_HINT = '마지막 줄에는 `결과: ok` · `결과: fail — 이유` · `결과: skip — 이유` 중 하나만 쓴다.'
