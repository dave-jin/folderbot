import { useEffect, useRef, useState } from 'react'
import { Icon } from './FolderBot'
import { centered, clampView, dist, fitScale, zoomAt, type View } from '../core/zoom'

/**
 * 이미지 뷰어 (M-1 · 2026-09-19) — 트랙패드 핀치(ctrl+휠)·휠·⌘+/−/0/9·터치 핀치·드래그·더블탭. 기준점은 **커서·손가락 자리**(core/zoom).
 * ⚠ 확대된 상태(맞춤보다 크게)면 가로 드래그는 이 요소가 먹는다 — `data-consume-x` 를 달아 H 의 서랍 쓸기가 양보한다.
 * ⛔ 수학은 core/zoom 에만 있다 — 여기서는 이벤트를 좌표로 바꿔 넘길 뿐이다.
 */
export function ImageView({ src, alt, onCopy, copyLabel = '복사' }: { src: string; alt?: string; onCopy?: () => void; copyLabel?: string }) {
  const box = useRef<HTMLDivElement>(null); const img = useRef<HTMLImageElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [v, setV] = useState<View>({ s: 1, x: 0, y: 0 })
  const [fit, setFit] = useState(1)
  const vRef = useRef(v); vRef.current = v
  const size = () => { const b = box.current?.getBoundingClientRect(); return { bw: b?.width ?? 0, bh: b?.height ?? 0 } }
  const apply = (next: View) => { if (!nat) return; const { bw, bh } = size(); setV(clampView(next, nat.w, nat.h, bw, bh)) }
  const toFit = (n = nat) => { if (!n) return; const { bw, bh } = size(); const f = fitScale(n.w, n.h, bw, bh); setFit(f); setV(centered(n.w, n.h, bw, bh, f)) }
  const to = (s: number) => { if (!nat) return; const { bw, bh } = size(); const c = zoomAt(vRef.current, s / vRef.current.s, bw / 2, bh / 2); apply(c) }
  const local = (e: { clientX: number; clientY: number }) => { const b = box.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top } }
  useEffect(() => { setNat(null); setV({ s: 1, x: 0, y: 0 }) }, [src])
  useEffect(() => { if (!box.current || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(() => { if (nat && Math.abs(vRef.current.s - fit) < 1e-6) toFit() }); ro.observe(box.current); return () => ro.disconnect() }, [nat, fit]) // eslint-disable-line react-hooks/exhaustive-deps
  // ⌘+ / ⌘− / ⌘0(원본) / ⌘9(맞춤) — 뷰어가 떠 있는 동안만. 입력칸에 커서가 있으면 양보
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const t = e.target as HTMLElement | null; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); to(vRef.current.s * 1.25) }
      else if (e.key === '-') { e.preventDefault(); to(vRef.current.s / 1.25) }
      else if (e.key === '0') { e.preventDefault(); to(1) }
      else if (e.key === '9') { e.preventDefault(); toFit() }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [nat]) // eslint-disable-line react-hooks/exhaustive-deps
  // 휠 — ctrl(트랙패드 핀치)·⌘ 이면 확대, 아니면 확대된 상태에서 끌기. passive:false 라야 페이지 확대를 막는다
  useEffect(() => {
    const el = box.current; if (!el) return
    const w = (e: WheelEvent) => {
      if (!nat) return
      e.preventDefault()
      const p = local(e)
      if (e.ctrlKey || e.metaKey) apply(zoomAt(vRef.current, Math.exp(-e.deltaY * 0.01), p.x, p.y))
      else if (vRef.current.s > fit + 1e-6) apply({ ...vRef.current, x: vRef.current.x - e.deltaX, y: vRef.current.y - e.deltaY })
    }
    el.addEventListener('wheel', w, { passive: false }); return () => el.removeEventListener('wheel', w)
  }, [nat, fit]) // eslint-disable-line react-hooks/exhaustive-deps
  // 포인터 — 하나면 끌기, 둘이면 핀치(가운데 고정). 더블탭·더블클릭은 맞춤 ↔ 2배 (원본이 더 크면 원본)
  const pts = useRef(new Map<number, { x: number; y: number }>()); const last = useRef<{ t: number; x: number; y: number } | null>(null); const pinch = useRef<{ d: number; v: View } | null>(null); const drag = useRef<{ x: number; y: number; v: View; moved: boolean } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if (!nat) return
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 합성 이벤트 */ }
    const p = local(e); pts.current.set(e.pointerId, p)
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; pinch.current = { d: dist(a, b), v: vRef.current }; drag.current = null }
    else drag.current = { x: p.x, y: p.y, v: vRef.current, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    const p = local(e); pts.current.set(e.pointerId, p)
    if (pinch.current && pts.current.size === 2) { const [a, b] = [...pts.current.values()]; const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; apply(zoomAt(pinch.current.v, dist(a, b) / pinch.current.d, m.x, m.y)); return }
    if (drag.current) { const dx = p.x - drag.current.x, dy = p.y - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true; if (vRef.current.s > fit + 1e-6) apply({ ...drag.current.v, x: drag.current.v.x + dx, y: drag.current.v.y + dy }) }
  }
  const onUp = (e: React.PointerEvent) => {
    const p = pts.current.get(e.pointerId); pts.current.delete(e.pointerId)
    if (pts.current.size < 2) pinch.current = null
    if (drag.current && !drag.current.moved && p) {
      const now = Date.now()
      if (last.current && now - last.current.t < 320 && Math.abs(last.current.x - p.x) < 24 && Math.abs(last.current.y - p.y) < 24) { last.current = null; const target = vRef.current.s > fit + 1e-6 ? fit : Math.max(1, fit * 2); apply(zoomAt(vRef.current, target / vRef.current.s, p.x, p.y)) }
      else last.current = { t: now, x: p.x, y: p.y }
    }
    drag.current = null
  }
  const zoomed = nat ? v.s > fit + 1e-6 : false
  return <div className={`imgv ${zoomed ? 'zoomed' : ''}`} ref={box} data-consume-x={zoomed ? '1' : undefined} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
    <img ref={img} src={src} alt={alt ?? ''} draggable={false} onLoad={(e) => { const im = e.currentTarget; const n = { w: im.naturalWidth, h: im.naturalHeight }; setNat(n); toFit(n) }} style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})`, visibility: nat ? 'visible' : 'hidden' }} />
    <div className="zbar" onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={() => to(v.s / 1.25)} title="축소 (⌘−)">−</button>
      <span className="pct">{Math.round(v.s * 100)}%</span>
      <button onClick={() => to(v.s * 1.25)} title="확대 (⌘+)">+</button>
      <button onClick={() => toFit()} title="맞춤 (⌘9)" className={Math.abs(v.s - fit) < 1e-6 ? 'on' : ''}>맞춤</button>
      <button onClick={() => to(1)} title="원본 (⌘0)" className={Math.abs(v.s - 1) < 1e-6 ? 'on' : ''}>원본</button>
      {onCopy ? <button onClick={onCopy} title="이미지를 클립보드에" className="cp"><Icon n="copy" size={12} />{copyLabel}</button> : null}
    </div>
  </div>
}
