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
  | { ok: true; cron: string; text: string; once?: true; past?: true }
  | { ok: false; ask: WhenAsk }
  | { ok: false; error: string; examples: string[] }

export const WHEN_EXAMPLES = ['매일 저녁 8시', '평일 아침 9시 반', '일요일 오전 10시', '두 시간마다', '매달 1일 아침 9시', '매시 20분', '내일 아침 9시', '10/20 오후 3시', '30분 뒤']

/**
 * 🔴 **CR · 한 번만 도는 루틴** (2026-10-17 Dave: *«기본 루틴 기능에 1회만 실행되는 루틴 기능도 추가해줘»*).
 *    10/12 SNS 봇이 12:30 게시를 루틴 세션 안 대기로 걸었다가 세션째 지워져 게시가 안 나갔다 — «정해진 시각에 한 번» 을
 *    걸 자리가 루틴에 없었다. 이제 «언제» 칸에 날짜나 «내일»·«30분 뒤» 를 쓰면 그 시각에 한 번만 돈다.
 *    저장 꼴은 지역 시각 `YYYY-MM-DDTHH:mm` 하나다 — croner 가 날짜 하나를 받아 **한 번만** 걸고, 지난 날짜면 안 건다.
 *    따로 칸(`once`)을 두지 않아 `.bot.yml`·스케줄러·화면이 지금 길을 그대로 쓴다.
 * ⚠ 지난 시각은 사람 말로는 못 건다(«이미 지났어요») — 저장된 날짜가 지난 것(끝난 루틴)만 그대로 둔다.
 */
const ONCE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const p2 = (n: number) => String(n).padStart(2, '0')
/** 한 번만 도는 루틴의 시각 — 아니면(또는 없는 날짜면) null */
export function onceAt(cron: string): Date | null {
  const m = ONCE_RE.exec(String(cron ?? '').trim()); if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))   // 초까지 — 손으로 «…:05» 를 적었으면 그 초에 돈다(croner 와 같게)
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] && d.getHours() === +m[4] && d.getMinutes() === +m[5] ? d : null
}
export const isOnce = (cron: string): boolean => ONCE_RE.test(String(cron ?? '').trim())
/** 한 번만 도는 루틴이 이미 돌았거나 시각이 지났다 — 다시 안 돈다 */
export const onceDone = (cron: string, now = new Date()): boolean => { const d = onceAt(cron); return !!d && d.getTime() <= now.getTime() }
/** CR · 두 값이 같은 한 번짜리 시각인가 — 지난 시각은 «이미 저장돼 있던 값» 일 때만 받는다 */
export const sameOnce = (a: string, b?: string): boolean => { const x = onceAt(a), y = b ? onceAt(b) : null; return !!x && !!y && x.getTime() === y.getTime() }
const onceCron = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}${d.getSeconds() ? `:${p2(d.getSeconds())}` : ''}`
/** 「10/20(화) 오후 3시」 — 해가 다르면 「2027/1/3(일) …」. 이 말을 다시 읽어도 같은 시각이 된다(왕복) */
const onceWhen = (d: Date, now = new Date()) => `${d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}/`}${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]}) ${hhmmText(d.getHours(), d.getMinutes())}`

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
    if (pm === false && h === 12 && part !== '정오' && part !== '점심') h = 0   // 「오전 12시」 는 자정이다 — 「정오 12시」 는 낮이다(CR · 되읽은 말을 다시 저장하면 자정이 됐다)
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
export function parseWhen(input: string, now = new Date()): WhenResult {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: '언제 돌릴지 적어 주세요', examples: WHEN_EXAMPLES }

  // CR · 저장된 한 번짜리 시각이면 검증만 한다 — 지난 것(끝난 루틴)도 그대로 둔다
  if (ONCE_RE.test(raw)) {
    const d = onceAt(raw)
    if (!d) return { ok: false, error: `「${raw}」 은 없는 날짜예요`, examples: WHEN_EXAMPLES }
    return { ok: true, cron: onceCron(d), text: describeCron(raw, now), once: true, ...(d.getTime() <= now.getTime() ? { past: true as const } : {}) }
  }

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
  const every0 = /(?:^|\s)(\d+|[가-힣]{1,2})\s*(분|시간)\s*(?:마다|간격|에 한 ?번)/.exec(s)
  const every = every0 && !/시$/.test(s.slice(0, every0.index).trimEnd()) ? every0 : null   // CR · 「오후 3시 30분에 한 번」 은 30분마다가 아니다
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

  // CR · 한 번만 — 날짜·«내일»·«30분 뒤»·«한 번»
  const once = parseOnce(s, now)
  if (once) return once

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

