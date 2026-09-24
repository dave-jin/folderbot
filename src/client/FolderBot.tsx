import type React from "react"
import type { Holder } from '../core/waiting'
import type { SessionState } from '../core/types'

/**
 * AB(2026-09-23 · Dave 「B안」) — `hold` 가 새로 들어왔다. **«남이 공을 들고 있다»** 는 뜻이고
 * `work`(내가 들고 있다)와 **눈·색·맥동 속도**로 갈린다. 입은 안 건드린다 — 28px 레일에서 뭉개진다.
 */
export type Mood = 'idle' | 'work' | 'hold' | 'wait' | 'done' | 'sleep' | 'error'
export function moodOf(state?: SessionState | null, hibernated = false, holder?: Holder): Mood {
  if (hibernated && (!state || state === 'idle')) return 'sleep'
  // AB · 「내가 일하는 중」과 「남을 기다리는 중」은 다른 얼굴이다. 🔴 **턴이 끝나도(bg) 남이 들고 있으면 기다리는 얼굴**이다
  if (holder === 'other') return 'hold'
  switch (state) { case 'running': return 'work'; case 'awaiting_input': return 'wait'; case 'done': return 'done'; case 'error': return 'error'; default: return 'idle' }
}

/**
 * 폴더봇 — 탭 달린 뒷판 + 얼굴 있는 앞판. 표정 = 상태. (V12 C 안, 2026-09-13 Dave 선택)
 * 눈·입·표식은 그룹 클래스라 CSS 키프레임이 움직인다(깜빡임·시선·타이핑·눈썹·!·z·미소·흔들림). JS 타이머 없음.
 * 모서리 배지 = 상태 색(일하는 중 주황 · 확인 노랑 · 끝남 초록 · 오류 빨강) — 레일 18px 에서도 읽힌다. 그래서 행 옆의 별도 점은 뺐다.
 * 작은 크기(≤20)는 .sm — 입 애니메이션은 끄고 시선·깜빡임·배지만 남긴다.
 */
/**
 * `work` — 일하는 중일 때 **무엇을 하는 중인지**까지 몸짓으로 말한다 (2026-09-13 Dave 확정).
 *  · `think` 숨쉬기 — 몸이 부풀고 뒷판이 살짝 들린다(생각 중·명령 실행 중)
 *  · `file`  서류 넘기기 — 폴더에서 종이가 한 장씩 올라와 사라진다(읽기·쓰기·찾기)
 *  · `type`  타이핑 — 눈이 글을 훑고 입이 점 셋으로 깜빡인다(답 쓰는 중)
 * ⚠ 셋 다 CSS 키프레임뿐이다 — JS 타이머 없음. `prefers-reduced-motion` 에서 멈춘다.
 */
/**
 * S · `unread` — **아직 내가 안 본 답**이 있으면 상태 배지에 얇은 링을 두른다 (2026-09-21 Dave).
 * ⛔ 깜빡이지 않는다 — 맥동은 이미 «일하는 중»(주황)의 언어라, 안 읽음까지 깜빡이면 색만 다른 같은 움직임이 둘이 된다.
 *    안 읽음은 **행 강조(굵은 제목 · 밝은 미리보기)** 와 이 링으로 말한다.
 */
