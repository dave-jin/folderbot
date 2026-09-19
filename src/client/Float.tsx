import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * 떠 있는 것 — 팝업·메뉴를 **화면 맨 위(body)** 에 그린다 (2026-09-13 Dave: *«팝업이 짤리니깐»*).
 *
 * 🔴 **왜 제자리에 못 그리나**: 패널의 절(`.sec`)은 `overflow:hidden` 으로 자기 높이 안에서 자른다 —
 *    접었다 폈다 하는 칸이라 그래야 한다. 그런데 그 안에서 연 메뉴도 **같이 잘린다**.
 *    `z-index` 로는 못 푼다 — 잘림은 쌓임 순서가 아니라 **부모의 자르기**라서, 부모 밖으로 나가는 수밖에 없다.
 * ⚠ 그래서 좌표는 **열 때 한 번 재서 고정(fixed)** 으로 쓴다. 기준이 되던 칸이 스크롤되면 따라가지 않으므로,
 *    스크롤·크기 변화에는 **닫는다** — 엉뚱한 자리에 떠 있는 메뉴보다 닫힌 메뉴가 낫다.
 * ⚠ 화면 밖으로 나가지 않게 가장자리에서 접어 넣는다(오른쪽·아래를 넘으면 반대쪽으로 붙인다).
 */
export interface Anchor { x: number; y: number; right?: boolean; up?: boolean }

/** 단추 기준 좌표 — 아래로 펼치되, 아래가 좁으면 위로. `right` 면 오른쪽 끝을 맞춘다 */
export function anchorOf(el: HTMLElement, opt: { right?: boolean; gap?: number } = {}): Anchor {
  const r = el.getBoundingClientRect()
  const gap = opt.gap ?? 4
  const up = window.innerHeight - r.bottom < 200 && r.top > 200
  return { x: opt.right ? r.right : r.left, y: up ? r.top - gap : r.bottom + gap, right: opt.right, up }
}

export function Float({ at, onClose, children, className = 'menu', width = 200 }: { at: Anchor; onClose: () => void; children: ReactNode; className?: string; width?: number }) {
  const [el] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')))
  useEffect(() => {
    if (!el) return
    document.body.appendChild(el)
    return () => { el.remove() }
  }, [el])
  useEffect(() => {
    // ⚠ 스크롤·리사이즈에는 닫는다 — 좌표를 열 때 고정했으므로 따라갈 수 없다
    const off = () => onClose()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    window.addEventListener('keydown', key)
    // 바깥을 누르면 닫힌다. ⚠ 여는 클릭이 그대로 이어져 바로 닫히지 않게 다음 틀에서 붙인다
    const t = window.setTimeout(() => window.addEventListener('mousedown', off), 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('scroll', off, true); window.removeEventListener('resize', off)
      window.removeEventListener('keydown', key); window.removeEventListener('mousedown', off)
    }
  }, [onClose])
  // 🔴 **긴 메뉴는 위로 밀어 올린다** (M-3 · 2026-09-19 — 트리 메뉴에 «파일 복사» 가 붙자 아래로 잘렸다). 그린 뒤 높이를 재서
  //    바닥을 넘으면 그만큼 올리고, 그래도 화면보다 크면 안에서 스크롤한다. 좌표는 여는 순간 고정이므로 한 번만 잰다.
  const box = useRef<HTMLDivElement>(null); const [lift, setLift] = useState(0)
  // ⚠ useEffect 라야 한다 — 포털 그릇은 위의 useEffect 가 body 에 붙이므로, layout effect 시점엔 아직 문서 밖이라 크기가 0 이다
  useEffect(() => { setLift(0); const b = box.current; if (!b) return; const r = b.getBoundingClientRect(); const over = r.bottom - (window.innerHeight - 8); if (over > 0) setLift(Math.min(over, Math.max(0, r.top - 8))) }, [at.x, at.y, at.up])
  if (!el) return null
  const style: React.CSSProperties = { position: 'fixed', zIndex: 200, minWidth: width, maxWidth: 'min(320px, 92vw)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }
  if (at.right) style.right = Math.max(8, window.innerWidth - at.x)
  else style.left = Math.min(at.x, Math.max(8, window.innerWidth - width - 8))
  if (at.up) style.bottom = Math.max(8, window.innerHeight - at.y)
  else style.top = Math.max(8, Math.min(at.y, Math.max(8, window.innerHeight - 80)) - lift)
  return createPortal(
    <div ref={box} className={className} style={style} onMouseDown={(e) => e.stopPropagation()}>{children}</div>,
    el
  )
}
