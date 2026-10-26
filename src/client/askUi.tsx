import { useEffect, useState } from 'react'
import type { Bot, SessionInfo } from '../core/types'
import { askLabel, askLifted, type AskBadge } from '../core/askMark'
import { api } from './api'
import { Float, anchorOf, type Anchor } from './Float'
import { FolderBot } from './FolderBot'
import { useStore } from './store'

/**
 * DB · ask 세션 보이기 — 화면 쪽 (판정은 `core/askMark`).
 *  - 1안(기본 켬) `lift` — 왼쪽 목록(폰은 첫 화면) 맨 위 줄 + 그 봇 세션 목록 맨 위
 *  - 2안(기본 끔) `chip` — 목록 머리에 «ask 대기 N건» 칩 · 누르면 기다리는 세션 목록
 *  - 3안(기본 끔) `expand` — ask 가 도는 동안 «자동화» 묶음을 저절로 펼치고 그 세션을 강조
 * 이 기기에만 남는 값이다(테마·폴더봇 크기와 같은 자리).
 */
export interface AskPrefs { lift: boolean; chip: boolean; expand: boolean }
const KEY = 'fb:askui'
const DEF: AskPrefs = { lift: true, chip: false, expand: false }
function readPrefs(): AskPrefs { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEF } }
export function useAskPrefs(): [AskPrefs, (p: Partial<AskPrefs>) => void] {
  const [v, set] = useState<AskPrefs>(readPrefs)
  useEffect(() => { const f = () => set(readPrefs()); window.addEventListener('fb:askui', f); return () => window.removeEventListener('fb:askui', f) }, [])
  const save = (p: Partial<AskPrefs>) => { const n = { ...readPrefs(), ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* */ } set(n); window.dispatchEvent(new Event('fb:askui')) }
  return [v, save]
}

/** «답함 · 3분 전» 과 10분 뒤 내리기가 저절로 바뀌게 — 올린 것이 있을 때만 30초마다 */
export function useAskNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!on) return; setNow(Date.now()); const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t) }, [on])
  return on ? now : Date.now()
}

/** 볼트 전체에서 올릴 ask 세션 — 시작한 순서대로 */
export function useAskRows(): { s: SessionInfo; b: AskBadge; bot: Bot }[] {
  const { s } = useStore()
  const all = Object.values(s.sessionsByBot).flat()
  const any = all.some((x) => x.asks?.length)
  const now = useAskNow(any)
  if (!any) return []
  return askLifted(all, now).map((x) => ({ ...x, bot: s.bots.find((b) => b.id === x.s.botId)! })).filter((x) => x.bot)
}

/** 연 ask 세션의 «답함» 을 내린다 — 실패해도 10분 뒤 저절로 내려간다 */
export function askOpened(sid: string): void { void api(`/sessions/${sid}/ask-seen`, { body: {} }).catch(() => undefined) }

/**
 * 1안 · 왼쪽 목록(폰 첫 화면) 맨 위 — «할일이가 묻는 중 · 제품_FolderBot» 줄. 누르면 그 대화가 바로 열린다.
 * ⚠ 줄은 잘리지 않고 접혀 내려간다(좁은 창에서도 폴더 이름까지 다 읽혀야 찾는다).
 */
export function AskStrip({ go, phone }: { go: (botId: string, sid?: string) => void; phone?: boolean }) {
  const [p] = useAskPrefs()
  const rows = useAskRows()
  if (!p.lift || !rows.length) return null
  return <div className={`askstrip ${phone ? 'm' : ''}`} data-sec="ask">
    <div className="secl">바깥에서 묻는 중</div>
    {rows.map(({ s, b, bot }) => <AskRow key={s.id} s={s} b={b} bot={bot} go={go} phone={phone} />)}
  </div>
}
function AskRow({ s, b, bot, go, phone }: { s: SessionInfo; b: AskBadge; bot: Bot; go: (botId: string, sid?: string) => void; phone?: boolean }) {
  const open = () => { if (b.state === 'answered') askOpened(s.id); go(bot.id, s.id) }
  return <button className={`askrow ${b.state} ${b.err ? 'err' : ''}`} data-sid={s.id} onClick={open} title={`${bot.name} · ${s.name}`}>
    <FolderBot color={bot.color} size={phone ? 30 : 18} mood={b.state === 'asking' ? (s.state === 'awaiting_input' ? 'wait' : 'work') : b.err ? 'error' : 'done'} mono />
    <span className="t"><b>{askLabel(b)}</b><span className="f">{bot.displayName || bot.name}</span></span>
    <span className={`dot ${b.state === 'asking' ? (s.state === 'awaiting_input' ? 'wait' : 'run') : b.err ? 'err' : 'unread'}`} />
  </button>
}

/** 2안 · «ask 대기 N건» 칩 — 묻는 중인 것만 센다. 누르면 기다리는 세션 목록 */
export function AskChip({ go }: { go: (botId: string, sid?: string) => void }) {
  const [p] = useAskPrefs()
  const rows = useAskRows().filter((x) => x.b.state === 'asking')
  const [at, setAt] = useState<Anchor | null>(null)
  if (!p.chip || !rows.length) return null
  return <>
    <button className="askchip" onClick={(e) => setAt(at ? null : anchorOf(e.currentTarget as HTMLElement, { gap: 6 }))} title="바깥 상대가 묻고 기다리는 세션">ask 대기 {rows.length}건</button>
    {at ? <Float at={at} onClose={() => setAt(null)}>{rows.map(({ s, b, bot }) => <button key={s.id} onClick={() => { setAt(null); go(bot.id, s.id) }}><span className="dot run" /><span style={{ flex: 1 }}>{askLabel(b)} · {bot.displayName || bot.name}</span></button>)}</Float> : null}
  </>
}
