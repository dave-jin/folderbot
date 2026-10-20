import { useEffect, useMemo, useRef, useState } from 'react'
import { rank, scoreName } from '../core/search'
import { agoShort, dueShort, finderGroups, lastReadOf, paraOf, PARA_WORD, type Para } from '../core/folderFind'
import { freezeOrder, isLive, liveOrder, liveSince, liveView, type LiveView } from '../core/liveFind'
import { sessArea } from '../core/autoArea'
import { STATE_LABEL, type Bot, type SessionInfo } from '../core/types'
import { api } from './api'
import { FolderBot, Icon, Mid } from './FolderBot'
import { useStore } from './store'

/**
 * 검색 ⌘K (2026-10-02 Dave: «전체 폴더 리스트가 늘어나면서 찾기가 어렵네. 검색하면 폴더봇 리스트 그리고 폴더봇 하단에는
 * 세션 리스트로 선택해서 들어가고 싶어» · 시안 A).
 *
 * ⚠ 순위는 `core/search` 하나(초성·가운데 일치) — 명령 팔레트·폴더 고르기와 같은 판정이다.
 * ⚠ 세션 이름만 맞은 봇도 목록에 선다(«부가세» 를 치면 그 세션이 있는 재무_CFO 가 나온다) — 맞은 세션은 그 봇 아래에 펼친 채로.
 * ⚠ 「지난 대화」(말 내용까지 · `/api/search`)는 두 글자부터 맨 아래에.
 *
 * 🔴 **DE · A안** (2026-10-19 Dave · 목업 `03_디자인/2026-10-18_폴더찾기-PARA-목업`) — 검색어가 없으면 오케스트레이터 → «최근»
 *    → PARA 칸(1. Projects · 2. Area · …). 최근 = 그 봇 세션을 사람이 마지막으로 연 시각. 칸 나누기는 `core/folderFind` 하나가 정한다.
 *    칸 머리는 고르는 줄이 아니다. 검색어를 치면 칸 머리를 걷고 맞는 순서로, 줄 왼쪽 칸 표식(P·A·R)을 남긴다.
 *
 * 🔴 **DF · 움직이는 세션 낱줄** (2026-10-20 Dave · 목업 `03_디자인/2026-10-20_찾기-실시간-목업` v2 «낱줄») —
 *    «최근» 맨 위에 **지금 움직이는 세션을 개수 제한 없이** 두 줄로 세운다(이름 · 폴더 · 경과 / 지금 하는 일). 차례·말은 `core/liveFind`.
 *    그 아래 «최근에 연 폴더» 다섯(위에 나온 폴더는 빼고). 연 동안 차례는 그대로 — 끝난 세션은 «방금 끝났어요» 로 자리를 지킨다.
 * 🔴 **↑↓ 는 보이는 줄만 밟는다** (Dave: «위아래 이동하면 폴더만 이동되고 클릭, 엔터, → 를 누르면 그때 서브 세션들이 보이면 좋겠어»).
 *    폴더는 닫힌 상자 — → · ⏎ · 클릭으로 펼치고 ← · ⎋ 로 접는다. 세션이 하나뿐인 폴더는 ⏎ 로 바로 들어간다. ⌘⏎ · 두 번 클릭은 폴더째.
 *    움직이는 세션에서 → 는 같은 폴더의 쉬는 세션을 흐리게 편다.
 */
type Head = { key: string; label: string; n: number; para: Para | null; live?: number }
type Kind = 'bot' | 'live' | 'sess' | 'idle' | 'hit' | 'more'
type Row = {
  key: string; kind: Kind; botId: string; sid?: string; label: string; sub?: string; color?: string; para?: Para | null; tm?: string
  head?: Head; sh?: string; grp?: string; v?: LiveView; chip?: { name: string; para: Para | null; color: string }; routine?: boolean; flash?: boolean; n?: number
}
const SHOW = 5
const FLASH_MS = 1700

