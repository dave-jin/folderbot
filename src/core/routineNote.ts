import { describeCron } from './when'
import type { ChangeRow } from './routineBoard'

/**
 * 🔴 RB-3 · 폴더 봇이 «내 루틴이 바뀌었다» 를 알게 하는 자리 (2026-10-30 Dave: *«바로 고치되 고친것을 각 폴더봇이 알도록 claude.md 에 적어두어야 함»*).
 *    그 폴더 `CLAUDE.md` 끝의 이 구역만 Folder Bot 이 통째로 새로 쓴다 — 구역 밖은 바이트 그대로. 폴더 봇은 새 세션에서 CLAUDE.md 를 읽으며 시작한다.
 * ⚠ «다음 실행» 은 넣지 않는다 — 넣으면 루틴이 돌 때마다 CLAUDE.md 가 다시 쓰여 Dropbox 가 쉬지 않는다(매시 루틴이면 하루 24번). 다음 실행은 `routine_list` 가 말한다.
 */
export const NOTE_OPEN = '<!-- folderbot:routines — Folder Bot 이 고쳐 쓴다. 손으로 고치지 마세요(루틴 시트·루틴 페이지에서 고칩니다) -->'
export const NOTE_CLOSE = '<!-- /folderbot:routines -->'
const OPEN_PREFIX = '<!-- folderbot:routines'
const p2 = (n: number) => String(n).padStart(2, '0')
const stamp = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}` }

/** 구역 글 — 루틴이 0개면 null(구역을 지운다) · `source` 는 정본 파일 이름(`.bot.yml` · 오케스트레이터는 `.claude/routines.yml`) */
export function renderNote(routines: { name: string; cron: string; enabled: boolean }[], changes: ChangeRow[], source: string): string | null {
  if (!routines.length) return null
  const out = [NOTE_OPEN, '## ⏰ 이 폴더의 루틴', '', `정본은 \`${source}\` 이다. 지금 걸린 루틴:`]
  for (const r of routines) out.push(`- ${r.name} — ${describeCron(r.cron)}${r.enabled ? '' : ' (꺼 둠)'}`)
  const recent = [...changes].sort((a, b) => b.at - a.at).slice(0, 5)
  if (recent.length) {
    out.push('', '최근 바뀜 (5건까지 · 전체는 `.folderbot/ops/routine-changes.jsonl`):')
    for (const c of recent) out.push(`- ${stamp(c.at)} · ${c.actor} · ${c.routine} · ${c.what}${c.why ? ` · 이유: ${c.why}` : ''}`)
  }
  out.push(NOTE_CLOSE)
  return out.join('\n')
}

/** 구역을 바꿔 끼운다 — 없으면 끝에 빈 줄 하나 뒤로 덧붙이고, `block` 이 null 이면 덧붙였던 모양 그대로 걷어 낸다 · 구역 밖은 바이트 그대로 */
export function replaceBlock(text: string, block: string | null): string {
  const i = text.indexOf(OPEN_PREFIX), j = i < 0 ? -1 : text.indexOf(NOTE_CLOSE, i)
  if (i < 0 || j < 0) {
    if (block === null) return text
    return (text.endsWith('\n') ? text : text + '\n') + '\n' + block + '\n'
  }
  const before = text.slice(0, i), after = text.slice(j + NOTE_CLOSE.length)
  if (block !== null) return before + block + after
  return before.replace(/\n$/, '') + after.replace(/^\n/, '')
}
