/**
 * JSON Canvas 1.0 — 순수 로직 (Obsidian 호환 `.canvas`).
 * ⛔ 여기엔 DOM 도 네트워크도 없다. 그리는 것은 `client/Canvas.tsx`.
 */
export interface CNode {
  id: string; type: 'text' | 'file' | 'link' | 'group' | string
  x: number; y: number; width: number; height: number
  text?: string; file?: string; subpath?: string; url?: string; label?: string
  color?: string; background?: string; backgroundStyle?: string
  [k: string]: unknown          // ⚠ 스펙 밖 필드도 그대로 들고 있다가 그대로 저장한다
}
export interface CEdge {
  id: string; fromNode: string; toNode: string
  fromSide?: string; toSide?: string; fromEnd?: string; toEnd?: string
  color?: string; label?: string
  [k: string]: unknown
}
export interface CDoc { extra: Record<string, unknown>; nodes: CNode[]; edges: CEdge[]; error: boolean }

/** 🔴 **읽을 때 모르는 것을 버리지 않는다** — 우리가 모르는 필드도 Obsidian 에는 뜻이 있다 */
export function parseCanvas(src: string): CDoc {
  try {
    const data = JSON.parse(src || '{}') as Record<string, unknown>
    const { nodes, edges, ...extra } = data
    return { extra, nodes: (nodes as CNode[]) ?? [], edges: (edges as CEdge[]) ?? [], error: false }
  } catch { return { extra: {}, nodes: [], edges: [], error: true } }
}

/** ⚠ Obsidian 과 같은 모양으로 쓴다 — 탭 들여쓰기. 다르게 쓰면 열 때마다 파일이 통째로 바뀐 diff 가 난다 */
export function serializeCanvas(d: Pick<CDoc, 'extra' | 'nodes' | 'edges'>): string {
  return JSON.stringify({ ...d.extra, nodes: d.nodes, edges: d.edges }, null, '\t')
}

/** 16자리 hex — Obsidian 이 쓰는 id 규칙 */
export function canvasId(rnd: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < 16; i++) s += Math.floor(rnd() * 16).toString(16)
  return s
}

export const CANVAS_PALETTE: Record<string, string> = {
  '1': '#f0554e', '2': '#f5a623', '3': '#f5d90a', '4': '#34c77b', '5': '#4db8d8', '6': '#b58cff'
}
export const nodeColor = (c?: string): string => (c ? (CANVAS_PALETTE[c] ?? (c.startsWith('#') ? c : '#8f8f8f')) : '#3a4150')

/** 엣지가 붙는 자리 */
export function sidePoint(n: CNode, side?: string): { x: number; y: number } {
  if (side === 'top') return { x: n.x + n.width / 2, y: n.y }
  if (side === 'bottom') return { x: n.x + n.width / 2, y: n.y + n.height }
  if (side === 'left') return { x: n.x, y: n.y + n.height / 2 }
  if (side === 'right') return { x: n.x + n.width, y: n.y + n.height / 2 }
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
}

/** 면을 안 정해 뒀으면 두 노드의 상대 위치로 고른다 (Obsidian 과 같은 결과) */
export function autoSide(a: CNode, b: CNode): { from: string; to: string } {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2)
  const dy = b.y + b.height / 2 - (a.y + a.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' }
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' }
}

/** 모든 노드를 담는 사각형 — 열 때 «다 보이게» 맞추는 데 쓴다 */
export function canvasBounds(nodes: CNode[]): { x: number; y: number; w: number; h: number } | null {
  if (!nodes.length) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 그룹을 옮기면 **안에 완전히 들어 있는 노드**가 함께 간다 (Obsidian 동작) */
export function insideGroup(g: CNode, nodes: CNode[]): string[] {
  return nodes.filter((n) => n.id !== g.id && n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height).map((n) => n.id)
}
