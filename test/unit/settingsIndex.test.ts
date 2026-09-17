import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 설정 검색 인덱스 ↔ 실제 줄 (2026-09-17 설정 1안).
 * 🔴 인덱스는 손으로 적는다 — 그래서 줄을 더하고 인덱스를 빼먹으면 그 줄은 검색에 안 걸린다.
 *    종전 판이 그랬다: 절전·진단·다시 연결·Codex 키가 검색에 없었다. 이 검사가 그 어긋남을 잡는다.
 * ⚠ 안내용 빈 줄(«…이 없어요»)은 설정이 아니라 인덱스에 안 넣는다 — 여기 목록으로 뺀다.
 */
const src = readFileSync(new URL('../../src/client/Settings.tsx', import.meta.url), 'utf8')
const rows = [...src.matchAll(/<Row(?:\s+key=\{[^}]*\})?\s+t="([^"]+)"/g)].map((m) => m[1])
/** 할 일 칸의 네 자리는 배열에서 `t={l}` 로 그려진다 — 그 제목도 화면에 있는 줄이다 */
for (const m of src.matchAll(/\['(?:rightShort|rightLong|leftShort|leftLong)', '([^']+)'/g)) rows.push(m[1])
/** 그룹 제목(«깔린 CLI»)도 검색으로 갈 수 있는 자리다 — 인덱스가 가리켜도 유령이 아니다 */
const groups = [...src.matchAll(/<Group\s+t="([^"]+)"/g)].map((m) => m[1])
const index = [...src.matchAll(/\{ sec: '(\w+)', t: '([^']+)'/g)].map((m) => ({ sec: m[1], t: m[2] }))
const INFO_ONLY = new Set(['깔린 에이전트가 없어요', '스킬이 없어요'])

describe('설정 검색 인덱스', () => {
  it('실제 줄이 하나도 빠지지 않았다', () => {
    const missing = rows.filter((t) => !INFO_ONLY.has(t) && !index.some((i) => i.t === t))
    expect(missing, `INDEX 에 없는 줄: ${missing.join(' · ')}`).toEqual([])
  })
  it('인덱스에만 있고 화면에 없는 유령 줄이 없다', () => {
    const ghosts = index.filter((i) => !rows.includes(i.t) && !groups.includes(i.t) && !['커넥터 (MCP)', '스킬'].includes(i.t))   // 둘은 개수가 붙는 템플릿 제목
    expect(ghosts.map((g) => g.t), '화면에 없는 인덱스').toEqual([])
  })
  it('칸 id 는 SecId 에 있는 것만', () => {
    const secs = new Set(['general', 'host', 'devices', 'claude', 'codex', 'sessions', 'notify', 'todo', 'ref'])
    expect(index.filter((i) => !secs.has(i.sec)).map((i) => i.sec)).toEqual([])
  })
  it('Claude 새 채팅 기본 권한이 줄로도 인덱스로도 있다 (2026-09-17 Dave)', () => {
    expect(rows).toContain('새 채팅 기본 권한'); expect(index.some((i) => i.t === '새 채팅 기본 권한' && i.sec === 'claude')).toBe(true)
  })
})
