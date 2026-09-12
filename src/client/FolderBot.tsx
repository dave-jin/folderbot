import type React from "react"
import type { SessionState } from '../core/types'

export type Mood = 'idle' | 'work' | 'wait' | 'done' | 'sleep' | 'error'
export function moodOf(state?: SessionState | null, hibernated = false): Mood {
  if (hibernated && (!state || state === 'idle')) return 'sleep'
  switch (state) { case 'running': return 'work'; case 'awaiting_input': return 'wait'; case 'done': return 'done'; case 'error': return 'error'; default: return 'idle' }
}

/** 폴더봇 — 탭 달린 뒷판 + 얼굴 있는 앞판. 표정 = 상태 */
export function FolderBot({ color, size = 36, mood = 'idle', mono = false }: { color: string; size?: number; mood?: Mood; mono?: boolean }) {
  const d = mono ? '#000' : 'rgba(0,0,0,.6)'
  const eyes: Record<Mood, React.ReactNode> = {
    idle: <><rect x="20" y="30" width="6" height="10" rx="3" fill={d} /><rect x="38" y="30" width="6" height="10" rx="3" fill={d} /></>,
    work: <><rect x="20" y="33" width="6" height="8" rx="3" fill={d} /><rect x="38" y="33" width="6" height="8" rx="3" fill={d} /><path d="M27 46h10" stroke={d} strokeWidth="3" strokeLinecap="round" /></>,
    wait: <><rect x="20" y="30" width="6" height="10" rx="3" fill={d} /><rect x="38" y="30" width="6" height="10" rx="3" fill={d} /><circle cx="32" cy="47" r="3" fill={d} /><path d="M50 14v10M50 28v2" stroke="#f5a623" strokeWidth="4" strokeLinecap="round" /></>,
    done: <><path d="M19 34c2-3 6-3 8 0M37 34c2-3 6-3 8 0" stroke={d} strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M26 44c3 4 9 4 12 0" stroke={d} strokeWidth="3" fill="none" strokeLinecap="round" /></>,
    sleep: <><path d="M19 36h8M37 36h8" stroke={d} strokeWidth="3" strokeLinecap="round" /><text x="46" y="20" fontSize="12" fontWeight="700" fill={d} fontFamily="system-ui">z</text></>,
    error: <><path d="M19 30l7 7M26 30l-7 7M37 30l7 7M44 30l-7 7" stroke={d} strokeWidth="3" strokeLinecap="round" /><path d="M27 47c3-3 9-3 12 0" stroke={d} strokeWidth="3" fill="none" strokeLinecap="round" /></>
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ flex: 'none', display: 'block' }} className={`fb fb-${mood}`}>
      <path d="M6 14a4 4 0 0 1 4-4h14l5 5h29a4 4 0 0 1 4 4v33a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill={color} opacity=".55" />
      <path d="M6 24a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill={color} />
      {eyes[mood]}
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
  phone: <><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" /><path d="M7 12.5h2" /></>
}
export function Icon({ n, size = 16, color, style }: { n: keyof typeof I; size?: number; color?: string; style?: React.CSSProperties }) {
  return <svg className="ico" viewBox="0 0 16 16" width={size} height={size} style={{ color, ...style }}>{I[n]}</svg>
}
