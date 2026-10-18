import { useEffect, useMemo, useRef, useState } from 'react'
import { rank, scoreName } from '../core/search'
import { agoShort, dueShort, finderGroups, lastReadOf, paraOf, PARA_WORD, type Para } from '../core/folderFind'
import { sessArea } from '../core/autoArea'
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
 *
 * 🔴 **DE · A안** (2026-10-19 Dave · 목업 `03_디자인/2026-10-18_폴더찾기-PARA-목업`) — 검색어가 없으면 오케스트레이터 → «최근 N»(최대 5)
 *    → PARA 칸(1. Projects · 2. Area · …). 최근 = 그 봇 세션을 사람이 마지막으로 연 시각. 칸 나누기는 `core/folderFind` 하나가 정한다.
 *    칸 머리는 고르는 줄이 아니다 — ↑↓ 는 봇·세션 줄만 밟는다. 검색어를 치면 칸 머리를 걷고 맞는 순서로, 줄 왼쪽 칸 표식(P·A·R)을 남긴다.
 */
type Head = { label: string; n: number; para: Para | null }
type Row = { key: string; kind: 'bot' | 'sess' | 'hit' | 'more'; botId: string; sid?: string; label: string; sub?: string; color?: string; para?: Para | null; tm?: string; head?: Head }
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

  // ⚠ 채팅 세션만 센다 — 알림 «모두 읽음» 은 루틴·소통 세션의 읽음까지 올려, 새벽 루틴이 돈 폴더가 위로 올라온다(리뷰 10/19)
  const readOf = (id: string) => lastReadOf((s.sessionsByBot[id] ?? []).filter((x) => sessArea(x) === 'chat'))
  /**
   * 봇 차례와 칸 머리. 검색어가 없으면 A안 칸(`finderGroups`), 있으면 이름·경로가 맞은 봇 먼저, 세션 이름만 맞은 봇은 그 뒤.
   * `heads` 는 «그 칸의 첫 봇 id → 칸 머리» — 머리는 줄이 아니라 줄 앞에 붙는 표시다.
   */
  const { bots, heads, recent } = useMemo(() => {
    if (!qq) {
      const g = finderGroups(s.bots, readOf)
      const heads = new Map<string, Head>()
      for (const x of g) if (x.key !== 'orch') heads.set(x.bots[0].id, { label: x.label, n: x.bots.length, para: x.para })
      return { bots: g.flatMap((x) => x.bots), heads, recent: new Set(g.find((x) => x.key === 'recent')?.bots.map((b) => b.id) ?? []) }
    }
    const byName = rank(qq, s.bots, (b) => ({ name: nameOf(b), path: `${b.name} ${b.rel}` }))
    const seen = new Set(byName.map((b) => b.id))
    const bySess = s.bots.filter((b) => !seen.has(b.id) && sessOf(b.id).some((x) => scoreName(qq, x.name, x.name) > 0))
    return { bots: [...byName, ...bySess], heads: new Map<string, Head>(), recent: new Set<string>() }
  }, [qq, s.bots, s.sessionsByBot])
  /** 칸 이름 — 봇이 든 실제 칸 폴더명(«2. Area») · 칸 밖이면 rel */
  const secOf = (b: Bot) => b.section || PARA_WORD[paraOf(b.rel) ?? 'P']

  const [hits, setHits] = useState<{ q: string; rows: Row[] }>({ q: '', rows: [] })
  useEffect(() => {
    if (qq.length < 2) { setHits({ q: '', rows: [] }); return }
    const t = window.setTimeout(() => {
      void api<{ sessionId: string; botId: string; name: string; snippet: string; where: 'name' | 'text'; bot: string }[]>(`/search?q=${encodeURIComponent(qq)}`)
        .then((l) => setHits({ q: qq, rows: l.filter((h) => h.where === 'text').map((h) => ({ key: `h-${h.sessionId}`, kind: 'hit' as const, botId: h.botId, sid: h.sessionId, label: h.snippet, sub: `${h.bot} · ${h.name}` })) }))
        .catch(() => setHits({ q: qq, rows: [] }))
    }, 100)   // CF-1 · 200 → 100ms — 이름 결과는 이미 즉시이고, 본문 결과만 앞당긴다
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
      const para = b.orchestrator ? null : paraOf(b.rel)
      // 줄 모양 — 관제는 «관제 · 세션 N» · 최근 칸과 검색 결과는 칸 표식(P·A·R) + «칸 · 날짜» · PARA 칸 안은 폴더 아이콘 + «날짜 마감»
      const marked = !b.orchestrator && (!!qq || recent.has(b.id))
      const due = dueShort(b.due)
      const sub = b.orchestrator ? `관제 · 세션 ${ss.length}`
        : marked ? (para ? `${secOf(b)}${para === 'P' && due ? ` · ${due}` : ''}` : b.rel)
        : para === 'P' && due ? `${due} 마감` : para ? '' : b.rel
      out.push({ key: `b-${b.id}`, kind: 'bot', botId: b.id, label: nameOf(b), sub: sub || undefined, color: b.color, para: marked ? para : null, tm: b.orchestrator ? undefined : agoShort(readOf(b.id)), head: heads.get(b.id) })
      if (b.id !== openBot) continue
      // 검색어에 맞은 세션 먼저, 그다음 화면 목록 차례(CC A안 — 채팅이 앞, 자동화가 뒤)
      const hit = qq ? ss.filter((x) => scoreName(qq, x.name, x.name) > 0) : []
      const rest = ss.filter((x) => !hit.includes(x))
      const list = [...hit, ...rest]
      const shown = more === b.id ? list : list.slice(0, Math.max(SHOW, hit.length))
      for (const x of shown) out.push({ key: `s-${b.id}|${x.id}`, kind: 'sess', botId: b.id, sid: x.id, label: x.name, sub: STATE_LABEL[x.state] })
      if (shown.length < list.length) out.push({ key: `m-${b.id}`, kind: 'more', botId: b.id, label: `세션 ${list.length - shown.length}개 더 보기…` })
    }
    if (hits.q === qq) out.push(...hits.rows)
    return out
  }, [bots, heads, recent, openBot, qq, more, hits, s.sessionsByBot])

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
          {r.head ? <div className="sgrp fhd" data-head={r.head.para ?? (r.head.label === '최근' ? 'recent' : 'other')}>{r.head.para ? <i className={`fsq p-${r.head.para}`} /> : null}<span>{r.head.label}</span><span className="n">{r.head.n}</span></div> : null}
          <button className={`prow ${r.kind} ${n === i ? 'on' : ''}`} data-bot={r.kind === 'bot' ? r.botId : undefined} onMouseEnter={() => setSelKey(r.key)} onClick={() => pick(r)}>
            {r.kind === 'bot' ? (r.para ? <span className={`fpara p-${r.para}`}>{r.para}</span> : <FolderBot color={r.color ?? '#888'} size={14} mono />) : r.kind === 'hit' ? <Icon n="sub" size={13} color="var(--t3)" /> : null}
            <span className="n"><Mid s={r.label} /></span>
            {r.sub ? <span className={`sb ${r.kind === 'hit' ? 'snip' : ''}`}><Mid s={r.sub} /></span> : r.kind === 'bot' ? <span className="sb" /> : null}
            {r.tm ? <span className="ftm">{r.tm}</span> : null}
          </button>
        </div>
      })}
      {!rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>찾는 게 없어요</div> : null}
    </div>
    <div className="sfoot"><span>↑↓ 고르기</span><span>→ 세션으로</span><span>⏎ 들어가기</span><span>⎋ 닫기</span></div>
  </div></>
}
