import type { ReactNode } from 'react'
import { useEsc } from './esc'
import { Icon } from './FolderBot'

/**
 * 창의 한 틀 (2026-11-13 · UX/UI 정리 «부품 넷» 둘째 묶음 · 목업 `03_디자인/2026-11-13_부품-넷-목업/01·02`).
 *
 * 11/12 리뷰에서 창 열 개를 세어 보니 폭이 열 가지(480~1180), ✕ 가 없는 창이 둘, [취소][저장] 이 머리줄에 있는 창이 하나였다.
 * 창마다 어둠막 · ⎋ · ✕ 를 따로 붙이다 보니 하나씩 빠진 것이다. 그래서 **닫는 길 셋(⎋ · 바깥 · ✕)과 폭은 이 틀이 책임진다.**
 *
 * | 자리 | 무엇 |
 * |---|---|
 * | 머리줄 | 제목 15px · 한 줄 설명(`sub`) · 오른쪽 위 ✕. `head` 는 ✕ 왼쪽에 서는 것(드물게) |
 * | 거르기 줄 `bar` | 세그먼트 · 찾기 칸처럼 본문을 거르는 것 |
 * | 본문 | `children`. 제 스크롤 칸을 가진 창은 `raw` 로 그대로 넣는다 |
 * | 발 `foot` | 왼쪽 보조 … `<span className="sp" />` … 오른쪽 [취소][주 행동]. 주 행동은 늘 오른쪽 끝 |
 *
 * 폭은 셋뿐이다 — `s` 480 · `m` 720 · `l` 1080(`styles.css` `--mw-*`). 창마다 폭을 새로 짓지 않는다.
 *
 * 🔴 새 창은 `<div className="backdrop">` + `<div className="modal">` 을 손으로 짓지 않고 이것을 쓴다(`test/unit/partsRules.test.ts`).
 *    예외는 틀이 다른 것 — 묻기 · 확인창(`Sheets.tsx` · 맨 위 층) · 찾기/명령 팔레트(✕ 없이 ⎋ 가 관례) · 설정(왼쪽 메뉴가 창 높이를 다 쓴다).
 *    예외도 폭은 `sz-*` 로 고르고 ⎋ 는 `useEsc` 로 건다.
 * ⚠ `onClose` 가 ⎋ · 바깥 · ✕ 셋 모두에 쓰인다. 닫기 전에 물어야 하면(루틴 편집의 «고친 내용을 버릴까요?») 묻는 함수를 넘긴다.
 *    ⎋ 만 다르게 써야 하면(검색어부터 지우기 등) `onEsc` 를 따로 준다.
 */
export type ModalSize = 's' | 'm' | 'l'

export function Modal({ title, sub, size, cls = '', label, onClose, onEsc, head, bar, foot, grip, raw, children }: {
  title: ReactNode
  /** 제목 아래 한 줄 — 개수 · 정본 위치처럼 창 전체에 걸린 말 */
  sub?: ReactNode
  size: ModalSize
  /** 창 고유 클래스(안쪽 스타일 · 검사가 창을 가리는 이름) */
  cls?: string
  /** 화면 낭독기가 읽을 이름 — 제목이 글이 아닐 때 */
  label?: string
  onClose: () => void
  onEsc?: () => void
  head?: ReactNode
  bar?: ReactNode
  foot?: ReactNode
  /** 폰에서 끌어내리는 손잡이 자리(보드 계열) */
  grip?: boolean
  /** 본문을 `.modal-b` 로 싸지 않는다 — 제 스크롤 칸 · 제 여백을 가진 창 */
  raw?: boolean
  children?: ReactNode
}) {
  useEsc(onEsc ?? onClose)
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className={`modal mf sz-${size} ${cls}`} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      {grip ? <div className="grip" /> : null}
      <div className="modal-h">
        <div className="t"><b>{title}</b>{sub ? <small className="cnt">{sub}</small> : null}</div>
        {head}
        <ModalX onClose={onClose} />
      </div>
      {bar ? <div className="modal-bar">{bar}</div> : null}
      {raw ? children : <div className="modal-b">{children}</div>}
      {foot ? <div className="modal-f">{foot}</div> : null}
    </div>
  </>
}

/** 오른쪽 위 ✕ — 틀 밖의 창(설정)도 같은 단추를 쓴다 */
export function ModalX({ onClose }: { onClose: () => void }) {
  return <button className="ib mx" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button>
}

/** 둘에서 넷 사이를 고르는 것은 세그먼트 하나로 (기획서 «고르기»). 하나만 켜진다 */
export function Seg<T extends string>({ value, options, onChange, label, cls = '' }: { value: T; options: readonly (readonly [T, ReactNode])[]; onChange: (v: T) => void; label?: string; cls?: string }) {
  return <span className={`seg ${cls}`} role="radiogroup" aria-label={label}>
    {options.map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={value === v} data-v={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}
  </span>
}