export function Search({ go, onClose }: { go: (botId: string, sid?: string) => void; onClose: () => void }) {
  const { s } = useStore()
  const [q, setQ] = useState('')
  const [selKey, setSelKey] = useState('')
  const [open, setOpen] = useState<string | null>(null)     // 펼친 폴더
  const [aopen, setAopen] = useState<string | null>(null)   // 쉬는 세션을 편 움직이는 세션 줄
  const [more, setMore] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  const listRef = useRef<HTMLDivElement>(null)
  const sessOf = (id: string): SessionInfo[] => s.sessionsByBot[id] ?? []
  const nameOf = (b: Bot) => b.displayName || b.name
  const qq = q.trim()

  // ⚠ 채팅 세션만 센다 — 알림 «모두 읽음» 은 루틴·소통 세션의 읽음까지 올려, 새벽 루틴이 돈 폴더가 위로 올라온다(리뷰 10/19)
  const readOf = (id: string) => lastReadOf((s.sessionsByBot[id] ?? []).filter((x) => sessArea(x) === 'chat'))
  /** 칸 이름 — 봇이 든 실제 칸 폴더명(«2. Area») · 칸 밖이면 rel */
  const secOf = (b: Bot) => b.section || PARA_WORD[paraOf(b.rel) ?? 'P']

  /**
   * DF · 움직이는 세션 — 차례는 연 순간 정하고 연 동안 묶는다(`freezeOrder`). 끝난 세션이 걸린 시간은 끝난 걸 본 순간 잰다.
   * ⚠ 오케스트레이터 세션은 빼다 — 그 줄은 맨 위 한 줄이 상태로 말한다(목업 «위 칸에 한 번 더 넣지 않는다»).
   */
  const orderRef = useRef<string[] | null>(null)
  const sinceRef = useRef(new Map<string, number>())
  const tookRef = useRef(new Map<string, number>())
  const flashRef = useRef(new Map<string, number>())
  const live = useMemo(() => {
    const idx = new Map<string, { b: Bot; x: SessionInfo }>()
    for (const b of s.bots) if (!b.orchestrator) for (const x of sessOf(b.id)) idx.set(x.id, { b, x })
    const cands = liveOrder([...idx.values()].map((e) => e.x).filter((x) => isLive(x, now)), now).map((x) => x.id)
    const { order, added } = freezeOrder(orderRef.current, cands, (id) => idx.has(id))
    if (orderRef.current) for (const id of added) flashRef.current.set(id, now)
    orderRef.current = order
    const out = order.map((id) => {
      const { b, x } = idx.get(id)!
      if (isLive(x, now)) { sinceRef.current.set(id, liveSince(x)); tookRef.current.delete(id) }
      else if (!tookRef.current.has(id)) tookRef.current.set(id, now - (sinceRef.current.get(id) ?? now))
      return { b, x, v: liveView(x, now, tookRef.current.get(id)) }
    })
    return { list: out, bots: new Set(out.map((e) => e.b.id)) }
  }, [s.bots, s.sessionsByBot, now])

  /** 폴더 줄에 쓸 «지금» — 그 폴더에서 가장 급한 움직이는 세션 */
  const liveOfBot = (id: string) => { const l = liveOrder(sessOf(id).filter((x) => isLive(x, now)), now)[0]; return l ? { x: l, v: liveView(l, now) } : null }

  /**
   * 봇 차례와 칸 머리. 검색어가 없으면 A안 칸(`finderGroups` · 움직이는 폴더는 위 칸에 나왔으니 뺀다), 있으면 이름·경로가 맞은 봇 먼저,
   * 세션 이름만 맞은 봇은 그 뒤. `heads` 는 «그 칸의 첫 봇 id → 칸 머리».
   */
  const { orch, bots, heads, recent } = useMemo(() => {
    if (!qq) {
      const g = finderGroups(s.bots.filter((b) => !live.bots.has(b.id)), readOf)
      const heads = new Map<string, Head>()
      for (const x of g) if (x.key !== 'orch' && x.key !== 'recent') heads.set(x.bots[0].id, { key: x.para ?? x.key, label: x.label, n: x.bots.length, para: x.para })
      const rec = g.find((x) => x.key === 'recent')?.bots ?? []
      return { orch: g.find((x) => x.key === 'orch')?.bots ?? [], bots: g.filter((x) => x.key !== 'orch').flatMap((x) => x.bots), heads, recent: new Set(rec.map((b) => b.id)) }
    }
    const byName = rank(qq, s.bots, (b) => ({ name: nameOf(b), path: `${b.name} ${b.rel}` }))
    const seen = new Set(byName.map((b) => b.id))
    const bySess = s.bots.filter((b) => !seen.has(b.id) && sessOf(b.id).some((x) => scoreName(qq, x.name, x.name) > 0))
    return { orch: [] as Bot[], bots: [...byName, ...bySess], heads: new Map<string, Head>(), recent: new Set<string>() }
  }, [qq, s.bots, s.sessionsByBot, live.bots])

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

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const sessRow = (b: Bot, x: SessionInfo, kind: 'sess' | 'idle', grp: string): Row => {
      const v = isLive(x, now) ? liveView(x, now) : null
      return { key: `${kind === 'idle' ? 'i' : 's'}-${b.id}|${x.id}`, kind, botId: b.id, sid: x.id, label: x.name, grp, routine: !!x.routine, v: v ?? undefined, sub: v ? v.text : x.state === 'idle' ? undefined : STATE_LABEL[x.state], tm: v ? v.tm : agoShort(x.lastActivity, now) }
    }
    const folder = (b: Bot) => {
      const ss = sessOf(b.id)
      const para = b.orchestrator ? null : paraOf(b.rel)
      // 줄 모양 — 관제는 «관제 · 세션 N» · 최근 칸과 검색 결과는 칸 표식(P·A·R) + «칸 · 날짜» · PARA 칸 안은 폴더 아이콘 + «날짜 마감»
      // DF · 움직이는 세션이 있으면 그 자리에 «세션 이름 · 지금 하는 일» 과 경과(관제 줄 · 검색 결과)
      const marked = !b.orchestrator && (!!qq || recent.has(b.id))
      const due = dueShort(b.due)
      const lv = liveOfBot(b.id)
      const sub = lv ? `${lv.x.name} · ${lv.v.text}`
        : b.orchestrator ? `관제 · 세션 ${ss.length}`
          : marked ? (para ? `${secOf(b)}${para === 'P' && due ? ` · ${due}` : ''}` : b.rel)
            : para === 'P' && due ? `${due} 마감` : para ? '' : b.rel
      out.push({ key: `b-${b.id}`, kind: 'bot', botId: b.id, label: nameOf(b), sub: sub || undefined, color: b.color, para: marked ? para : null, v: lv?.v, tm: lv ? lv.v.tm : b.orchestrator ? undefined : agoShort(readOf(b.id), now), head: heads.get(b.id), n: ss.length })
      // 검색어에 맞은 세션은 늘 펴 둔다(찾던 것이 그것이다) · 그 밖은 펼친 폴더만
      const hit = qq ? ss.filter((x) => scoreName(qq, x.name, x.name) > 0) : []
      if (open !== b.id) { for (const x of hit) out.push(sessRow(b, x, 'sess', b.id)); return }
      const list = [...hit, ...ss.filter((x) => !hit.includes(x))]
      const shown = more === b.id ? list : list.slice(0, Math.max(SHOW, hit.length))
      for (const x of shown) out.push(sessRow(b, x, 'sess', b.id))
      if (shown.length < list.length) out.push({ key: `m-${b.id}`, kind: 'more', botId: b.id, grp: b.id, label: `세션 ${list.length - shown.length}개 더 보기…` })
    }
    for (const b of orch) folder(b)
    if (!qq) {
      const recHead: Head = { key: 'recent', label: '최근', n: recent.size, para: null, live: live.list.length }
      let first = true
      for (const { b, x, v } of live.list) {
        const k = `l-${x.id}`, ft = flashRef.current.get(x.id)
        out.push({ key: k, kind: 'live', botId: b.id, sid: x.id, label: x.name, v, routine: !!x.routine, flash: ft != null && now - ft < FLASH_MS,
          chip: { name: nameOf(b), para: paraOf(b.rel), color: b.color }, head: first ? recHead : undefined, sh: first ? '지금 움직이는 세션' : undefined })
        first = false
        if (aopen === k) for (const y of sessOf(b.id)) if (!live.list.some((e) => e.x.id === y.id)) out.push(sessRow(b, y, 'idle', 'a'))
      }
      let firstRec = true
      for (const b of bots) {
        const at = out.length
        folder(b)
        if (recent.has(b.id) && firstRec) {
          out[at] = { ...out[at], head: live.list.length ? undefined : recHead, sh: live.list.length ? '최근에 연 폴더' : undefined }
          firstRec = false
        }
      }
    } else for (const b of bots) folder(b)
    if (hits.q === qq) out.push(...hits.rows)
    return out
  }, [orch, bots, heads, recent, live, open, aopen, qq, more, hits, now, s.sessionsByBot])

  useEffect(() => { setSelKey(''); setMore(null); setOpen(null); setAopen(null) }, [qq])
  // 처음 고른 줄 — 움직이는 세션이 있으면 그 첫 줄, 없으면 맨 위
  const found = rows.findIndex((r) => r.key === selKey)
  const i = found >= 0 ? found : Math.max(0, rows.findIndex((r) => r.kind === 'live'))
  const cur = rows[i]
  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }) }, [i, rows.length])

  /** 마우스가 실제로 움직였을 때만 고른다 — 글자를 치는 동안 목록이 바뀌면 가만히 있는 커서 밑 줄이 선택을 빼앗았다(DF 스모크) */
  const hover = (e: React.MouseEvent, k: string) => { if ((e.movementX || e.movementY) && k !== selKey) setSelKey(k) }
  const enter = (r: Row) => { onClose(); go(r.botId, r.sid) }
  /** 폴더를 편다 — 그 안 첫 세션에 선다. 세션이 없으면 폴더째 들어간다 */
  const expand = (r: Row) => {
    const ss = sessOf(r.botId)
    if (!ss.length) { enter(r); return }
    setOpen(r.botId); setAopen(null)
    const hit = qq ? ss.filter((x) => scoreName(qq, x.name, x.name) > 0) : []
    setSelKey(`s-${r.botId}|${(hit[0] ?? ss[0]).id}`)
  }
  const pick = (r?: Row, meta = false) => {
    if (!r) return
    if (r.kind === 'more') { setMore(r.botId); return }
    if (r.kind !== 'bot') { enter(r); return }
    if (meta || (r.n ?? 0) <= 1) { enter(r.n === 1 ? { ...r, sid: sessOf(r.botId)[0]?.id } : r); return }
    if (open === r.botId) { setOpen(null); setSelKey(r.key) } else expand(r)
  }
  const showIdle = (r: Row) => {
    if (sessOf(r.botId).every((y) => live.list.some((e) => e.x.id === y.id))) return
    setAopen(r.key)
  }
  /** ↑↓ — 펼친 폴더 줄에서 내려가면 그 안을 건너뛴다 · 펼친 것 밖으로 나가면 접는다 */
  const move = (d: number) => {
    if (!rows.length) return
    let n = i + d
    if (d > 0 && cur?.kind === 'bot' && open === cur.botId) while (rows[n] && rows[n].grp === cur.botId) n++
    const tgt = rows[Math.min(rows.length - 1, Math.max(0, n))]
    if (open && tgt.grp !== open) setOpen(null)
    if (aopen && tgt.grp !== 'a' && tgt.key !== aopen) setAopen(null)
    setSelKey(tgt.key)
  }
  /** ← · ⎋ — 펼친 것을 접는다. 접을 게 없으면 false */
  const fold = (): boolean => {
    if (!cur) return false
    if ((cur.kind === 'sess' || cur.kind === 'more') && open === cur.botId) { setOpen(null); setSelKey(`b-${cur.botId}`); return true }
    if (cur.kind === 'idle' && aopen) { setSelKey(aopen); setAopen(null); return true }
    if (aopen) { setAopen(null); return true }
    if (open) { setOpen(null); return true }
    return false
  }

  const foot = !cur ? null
    : cur.kind === 'live' ? <><span>⏎ 이 세션으로</span><span>→ 같은 폴더의 쉬는 세션</span><span>↑↓ 고르기</span></>
      : cur.kind === 'sess' || cur.kind === 'idle' ? <><span>⏎ 이 세션으로</span><span>← 접기</span><span>↑↓ 세션 사이</span></>
        : cur.kind === 'bot' ? ((cur.n ?? 0) <= 1 ? <><span>↑↓ 폴더</span><span>⏎ {cur.n ? '세션이 하나라 바로 들어가기' : '들어가기'}</span></>
          : <><span>↑↓ 폴더</span><span>→ · ⏎ 세션 펼치기</span><span>⌘⏎ · 두 번 클릭 폴더째 들어가기</span></>)
          : <><span>↑↓ 고르기</span><span>⏎ 들어가기</span></>

  return <><div className="backdrop" onClick={onClose} /><div className="modal pal srch">
    <div className="pq"><Icon n="search" size={14} color="var(--t3)" />
      <input autoFocus placeholder="폴더봇 · 세션 찾기 — 이름 · 초성 · 지난 대화" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') { e.preventDefault(); if (!fold()) onClose(); return }
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return }
          if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return }
          // → 폴더는 펴고 움직이는 세션은 쉬는 세션을 편다 · ← 접는다 (글자 사이를 움직일 때는 가로채지 않는다)
          if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === q.length) {
            if (cur?.kind === 'bot' && (cur.n ?? 0) > 0) { e.preventDefault(); if (open !== cur.botId) expand(cur); else if (rows[i + 1]?.grp === cur.botId) setSelKey(rows[i + 1].key) }
            else if (cur?.kind === 'live') { e.preventDefault(); showIdle(cur) }
            return
          }
          if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) { if (fold()) e.preventDefault(); return }
          if (e.key === 'Enter') { e.preventDefault(); pick(cur, e.metaKey || e.ctrlKey) }
        }} />
      <span className="k">⌘K</span></div>
    <div className="plist" ref={listRef}>
      {rows.map((r, n) => {
        const firstHit = r.kind === 'hit' && rows[n - 1]?.kind !== 'hit'
        const on = n === i ? 'on' : ''
        return <div key={r.key} style={{ display: 'contents' }}>
          {firstHit ? <div className="sgrp">지난 대화</div> : null}
          {r.head ? <div className="sgrp fhd" data-head={r.head.para ?? r.head.key}>{r.head.para ? <i className={`fsq p-${r.head.para}`} /> : null}<span>{r.head.label}</span>
            {r.head.live ? <span className="lv">움직이는 세션 {r.head.live}</span> : null}<span className="n">{r.head.n}</span></div> : null}
          {r.sh ? <div className="sgrp fsub" data-sub={r.kind === 'live' ? 'live' : 'recent'}>{r.sh}</div> : null}
          {r.kind === 'live' && r.v ? <button className={`prow lrow ${on} ${r.flash ? 'flash' : ''}`} data-sid={r.sid} data-cls={r.v.cls} onMouseMove={(e) => hover(e, r.key)} onClick={() => pick(r)}>
            <span className="l1"><i className={`ldot ${r.v.cls}`} /><span className="n"><Mid s={r.label} /></span>{r.routine ? <span className="rt">루틴</span> : null}
              {r.chip ? <span className="fc">{r.chip.para ? <span className={`fpara p-${r.chip.para}`}>{r.chip.para}</span> : <FolderBot color={r.chip.color} size={12} mono />}<Mid s={r.chip.name} /></span> : null}
              <span className={`ftm c-${r.v.cls}`}>{r.v.tm}</span></span>
            <span className={`l2 c-${r.v.cls}`}>{r.v.text}</span>
          </button>
            : <button className={`prow ${r.kind} ${on} ${r.kind === 'bot' && open === r.botId ? 'open' : ''}`} data-bot={r.kind === 'bot' ? r.botId : undefined} data-sid={r.sid}
              onMouseMove={(e) => hover(e, r.key)} onClick={() => pick(r)} onDoubleClick={() => { if (r.kind === 'bot') enter(r) }}>
              {r.kind === 'bot' ? <span className="chev">›</span> : null}
              {r.kind === 'bot' ? (r.para ? <span className={`fpara p-${r.para}`}>{r.para}</span> : <FolderBot color={r.color ?? '#888'} size={14} mono />)
                : r.kind === 'hit' ? <Icon n="sub" size={13} color="var(--t3)" />
                  : r.kind === 'sess' || r.kind === 'idle' ? <i className={`ldot ${r.v?.cls ?? 'none'}`} /> : null}
              <span className="n"><Mid s={r.label} /></span>
              {r.routine ? <span className="rt">루틴</span> : null}
              {r.sub ? <span className={`sb ${r.kind === 'hit' ? 'snip' : ''} ${r.v ? `c-${r.v.cls}` : ''}`}><Mid s={r.sub} /></span> : r.kind === 'bot' ? <span className="sb" /> : null}
              {r.tm ? <span className={`ftm ${r.v ? `c-${r.v.cls}` : ''}`}>{r.tm}</span> : null}
            </button>}
        </div>
      })}
      {!rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>찾는 게 없어요</div> : null}
    </div>
    <div className="sfoot">{foot}<span>⎋ {open || aopen ? '접기' : '닫기'}</span></div>
  </div></>
}
