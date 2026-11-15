import { useEffect, useRef, useState } from 'react'
import type { Bot } from '../core/types'
import { botDueChip } from '../core/botName'
import { dueChipOf } from '../core/due'
import { OV_CHUNK_SRC, OV_CHUNK_TITLE, askRefOf, type AskRef, type OvChunk, type OvRow, type OverviewPage as Page } from '../core/overviewPage'
import { ago, dayClock } from '../core/timeText'
import { api } from './api'
import { Icon } from './FolderBot'

/**
 * 🔴 **폴더 개요 한 장** (2026-11-15 Dave 카드 — 자리는 «문서 칸» · 채우는 법은 «파일에서 그대로»).
 *
 * 문서 칸에 열리는 보기 전용 한 장이다. 덩이는 넷으로 고정한다 — 어디까지 왔나 · 내가 나설 곳 · 최근 만든 것 · 이어진 곳.
 * 줄은 모두 폴더에 적힌 그대로다(`core/overviewPage` · 모델을 부르지 않는다). 덩이 머리 아래의 작은 글자가 출처다.
 *
 *  - **[이 부분 묻기]** — 그 덩이를 입력칸 위에 붙인다(`onAsk`). 보낼 때 덩이의 줄이 내 말 아래에 인용으로 간다.
 *  - **연 뒤 바뀌면 알리기만 한다** — 파일이나 세션이 바뀌면 다시 받아 지문(`ver`)을 견주고, 다르면 «그 뒤 바뀐 것이 있어요 · 다시 읽기».
 *    저절로 다시 그리지 않는다(읽던 줄이 발밑에서 바뀌지 않게).
 *  - **고치지 않는다** — 고치려면 [이 부분 묻기] 로 봇에게 시키고, 봇이 원본(state.md · todo.md)을 고친다.
 */
