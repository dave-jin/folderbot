import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CANVAS_PALETTE, autoSide, canvasBounds, canvasId, insideGroup, nodeColor, parseCanvas, serializeCanvas, sidePoint, type CDoc, type CEdge, type CNode } from '../core/canvas'
import { Icon } from './FolderBot'
import { Md } from './Sheets'

/**
 * Canvas — **Obsidian 의 `.canvas` 를 그대로 읽고 그대로 고친다** (JSON Canvas 1.0).
 *
 * 🔴 **화면 변환은 하나뿐이다.** 노드마다 좌표를 계산하지 않고 **판 하나를 `transform` 으로** 옮기고
 *    키운다 — 노드가 수백 개여도 옮길 때 다시 계산하는 것은 문자열 하나다.
 * 🔴 **모르는 필드를 버리지 않는다** — 우리가 모르는 값도 Obsidian 에는 뜻이 있다. 읽을 때 들고 있다가
 *    저장할 때 그대로 돌려준다(`core/canvas.ts`). 저장 모양도 Obsidian 과 같은 **탭 들여쓰기** 다 —
 *    다르게 쓰면 열기만 해도 파일이 통째로 바뀐 diff 가 난다.
 * ⚠ **그룹을 옮기면 안에 완전히 들어 있는 노드가 함께 간다** (Obsidian 동작).
 * ⚠ 저장은 **손을 뗀 뒤**(드래그 끝·편집 끝)에만 한다 — 끄는 동안 매 프레임 저장하면 파일이 수백 번 쓰인다.
 */

type View = { x: number; y: number; z: number }
type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'node'; id: string; sx: number; sy: number; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'size'; id: string; sx: number; sy: number; w: number; h: number }
  | { kind: 'edge'; from: string; side: string; x: number; y: number }