const KDAY: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3, 내일모레: 2 }
/**
 * CR · 한 번만 도는 시각을 읽는다. 반복을 뜻하는 말(매·마다·평일·주말·씩·«하루/주 한 번»·«주 1회»)이 있으면 null — 반복 쪽이 읽는다.
 * 한 번짜리 단서(오늘·내일·다음 주·…뒤)를 봤는데 못 읽었으면 null 이 아니라 이유를 돌려준다 — 반복 쪽이 «그 외 말은 무시» 하고 매일로 읽는다.
 * 날짜(`10/20`·`10월 20일`·`2026-10-20`)·«오늘/내일/모레»·«이번 주/다음 주 X요일»·«N분/시간 뒤»·«(X요일) 오후 3시 한 번».
 * 시각을 안 말하면 아침 9시(매달 N일과 같다) · 해를 안 말한 날짜가 반년 넘게 지났으면 내년으로 본다(12/30 의 «1/3»).
 */
function parseOnce(s: string, now: Date): WhenResult | null {
  // 「주 1회」·「하루 한 번」·「한 번씩」 은 반복이다 — «한 번» 만 보고 한 번짜리로 읽으면 루틴이 한 번 돌고 조용히 멈춘다
  if (/매|마다|평일|주말|주중|간격|씩|격주|(?:하루|일주일|주|달)\s*(?:에\s*)?(?:한|1|두|2|세|3)\s*(?:번|회|차례)/.test(s)) return null
  const fail = (error: string): WhenResult => ({ ok: false, error, examples: WHEN_EXAMPLES })
  const done = (d: Date): WhenResult => d.getTime() <= now.getTime()
    ? fail(`${onceWhen(d, now)} — 이미 지난 시각이에요`)
    : { ok: true, cron: onceCron(d), text: `${onceWhen(d, now)} 한 번`, once: true }
  const t = readTime(s)
  const at = (y: number, mo: number, day: number) => { const tt = t ?? { h: 9, m: 0 }; return new Date(y, mo, day, tt.h, tt.m) }

  const rel = /(\d+|[가-힣]{1,2})\s*(분|시간|일)\s*(?:뒤|후|있다가)/.exec(s)
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? +rel[1] : DIGITS[rel[1]]
    if (!n) return fail(`「${rel[1]}」 을 숫자로 못 읽었어요`)
    if (rel[2] === '일') return done(at(now.getFullYear(), now.getMonth(), now.getDate() + n))   // 「3일 뒤 오후 3시」 · 시각을 안 말하면 아침 9시
    const d = new Date(now); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + n * (rel[2] === '분' ? 1 : 60))
    return done(d)
  }
  const real = (d: Date, y: number, mo: number, day: number) => d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day

  const ymd = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(s)
  if (ymd) { const [y, mo, day] = [+ymd[1], +ymd[2] - 1, +ymd[3]]; const d = at(y, mo, day); return real(d, y, mo, day) ? done(d) : fail(`「${ymd[0]}」 은 없는 날짜예요`) }
  const md = /(\d{1,2})\s*(?:[/.-]|월\s*)(\d{1,2})(?!\d)/.exec(s)
  if (md) {
    const [mo, day] = [+md[1] - 1, +md[2]]; let y = now.getFullYear(); let d = at(y, mo, day)
    if (!real(d, y, mo, day)) return fail(`「${md[0]}」 은 없는 날짜예요`)
    if (now.getTime() - d.getTime() > 183 * 86400_000) { y += 1; d = at(y, mo, day) }
    return done(d)
  }
  const kd = /(내일모레|오늘|내일|모레|글피)/.exec(s)
  if (kd) {
    if (!t && kd[1] === '오늘') return fail('오늘 몇 시에 돌릴까요? 예: 오늘 오후 3시')
    return done(at(now.getFullYear(), now.getMonth(), now.getDate() + KDAY[kd[1]]))
  }
  const wk = /(이번\s*주|다음\s*주|담주)\s*([일월화수목금토])(?:\s*요일)?(?![가-힣])/.exec(s)   // 「다음 주 화 9시」 처럼 «요일» 을 빼도
  const dayOnly = /([일월화수목금토])\s*요일/.exec(s)
  const marker = /한\s*번|1\s*회|한\s*차례|일회/.test(s)
  if (wk || (dayOnly && marker)) {
    const want = DOW[(wk ?? dayOnly)![wk ? 2 : 1]]
    if (wk) {
      // 주는 월요일에 시작한다 — 오늘이 일요일이면 «다음 주 월요일» 은 내일이고 «이번 주 월요일» 은 6일 전(지난 시각)이다
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + (/이번/.test(wk[1]) ? 0 : 7))
      return done(at(mon.getFullYear(), mon.getMonth(), mon.getDate() + ((want + 6) % 7)))
    }
    for (let k = 0; k <= 7; k++) { const d = at(now.getFullYear(), now.getMonth(), now.getDate() + k); if (d.getDay() === want && d.getTime() > now.getTime()) return done(d) }
  }
  // «N일 오전 9시» — 매달인지 이번 한 번인지 갈린다. 추측하지 않고 되묻는다(AA-3 ①)
  const dom = /(?:^|[^\d월/])(\d{1,2})\s*일(?!\s*(?:마다|간격))/.exec(s)
  if (dom && +dom[1] >= 1 && +dom[1] <= 31) {
    const n = +dom[1], tt = t ?? { h: 9, m: 0 }
    let d = new Date(now.getFullYear(), now.getMonth(), n, tt.h, tt.m)
    if (d.getTime() <= now.getTime() || d.getDate() !== n) d = new Date(now.getFullYear(), now.getMonth() + 1, n, tt.h, tt.m)
    if (marker && d.getDate() === n) return done(d)   // 「3일 오후 3시 한 번」 — 한 번이라고 했으니 묻지 않는다
    const opts: WhenAsk['options'] = [{ label: `매달 ${n}일`, cron: `${tt.m} ${tt.h} ${n} * *`, text: `매달 ${n}일 ${hhmmText(tt.h, tt.m)}` }]
    if (d.getDate() === n) opts.push({ label: `${d.getMonth() + 1}/${n} 한 번만`, cron: onceCron(d), text: `${onceWhen(d, now)} 한 번` })
    return { ok: false, ask: { q: `「${s}」 은 ${opts.map((o) => o.label).join(', ')} 중 어느 쪽인가요?`, options: opts } }
  }
  if (marker) {
    if (!t) return fail('몇 시에 한 번 돌릴까요? 예: 오후 3시 한 번')
    const d = at(now.getFullYear(), now.getMonth(), now.getDate())
    return done(d.getTime() > now.getTime() ? d : at(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  }
  if (/오늘|내일|모레|글피|이번\s*주|다음\s*주|담주|있다가|(?:분|시간|일)\s*(?:뒤|후)/.test(s)) return fail(`「${s}」 를 한 번 돌릴 시각으로 못 읽었어요 — 예: 다음 주 화요일 오후 3시`)
  return null
}

/** cron 을 사람 말로 되읽는다 — 목록에 원시 cron 을 띄우지 않으려고 (AA-4) */
export function describeCron(cron: string, now = new Date()): string {
  const once = onceAt(cron); if (once) return `${onceWhen(once, now)} 한 번`
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
  const once = onceAt(cron)
  if (once) return once.getTime() <= from.getTime() ? `${onceWhen(once, from)}에 한 번 도는 루틴이었어요 — 그 시각이 지나 다시 돌지 않아요.` : `${onceWhen(once, from)}에 한 번만 돌립니다. 그 뒤로는 다시 돌지 않아요.`
  return `${describeCron(cron)}에 돌립니다. 다음 실행은 ${formatNext(nextRunOf(cron, from))} 입니다.`
}
