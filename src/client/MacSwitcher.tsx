import { useEffect, useRef, useState } from 'react'
import { Float, anchorOf, type Anchor } from './Float'

/**
 * 여러 맥 — 왼쪽 아래 전환기 (2026-11-19 · 첫 외부 고객: «늘 켜 둔 맥 여러 대를 오가고 싶다»).
 *
 * 지금 «● mac-mini» 가 있던 자리를 누르는 단추로 바꾼다. 누르면 맥 목록이 위로 뜨고, 보고 있지 않은 맥의 답 대기가 배지로 붙는다.
 * 🔴 **맥 앱이 아니면(브라우저·폰) 지금과 똑같이 그린다** — 맥 목록은 맥 앱(셸)만 가진다. 폰은 맥마다 홈 화면 앱을 따로 둔다(11/19 Dave).
 * ⚠ 판정과 저장은 셸(`desktop/main.js` · `macs.js`)이 한다. 여기는 `folderbotDesktop.macs` 가 준 목록을 그리기만 한다.
 * 목업 `03_디자인/2026-11-19_여러-맥-오가기-목업/여러-맥-오가기.html` ①
 */
export interface MacView { id: string; name: string; url: string; local: boolean; state: 'on' | 'off' | 'auth'; waiting: number; working: number; lastSeen: number; active: boolean; shortcut: number; old: boolean }
interface MacsBridge { list: () => Promise<MacView[]>; onChange: (cb: (l: MacView[]) => void) => () => void; switchTo: (id: string) => void; manage: () => void }
const bridge = (): MacsBridge | undefined => (window as unknown as { folderbotDesktop?: { macs?: MacsBridge } }).folderbotDesktop?.macs

const hhmm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export function macLine(m: MacView): string {
  if (m.state === 'auth') return '다시 페어링 필요'
  if (m.state === 'off') return m.lastSeen ? `닿지 않음 · 마지막 ${hhmm(m.lastSeen)}` : '닿지 않음'
  return m.working ? `일하는 중 ${m.working}` : '쉼'
}

function useMacs(): MacView[] | null {
  const M = bridge()
  const [macs, setMacs] = useState<MacView[] | null>(null)
  useEffect(() => {
    if (!M) return
    let live = true
    void M.list().then((l) => { if (live) setMacs(l) }).catch(() => {})
    const off = M.onChange((l) => setMacs(l))
    return () => { live = false; off() }
  }, [M])
  return macs
}

/**
 * 다른 맥의 답 대기 합 — 왼쪽 아래 맥 줄 **아래 한 줄**. 🔴 같은 줄에 두면 «메인»·Inbox·판 칩과 다투다 맥 이름이 0 으로 줄었다(11/19 실측).
 * 맥이 1대거나 다른 맥에 답 대기가 없으면 아무것도 안 그린다(지금 화면 그대로).
 */
export function MacOthers() {
  const macs = useMacs()
  if (!macs || macs.length < 2) return null
  const n = macs.filter((m) => !m.active).reduce((a, m) => a + m.waiting, 0)
  return n ? <div className="r2 mac-others">· 다른 맥 {n}</div> : null
}

export function MacSwitcher({ hostName, online }: { hostName: string; online: boolean }) {
  const M = bridge()
  const macs = useMacs()
  const [at, setAt] = useState<Anchor | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  // 맥 앱이 아니면 — 지금과 같은 마크업
  if (!M || !macs) return <><span className={`dot ${online ? 'done' : 'err'}`} /><span className="hn">{hostName}</span></>
  const cur = macs.find((m) => m.active)
  const dot = (m: MacView) => (m.state === 'auth' ? 'err' : m.state === 'off' ? 'off' : m.waiting ? 'wait' : 'done')
  return <>
    <button ref={btn} className={`mac-sw ${at ? 'on' : ''}`} title="맥 바꾸기" aria-haspopup="menu" aria-expanded={!!at}
      onClick={() => { if (at) setAt(null); else if (btn.current) setAt({ ...anchorOf(btn.current), up: true, y: btn.current.getBoundingClientRect().top - 6 }) }}>
      <span className={`dot ${cur ? dot(cur) : online ? 'done' : 'err'}`} /><span className="hn">{cur?.name || hostName}</span>
    </button>
    {at ? <Float at={at} onClose={() => setAt(null)} className="menu macpop" width={288}>
      <div className="g">맥 {macs.length}대</div>
      {macs.map((m) => <button key={m.id} className={`mrow ${m.active ? 'cur' : ''} ${m.state !== 'on' ? 'dim' : ''}`} role="menuitem"
        onClick={() => { setAt(null); if (!m.active) M.switchTo(m.id) }}>
        <span className={`dot ${dot(m)}`} />
        <span className="nm"><b>{m.name}{m.active ? <em> 지금</em> : null}</b><small>{macLine(m)}</small></span>
        <span className="rt">{m.waiting && !m.active ? <span className="mbadge">내 답 기다림 {m.waiting}</span> : null}{m.shortcut ? <kbd>⌃⌘{m.shortcut}</kbd> : null}</span>
      </button>)}
      <hr />
      <button className="mact" role="menuitem" onClick={() => { setAt(null); M.manage() }}>＋ 맥 추가<span className="rt"><kbd>페어링 코드</kbd></span></button>
      <button className="mact" role="menuitem" onClick={() => { setAt(null); M.manage() }}>맥 관리…</button>
    </Float> : null}
  </>
}
