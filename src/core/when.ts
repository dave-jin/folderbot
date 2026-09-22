/**
 * AA-3 · **주기는 사람 말로 넣는다 — cron 을 사람에게 보여 주지 않는다** (2026-09-22 Dave, 실제 사고 뒤).
 *
 * 🔴 **사고가 난 자리**: UI 주기 칸에 「20」(저녁 8시라는 뜻)을 넣었더니 `.bot.yml` 에 `cron: "20"` 으로 저장됐다.
 *    croner 는 5·6·7 필드만 받으므로 예외를 던졌고, 그 예외를 스케줄러가 삼켜 **루틴은 화면에 멀쩡히 살아 있는데
 *    한 번도 안 돌았다.** 이틀을 몰랐다.
 * 🔴 그래서 이 파일의 규칙은 셋이다 —
 *    ① **추측하지 않는다.** 「20」처럼 뜻이 갈리는 값은 cron 을 지어내지 말고 **되묻는다**.
 *    ② **말한 시각이 곧 약속이다.** 부하를 흩뿌리겠다고 :00·:30 을 피해 분을 옮기지 않는다.
 *    ③ **되읽어 확인시킨다.** 저장 전에 «매일 저녁 8시에 돌립니다» 처럼 사람 말로 돌려준다.
 * 🔴 **화면 미리보기와 스케줄러가 같은 파서를 쓴다.** 둘이 갈리면 «미리보기는 맞는데 안 도는» 새 사고가 난다.
 */
import { Cron } from 'croner'

export type WhenAsk = { q: string; options: { label: string; cron: string; text: string }[] }
export type WhenResult =
  | { ok: true; cron: string; text: string }
  | { ok: false; ask: WhenAsk }
  | { ok: false; error: string; examples: string[] }

export const WHEN_EXAMPLES = ['매일 저녁 8시', '평일 아침 9시 반', '일요일 오전 10시', '두 시간마다', '매달 1일 아침 9시', '매시 20분']

