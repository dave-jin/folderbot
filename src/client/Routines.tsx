import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { useStore } from './store'
import { Icon } from './FolderBot'
import type { Board } from '../host/routineBoard'
import { LOAD_BAD, LOAD_WARN, STATE_ORDER, type BoardRoutine, type BoardState, type RunRow } from '../core/routineBoard'
import type { RoutineDef } from '../core/types'

/**
 * 🔴 RB-6 · 루틴 관리 페이지 (2026-10-30 Dave: *«folderbot 전체 루틴을 보고 관리할 수 있는 루틴 관리 페이지»* ·
 *    *«시간표를 보면서 리소스가 너무 몰리는건 아닌지 확인하고, 루틴의 성공 및 실패 여부도 확인»*).
 *    설계 `2. Area/제품_FolderBot/01_기획/2026-10-30_기획_루틴-관리-페이지.md` §4 · 목업 `03_디자인/2026-10-30_루틴-관리-목업/`.
 *    위는 시간표(오늘 · 이번 주)와 몰림 띠, 아래는 문제 먼저 오는 목록. 고치기는 그 봇의 루틴 시트, 나머지는 여기서 바로.
 *    값은 `/api/routines/overview` 한 장 — 오케스트레이터 `routines_overview` 와 같은 계산이다.
 * ⚠ 폰은 시간표를 «오늘 몰림» 띠 하나로 줄이고, 단추는 펼친 줄에만 둔다.
 */
