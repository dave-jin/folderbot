/**
 * 그림으로 받는 답 — 블록 **읽기** (2026-11-12 Dave: *«다이어그램 형태로 보여주거나 … 채팅창 안에서 보다 시각화된 커뮤니케이션»* · 시각화 채팅 둘째 묶음).
 *
 * 봇이 순서 · 비교 · 숫자를 코드 울타리(`steps` · `compare` · `chart`)로 쓰면 화면(`client/visualBlocks`)이 카드로 그린다.
 * mermaid 와 같은 길이다 — 블록을 모르는 옛 판에서는 코드로 보이고, 줄 단위 글이라 코드로 보여도 읽힌다.
 *
 * 🔴 **반만 읽은 블록을 그리지 않는다.** 모양이 다른 줄이 하나라도 있으면 `null` 을 돌려주고 화면은 코드 그대로 둔다 —
 *    줄 하나를 조용히 버리고 그리면 «다섯 단계 중 넷» 처럼 틀린 그림이 된다.
 * ⚠ 쓰는 법을 바꾸면 `VISUAL_RULES_MD`(봇이 받는 규칙)도 함께 바꾼다 — 유닛 검사가 규칙의 예시를 실제로 읽어 본다.
 */
export const VISUAL_LANGS = ['steps', 'compare', 'chart'] as const
export type VisualLang = typeof VISUAL_LANGS[number]

export type StepState = 'done' | 'now' | 'todo'
export interface StepsBlock { kind: 'steps'; title: string; steps: { state: StepState; label: string; note: string }[]; /** 지금 단계 번호(1부터) — 없으면 끝난 단계 수 */ at: number }
export interface CompareBlock { kind: 'compare'; title: string; /** 항목 이름 — 처음 나온 순서 */ keys: string[]; options: { name: string; rec: boolean; rows: Record<string, string> }[] }
export interface ChartPoint { label: string; value: number; /** 보이는 글 — 봇이 쓴 숫자 그대로(`1,200만`) */ text: string; /** 아직 확정이 아닌 값(` ~`) — 흐리게 그린다 */ soft: boolean; /** 가장 큰 절댓값 대비 0~100 */ pct: number }
export interface ChartBlock { kind: 'chart'; title: string; unit: string; /** 세로 막대 · 가로 막대 */ layout: 'cols' | 'rows'; points: ChartPoint[] }
export type VisualBlock = StepsBlock | CompareBlock | ChartBlock

export const STEPS_MAX = 12
export const COMPARE_MAX = 6
export const CHART_MAX = 24

