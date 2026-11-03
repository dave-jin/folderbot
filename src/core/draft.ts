/**
 * 입력창 초안 — 기기를 건너 같은 세션에서 이어 쓰기 (DR · 2026-11-04 Dave: «채팅창은 자동 저장되어서 모바일이나 다른 곳에서도
 * 동일한 세션에 동일한 채팅이 보이면 좋겠어 (첨부 포함)» → 카드 답 «보내지 않은 초안»).
 *
 * 🔴 **초안의 정본은 호스트다.** 종전에는 그 기기의 localStorage 에만 있어서 맥에서 쓰다 만 글이 폰에 안 보였다.
 *    기기 저장소는 줄이 끊겼을 때의 예비로만 남는다.
 * 🔴 **첨부는 경로만 싣는다** — 붙이는 순간 이미 호스트 `첨부/` 로 올라가 있다(App `upload`). 올리는 중인 것은 싣지 않는다.
 * ⚠ 같은 사람이 두 기기에서 동시에 치는 일은 드물다 — 마지막에 쓴 쪽이 이긴다(`at`). 다만 **지금 치고 있는 입력창은**
 *    남의 초안으로 덮지 않는다(`shouldAdopt`) — 글자가 손가락 밑에서 바뀌면 사람은 앱이 고장 난 줄 안다.
 */
export interface DraftAtt { rel: string; abs: string; dir?: boolean; name?: string; size?: number }
export interface Draft { text: string; attach: DraftAtt[]; /** 마지막으로 고친 시각(ms) */ at: number; /** 고친 기기 id(호스트가 채운다) */ by?: string }

/** 세션 열쇠 — 아직 만들지 않은 새 대화는 'new' */
export const draftSid = (sid: string | null | undefined): string => (sid && /^[\w.:-]{1,80}$/.test(sid) ? sid : 'new')
export const MAX_DRAFT_TEXT = 200_000
export const MAX_DRAFT_ATT = 40

/** 받은 값을 초안 모양으로 — 모르는 칸·올리는 중인 첨부·지나친 길이는 버린다 */
export function cleanDraft(raw: unknown, now = Date.now()): Draft {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = typeof r.text === 'string' ? r.text.slice(0, MAX_DRAFT_TEXT) : ''
  const list = Array.isArray(r.attach) ? r.attach : []
  const attach: DraftAtt[] = []
  for (const x of list) {
    if (!x || typeof x !== 'object') continue
    const a = x as Record<string, unknown>
    if (a.uploading || typeof a.rel !== 'string' || !a.rel) continue
    attach.push({ rel: a.rel, abs: typeof a.abs === 'string' ? a.abs : '', ...(a.dir ? { dir: true } : {}), ...(typeof a.name === 'string' ? { name: a.name } : {}), ...(typeof a.size === 'number' ? { size: a.size } : {}) })
    if (attach.length >= MAX_DRAFT_ATT) break
  }
  const at = typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0 ? Math.min(r.at, now + 60_000) : now
  return { text, attach, at }
}

export const isEmptyDraft = (d: Pick<Draft, 'text' | 'attach'> | null | undefined): boolean => !d || (!d.text.trim() && !d.attach.length)

/** 두 초안이 같은 내용인가 — 시각·기기는 보지 않는다 */
export function sameDraft(a: Pick<Draft, 'text' | 'attach'> | null | undefined, b: Pick<Draft, 'text' | 'attach'> | null | undefined): boolean {
  if (isEmptyDraft(a) && isEmptyDraft(b)) return true
  if (!a || !b || a.text !== b.text || a.attach.length !== b.attach.length) return false
  return a.attach.every((x, i) => x.rel === b.attach[i].rel)
}

/**
 * 다른 기기에서 온 초안을 지금 입력창에 들일까.
 * - 내가 보낸 것이면 안 들인다(되돌이).
 * - 방금(1.5초 안) 친 입력창은 덮지 않는다 — 곧 내 쪽이 호스트로 가서 이긴다.
 * - 내 쪽이 더 새것이면 안 들인다.
 */
export function shouldAdopt(o: { incoming: Draft | null; me: string; local: Pick<Draft, 'text' | 'attach'> & { at: number }; lastTypedAt: number; now?: number }): boolean {
  const now = o.now ?? Date.now()
  const inc = o.incoming
  if (inc?.by && inc.by === o.me) return false
  if (now - o.lastTypedAt < 1500) return false
  if (sameDraft(inc, o.local)) return false
  const incAt = inc?.at ?? now
  return incAt >= o.local.at
}

/** 기기 저장소의 예비본과 호스트 것 중 무엇으로 시작할까 — 더 새것. 같으면 호스트 */
export function pickStart(local: Draft | null, host: Draft | null): Draft | null {
  if (!local) return host
  if (!host) return local
  return local.at > host.at ? local : host
}