const LABEL: Record<BoardState, string> = { fail: '실패', missed: '놓침', unknown: '결과 줄 없음', finished: '끝난 일회성', off: '꺼 둠', ok: '정상' }
const DOT: Record<BoardState, string> = { fail: '🔴', missed: '🟠', unknown: '🟡', finished: '⚪', off: '⏸', ok: '🟢' }
const HINT: Partial<Record<BoardState, string>> = { missed: '앱이 꺼져 있었고 보충 시간도 지났어요', unknown: '돌았지만 마지막 줄에 «결과: …» 를 안 남겼어요' }
const RES: Record<RunRow['result'], string> = { ok: '성공', skip: '건너뜀', fail: '실패', timeout: '시간 초과', unknown: '결과 없음' }
const p2 = (n: number) => String(n).padStart(2, '0')
const hm = (t: number) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
const md = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}` }
const when = (t: number, now: number) => (new Date(t).toDateString() === new Date(now).toDateString() ? hm(t) : `${md(t)} ${hm(t)}`)
const dur = (ms?: number) => (ms === undefined ? '' : ms < 60_000 ? `${Math.round(ms / 1000)}초` : `${Math.floor(ms / 60_000)}분${ms % 60_000 >= 1000 ? ` ${Math.round((ms % 60_000) / 1000)}초` : ''}`)
const lvl = (n: number) => (n <= 0 ? 'l0' : n < LOAD_WARN ? 'l1' : n < LOAD_BAD ? 'l3' : 'l5')
const isProblem = (s: BoardState) => s === 'fail' || s === 'missed' || s === 'unknown'
const HIDE_KEY = 'fb:rt-hide-suggest'

export function Routines({ onClose, go, openSheet, say, phone }: { onClose: () => void; go: (botId: string, sid?: string) => void; openSheet: (botId: string) => void; say: (m: string) => void; phone: boolean }) {
  const { s } = useStore()
  const [b, setB] = useState<Board | null>(null)
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [onlyBad, setOnlyBad] = useState(true)
  const [folder, setFolder] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string>('')
  const [busy, setBusy] = useState('')
  const [hidden, setHidden] = useState<string>(() => { try { return localStorage.getItem(HIDE_KEY) ?? '' } catch { return '' } })
  const load = () => { void api<Board>('/routines/overview').then(setB).catch((e) => say((e as Error).message)) }
  useEffect(() => { load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t) }, [])
  useEffect(() => { load() }, [s.bots])   // 루틴이 바뀌면 봇 목록이 다시 온다
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const key = (r: { botId: string; name: string }) => `${r.botId}::${r.name}`
  const problems = b ? b.counts.fail + b.counts.missed + b.counts.unknown : 0
  const shown = useMemo(() => (b?.routines ?? []).filter((r) => (!onlyBad || isProblem(r.state) || r.state === 'finished') && (!folder || r.botId === folder) && (!q.trim() || `${r.name} ${r.bot}`.toLowerCase().includes(q.trim().toLowerCase()))), [b, onlyBad, folder, q])
  const groups = STATE_ORDER.map((st) => [st, shown.filter((r) => r.state === st)] as const).filter(([, l]) => l.length)

  /** 그 봇의 루틴 목록을 고쳐 저장 — 시트와 같은 문(PUT)을 쓴다 · 변경은 호스트가 «화면» 으로 기록하고 그 폴더 CLAUDE.md 구역을 고친다 */
  const mutate = async (botId: string, label: string, f: (l: RoutineDef[]) => RoutineDef[]) => {
    setBusy(label)
    try {
      const cur = await api<(RoutineDef & { when?: string })[]>(`/bots/${botId}/routines`)
      const clean = cur.map(({ when: _w, lastError: _e, nextRun: _n, ...r }) => r)
      await api(`/bots/${botId}/routines`, { method: 'PUT', body: { routines: f(clean) } })
      say(label); load()
    } catch (e) { say((e as Error).message) } finally { setBusy('') }
  }
  const run = async (r: BoardRoutine) => { setBusy(`run:${key(r)}`); try { await api(`/bots/${r.botId}/routines/run`, { method: 'POST', body: { name: r.name } }); say(`«${r.name}» 을 지금 돌렸어요`); window.setTimeout(load, 1500) } catch (e) { say((e as Error).message) } finally { setBusy('') } }
  const toggle = (r: BoardRoutine) => mutate(r.botId, r.enabled ? `«${r.name}» 을 껐어요` : `«${r.name}» 을 켰어요`, (l) => l.map((x) => (x.name === r.name ? { ...x, enabled: !r.enabled } : x)))
  const remove = (r: BoardRoutine) => { if (window.confirm(`«${r.bot}» 의 «${r.name}» 루틴을 지울까요?`)) void mutate(r.botId, `«${r.name}» 을 지웠어요`, (l) => l.filter((x) => x.name !== r.name)) }
  const sweepFinished = async () => {
    const done = (b?.routines ?? []).filter((r) => r.state === 'finished')
    if (!done.length || !window.confirm(`끝난 일회성 루틴 ${done.length}개를 지울까요?\n\n${done.map((r) => `· ${r.bot} · ${r.name}`).join('\n')}`)) return
    for (const id of [...new Set(done.map((r) => r.botId))]) await mutate(id, `끝난 일회성 ${done.length}개를 지웠어요`, (l) => l.filter((x) => !done.some((d) => d.botId === id && d.name === x.name)))
  }
  const sg = b?.suggest, sgKey = sg ? `${sg.botId}::${sg.name}::${sg.to}` : ''
  const shift = () => { if (sg) void mutate(sg.botId, `«${sg.name}» 을 옮겼어요`, (l) => l.map((x) => (x.name === sg.name ? { ...x, cron: sg.to } : x))) }
  const hideSg = () => { setHidden(sgKey); try { localStorage.setItem(HIDE_KEY, sgKey) } catch { /* */ } }

  const warnHours = b ? [...new Set(b.today.slots.map((v, i) => (v >= LOAD_WARN ? Math.floor(i / 6) : -1)).filter((h) => h >= 0))] : []
  const pct = (t: number) => `${((t - (b?.today.dayStart ?? 0)) / 864_000).toFixed(3)}%`
  const wpct = (ms: number) => `${Math.max(ms / 864_000, 0.25).toFixed(3)}%`
  const strip = b ? <div className="rtrow load"><span className="lab">몰림</span><div className="tr">{b.today.slots.map((n, i) => n ? <i key={i} className={lvl(n)} style={{ left: `${(i / 1.44).toFixed(3)}%`, width: `${(1 / 1.44).toFixed(3)}%` }} title={`${p2(Math.floor(i / 6))}:${p2((i % 6) * 10)} · ${n}개 동시`} /> : null)}<b className="now" style={{ left: pct(b.now) }} /></div></div> : null
  const byBot = b ? [...new Set(b.today.blocks.map((x) => x.botId))] : []
  const nameOf = (id: string) => b?.routines.find((r) => r.botId === id)?.bot ?? id

  return <><div className="backdrop" onClick={onClose} /><div className="modal board rt" role="dialog" aria-label="루틴">
    <div className="grip" />
    <div className="modal-h"><div className="t"><b>⏰ 루틴</b><span className="cnt">{b ? `${b.total}개 · 폴더 ${b.folders}곳 · 문제 ${problems}` : '불러오는 중…'}</span></div><button className="ib" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button></div>
    <div className="bbody">
      {b ? <>
        <section className="rtbox">
          <div className="rth"><b>{phone ? '오늘 몰림' : '시간표'}</b>
            {phone ? null : <span className="seg">{(['today', 'week'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'today' ? '오늘' : '이번 주'}</button>)}</span>}
            <span className="legend"><i className="l1" />1~2개<i className="l3" />{LOAD_WARN}개 이상<i className="l5" />{LOAD_BAD}개 이상</span>
          </div>
          {tab === 'today' || phone ? <div className="rttl">
            <div className="rtrow axis"><span className="lab" /><div className="tr">{[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <span key={h} style={{ left: `${h / 0.24}%` }}>{p2(h)}</span>)}</div></div>
            {strip}
            {phone ? null : byBot.map((id) => <div key={id} className="rtrow"><span className="lab" title={nameOf(id)}>{nameOf(id)}</span><div className="tr">
              {b.today.blocks.filter((x) => x.botId === id).map((x, i) => <i key={i} className={`blk ${x.result ? `r-${x.result}` : 'plan'}`} style={{ left: pct(x.start), width: wpct(x.ms) }} title={`${x.name} · ${hm(x.start)}${x.result ? ` · ${RES[x.result]}` : ' · 예정'}`} />)}
              <b className="now" style={{ left: pct(b.now) }} /></div></div>)}
          </div> : <div className="rtweek">
            <div className="wr"><span className="lab" />{Array.from({ length: 24 }, (_, h) => <span key={h} className="hh">{h % 3 ? '' : h}</span>)}</div>
            {b.week.grid.map((row, d) => { const t = b.week.weekStart + d * 86_400_000; return <div key={d} className="wr"><span className="lab">{['일', '월', '화', '수', '목', '금', '토'][new Date(t).getDay()]} {md(t)}</span>{row.map((n, h) => <i key={h} className={lvl(n)} title={`${n}개 동시`}>{n || ''}</i>)}</div> })}
          </div>}
          <div className="rtsum">{tab === 'week' && !phone
            ? <>지난 7일 가장 몰린 때: <b>{b.week.peak.n ? `${md(b.week.weekStart + b.week.peak.day * 86_400_000)} ${p2(b.week.peak.hour)}시 · ${b.week.peak.n}개 동시` : '없음'}</b>{b.week.peak.n < LOAD_WARN ? ' — 여유 있음' : ''}</>
            : warnHours.length ? <>오늘 <b>{LOAD_WARN}개 이상 겹치는 때가 {warnHours.length}번</b> — {warnHours.map((h) => `${p2(h)}:00`).join(' · ')}</> : '오늘은 셋 이상 겹치는 때가 없어요'}</div>
          {sg && hidden !== sgKey ? <div className="rthint"><span className="k">제안</span><span>«{sg.name}» 을 <b>{sg.to.split(' ')[0]}분</b>으로 옮기면 오늘 겹침이 모두 {LOAD_WARN - 1}개 이하가 돼요</span><span className="sp" /><button className="btn" disabled={!!busy} onClick={shift}>옮기기</button><button className="btn ghost" onClick={hideSg}>그대로 두기</button></div> : null}
        </section>

        <div className="bbar rtbar">
          <button className={`pill ${onlyBad ? 'on' : ''}`} onClick={() => setOnlyBad(true)}>문제만 {problems}</button>
          <button className={`pill ${onlyBad ? '' : 'on'}`} onClick={() => setOnlyBad(false)}>전체 {b.total}</button>
          <select className="cfold" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="폴더"><option value="">폴더: 전체</option>{[...new Set(b.routines.map((r) => r.botId))].map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select>
          <input className="rtq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="루틴 찾기" aria-label="루틴 찾기" />
        </div>
        {b.noteMissing.length ? <div className="rtnote">CLAUDE.md 없음 — 이 폴더 봇은 루틴 변경을 모를 수 있어요: {b.noteMissing.map(nameOf).join(' · ')}</div> : null}

        {groups.map(([st, list]) => <div key={st} className="rtgrp" data-state={st}>
          <div className="gh"><span>{DOT[st]}</span><b>{LABEL[st]}</b><span className="c">{list.length}</span>{HINT[st] ? <span className="h">— {HINT[st]}</span> : null}<span className="sp" />
            {st === 'finished' ? <button className="btn" disabled={!!busy} onClick={() => void sweepFinished()}>끝난 일회성 {list.length}개 정리</button> : null}</div>
          {list.map((r) => { const k = key(r), on = open === k; return <div key={k} className={`rtr ${on ? 'open' : ''}`} data-routine={r.name}>
            <div className="row" onClick={() => setOpen(on ? '' : k)}>
              <span className="nm"><b>{r.name}</b><span className="f">{r.bot}</span></span>
              <span className="why">{r.last ? `${when(r.last.start, b.now)} ${RES[r.last.result]}${r.last.reason ? ` — ${r.last.reason}` : ''}${r.last.catchup ? ' (보충)' : ''}` : r.firstWait ? '첫 회차 대기' : r.error ?? '기록 없음'}{r.daveTodo ? <em className="dave"> · Dave 할 일</em> : null}</span>
              {phone ? null : <><span className="wh">{r.when}</span><span className="nx">{r.next ? `다음 ${when(r.next, b.now)}` : r.state === 'finished' ? '끝남' : '—'}</span>
                <span className="dots">{r.recent.slice(0, 14).reverse().map((x) => <i key={x.run} className={`d-${x.result}${x.catchup ? ' c' : ''}`} title={`${when(x.start, b.now)} ${RES[x.result]}`} />)}{r.avgMs ? <span className="avg">평균 {dur(r.avgMs)}</span> : null}</span></>}
              {phone && !on ? null : <span className="acts" onClick={(e) => e.stopPropagation()}>
                {r.state !== 'finished' ? <button className="btn" disabled={!!busy} onClick={() => void run(r)}>지금 돌리기</button> : null}
                {r.state !== 'finished' && !r.once ? <button className="btn" disabled={!!busy} onClick={() => void toggle(r)}>{r.enabled ? '끄기' : '켜기'}</button> : null}
                <button className="btn" onClick={() => openSheet(r.botId)}>고치기</button>
                {r.state === 'finished' || r.state === 'missed' || r.state === 'off' ? <button className="btn danger" disabled={!!busy} onClick={() => remove(r)}>지우기</button> : null}
              </span>}
            </div>
            {on ? <div className="exp">
              <div><h4>최근 회차</h4>{r.recent.length ? <table><tbody>{r.recent.slice(0, 8).map((x) => <tr key={x.run}><td>{when(x.start, b.now)}</td><td className={`res d-${x.result}`}>{RES[x.result]}{x.catchup ? ' · 보충' : ''}</td><td>{dur(x.ms ?? (x.end ? x.end - x.start : undefined))}</td><td className="r">{x.reason ?? ''}</td><td><button className="btn ghost" onClick={() => { onClose(); go(r.botId, x.run) }}>세션 보기</button></td></tr>)}</tbody></table> : <div className="none">지난 7일 기록이 없어요</div>}</div>
              <div><h4>최근 바뀜</h4>{r.changes.length ? <table><tbody>{r.changes.map((c, i) => <tr key={i}><td>{when(c.at, b.now)}</td><td>{c.actor}</td><td className="r">{c.what}{c.why ? ` · 이유: ${c.why}` : ''}</td></tr>)}</tbody></table> : <div className="none">바뀐 기록이 없어요</div>}</div>
            </div> : null}
          </div> })}
        </div>)}
        {!groups.length ? <div className="bempty">{onlyBad ? '문제 있는 루틴이 없어요 — [전체] 를 누르면 다 보여요' : '걸린 루틴이 없어요'}</div> : null}
      </> : <div className="bempty">불러오는 중…</div>}
    </div>
  </div></>
}

/** 홈·사이드바 네 칸 아래 한 줄 — 루틴 수와 문제 수 · 누르면 루틴 페이지 */
export function RoutineLine({ onOpen }: { onOpen: () => void }) {
  const { s } = useStore()
  const [c, setC] = useState<{ total: number; bad: number } | null>(null)
  const load = () => { void api<Board>('/routines/overview').then((b) => setC({ total: b.total, bad: b.counts.fail + b.counts.missed + b.counts.unknown })).catch(() => { /* 숫자 없이 */ }) }
  useEffect(() => { load(); const t = window.setInterval(load, 120_000); return () => window.clearInterval(t) }, [])
  useEffect(() => { load() }, [s.bots])
  return <button className="rtline" onClick={onOpen} aria-label="루틴"><span className="ic">⏰</span><span className="t">루틴</span><span className="sp" />{c ? c.bad ? <span className="bad">문제 {c.bad}</span> : <span className="all">{c.total}개</span> : null}</button>
}
