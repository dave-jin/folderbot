import { useEffect, useMemo, useRef, useState } from 'react'
import { rank, scoreName } from '../core/search'
import { STATE_LABEL, type Bot, type SessionInfo } from '../core/types'
import { api } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { useStore } from './store'

/**
 * 검색 ⌘K (2026-10-02 Dave: «전체 폴더 리스트가 늘어나면서 찾기가 어렵네. 검색하면 폴더봇 리스트 그리고 폴더봇 하단에는
 * 세션 리스트로 선택해서 들어가고 싶어» · 시안 A).
 *
 * 🔴 **폴더봇이 먼저, 세션은 그 아래** — 고른 봇 바로 밑에 그 봇의 세션이 펼쳐진다(최근 3개 + 검색어에 맞은 세션).
 *    화살표로 다른 봇에 올라가면 펼침이 그 봇으로 옮겨 간다. → 는 세션으로 내려가고 ← 는 봇으로 돌아온다. ⏎ 로 들어간다.
 * ⚠ 순위는 `core/search` 하나(초성·가운데 일치) — 명령 팔레트·폴더 고르기와 같은 판정이다.
 * ⚠ 세션 이름만 맞은 봇도 목록에 선다(«부가세» 를 치면 그 세션이 있는 재무_CFO 가 나온다).
 * ⚠ 「지난 대화」(말 내용까지 · `/api/search`)는 두 글자부터 맨 아래에.
 */
type Row = { key: string; kind: 'bot' | 'sess' | 'hit' | 'more'; botId: string; sid?: string; label: string; sub?: string; color?: string }
const SHOW = 3