export function FolderBot({ color, size = 36, mood = 'idle', mono = false, work, unread = false }: { color: string; size?: number; mood?: Mood; mono?: boolean; work?: 'think' | 'file' | 'type'; unread?: boolean }) {
  const d = mono ? '#000' : 'rgba(0,0,0,.6)'
  const eyes: Record<Mood, React.ReactNode> = {
    idle: <g className="eyes"><rect x="20" y="30" width="6" height="10" rx="3" fill={d} /><rect x="38" y="30" width="6" height="10" rx="3" fill={d} /></g>,
    work: <><g className="eyes"><rect x="20" y="33" width="6" height="8" rx="3" fill={d} /><rect x="38" y="33" width="6" height="8" rx="3" fill={d} /></g><path className="mouth" d="M27 46h10" stroke={d} strokeWidth="3" strokeLinecap="round" /></>,
    // AB · 남을 기다리는 중 — **반쯤 감은 눈**(내 차례가 아니다) + 일자 입. 눈만 바꾸므로 작은 크기에서도 읽힌다
    hold: <><g className="eyes"><rect x="20" y="34" width="6" height="3" rx="1.5" fill={d} /><rect x="38" y="34" width="6" height="3" rx="1.5" fill={d} /></g><path className="mouth" d="M27 46h10" stroke={d} strokeWidth="3" strokeLinecap="round" fill="none" /></>,
    wait: <><g className="eyes"><rect x="20" y="30" width="6" height="10" rx="3" fill={d} /><rect x="38" y="30" width="6" height="10" rx="3" fill={d} /></g><circle className="mouth" cx="32" cy="47" r="3" fill={d} /><path className="mark" d="M50 14v10M50 28v2" stroke="#fff" strokeWidth="4" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,.6))' }} /></>,
    done: <><g className="eyes"><path d="M19 34c2-3 6-3 8 0M37 34c2-3 6-3 8 0" stroke={d} strokeWidth="3" fill="none" strokeLinecap="round" /></g><path className="mouth" d="M26 44c3 4 9 4 12 0" stroke={d} strokeWidth="3" fill="none" strokeLinecap="round" /></>,
    sleep: <><g className="eyes"><path d="M19 36h8M37 36h8" stroke={d} strokeWidth="3" strokeLinecap="round" /></g><text className="mark" x="46" y="20" fontSize="12" fontWeight="700" fill={d} fontFamily="system-ui">z</text></>,
    error: <><g className="eyes"><path d="M19 30l7 7M26 30l-7 7M37 30l7 7M44 30l-7 7" stroke={d} strokeWidth="3" strokeLinecap="round" /></g><path className="mouth" d="M27 47c3-3 9-3 12 0" stroke={d} strokeWidth="3" fill="none" strokeLinecap="round" /></>
  }
  // 🔴 색은 「누가 공을 들고 있나」 하나로 읽힌다 — 주황=내가 · 청록=남이 · 노랑=네가 · 초록=아무도 (AB)
  const badge: Partial<Record<Mood, string>> = { work: 'var(--run)', hold: 'var(--hold)', wait: 'var(--wait)', done: 'var(--done)', error: 'var(--err)' }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ flex: 'none', display: 'block', overflow: 'visible' }} className={`fb fb-${mood} ${work ? `fbw fbw-${work}` : ''} ${size <= 20 ? 'sm' : ''} ${unread ? 'unread' : ''}`}>
      {/* 서류 — `file` 일 때만 보인다(그 외에는 CSS 가 감춘다). 탭 위로 올라와 사라진다 */}
      <rect className="pg p1" x="24" y="6" width="16" height="12" rx="2" fill={mono ? '#ededed' : 'var(--w)'} opacity="0" />
      <rect className="pg p2" x="28" y="6" width="13" height="10" rx="2" fill={mono ? '#9a9a9a' : 'var(--t2)'} opacity="0" />
      <g className="body">
        <path className="leaf" d="M6 14a4 4 0 0 1 4-4h14l5 5h29a4 4 0 0 1 4 4v33a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill={color} opacity=".55" />
        <path d="M6 24a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill={color} />
        {eyes[mood]}
      </g>
      {unread ? <circle className="uring" cx="56" cy="56" r="11.5" fill="none" stroke={badge[mood] ?? 'var(--done)'} strokeWidth="3" opacity=".75" /> : null}
      {badge[mood] ?? unread ? <circle className="badge" cx="56" cy="56" r="7" fill={badge[mood] ?? 'var(--done)'} stroke="var(--bg)" strokeWidth="3" /> : null}
    </svg>
  )
}

