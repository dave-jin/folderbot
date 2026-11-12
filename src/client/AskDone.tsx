import { useMemo, useState } from 'react'
import type { ChatItem } from '../core/types'
import { askSummary } from '../core/askDone'
import { Icon } from './FolderBot'
import { fmtTime } from './store'

type Tool = Extract<ChatItem, { kind: 'tool' }>

/**
 * 질문 카드에 답한 뒤 대화에 남는 요약 (2026-11-12 Dave: *«Ask User Question 의 답변 후 뭘 답변했는지 제대로 내용이 안보인다»*).
 * 종전에는 «보냈어요» 한 줄 뒤 `AskUserQuestion` 도구 줄만 남아, 무엇을 묻고 무엇을 골랐는지 거슬러 볼 수 없었다.
 *
 * - 접힌 모습: 질문 머리말(header) + 고른 답 알약 + 직접 쓴 글. 누르면 질문 글과 **고르지 않은 선택지**까지 펼친다.
 * - 못 읽는 답(옛 모양 · 취소)은 `null` 을 돌려준다 — 부르는 쪽이 종전 도구 줄을 그린다(`core/askDone` 머리말).
 * - 폰에서는 접힌 동안 고른 답을 둘까지만 보이고 «외 N개» 로 줄인다(CSS · `.app.phone`).
 */
export function askDoneOf(it: Tool): ReturnType<typeof askSummary> { return it.name === 'AskUserQuestion' && !it.isError ? askSummary(it.input, it.result) : null }

export function AskDone({ it }: { it: Tool }) {
  const sum = useMemo(() => askDoneOf(it), [it.input, it.result, it.isError, it.name])
  const [open, setOpen] = useState(false)
  if (!sum) return null
  const n = sum.rows.length
  return <div className={`askdone ${open ? 'open' : ''}`} data-ask={it.id}>
    <button type="button" className="hd" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? '접기' : '질문 글과 고르지 않은 선택지 보기'}>
      <Icon n="check" size={11} color="var(--done)" /><span>내가 답한 것{n > 1 ? ` · 질문 ${n}개` : ''}</span><span className="sp" /><span className="tm">{fmtTime(it.t)}</span><Icon n={open ? 'chevd' : 'chev'} size={9} /></button>
    {sum.rows.map((r, i) => <div className="q" key={i}>
      {r.header ? <span className="k">{r.header}</span> : null}
      {open || !r.header ? <span className="qq">{r.question}</span> : null}
      <div className="picks">
        {r.picks.map((p, j) => <span key={p} className={`pick ${j > 1 ? 'xtra' : ''}`}>{p}</span>)}
        {r.picks.length > 2 ? <span className="pick more">외 {r.picks.length - 2}개</span> : null}
        {r.free ? <span className="pick free"><span className="fl">직접 쓴 글</span>{r.free}</span> : null}
        {r.edited ? <span className="ed">미리보기를 고쳐서 답함</span> : null}
        {!r.picks.length && !r.free ? <span className="ed">답 없음</span> : null}
      </div>
      {open && r.rest.length ? <div className="not">고르지 않은 것: {r.rest.join(' · ')}</div> : null}
    </div>)}
    {sum.partial ? <div className="not tail">답 글이 길어 여기까지만 읽었어요</div> : null}
  </div>
}