export function Search({ go, onClose }: { go: (botId: string, sid?: string) => void; onClose: () => void }) {
  const { s } = useStore()
  const [q, setQ] = useState('')
  const [selKey, setSelKey] = useState('')
  const [more, setMore] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sessOf = (id: string): SessionInfo[] => s.sessionsByBot[id] ?? []
  const nameOf = (b: Bot) => b.displayName || b.name
  const qq = q.trim()

  /** 봇 순위 — 이름·경로가 맞은 봇 먼저, 세션 이름만 맞은 봇은 그 뒤 */
  const bots = useMemo(() => {
    if (!qq) return s.bots
    const byName = rank(qq, s.bots, (b) => ({ name: nameOf(b), path: `${b.name} ${b.rel}` }))
    const seen = new Set(byName.map((b) => b.id))
    const bySess = s.bots.filter((b) => !seen.has(b.id) && sessOf(b.id).some((x) => scoreName(qq, x.name, x.name) > 0))
    return [...byName, ...bySess]
  }, [qq, s.bots, s.sessionsByBot])

  const [hits, setHits] = useState<{ q: string; rows: Row[] }>({ q: '', rows: [] })
  useEffect(() => {
    if (qq.length < 2) { setHits({ q: '', rows: [] }); return }
    const t = window.setTimeout(() => {
      void api<{ sessionId: string; botId: string; name: string; snippet: string; where: 'name' | 'text'; bot: string }[]>(`/search?q=${encodeURIComponent(qq)}`)
        .then((l) => setHits({ q: qq, rows: l.filter((h) => h.where === 'text').map((h) => ({ key: `h-${h.sessionId}`, kind: 'hit' as const, botId: h.botId, sid: h.sessionId, label: h.snippet, sub: `${h.bot} · ${h.name}` })) }))
        .catch(() => setHits({ q: qq, rows: [] }))
    }, 200)
    return () => window.clearTimeout(t)
  }, [qq])

  // 펼친 봇 = 고른 줄의 봇(처음엔 맨 위 봇)
  // ⚠ «지난 대화» 줄에 올라가도 펼침은 그대로 둔다 — 마우스 밑의 줄이 밀려 다른 줄을 집게 된다
  const openRef = useRef('')
  if (!selKey) openRef.current = bots[0]?.id ?? ''
  else if (!selKey.startsWith('h-')) openRef.current = selKey.replace(/^[bsm]-/, '').split('|')[0]
  const openBot = openRef.current
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const b of bots) {
      const ss = sessOf(b.id)
      out.push({ key: `b-${b.id}`, kind: 'bot', botId: b.id, label: nameOf(b), sub: `${b.rel || '관제'} · 세션 ${ss.length}`, color: b.color })
      if (b.id !== openBot) continue
      // 검색어에 맞은 세션 먼저, 그다음 최근(소통 세션은 맨 위에 고정된 그대로)
      const hit = qq ? ss.filter((x) => scoreName(qq, x.name, x.name) > 0) : []
      const rest = ss.filter((x) => !hit.includes(x))
      const list = [...hit, ...rest]
      const shown = more === b.id ? list : list.slice(0, Math.max(SHOW, hit.length))
      for (const x of shown) out.push({ key: `s-${b.id}|${x.id}`, kind: 'sess', botId: b.id, sid: x.id, label: x.name, sub: STATE_LABEL[x.state] })
      if (shown.length < list.length) out.push({ key: `m-${b.id}`, kind: 'more', botId: b.id, label: `세션 ${list.length - shown.length}개 더 보기…` })
    }
    if (hits.q === qq) out.push(...hits.rows)
    return out
  }, [bots, openBot, qq, more, hits, s.sessionsByBot])

  useEffect(() => { setSelKey(''); setMore(null) }, [qq])
  const i = Math.max(0, rows.findIndex((r) => r.key === selKey))
  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }) }, [i, rows])

  const pick = (r?: Row) => {
    if (!r) return
    if (r.kind === 'more') { setMore(r.botId); return }
    onClose(); go(r.botId, r.sid)
  }
  const move = (d: number) => { const n = Math.min(rows.length - 1, Math.max(0, i + d)); if (rows[n]) setSelKey(rows[n].key) }

  return <><div className="backdrop" onClick={onClose} /><div className="modal pal srch">
    <div className="pq"><Icon n="search" size={14} color="var(--t3)" />
      <input autoFocus placeholder="폴더봇 · 세션 찾기 — 이름 · 초성 · 지난 대화" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return }
          if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return }
          // → 봇에서 그 봇의 첫 세션으로 · ← 세션에서 봇으로 (글자 사이를 움직일 때는 가로채지 않는다)
          if (e.key === 'ArrowRight' && rows[i]?.kind === 'bot' && e.currentTarget.selectionStart === q.length) { const nx = rows[i + 1]; if (nx?.kind === 'sess') { e.preventDefault(); setSelKey(nx.key) } return }
          if (e.key === 'ArrowLeft' && rows[i]?.kind === 'sess' && e.currentTarget.selectionStart === 0) { e.preventDefault(); setSelKey(`b-${rows[i].botId}`); return }
          if (e.key === 'Enter') { e.preventDefault(); pick(rows[i]) }
        }} />
      <span className="k">⌘K</span></div>
    <div className="plist" ref={listRef}>
      {rows.map((r, n) => {
        const firstHit = r.kind === 'hit' && rows[n - 1]?.kind !== 'hit'
        return <div key={r.key} style={{ display: 'contents' }}>
          {firstHit ? <div className="sgrp">지난 대화</div> : null}
          <button className={`prow ${r.kind} ${n === i ? 'on' : ''}`} onMouseEnter={() => setSelKey(r.key)} onClick={() => pick(r)}>
            {r.kind === 'bot' ? <FolderBot color={r.color ?? '#888'} size={14} mono /> : r.kind === 'hit' ? <Icon n="sub" size={13} color="var(--t3)" /> : null}
            <span className="n"><Mid s={r.label} /></span>
            {r.sub ? <span className={`sb ${r.kind === 'hit' ? 'snip' : ''}`}><Mid s={r.sub} /></span> : null}
          </button>
        </div>
      })}
      {!rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>찾는 게 없어요</div> : null}
    </div>
    <div className="sfoot"><span>↑↓ 고르기</span><span>→ 세션으로</span><span>⏎ 들어가기</span><span>⎋ 닫기</span></div>
  </div></>
}