export default function Canvas({ text, onCommit, onOpenFile, raw, readOnly }: {
  text: string
  onCommit: (next: string) => void
  onOpenFile: (rel: string) => void
  /** 캔버스 기준 상대경로 → 실제로 받을 수 있는 주소 */
  raw: (rel: string) => string
  readOnly?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 })
  const [doc, setDoc] = useState<CDoc>(() => parseCanvas(text))
  const [sel, setSel] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [edit, setEdit] = useState<{ id: string; v: string } | null>(null)
  const drag = useRef<Drag | null>(null)
  const mine = useRef(text)          // 내가 쓴 글 — 밖에서 바뀐 것만 다시 읽는다

  useEffect(() => { if (text !== mine.current) { mine.current = text; setDoc(parseCanvas(text)) } }, [text])

  const commit = useCallback((nodes: CNode[], edges: CEdge[]) => {
    const next = serializeCanvas({ extra: doc.extra, nodes, edges })
    mine.current = next
    setDoc((d) => ({ ...d, nodes, edges }))
    onCommit(next)
  }, [doc.extra, onCommit])

  /** 열 때 한 번 — 다 보이게 맞춘다 */
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !host.current) return
    const b = canvasBounds(doc.nodes)
    const r = host.current.getBoundingClientRect()
    if (!b || !r.width) return
    fitted.current = true
    const z = Math.min(1, Math.min((r.width - 80) / Math.max(1, b.w), (r.height - 80) / Math.max(1, b.h)))
    setView({ z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z })
  }, [doc.nodes])

  /** 화면 좌표 → 캔버스 좌표 */
  const toCanvas = (cx: number, cy: number) => {
    const r = host.current?.getBoundingClientRect()
    return { x: ((cx - (r?.left ?? 0)) - view.x) / view.z, y: ((cy - (r?.top ?? 0)) - view.y) / view.z }
  }

  // ── 끌기 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const d = drag.current; if (!d) return
      if (d.kind === 'pan') { setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) })); return }
      if (d.kind === 'edge') { const p = toCanvas(e.clientX, e.clientY); drag.current = { ...d, x: p.x, y: p.y }; setTick((t) => t + 1); return }
      const dx = (e.clientX - d.sx) / view.z, dy = (e.clientY - d.sy) / view.z
      if (d.kind === 'size') {
        setDoc((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === d.id ? { ...n, width: Math.max(60, Math.round(d.w + dx)), height: Math.max(40, Math.round(d.h + dy)) } : n)) }))
        return
      }
      if (Math.abs(dx) + Math.abs(dy) > 1) drag.current = { ...d, moved: true }
      setDoc((s) => ({ ...s, nodes: s.nodes.map((n) => { const o = d.orig.get(n.id); return o ? { ...n, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : n }) }))
    }
    const up = (e: PointerEvent) => {
      const d = drag.current; drag.current = null
      if (!d) return
      if (d.kind === 'edge') {
        const p = toCanvas(e.clientX, e.clientY)
        const hit = doc.nodes.find((n) => p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height && n.id !== d.from)
        if (hit) commit(doc.nodes, [...doc.edges, { id: canvasId(), fromNode: d.from, fromSide: d.side, toNode: hit.id, toEnd: 'arrow' }])
        else setTick((t) => t + 1)
        return
      }
      if (d.kind === 'node' && !d.moved) return          // 그냥 고른 것 — 저장할 일이 없다
      if (d.kind === 'pan') return
      setDoc((s) => { commit(s.nodes, s.edges); return s })
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
  }, [view.z, doc, commit])
  const [, setTick] = useState(0)

  // ── 키보드 — 지운다 · 고르기 푼다. ⚠ 글을 치는 중이면 아무것도 하지 않는다 ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!host.current?.contains(document.activeElement) && !host.current?.matches(':hover')) return
      if (e.key === 'Escape') { setSel(null); setEdit(null); return }
      if (!sel || readOnly) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (sel.kind === 'node') commit(doc.nodes.filter((n) => n.id !== sel.id), doc.edges.filter((x) => x.fromNode !== sel.id && x.toNode !== sel.id))
        else commit(doc.nodes, doc.edges.filter((x) => x.id !== sel.id))
        setSel(null)
      }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [sel, doc, commit, readOnly])

  const addText = (cx: number, cy: number) => {
    if (readOnly) return
    const p = toCanvas(cx, cy)
    const n: CNode = { id: canvasId(), type: 'text', x: Math.round(p.x - 100), y: Math.round(p.y - 40), width: 200, height: 80, text: '' }
    commit([...doc.nodes, n], doc.edges)
    setSel({ kind: 'node', id: n.id }); setEdit({ id: n.id, v: '' })
  }

  const byId = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes])
  const dragging = drag.current

  if (doc.error) return <div className="empty">캔버스 파일을 못 읽었어요 — JSON 이 깨졌습니다.</div>

  return <div className="cvs" ref={host}
    onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('cvs-plane')) { setSel(null); drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y } } }}
    onDoubleClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('cvs-plane')) addText(e.clientX, e.clientY) }}
    onWheel={(e) => {
      // ⚠ 커서 아래 지점을 붙잡고 확대한다 — 안 그러면 확대할 때마다 보던 곳이 달아난다
      const f = Math.exp(-e.deltaY * 0.0015)
      const z = Math.min(3, Math.max(0.15, view.z * f))
      const r = host.current?.getBoundingClientRect()
      const mx = e.clientX - (r?.left ?? 0), my = e.clientY - (r?.top ?? 0)
      setView({ z, x: mx - ((mx - view.x) / view.z) * z, y: my - ((my - view.y) / view.z) * z })
    }}>

    <div className="cvs-plane" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
      {/* 엣지 — 노드보다 뒤에 (스펙의 z순서는 배열 순서, 엣지는 그 아래) */}
      <svg className="cvs-edges" width="1" height="1" style={{ overflow: 'visible' }}>
        <defs><marker id="cvarrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor" /></marker></defs>
        {doc.edges.map((e) => {
          const a = byId.get(e.fromNode), b = byId.get(e.toNode)
          if (!a || !b) return null
          const auto = autoSide(a, b)
          const p1 = sidePoint(a, e.fromSide ?? auto.from), p2 = sidePoint(b, e.toSide ?? auto.to)
          const c = Math.max(40, Math.abs(p2.x - p1.x) / 2)
          const horiz = (e.fromSide ?? auto.from) === 'left' || (e.fromSide ?? auto.from) === 'right'
          const d = `M${p1.x},${p1.y} C${horiz ? p1.x + (p2.x > p1.x ? c : -c) : p1.x},${horiz ? p1.y : p1.y + (p2.y > p1.y ? c : -c)} ${horiz ? p2.x + (p2.x > p1.x ? -c : c) : p2.x},${horiz ? p2.y : p2.y + (p2.y > p1.y ? -c : c)} ${p2.x},${p2.y}`
          const on = sel?.kind === 'edge' && sel.id === e.id
          return <g key={e.id} style={{ color: nodeColor(e.color) }} onPointerDown={(ev) => { ev.stopPropagation(); setSel({ kind: 'edge', id: e.id }) }}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} />
            <path d={d} fill="none" stroke="currentColor" strokeWidth={on ? 3 : 2} opacity={on ? 1 : .75}
              markerEnd={e.toEnd === 'none' ? undefined : 'url(#cvarrow)'} markerStart={e.fromEnd === 'arrow' ? 'url(#cvarrow)' : undefined} />
            {e.label ? <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6} textAnchor="middle" fill="currentColor" fontSize={12}>{e.label}</text> : null}
          </g>
        })}
        {dragging?.kind === 'edge' ? (() => {
          const a = byId.get(dragging.from); if (!a) return null
          const p1 = sidePoint(a, dragging.side)
          return <path d={`M${p1.x},${p1.y} L${dragging.x},${dragging.y}`} fill="none" stroke="var(--t3)" strokeWidth={2} strokeDasharray="4 4" />
        })() : null}
      </svg>

      {doc.nodes.map((n) => {
        const on = sel?.kind === 'node' && sel.id === n.id
        const col = nodeColor(n.color)
        const group = n.type === 'group'
        return <div key={n.id} className={`cvs-n ${group ? 'grp' : ''} ${on ? 'on' : ''}`}
          style={{ left: n.x, top: n.y, width: n.width, height: n.height, borderColor: n.color ? col : undefined, background: group && n.color ? `${col}14` : undefined }}
          onPointerDown={(e) => {
            e.stopPropagation(); setSel({ kind: 'node', id: n.id })
            if (readOnly || edit?.id === n.id) return
            const ids = group ? [n.id, ...insideGroup(n, doc.nodes)] : [n.id]
            const orig = new Map(doc.nodes.filter((x) => ids.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y }]))
            drag.current = { kind: 'node', id: n.id, sx: e.clientX, sy: e.clientY, orig, moved: false }
          }}
          onDoubleClick={(e) => { e.stopPropagation(); if (!readOnly && n.type === 'text') setEdit({ id: n.id, v: String(n.text ?? '') }) }}>

          {group ? <div className="cvs-glabel" style={{ color: n.color ? col : undefined }}>{n.label ?? ''}</div> : null}

          {n.type === 'text' ? (edit?.id === n.id
            ? <textarea className="cvs-ta" autoFocus value={edit.v} onChange={(ev) => setEdit({ id: n.id, v: ev.target.value })}
                onPointerDown={(ev) => ev.stopPropagation()}
                onBlur={() => { commit(doc.nodes.map((x) => (x.id === n.id ? { ...x, text: edit.v } : x)), doc.edges); setEdit(null) }} />
            : <div className="cvs-md"><Md text={String(n.text ?? '') || '…'} /></div>) : null}

          {n.type === 'file' && n.file ? <FileNode file={n.file} raw={raw} onOpen={() => onOpenFile(n.file!)} /> : null}

          {n.type === 'link' && n.url ? <a className="cvs-link" href={n.url} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()}>
            <Icon n="open" size={12} /><span>{(() => { try { return new URL(n.url).host } catch { return n.url } })()}</span>
          </a> : null}

          {/* 잡는 자리 — 네 면에서 끌면 엣지가 그려지고, 오른쪽 아래로 끌면 크기가 바뀐다 */}
          {!readOnly && !group ? <>
            {(['top', 'right', 'bottom', 'left'] as const).map((s) => <span key={s} className={`cvs-port ${s}`}
              onPointerDown={(e) => { e.stopPropagation(); const p = toCanvas(e.clientX, e.clientY); drag.current = { kind: 'edge', from: n.id, side: s, x: p.x, y: p.y }; setTick((t) => t + 1) }} />)}
            <span className="cvs-size" onPointerDown={(e) => { e.stopPropagation(); drag.current = { kind: 'size', id: n.id, sx: e.clientX, sy: e.clientY, w: n.width, h: n.height } }} />
          </> : null}
        </div>
      })}
    </div>

    {/* 도구 — 조용히, 오른쪽 아래 */}
    <div className="cvs-bar">
      {sel?.kind ? <span className="cvs-pal">{Object.keys(CANVAS_PALETTE).map((k) => <button key={k} style={{ background: CANVAS_PALETTE[k] }} title={`색 ${k}`}
        onClick={() => sel.kind === 'node'
          ? commit(doc.nodes.map((n) => (n.id === sel.id ? { ...n, color: k } : n)), doc.edges)
          : commit(doc.nodes, doc.edges.map((e) => (e.id === sel.id ? { ...e, color: k } : e)))} />)}
        <button className="none" title="색 지우기" onClick={() => sel.kind === 'node'
          ? commit(doc.nodes.map((n) => { if (n.id !== sel.id) return n; const { color, ...rest } = n; return rest as CNode }), doc.edges)
          : commit(doc.nodes, doc.edges.map((e) => { if (e.id !== sel.id) return e; const { color, ...rest } = e; return rest as CEdge }))} /></span> : null}
      <span className="cvs-z mono">{Math.round(view.z * 100)}%</span>
      <button className="ib" title="다 보이게" onClick={() => { fitted.current = false; setView((v) => ({ ...v })) }}><Icon n="expand" size={13} /></button>
      {!readOnly ? <button className="ib" title="글 상자 더하기 (빈 곳 더블클릭)" onClick={() => { const r = host.current?.getBoundingClientRect(); if (r) addText(r.left + r.width / 2, r.top + r.height / 2) }}><Icon n="plus" size={13} /></button> : null}
    </div>
  </div>
}

const IMG = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

/** file 노드 — 이미지는 그대로, 마크다운은 미리보기, 그 외는 여는 단추 */
function FileNode({ file, raw, onOpen }: { file: string; raw: (r: string) => string; onOpen: () => void }) {
  const [md, setMd] = useState<string | null>(null)
  useEffect(() => {
    if (!/\.(md|markdown|txt)$/i.test(file)) return
    let live = true
    void fetch(raw(file)).then((r) => (r.ok ? r.text() : null)).then((t) => { if (live) setMd(t) }).catch(() => {})
    return () => { live = false }
  }, [file, raw])
  if (IMG.test(file)) return <div className="cvs-media" onDoubleClick={onOpen}><img src={raw(file)} alt={file} draggable={false} /></div>
  if (/\.pdf$/i.test(file)) return <iframe className="cvs-media" src={raw(file)} title={file} />
  if (md !== null) return <div className="cvs-md"><Md text={md} /></div>
  return <button className="cvs-file" onClick={onOpen} onPointerDown={(e) => e.stopPropagation()}><Icon n="doc" size={12} /><span>{file.split('/').pop()}</span></button>
}
