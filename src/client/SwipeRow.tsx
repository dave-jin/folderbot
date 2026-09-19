import { useRef, useState, type ReactNode } from 'react'
import { Icon } from './FolderBot'
import { decide } from './gesture'
import { ACT_COLOR, ACT_ICON, ACT_LABEL, LONG, actOf, buzz, slotOf, type SwipeAct, type SwipeCfg } from './swipe'

/**
 * 쓸어서 처리하는 행 — 할 일 행(Panel)의 장치를 **폴더 행**(폰 홈)에도 쓰려고 떼어 낸 것 (2026-09-18).
 * 판정은 `swipe.ts`(`slotOf`·`actOf`)와 `gesture.ts`(`decide`)의 순수 함수뿐이고, 여기는 손가락과 그림만 맡는다.
 *
 * - 처음 움직임이 세로면 목록 스크롤에 양보하고 다시는 가로로 보지 않는다.
 * - 🔴 **쓸고 나면 클릭이 새지 않는다** — 행이 `<button>` 이라 pointerup 뒤 click 이 따라온다. 그대로 두면
 *   «고정» 하려고 쓸었는데 폴더가 열린다. `onClickCapture` 에서 한 번 삼킨다.
 * - `labelFor` 로 예고 글자를 상황에 맞춘다(«고정» ↔ «고정 풀기»).
 */
export function SwipeRow({ cfg, onAct, labelFor, children, className }: { cfg: SwipeCfg; onAct: (a: SwipeAct) => void; labelFor?: (a: SwipeAct) => string | undefined; children: ReactNode; className?: string }) {
  const [sw, setSw] = useState<{ dx: number; w: number } | null>(null)
  const ref = useRef<{ x0: number; y0: number; w: number; on: boolean; dead: boolean; last: SwipeAct | null } | null>(null)
  const swiped = useRef(false)
  const act = sw ? actOf(cfg, slotOf(sw.dx, sw.w)) : null
  const long = !!sw && Math.abs(sw.dx) / Math.max(1, sw.w) >= LONG
  const label = act ? (labelFor?.(act) ?? ACT_LABEL[act]) : ''
  return <div className={`swwrap ${act ? 'armed' : ''} ${className ?? ''}`} style={act ? { background: `color-mix(in srgb, ${ACT_COLOR[act]} ${long ? 100 : 45}%, var(--bg))` } : undefined}>
    {act ? <div className={`swhint ${sw!.dx > 0 ? 'l' : 'r'}`}><span className={`cir ${long ? 'on' : ''}`} style={long ? { color: ACT_COLOR[act] } : undefined}><Icon n={ACT_ICON[act] as 'edit'} size={15} /></span>{long ? <b>{label}</b> : null}</div> : null}
    <div className="swrow" style={sw ? { transform: `translateX(${Math.max(-0.72 * sw.w, Math.min(0.72 * sw.w, sw.dx))}px)`, transition: 'none' } : undefined}
      onPointerDown={(e) => { if (e.pointerType === 'mouse') return; ref.current = { x0: e.clientX, y0: e.clientY, w: (e.currentTarget as HTMLElement).getBoundingClientRect().width, on: false, dead: false, last: null } }}
      onPointerMove={(e) => {
        const r = ref.current; if (!r || r.dead) return
        const dx = e.clientX - r.x0, dy = e.clientY - r.y0
        const ph = decide(dx, dy, false)
        if (ph === 'scroll') { r.dead = true; setSw(null); return }
        if (ph !== 'swipe') return
        if (!r.on) { r.on = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 합성 이벤트에서 던질 수 있다 */ } }
        const a = actOf(cfg, slotOf(dx, r.w))
        if (a !== r.last) { r.last = a; if (a) buzz(cfg.haptics) }
        setSw({ dx, w: r.w })
      }}
      onPointerUp={() => {
        const r = ref.current; ref.current = null
        const cur = sw; setSw(null)
        if (!r || !r.on || !cur) return
        swiped.current = true
        const a = actOf(cfg, slotOf(cur.dx, cur.w)); if (a) onAct(a)
      }}
      onPointerCancel={() => { ref.current = null; setSw(null) }}
      onClickCapture={(e) => { if (swiped.current) { swiped.current = false; e.preventDefault(); e.stopPropagation() } }}>
      {children}
    </div>
  </div>
}