const linesOf = (src: string): string[] => String(src ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
/** 맨 위의 머리말 줄(`title:` · `unit:`)을 떼어 낸다 — 본문이 시작된 뒤의 같은 낱말은 본문이다 */
function heads(ls: string[], names: RegExp): { head: Record<string, string>; rest: string[] } {
  const head: Record<string, string> = {}; let i = 0
  for (; i < ls.length; i++) {
    const m = /^([A-Za-z가-힣]+)\s*[:：]\s*(.*)$/.exec(ls[i]); if (!m || !names.test(m[1])) break
    const key = /^(title|제목)$/i.test(m[1]) ? 'title' : 'unit'
    if (key === 'unit' && /^[+-]?[\d.,]+$/.test(m[2].trim())) break   // 단위가 숫자뿐일 수는 없다 — «단위: 5» 는 이름이 «단위» 인 값이다
    head[key] = m[2].trim()
  }
  return { head, rest: ls.slice(i) }
}
/** 줄 앞의 글머리표(`- ` · `* `)는 뗀다 — 봇이 목록처럼 써도 같은 줄이다 */
const unbullet = (l: string): string => l.replace(/^[-*]\s+/, '')
/**
 * `이름: 값` 을 가르는 쌍점의 자리. 🔴 **숫자 사이에 낀 쌍점은 가르는 자리가 아니다**(`11:30` · `3:1`) —
 * 그것까지 가르면 «1회: 24명 (11:30 마감)» 이 «값 30» 으로 읽힌다(2026-11-13 독립 검토).
 */
function colons(l: string): number[] {
  const at: number[] = []
  for (let i = 0; i < l.length; i++) if ((l[i] === ':' || l[i] === '：') && !(/\d/.test(l[i - 1] ?? '') && /\d/.test(l[i + 1] ?? ''))) at.push(i)
  return at
}

const STEP = /^(?:[-*]\s+)?\[([ xXvV✓>~]?)\]\s*(.+)$/
function parseSteps(src: string): StepsBlock | null {
  const { head, rest } = heads(linesOf(src), /^(title|제목)$/i)
  if (rest.length < 2 || rest.length > STEPS_MAX) return null
  const steps: StepsBlock['steps'] = []
  for (const l of rest) {
    const m = STEP.exec(l); if (!m) return null
    const [label, ...note] = m[2].split('|')
    if (!label.trim()) return null
    steps.push({ state: /[xXvV✓]/.test(m[1]) ? 'done' : /[>~]/.test(m[1]) ? 'now' : 'todo', label: label.trim(), note: note.join('|').trim() })
  }
  const now = steps.findIndex((s) => s.state === 'now')
  return { kind: 'steps', title: head.title ?? '', steps, at: now >= 0 ? now + 1 : steps.filter((s) => s.state === 'done').length }
}

function parseCompare(src: string): CompareBlock | null {
  const { head, rest } = heads(linesOf(src), /^(title|제목)$/i)
  const options: CompareBlock['options'] = []; const keys: string[] = []
  for (const l of rest) {
    const o = /^#{1,3}\s+(.+)$/.exec(l)
    if (o) {
      const rec = /(?:\s\*|\s*\(추천\))$/.test(o[1]); const name = o[1].replace(/(?:\s\*|\s*\(추천\))$/, '').trim()
      if (!name) return null
      options.push({ name, rec, rows: Object.create(null) as Record<string, string> }); continue   // ⚠ 맨 객체 — 항목 이름이 `constructor` 여도 물려받은 값이 칸에 찍히지 않는다
    }
    const row = unbullet(l); const cut = colons(row)[0]; const cur = options[options.length - 1]   // 값에 든 쌍점은 값이다 — **첫** 자리에서 가른다
    if (cut == null || !cur) return null
    const k = row.slice(0, cut).trim(); const v = row.slice(cut + 1).trim()
    if (!k) return null
    if (!v) continue   // 모르는 칸은 비워 둔다 — 줄은 맞지만 값이 없다
    if (k in cur.rows) return null   // 같은 항목이 두 줄이면 앞줄이 조용히 사라진다 — 그리지 않는다
    if (!keys.includes(k)) keys.push(k)
    cur.rows[k] = v
  }
  if (options.length < 2 || options.length > COMPARE_MAX || options.some((o) => !Object.keys(o.rows).length)) return null
  return { kind: 'compare', title: head.title ?? '', keys, options }
}

/**
 * `이름: 숫자` — 이름에 쌍점이 있을 수 있어(«11:30 회차: 12») **마지막** 자리에서 가른다. 값은 숫자 하나와 단위 글자(`만` · `명` · `%`)뿐이다.
 * 🔴 **조용히 틀리게 읽지 않는다**(2026-11-13 독립 검토) — 날짜(`11/22`) · 범위(`20-30명`) · 시각(`11:30`) · 잘못 찍힌 쉼표(`3,5`) · 지수(`1e6`)는 숫자 하나가 아니라 `null` 이다.
 *    단위가 줄마다 다르면(`1.2억` 과 `8,000만`) 막대 길이가 실제와 거꾸로 나온다 — 그것도 `null`.
 */
const VALUE = /^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([\p{L}%°][^\d:：~]*?)?\s*(~)?$/u
function parseChart(src: string): ChartBlock | null {
  const { head, rest } = heads(linesOf(src), /^(title|제목|unit|단위)$/i)
  if (rest.length < 2 || rest.length > CHART_MAX) return null
  const raw: Omit<ChartPoint, 'pct'>[] = []; const tails = new Set<string>()
  for (const l of rest) {
    const row = unbullet(l); const cut = colons(row).pop(); if (cut == null) return null
    const label = row.slice(0, cut).trim(); const m = VALUE.exec(row.slice(cut + 1).trim()); if (!label || !m) return null
    const value = Number(m[1].replace(/,/g, '')); if (!Number.isFinite(value)) return null
    const tail = (m[2] ?? '').trim(); tails.add(tail)
    raw.push({ label, value, text: m[1] + tail, soft: !!m[3] })
  }
  if (tails.size > 1) return null
  const max = Math.max(...raw.map((p) => Math.abs(p.value)))
  const points = raw.map((p) => ({ ...p, pct: max ? Math.round((Math.abs(p.value) / max) * 1000) / 10 : 0 }))
  // 세로 막대는 이름과 값이 막대 한 칸 폭에 들어가야 한다 — 값이 많거나 이름 · 값이 길면 가로 막대(폰 폭에서 칸이 좁아져 글이 잘리거나 겹친다)
  const layout = points.length > 6 || points.some((p) => [...p.label].length > 10 || [...p.text].length > 6) ? 'rows' : 'cols'
  return { kind: 'chart', title: head.title ?? '', unit: head.unit ?? '', layout, points }
}

export function parseVisual(lang: string, src: string): VisualBlock | null {
  return lang === 'steps' ? parseSteps(src) : lang === 'compare' ? parseCompare(src) : lang === 'chart' ? parseChart(src) : null
}

/**
 * 격리된 미니 창에 넣을 글 — 봇이 만든 html 앞에 «바깥을 전부 막는» 정책을 끼운다.
 *
 * 🔴 **맨 앞에 둔다**(doctype 바로 뒤). `<head>` 를 찾아 끼우면 그보다 앞에 적힌 `<script>` 가 정책 없이 돈다.
 * ⚠ 이 정책은 둘째 울타리다. 첫째는 틀 자체다 — `sandbox="allow-scripts"`(같은 출처 허용 없음)와 `srcdoc`(주소에 토큰이 없다).
 *    틀 안의 글은 볼트도 토큰도 부모 화면도 모른다. 정책은 거기에 «바깥 주소도 못 부른다» 를 더한다.
 * ⛔ `connect-src` · `'self'` · 바깥 주소를 열지 않는다(`test/unit/visualBlocks.test.ts`).
 * 🔴 **이 정책은 틀이 «다른 주소로 가는 것» 을 못 막는다**(링크 · `location.href` · `meta refresh` — 2026-11-13 독립 검토 · 재현).
 *    그것은 앱 문서의 `frame-src 'self'`(`client/index.html`)가 막는다 — 크롬은 자식 틀의 이동을 **부모** 정책으로 본다. 둘 중 하나만 지워도 울타리가 뚫린다.
 * ⚠ 남은 길: WebRTC · `dns-prefetch` 는 CSP 가 막지 못한다. 틀이 아는 것은 그 파일 자신과 사람이 틀 안에 친 값뿐이다.
 */
export const MINI_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'"
/** 이보다 큰 html 은 말풍선 안 틀에 넣지 않는다 — 문서 창에서 연다 */
export const MINI_MAX = 512 * 1024
export function miniDoc(html: string): string {
  const s = String(html ?? '').replace(/^﻿/, '')
  const meta = `<meta http-equiv="Content-Security-Policy" content="${MINI_CSP}"><meta name="referrer" content="no-referrer">`
  const m = /^\s*<!doctype[^>]*>/i.exec(s)
  return m ? m[0] + meta + s.slice(m[0].length) : meta + s
}
/**
 * 바깥 자료를 부르는 html 인가 — CDN 의 글꼴 · 라이브러리나 옆 파일(`./style.css`)을 쓰는 문서는 미니 창에서 그 부분이 빠진 채 보인다.
 * 열기는 하되 «문서 창에서 여세요» 를 함께 알린다(`client/mediaCards`). ⚠ 어림이다 — 스크립트가 만든 주소는 모른다.
 */
export function miniOutside(html: string): boolean {
  const s = String(html ?? '')
  const local = /^(?:data:|blob:|#|about:|javascript:)/i
  for (const m of s.matchAll(/<(?:script|img|iframe|video|audio|source|embed|link)\b[^>]*?\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const v = (m[1] ?? m[2] ?? m[3] ?? '').trim(); if (v && !local.test(v)) return true
  }
  for (const m of s.matchAll(/(?:@import\s+(?:url\(\s*)?|(?<![A-Za-z.])url\(\s*)["']?([^"')\s]+)/g)) if (!local.test(m[1])) return true
  return false
}
/**
 * 답이 울타리를 **닫지 않은 채** 끝났나(정지 · 오류로 끊긴 답). 그러면 마지막 코드 블록은 반쯤 온 것이다 —
 * 줄 모양만 맞으면 «다섯 중 셋» 카드가 되므로 그리지 않는다(`client/visualBlocks`).
 */
export function fenceOpen(md: string): boolean {
  let open: { ch: string; n: number } | null = null
  for (const l of String(md ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l); if (!m) continue
    const ch = m[1][0]; const n = m[1].length
    if (!open) { if (ch === '`' && m[2].includes('`')) continue; open = { ch, n } }
    else if (ch === open.ch && n >= open.n && !m[2].trim()) open = null
  }
  return !!open
}

/** 봇에게 알려 주는 규칙 — 시스템 프롬프트와 새 볼트 CLAUDE.md 머리말에 같은 글(`DEVICE_RULES_MD` 와 같은 길). 모든 세션이 받으니 짧게 둔다 */
export const VISUAL_RULES_MD = `## 그림으로 답하기 (Folder Bot)
사람이 Folder Bot 채팅에서 읽는 답에 순서 · 비교 · 숫자가 들면 글이나 표 대신 아래 코드 블록으로 쓴다(Folder Bot 이 카드로 그린다). 파일 · 편지 · 루틴 보고 · 다른 봇에게 가는 글에는 쓰지 않는다 — 거기서는 코드로 보인다. 아는 값만 넣고 지어내지 않는다. 답 하나에 셋까지.
\`\`\`steps
title: 강의 준비
[x] 기획 | 10/28 확정
[>] 슬라이드 | 42장 중 31
[ ] 리허설
\`\`\`
\`\`\`compare
# 노션 템플릿 *
준비: 약 2시간
# PDF 워크북
준비: 약 4시간
\`\`\`
\`\`\`chart
title: 회차별 신청
unit: 명
1회: 24
2회: 33 ~
\`\`\`
- steps: \`[x]\` 끝남 · \`[>]\` 지금 · \`[ ]\` 남음, \`|\` 뒤는 덧붙임. 2~${STEPS_MAX}개.
- compare: \`# 안 이름\`(추천은 끝에 \` *\`) 아래 \`항목: 값\`. 한 안에 같은 항목은 한 줄. 안 2~${COMPARE_MAX}개.
- chart: \`이름: 숫자\`. 숫자 하나만 쓰고(날짜 · 범위 · 시각은 안 된다) 단위는 \`unit:\` 에 한 번. 끝의 \` ~\` 는 아직 확정이 아닌 값. 2~${CHART_MAX}개.
- 세 블록으로 안 되는 것(만져 보는 계산기 등)은 이 폴더에 html 파일 하나로 만든다. 스타일 · 스크립트를 그 파일에 다 담고 바깥 주소를 부르지 않는다. 답에는 그 파일 이름만 한 줄에 혼자 적는다 — 격리된 미니 창으로 열린다.
- 흐름 · 관계 그림은 지금처럼 \`\`\`mermaid 로 쓴다.`