/** cron 식이 croner 로 실제로 서는가 — 저장 시점과 스케줄 시점이 **같은 판정**을 쓴다 */
export function cronOk(cron: string): { ok: true } | { ok: false; error: string } {
  const c = String(cron ?? '').trim()
  if (!c) return { ok: false, error: '주기가 비어 있어요' }
  try { const j = new Cron(c, { paused: true }); j.stop(); return { ok: true } } catch (e) { return { ok: false, error: (e as Error).message } }
}
/** 다음 실행 시각 — 못 서는 주기면 null */
export function nextRunOf(cron: string, from = new Date()): Date | null {
  try { const j = new Cron(String(cron).trim(), { paused: true }); const n = j.nextRun(from); j.stop(); return n ?? null } catch { return null }
}
/** 「9/23(화) 20:00」 — 날짜에 요일을 붙여야 사람이 «내일이네» 를 바로 안다 */
export function formatNext(d: Date | null): string {
  if (!d) return '—'
  const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()}(${w}) ${p(d.getHours())}:${p(d.getMinutes())}`
}

const DIGITS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열두: 12, 열한: 11 }
const DOW: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }
/** 때를 가리키는 말의 «기본 시각» — 시각을 안 말했을 때만 쓰고, 되읽어 줄 때 그 시각을 분명히 말한다 */
const PART: Record<string, { base: number; pm: boolean }> = {
  새벽: { base: 5, pm: false }, 아침: { base: 9, pm: false }, 오전: { base: 9, pm: false },
  점심: { base: 12, pm: false }, 정오: { base: 12, pm: false }, 낮: { base: 14, pm: true },
  오후: { base: 14, pm: true }, 저녁: { base: 19, pm: true }, 밤: { base: 21, pm: true }, 자정: { base: 0, pm: false },
}
/** 되읽을 때 쓰는 때 이름. 🔴 **21시는 「저녁 9시」가 아니라 「밤 9시」다** — `PART.밤` 의 기본값(21시)과 맞물려 왕복이 된다 */
const partName = (h: number) => (h === 0 ? '자정' : h < 6 ? '새벽' : h < 12 ? '아침' : h === 12 ? '정오' : h < 18 ? '오후' : h < 21 ? '저녁' : '밤')
const h12 = (h: number) => (h === 0 || h === 12 ? 12 : h % 12)

/** 시각 말 한 덩이를 읽는다 — 「저녁 8시」·「9시 반」·「20시」·「20:30」·「오후 3시 20분」 */
function readTime(s: string): { h: number; m: number } | null {
  let pm: boolean | null = null, part = ''
  for (const k of Object.keys(PART)) if (s.includes(k)) { part = k; pm = PART[k].pm; break }
  const hhmm = /(\d{1,2})\s*:\s*(\d{2})/.exec(s)
  if (hhmm) { const h = +hhmm[1], m = +hhmm[2]; return h <= 23 && m <= 59 ? { h: pm && h < 12 ? h + 12 : h, m } : null }
  const hm = /(\d{1,2})\s*시(?:\s*(반|(\d{1,2})\s*분))?/.exec(s)
  if (hm) {
    let h = +hm[1]; const m = hm[2] === '반' ? 30 : hm[3] ? +hm[3] : 0
    if (h > 23 || m > 59) return null
    if (pm && h < 12) h += 12
    if (pm === false && h === 12) h = 0            // 「오전 12시」 는 자정이다
    return { h, m }
  }
  if (part) return { h: PART[part].base, m: 0 }     // 「아침」 처럼 때만 말했으면 그 때의 기본 시각
  return null
}

const hhmmText = (h: number, m: number) => `${partName(h)} ${h12(h)}시${m ? ` ${m}분` : ''}`

/**
 * 사람 말을 cron 으로. 못 읽으면 **지어내지 않고** 되묻거나 이유를 돌려준다.
 * 이미 cron 식이면 그대로 검증만 한다(봇이 지어낸 cron 도 여기서 걸린다).
 */
export function parseWhen(input: string): WhenResult {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: '언제 돌릴지 적어 주세요', examples: WHEN_EXAMPLES }

  // 이미 cron 식(빈칸으로 갈린 5~7 덩이)이면 검증만 한다
  if (/^[\d*/,\-?LW#a-zA-Z]+(\s+[\d*/,\-?LW#a-zA-Z]+){4,6}$/.test(raw)) {
    const v = cronOk(raw)
    return v.ok ? { ok: true, cron: raw, text: describeCron(raw) } : { ok: false, error: `cron 식으로 읽었는데 안 서요 — ${v.error}`, examples: WHEN_EXAMPLES }
  }

  const s = raw.replace(/\s+/g, ' ')

  // 🔴 숫자 하나만 — 이번 사고가 정확히 이 지점이다. 추측하지 말고 되묻는다
  if (/^\d{1,2}$/.test(s)) {
    const n = +s
    const opts: WhenAsk['options'] = []
    if (n <= 23) opts.push({ label: `${n}시에 (매일)`, cron: `0 ${n} * * *`, text: `매일 ${hhmmText(n, 0)}` })
    if (n <= 59) opts.push({ label: `매시 ${n}분에`, cron: `${n} * * * *`, text: `매시 ${n}분` })
    if (!opts.length) return { ok: false, error: `「${s}」 은 시각으로도 분으로도 못 읽어요`, examples: WHEN_EXAMPLES }
    return { ok: false, ask: { q: `「${s}」 은 ${opts.map((o) => o.label).join(', ')} 중 어느 쪽인가요?`, options: opts } }
  }

  // N분마다 · N시간마다 (「두 시간마다」 처럼 한글 숫자도)
  const every = /(?:^|\s)(\d+|[가-힣]{1,2})\s*(분|시간)\s*(?:마다|간격|에 한 ?번)/.exec(s)
  if (every) {
    const n = /^\d+$/.test(every[1]) ? +every[1] : DIGITS[every[1]]
    if (!n) return { ok: false, error: `「${every[1]}」 을 숫자로 못 읽었어요`, examples: WHEN_EXAMPLES }
    if (every[2] === '분') {
      if (n < 1 || n > 59) return { ok: false, error: '분 간격은 1~59 분이어야 해요', examples: WHEN_EXAMPLES }
      return { ok: true, cron: `*/${n} * * * *`, text: `${n}분마다` }
    }
    if (n < 1 || n > 23) return { ok: false, error: '시간 간격은 1~23 시간이어야 해요', examples: WHEN_EXAMPLES }
    return { ok: true, cron: `0 */${n} * * *`, text: `${n}시간마다` }
  }

  // 매시 N분
  const hourly = /매\s*시(?:간)?\s*(\d{1,2})\s*분/.exec(s)
  if (hourly) { const m = +hourly[1]; if (m > 59) return { ok: false, error: '분은 0~59 여야 해요', examples: WHEN_EXAMPLES }; return { ok: true, cron: `${m} * * * *`, text: `매시 ${m}분` } }

  const t = readTime(s)

  // 매달 N일
  const monthly = /매\s*(?:달|월)\s*(\d{1,2})\s*일/.exec(s)
  if (monthly) {
    const d = +monthly[1]
    if (d < 1 || d > 31) return { ok: false, error: '날짜는 1~31 이어야 해요', examples: WHEN_EXAMPLES }
    const tt = t ?? { h: 9, m: 0 }
    return { ok: true, cron: `${tt.m} ${tt.h} ${d} * *`, text: `매달 ${d}일 ${hhmmText(tt.h, tt.m)}` }
  }

  // 요일 — 「월요일」·「월·수·금」·「주말」·「평일」
  const days = new Set<number>()
  for (const m of s.matchAll(/([일월화수목금토])\s*요일/g)) days.add(DOW[m[1]])
  const weekday = /평일|주중/.test(s), weekend = /주말/.test(s)
  if (weekday) [1, 2, 3, 4, 5].forEach((d) => days.add(d))
  if (weekend) [0, 6].forEach((d) => days.add(d))

  const tt = t ?? (days.size || /매일|날마다|하루/.test(s) ? { h: 9, m: 0 } : null)
  if (!tt) return { ok: false, error: `「${raw}」 를 못 읽었어요`, examples: WHEN_EXAMPLES }

  if (days.size) {
    const list = [...days].sort((a, b) => a - b)
    const dowText = weekday && list.length === 5 ? '평일' : weekend && list.length === 2 ? '주말' : list.map((d) => `${'일월화수목금토'[d]}요일`).join('·')
    const cronDow = weekday && list.length === 5 ? '1-5' : list.join(',')
    return { ok: true, cron: `${tt.m} ${tt.h} * * ${cronDow}`, text: `${dowText} ${hhmmText(tt.h, tt.m)}` }
  }
  return { ok: true, cron: `${tt.m} ${tt.h} * * *`, text: `매일 ${hhmmText(tt.h, tt.m)}` }
}

/** cron 을 사람 말로 되읽는다 — 목록에 원시 cron 을 띄우지 않으려고 (AA-4) */
export function describeCron(cron: string): string {
  const p = String(cron ?? '').trim().split(/\s+/)
  if (p.length < 5 || p.length > 7) return cron
  const [mi, ho, dom, , dow] = p.length === 6 ? p.slice(1) : p
  const evH = /^\*\/(\d+)$/.exec(ho); if (evH && mi === '0') return `${evH[1]}시간마다`
  const evM = /^\*\/(\d+)$/.exec(mi); if (evM && ho === '*') return `${evM[1]}분마다`
  if (ho === '*' && /^\d+$/.test(mi)) return `매시 ${+mi}분`
  if (!/^\d+$/.test(mi) || !/^\d+$/.test(ho)) return cron
  const when = hhmmText(+ho, +mi)
  if (/^\d+$/.test(dom)) return `매달 ${+dom}일 ${when}`
  if (dow === '*' || dow === '?') return `매일 ${when}`
  if (dow === '1-5') return `평일 ${when}`
  if (dow === '0,6' || dow === '6,0') return `주말 ${when}`
  const list = dow.split(',').filter((x) => /^\d$/.test(x)).map((d) => `${'일월화수목금토'[+d % 7]}요일`)
  return list.length ? `${list.join('·')} ${when}` : cron
}

/** 저장 전에 사람에게 보여 줄 한 줄 — 「매일 저녁 8시에 돌립니다. 다음 실행은 9/23(화) 20:00 입니다.」 */
export function confirmLine(cron: string, from = new Date()): string {
  return `${describeCron(cron)}에 돌립니다. 다음 실행은 ${formatNext(nextRunOf(cron, from))} 입니다.`
}