export function OverviewPage({ bot, tick, askOn, onAsk, onOpenFile, onTalk, go, phone }: {
  bot: Bot
  /** 파일 · 세션이 바뀔 때마다 달라지는 값 — 바뀌면 조용히 다시 받아 견준다 */
  tick: string
  /** 지금 입력칸에 붙어 있는 덩이의 이름(없으면 '') */
  askOn: string
  onAsk: (ref: AskRef) => void
  onOpenFile: (rel: string) => void
  onTalk: (text: string) => void
  go: (botId: string, sid?: string) => void
  phone?: boolean
}) {
  const [shown, setShown] = useState<{ id: string; page: Page } | null>(null)
  const [latest, setLatest] = useState<{ id: string; page: Page } | null>(null)
  const [err, setErr] = useState('')
  const first = useRef(true)
  useEffect(() => { first.current = true; setShown(null); setLatest(null); setErr('') }, [bot.id])
  useEffect(() => {
    let live = true
    const t = window.setTimeout(() => {
      void api<Page>(`/bots/${bot.id}/overview/page`).then((page) => {
        if (!live) return
        setLatest({ id: bot.id, page })
        if (first.current) { first.current = false; setShown({ id: bot.id, page }) }
      }).catch((e: unknown) => { if (live && first.current) setErr(e instanceof Error ? e.message : '') })
    }, first.current ? 0 : 400)
    return () => { live = false; window.clearTimeout(t) }
  }, [bot.id, tick])
  const page = shown && shown.id === bot.id ? shown.page : null
  const fresh = latest && latest.id === bot.id ? latest.page : null
  const changed = !!page && !!fresh && fresh.ver !== page.ver
  const reload = () => { if (fresh) setShown({ id: bot.id, page: fresh }) }
  const due = botDueChip(bot)
  const name = bot.displayName || bot.name

  if (err) return <div className="dbody ovp"><div className="ovp-none">개요를 못 읽었어요 — {err}</div></div>
  if (!page) return <div className="dbody ovp" aria-busy="true"><div className="skel" style={{ width: '46%', height: 22, marginBottom: 14 }} /><div className="skel" style={{ width: '82%', marginBottom: 10 }} /><div className="skel" style={{ width: '64%' }} /></div>

  const noState = page.sources.find((x) => x.name === 'state.md')?.at === null
  const srcLine = page.sources.filter((x) => x.at !== null).map((x) => `${x.name} ${dayClock(x.at as number)}`).join(' · ')
  const Head = ({ c }: { c: OvChunk }) => <div className="ovc-h"><b>{OV_CHUNK_TITLE[c]}</b><button className={`btn sm ovc-ask ${askOn === OV_CHUNK_TITLE[c] ? 'on' : ''}`} aria-pressed={askOn === OV_CHUNK_TITLE[c]} onClick={() => onAsk(askRefOf(page, c))}>{phone ? '묻기' : '이 부분 묻기'}{askOn === OV_CHUNK_TITLE[c] ? <Icon n="check" size={11} /> : null}</button><small>{OV_CHUNK_SRC[c]}</small></div>
  const Row = ({ r, k, tag }: { r: OvRow; k: 'ok' | 'now' | 'next'; tag: string }) => <button className={`ovr st-${k}`} title={r.full ?? r.text} onClick={() => onOpenFile('state.md')}><i aria-hidden="true">{k === 'ok' ? <Icon n="check" size={9} /> : null}</i><span>{r.text}</span><small>{tag}</small></button>
  const pr = page.progress
  const prEmpty = !pr.done.length && !pr.doing.length && !pr.next.length
  const missing = (['done', 'doing', 'next'] as const).filter((k) => !pr.has[k]).map((k) => ({ done: '완료', doing: '진행 중', next: '다음 작업' })[k])
  const mine = page.mine
  const mineEmpty = !mine.asks.length && !mine.todos.length && !mine.waits.length && !mine.proposed

  return <div className={`dbody ovp ${phone ? 'ph' : ''}`} data-ver={page.ver}>
    <h2 className="ovp-t"><span>{name}</span>{due ? <em className={due.tone === 'past' ? 'past' : ''}>{due.text}</em> : null}</h2>
    <div className="ovp-made">
      {srcLine ? <span>{srcLine} 에서 옮김</span> : <span>아직 옮길 파일이 없어요</span>}
      {page.staleDays ? <span className="stale">state.md 가 {page.staleDays}일 전 것이에요</span> : null}
      {page.staleDays || noState ? <button className="btn sm" onClick={() => onTalk(noState ? '이 폴더의 state.md 를 만들어 지금 상태를 정리해 줘.' : 'state.md 를 지금 상태에 맞게 고쳐 줘.')}>봇에게 정리 시키기</button> : null}
      {changed ? <button className="btn sm ovp-re" onClick={reload}>그 뒤 바뀐 것이 있어요 · 다시 읽기</button> : null}
    </div>
    {page.purpose ? <p className="ovp-goal">{page.purpose}<small>CLAUDE.md «목적»</small></p> : null}
    {page.goal ? <p className="ovp-goal now">{page.goal}<small>state.md «현재 목표»</small></p> : null}
    <div className="ovp-grid">
      <section className={`ovc ${askOn === OV_CHUNK_TITLE.progress ? 'sel' : ''}`} data-chunk="progress"><Head c="progress" />
        {noState ? <div className="ovc-none">state.md 가 없어요</div>
          : prEmpty ? <div className="ovc-none">state.md 에 «완료 · 진행 중 · 다음 작업» 절의 줄이 없어요</div>
            : <>{pr.done.map((r, i) => <Row key={`d${i}`} r={r} k="ok" tag="완료" />)}{pr.doing.map((r, i) => <Row key={`g${i}`} r={r} k="now" tag="진행 중" />)}{pr.next.map((r, i) => <Row key={`n${i}`} r={r} k="next" tag="다음 작업" />)}</>}
        {!noState && !prEmpty ? <div className="ovc-more">{[pr.doneTotal > pr.done.length ? `완료 ${pr.doneTotal} 가운데 ${pr.done.length}` : '', pr.doingTotal > pr.doing.length ? `진행 중 ${pr.doingTotal} 가운데 ${pr.doing.length}` : '', pr.nextTotal > pr.next.length ? `다음 작업 ${pr.nextTotal} 가운데 ${pr.next.length}` : '', missing.length ? `«${missing.join(' · ')}» 절 없음` : ''].filter(Boolean).join(' · ') || '전체는 state.md'}</div> : null}
      </section>
      <section className={`ovc ${askOn === OV_CHUNK_TITLE.mine ? 'sel' : ''}`} data-chunk="mine"><Head c="mine" />
        {mineEmpty ? <div className="ovc-none">지금 내가 나설 곳이 없어요</div> : <>
          {mine.asks.map((a) => <button key={a.id} className="ovr mi-ask" onClick={() => go(bot.id, a.id)}><i aria-hidden="true" /><span>내 답 기다림 — «{a.name}» 세션</span><small>답하기 ›</small></button>)}
          {mine.todos.map((t) => { const d = t.due ? dueChipOf(t.due) : null; return <button key={t.line} className="ovr mi-todo" title={t.title} onClick={() => onOpenFile('todo.md')}><i aria-hidden="true" /><span>{t.title}</span>{d ? <small className={d.tone === 'past' ? 'past' : ''}>{d.text}</small> : null}</button> })}
          {mine.waits.map((w, i) => <button key={`w${i}`} className="ovr mi-wait" title={w.full ?? w.text} onClick={() => onOpenFile('todo.md')}><i aria-hidden="true" /><span>{w.text}</span><small>{w.tag ?? '기다리는 일'}</small></button>)}
        </>}
        {!mineEmpty ? <div className="ovc-more">{[mine.proposed ? `봇의 제안 ${mine.proposed}` : '', mine.openTotal > mine.todos.length ? `열린 할 일 ${mine.openTotal} 가운데 마감 순 ${mine.todos.length}` : mine.openTotal ? `열린 할 일 ${mine.openTotal}` : ''].filter(Boolean).join(' · ')}</div> : null}
      </section>
      <section className={`ovc ${askOn === OV_CHUNK_TITLE.recent ? 'sel' : ''}`} data-chunk="recent"><Head c="recent" />
        {page.recent.length ? page.recent.map((r) => <button key={r.rel} className="ovr fl" title={r.rel} onClick={() => onOpenFile(r.rel)}><i aria-hidden="true" /><span>{r.rel.split('/').pop()}</span><small>{ago(r.at, Date.now(), { far: 'date' })}</small></button>)
          : <div className="ovc-none">지난 7일에 봇이 만든 파일이 없어요</div>}
      </section>
      <section className={`ovc ${askOn === OV_CHUNK_TITLE.links ? 'sel' : ''}`} data-chunk="links"><Head c="links" />
        {page.links.length ? <div className="ovc-lk">{page.links.map((l) => <button key={l.id} className="ovlk" title={l.why} disabled={!l.botId} onClick={() => { if (l.botId) go(l.botId) }}><i aria-hidden="true" />{l.label}</button>)}</div>
          : <div className="ovc-none">아직 이어진 폴더가 없어요</div>}
        {page.past.map((p, i) => <div key={i} className="ovc-more" title={p.why}>지난 일에서 가져다 쓸 것 — {p.label}{p.file ? ` · ${p.file.split('/').pop()}` : ''}</div>)}
      </section>
    </div>
  </div>
}
