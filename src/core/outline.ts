/**
 * 문서 목차 (Rondo 이식 B4) — 순수 로직.
 *
 * ⚠ **코드 펜스 안의 `#` 은 제목이 아니다** — 셸 주석·마크다운 예시가 통째로 목차에 올라온다
 *    (실측: `# !/bin/bash` 가 1단 제목으로 섰다). 그래서 펜스를 세면서 지나간다.
 * ⚠ **프론트매터의 `---` 도 건너뛴다** — 그 안의 `#` 은 YAML 주석이다.
 * ⛔ setext 제목(`제목` + `===`)은 안 센다 — 이 편집기가 만들지 않는 표기이고, 표의 구분줄과
 *    헷갈릴 여지만 는다(`findTables` 가 같은 이유로 칸 수를 본다).
 */
export interface Head { line: number; level: number; text: string }

const ATX = /^(#{1,6})\s+(.*)$/

export function outline(md: string): Head[] {
  const lines = md.split('\n')
  const out: Head[] = []
  let fence = ''
  let i = 0
  // 프론트매터 — 첫 줄이 `---` 일 때만, 닫힐 때까지
  if (lines[0]?.trim() === '---') { i = 1; while (i < lines.length && lines[i].trim() !== '---') i++; i++ }
  for (; i < lines.length; i++) {
    const raw = lines[i]
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(raw)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = ''
      continue
    }
    if (fence) continue
    const m = ATX.exec(raw.trim())
    if (!m) continue
    const text = m[2].replace(/\s+#+\s*$/, '').trim()   // 닫는 `###` 표기를 지운다
    if (!text) continue
    out.push({ line: i + 1, level: m[1].length, text })
  }
  return out
}

/** 가장 얕은 단계를 1로 당긴다 — `##` 부터 쓰는 문서가 통째로 들여쓰여 보이지 않게 */
export function normalizeDepth(heads: Head[]): Head[] {
  if (!heads.length) return heads
  const min = Math.min(...heads.map((h) => h.level))
  return heads.map((h) => ({ ...h, level: h.level - min + 1 }))
}
