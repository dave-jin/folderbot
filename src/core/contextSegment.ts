/**
 * 여러 폴더 세션 조각 — «맥락 상황판» 1단계 (2026-11-01).
 * 오케스트레이터·«🤝 소통»·연결(bridge) 세션은 한 세션이 여러 폴더 일을 건드린다. 그대로 한 장으로 줄이면 어느 폴더 일인지 섞이므로
 * **사람 말 하나 = 조각 하나** 로 나누고, 조각마다 폴더를 가린다.
 *
 * ⚠ **순수 모듈이다 — IO 없음.** 폴더를 못 가린 조각(`null`)은 뒤 과제가 Haiku 에 맡기고, 그래도 없으면 «볼트 운영»(`VAULT_OPS`)으로 간다.
 */
import type { ChatItem } from './types'
import type { CardChannel } from './contextCard'

/** 조각 하나 — botId null = Haiku 가 고를 것 */
export interface Segment { seg: number; items: ChatItem[]; botId: string | null }
/** «볼트 운영» 카드가 붙는 botId */
export const VAULT_OPS = 'orch'

/**
 * 세션이 어느 갈래 카드인가. 순서가 우선순위다 — orch → comm → channel(bridge) → 입양 안 된 루틴 → folder.
 * 입양된 루틴(`adopted`)은 사람이 이어 쓴 세션이라 folder 로 본다.
 */
export function cardChannel(rec: { botId: string; comm?: boolean; channel?: unknown; routine?: string; adopted?: boolean }): CardChannel {
  if (rec.botId === VAULT_OPS) return 'orch'
  if (rec.comm) return 'comm'
  if (rec.channel != null) return 'bridge'
  if (rec.routine && !rec.adopted) return 'routine'
  return 'folder'
}

/** 여러 폴더 일이 섞이는 갈래만 조각낸다 */
export function needsSplit(ch: CardChannel): boolean {
  return ch === 'orch' || ch === 'comm' || ch === 'bridge'
}

/**
 * 사람(user) 말 하나가 조각 하나의 시작이다. 첫 user 앞의 줄(system 등)은 첫 조각에 붙는다.
 * user 가 하나도 없으면 통째로 한 조각, 빈 입력은 [].
 */
export function splitSegments(items: ChatItem[]): ChatItem[][] {
  const out: ChatItem[][] = []
  let cur: ChatItem[] = []
  let seenUser = false
  for (const it of items) {
    if (it.kind === 'user') {
      if (seenUser) { out.push(cur); cur = [] }
      seenUser = true
    }
    cur.push(it)
  }
  if (cur.length) out.push(cur)
  return out
}

/** `orchAskHead`(host/mcp.ts) 꼴 `[요청 ← 이름 · botId · sid]` — 이름에 ` · ` 가 있어도 뒤 두 칸을 botId·sid 로 읽는다 */
const RE_HEAD = /^\s*\[요청\s*←\s*.*?\s·\s([^\s·\]]+)\s·\s([^\s·\]]+)\]/
const BOT_SEND = new Set(['bot_send', 'mcp__folderbot__bot_send'])

/**
 * 조각의 폴더를 코드로 읽는다. ① 첫 user 글의 요청 머리 botId ② `bot_send` 도구 입력의 `bot`.
 * `bots` 는 호스트가 만든 «botId · 이름 · 표시 이름 · 상대 경로 → 정본 botId» 표다. 표 밖이면 null — 없는 폴더를 지어내지 않는다.
 */
export function segmentFolder(seg: ChatItem[], bots: Map<string, string>): string | null {
  const first = seg.find(it => it.kind === 'user')
  if (first && first.kind === 'user') {
    const m = RE_HEAD.exec(first.text)
    const hit = m && bots.get(m[1])
    if (hit) return hit
  }
  for (const it of seg) {
    if (it.kind !== 'tool' || !BOT_SEND.has(it.name)) continue
    const b = it.input?.bot
    if (typeof b !== 'string') continue
    const hit = bots.get(b.trim())
    if (hit) return hit
  }
  return null
}
