import { useEffect, useMemo, useRef, useState } from 'react'
import { rank } from '../core/search'
import { api } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { useStore } from './store'
import type { Bot, SessionInfo } from '../core/types'

/**
 * 명령 팔레트 (Rondo 이식 D1) — 🔴 **한 칸에서 다 간다.**
 *
 * 레일·트리·설정이 각자 다른 자리에 있어서, «그 폴더가 어디였지 · 그 문서가 어디였지» 를 찾는 데
 * 눈이 세 번 움직였다. 여기서는 **폴더 · 문서 · 세션 · 명령**이 한 목록에 같이 선다.
 *
 * ⚠ **정렬 판정은 `core/search` 하나가 한다** — 초성·가운데 일치·NFC 맞춤이 폴더 고르기와 같아야
 *    «여기선 찾히는데 저기선 안 찾히는» 일이 안 생긴다.
 * ⚠ 문서 목록은 **열 때 한 번** 받는다 — 글자마다 트리를 훑으면 두 글자째부터 버벅인다.
 * ⛔ 되돌리기 어려운 일(지우기·은퇴)은 여기 두지 않는다 — 팔레트는 손이 빠른 자리라,
 *    한 글자 잘못 치고 ⏎ 를 누르면 그대로 실행된다.
 */
export type PalAct = { id: string; icon: 'folder' | 'doc' | 'sub' | 'gear' | 'bell' | 'plus' | 'search' | 'eye'; label: string; hint?: string; sub?: string; run: () => void }

export interface PaletteProps {
  bots: Bot[]
  bot: Bot
  sessions: SessionInfo[]
  onClose: () => void
  go: (botId: string, sessionId?: string) => void
  openDoc: (rel: string, pin?: boolean) => void
  setModal: (m: 'picker' | 'notify' | 'settings' | 'keys') => void
  newSession: () => Promise<void>
  toggle: (what: 'sb' | 'rp' | 'doc') => void
}