export const I = {
  search: <path d="M10.5 10.5 14 14M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z" />,
  plus: <path d="M8 3v10M3 8h10" />,
  chev: <path d="M6 3l5 5-5 5" />,
  chevd: <path d="M3 6l5 5 5-5" />,
  more: <><circle cx="3" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="13" cy="8" r="1.2" /></>,
  collapse: <path d="M9 3l5 5-5 5M3 3l5 5-5 5" />,
  send: <path d="M2 8l12-5-3 11-3-4-6-2z" />,
  file: <><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></>,
  folder: <path d="M2 4h4l1.5 1.5H14V13H2z" />,
  pin: <><path d="M6 2h4l-.5 4 2.5 2.5v1H4v-1L6.5 6z" /><path d="M8 9.5V14" /></>,
  diff: <><path d="M3 5h7M8 2.5 10.5 5 8 7.5" /><path d="M13 11H6M8.5 8.5 6 11l2.5 2.5" /></>,
  fplus: <><path d="M2 4h4l1.5 1.5H14V13H2z" /><path d="M8 7v4M6 9h4" /></>,
  read: <path d="M2 4h5a2 2 0 0 1 2 2v8a1.5 1.5 0 0 0-1.5-1.5H2zM14 4H9a2 2 0 0 0-2 2v8a1.5 1.5 0 0 1 1.5-1.5H14z" />,
  edit: <path d="M3 13l1-4 7-7 3 3-7 7z" />,
  run: <path d="M3 4l4 4-4 4M8 12h5" />,
  web: <><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></>,
  task: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5 8l2 2 4-4" /></>,
  clock: <><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></>,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  check: <path d="M3 8.5l3 3 7-7" />,
  open: <><path d="M9 3h4v4M13 3 7 9" /><path d="M11 9v4H3V5h4" /></>,
  back: <path d="M10 3 5 8l5 5" />,
  bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3z" /><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" /></>,
  gear: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></>,
  warn: <><path d="M8 2l6.5 11h-13z" /><path d="M8 6.5v3M8 11.5v.5" /></>,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.5" />,
  undo: <><path d="M6 4 3 7l3 3" /><path d="M3 7h7a3 3 0 0 1 0 6H8" /></>,
  archive: <><rect x="2" y="3" width="12" height="3" /><path d="M3 6v7h10V6M6.5 9h3" /></>,
  pause: <path d="M5.5 3v10M10.5 3v10" />,
  inbox: <><path d="M2 9l2-6h8l2 6v4H2z" /><path d="M2 9h4l1 2h2l1-2h4" /></>,
  phone: <><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" /><path d="M7 12.5h2" /></>,
  doc: <><path d="M4 2h5l3 3v9H4z" /><path d="M6 8h4M6 10.5h4" /></>,
  // 말풍선 — 하단 탭의 «채팅». doc·folder 와 나란히 서므로 한눈에 갈려야 한다
  chat: <path d="M2.5 3.5h11v8h-6l-3.5 3v-3h-1.5z" />,
  // 겹친 종이 두 장 — «복사» 는 문서 아이콘(doc)과 뜻이 달라야 한다(그 자리에 doc 을 쓰면 «파일 열기» 로 읽힌다)
  copy: <><rect x="5.5" y="2.5" width="8" height="9" rx="1.5" /><path d="M10.5 13.5h-6a1.5 1.5 0 0 1-1.5-1.5v-7" /></>,
  panel: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M6 3v10" /></>,
  panelr: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M10 3v10" /></>,
  sub: <path d="M4 3v6a2 2 0 0 0 2 2h6M9 8l3 3-3 3" />,
  expand: <><path d="M9 3h4v4M3 13l10-10M7 13H3V9" /></>,
  /* AM · 이미지 뷰어용 둘 (2026-09-24 Dave: 폰에서 「맞춤·원본·복사」 글자가 세로로 쪼개져 아이콘으로 바꿈).
     맞춤 = 테두리 안으로 모이는 네 화살표 · 원본 = 바깥 테두리 안에 실제 크기 네모(1:1). 뜻은 `title` 이 함께 말한다. */
  fit: <><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" /><path d="M5 6.5h2v-2M11 6.5H9v-2M5 9.5h2v2M11 9.5H9v2" /></>,
  actual: <><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" /><rect x="6" y="6.5" width="4" height="3" rx="0.5" /></>,
  list: <><path d="M5 4h8M5 8h8M5 12h8" /><circle cx="2.5" cy="4" r=".8" /><circle cx="2.5" cy="8" r=".8" /><circle cx="2.5" cy="12" r=".8" /></>,
  sort: <path d="M3 4h10M3 8h7M3 12h4" />,
  eye: <><path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></>,
  up: <path d="M8 13V3M4 7l4-4 4 4" />,
  grep: <><circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5M5 7h4" /></>,
  plug: <><path d="M5 2v4M11 2v4M3 6h10v3a5 5 0 0 1-10 0z" /><path d="M8 14v-3" /></>,
  cal: <><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 7h12M5 1.5v3M11 1.5v3" /></>,
  home: <><path d="M2 8l6-5 6 5v6H2z" /><path d="M6.5 14V9.5h3V14" /></>,
  mic: <><rect x="6" y="1.5" width="4" height="7.5" rx="2" /><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5" /></>
}
/** Finder 식 가운데 말줄임 — 앞과 뒤를 남기고 가운데를 … 로 (Dave 2026-09-12). 뒤는 최대 8자, 짧은 이름은 절반 */
export function Mid({ s: raw, tail = 8 }: { s: string; tail?: number }) {
  // macOS 파일명은 NFD(자모 분리)로 온다 — 그대로 문자열 index 로 자르면 초성·중성 사이가 갈려 «전ㅊ ㅔ구조» 가 된다. NFC 로 합친 뒤 코드포인트 단위로 자른다
  const cps = Array.from(raw.normalize('NFC'))
  const t = Math.min(tail, Math.floor(cps.length / 2))
  if (cps.length <= 10 || t < 3) return <span className="mid"><span className="mh">{cps.join('')}</span></span>
  return <span className="mid"><span className="mh">{cps.slice(0, cps.length - t).join('')}</span><span className="mt">{cps.slice(cps.length - t).join('')}</span></span>
}
export function Icon({ n, size = 16, color, style }: { n: keyof typeof I; size?: number; color?: string; style?: React.CSSProperties }) {
  return <svg className="ico" viewBox="0 0 16 16" width={size} height={size} style={{ color, ...style }}>{I[n]}</svg>
}
