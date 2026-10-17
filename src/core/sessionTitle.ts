/**
 * 세션 제목 — 🔴 **첫 말이 제목이 된다** (2026-09-15 Dave: «첫 채팅이 진행되면 그에 맞는 채팅 제목을
 * 자동으로 설정해줘»). 「세션 1 · 세션 2 · 세션 3」 은 목록에서 **어느 것이 무엇이었는지** 를 못 알려 준다.
 *
 * ⛔ **모델에게 물어보지 않는다.** 제목 한 줄 때문에 턴을 하나 더 돌리면 사람의 토큰이 나간다 —
 *    게다가 제목은 보낸 **그 순간** 목록에 떠야 하는데, 물어보는 길은 답이 올 때까지 「세션 3」 이다.
 *    첫 말을 다듬는 것만으로 «무엇에 대한 대화였나» 는 거의 언제나 살아난다.
 * ⚠ 사람이 직접 지은 이름은 **덮지 않는다** — 자동 이름(`isAutoSessionName`)일 때만 바꾼다.
 */

/** 앱이 붙인 «아직 이름이 없다» 는 뜻의 이름들 — 이것뿐일 때만 자동 제목이 덮어쓴다 */
const AUTO_NAME_RE = /^(세션|새 세션|메인|대화|새 대화|session|new session|new chat|chat)\s*\d*$/i
export function isAutoSessionName(name: string): boolean { return AUTO_NAME_RE.test((name ?? '').trim()) }

const ENDER = /[.!?。！？]/

/**
 * 첫 말에서 제목 한 줄. 못 만들면 `''` 를 준다(그때는 쓰던 이름을 그대로 둔다).
 * ⚠ 첫 **줄**이 아니라 첫 **문장**까지만 — 붙여 넣은 긴 지시문의 둘째 문단까지 끌고 오지 않는다.
 */
export function titleFromText(text: string, max = 26): string {
  let s = (text ?? '').replace(/\r/g, '')
  // 코드블록·첨부 줄은 제목감이 아니다
  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1')
  const line = s.split('\n').map((l) => l.trim()).find((l) => l && !/^[-*>#|]+$/.test(l)) ?? ''
  let t = line
    .replace(/^#{1,6}\s*/, '')          // 머리말 마커
    .replace(/^[-*>]\s+/, '')           // 목록·인용 마커
    .replace(/\*\*|__|~~/g, '')         // 강조
    .trim()
  // 슬래시 명령으로 시작하면 명령은 떼고 나머지를 본다 (나머지가 없으면 명령 자체가 제목)
  const sl = /^\/([a-z0-9:_-]+)\s*/i.exec(t)
  if (sl) { const rest = t.slice(sl[0].length).trim(); t = rest || `/${sl[1]}` }
  t = t.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  // 첫 문장까지 — 너무 짧게 잘리는 건 막는다(「안녕. 이거 좀…」 의 «안녕» 만 남지 않게)
  for (let i = 6; i < t.length; i++) if (ENDER.test(t[i])) { const head = t.slice(0, i).trim(); if (head.length >= 6) { t = head; break } }
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp >= Math.floor(max * 0.6) ? cut.slice(0, sp) : cut).trim()}…`
}

/** DC · Haiku 에게 보낼 말 — 질문·답 앞부분만(긴 붙여 넣기로 토큰을 쓰지 않게) */
export function titlePrompt(question: string, answer: string): string {
  const cut = (t: string, n: number) => { const x = (t ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x }
  return [
    '아래 대화에 붙일 짧은 제목을 지어 줘.',
    '- 한국어로, 20자 안쪽의 명사구 하나. 무엇을 하는 대화인지 드러나게.',
    '- 따옴표·마침표·이모지·머리말 없이 제목 한 줄만 답해.',
    '',
    `[질문] ${cut(question, 1500)}`,
    `[답] ${cut(answer, 1500)}`
  ].join('\n')
}

/** DC · 모델 답을 제목으로 — 첫 줄 · 꾸밈 걷기 · 30자. 제목감이 아니면 '' */
export function cleanLlmTitle(raw: string, max = 30): string {
  const line = (raw ?? '').split('\n').map((l) => l.trim()).find((l) => l) ?? ''
  let t = line.replace(/^(제목|title)\s*[:：]\s*/i, '').replace(/^#{1,6}\s*/, '').replace(/\*\*|__|`/g, '').replace(/^["'“”‘’「『«]+|["'“”‘’」』»]+$/g, '').replace(/[.。]+$/, '').trim()
  if (!t || /^(error|오류)/i.test(t)) return ''
  if (t.length > max) t = t.slice(0, max).trim() + '…'
  return t
}