export function Palette(p: PaletteProps) {
  const { s } = useStore()
  const [q, setQ] = useState('')
  const [files, setFiles] = useState<string[] | null>(null)
  const [i, setI] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void api<{ rel: string; dir: boolean }[]>(`/bots/${p.bot.id}/files?depth=4`)
      .then((l) => setFiles(l.filter((n) => !n.dir).map((n) => n.rel)))
      .catch(() => setFiles([]))
  }, [p.bot.id])

  const acts = useMemo<PalAct[]>(() => {
    const out: PalAct[] = []
    // ① 명령 — 늘 같은 자리에서 시작하도록 맨 앞
    const cmd = (id: string, icon: PalAct['icon'], label: string, hint: string, run: () => void) => out.push({ id, icon, label, hint, run })
    cmd('c-picker', 'folder', '폴더 고르기 · 시작', '⌘K', () => p.setModal('picker'))
    cmd('c-new', 'plus', '새 세션', '⌘N', () => void p.newSession())
    cmd('c-notify', 'bell', '알림 센터', '⌘⇧U', () => p.setModal('notify'))
    cmd('c-set', 'gear', '설정', '⌘,', () => p.setModal('settings'))
    cmd('c-keys', 'search', '단축키 보기', '⌘/', () => p.setModal('keys'))
    cmd('c-sb', 'eye', '폴더 목록 접기 · 펴기', '⌘B', () => p.toggle('sb'))
    cmd('c-doc', 'doc', '문서 열 접기 · 펴기', '⌘⇧D', () => p.toggle('doc'))
    cmd('c-rp', 'eye', '오른쪽 패널 접기 · 펴기', '⌘⇧B', () => p.toggle('rp'))
    // ② 폴더(봇) — 지금 보고 있는 것은 뺀다(갈 데가 아니다)
    for (const b of p.bots) if (b.id !== p.bot.id) out.push({ id: `b-${b.id}`, icon: 'folder', label: b.name, sub: b.rel || '관제', run: () => p.go(b.id) })
    // ③ 이 폴더의 세션
    for (const x of p.sessions) out.push({ id: `s-${x.id}`, icon: 'sub', label: x.name, sub: `${p.bot.name} · 세션`, run: () => p.go(p.bot.id, x.id) })
    // ④ 이 폴더의 문서
    for (const rel of files ?? []) out.push({ id: `f-${rel}`, icon: 'doc', label: rel.split('/').pop() ?? rel, sub: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : p.bot.name, run: () => p.openDoc(rel, true) })
    return out
  }, [p.bots, p.bot.id, p.sessions, files, s.hostName])

  /**
   * ⑤ 지난 대화 (루프 7/10) — 두 글자부터, 200ms 쉬었다가 호스트에 묻는다(볼트 전체 · 이름과 말).
   * ⚠ 이 폴더의 세션이 이름으로 이미 걸렸으면 겹치지 않게 뺀다(같은 곳으로 가는 줄이 둘이면 헷갈린다).
   * ⚠ 답이 늦게 와서 **지금 질의와 다르면 버린다** — 빠른 타자에 옛 답이 덮어쓰는 고전적 경주.
   */
  const [hits, setHits] = useState<{ q: string; rows: PalAct[] }>({ q: '', rows: [] })
  useEffect(() => {
    const qq = q.trim()
    if (qq.length < 2) { setHits({ q: '', rows: [] }); return }
    const t = window.setTimeout(() => {
      void api<{ sessionId: string; botId: string; name: string; snippet: string; where: 'name' | 'text'; bot: string }[]>(`/search?q=${encodeURIComponent(qq)}`)
        .then((l) => setHits({ q: qq, rows: l.map((h) => ({ id: `h-${h.sessionId}`, icon: 'sub', label: h.name, sub: h.where === 'text' ? h.snippet : `${h.bot} · 대화`, hint: h.where === 'text' ? h.bot : undefined, run: () => p.go(h.botId, h.sessionId) })) }))
        .catch(() => setHits({ q: qq, rows: [] }))
    }, 200)
    return () => window.clearTimeout(t)
  }, [q])
  const rows = useMemo(() => {
    if (!q.trim()) return acts.slice(0, 40)
    const local = rank(q, acts, (a) => ({ name: a.label, path: a.sub ?? '' }), 40)
    if (hits.q !== q.trim()) return local
    const seen = new Set(local.map((a) => a.id.replace(/^s-/, 'h-')))
    return [...local, ...hits.rows.filter((h) => !seen.has(h.id))]
  }, [q, acts, hits])
  useEffect(() => { setI(0) }, [q])
  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }) }, [i, rows])

  const pick = (a?: PalAct) => { if (!a) return; p.onClose(); a.run() }
  return <><div className="backdrop" onClick={p.onClose} /><div className="modal pal">
    <div className="pq"><Icon n="search" size={14} color="var(--t3)" />
      <input autoFocus placeholder="어디로 갈까요 — 폴더 · 문서 · 세션 · 명령 · 지난 대화" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); p.onClose(); return }
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(rows.length - 1, n + 1)); return }
          if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(0, n - 1)); return }
          if (e.key === 'Enter') { e.preventDefault(); pick(rows[i]) }
        }} />
      <span className="k">⎋</span></div>
    <div className="plist" ref={listRef}>
      {rows.map((a, n) => <button key={a.id} className={`prow ${n === i ? 'on' : ''} ${a.id.startsWith('h-') ? 'hit' : ''}`} onMouseEnter={() => setI(n)} onClick={() => pick(a)}>
        {a.icon === 'folder' && a.id.startsWith('b-') ? <FolderBot color={p.bots.find((b) => `b-${b.id}` === a.id)?.color ?? '#888'} size={14} mono /> : <Icon n={a.icon} size={13} color="var(--t3)" />}
        <span className="n"><Mid s={a.label} /></span>
        {a.sub ? <span className={`sb ${a.id.startsWith('h-') && !a.hint ? '' : a.id.startsWith('h-') ? 'snip' : ''}`}><Mid s={a.sub} /></span> : null}
        {a.hint ? <span className="k">{a.hint}</span> : null}
      </button>)}
      {!rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>찾는 게 없어요</div> : null}
    </div>
  </div></>
}
