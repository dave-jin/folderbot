import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './paths'
import { cleanDraft, draftSid, isEmptyDraft, type Draft } from '../core/draft'

/**
 * 입력창 초안 장부 (DR · 2026-11-04) — 봇·세션마다 보내지 않은 글과 첨부 경로.
 * - 자리는 **앱 데이터** `<dataDir>/drafts.json` — 대화와 같은 대접이라 Dropbox 로 내보내지 않는다(`session.ts` 휴지통과 같은 원칙).
 * - 비면 지운다. 30일 넘게 안 고친 초안은 버린다(세션이 지워졌어도 줄이 쌓이지 않게).
 * - 쓰기는 0.5초 모아서 한 번 — 글자마다 디스크에 쓰지 않는다.
 */
export class DraftStore {
  private map = new Map<string, Draft>()
  private file: string
  private t: NodeJS.Timeout | null = null
  static readonly TTL = 30 * 24 * 3600_000

  constructor(dataDir: string) {
    this.file = join(dataDir, 'drafts.json')
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, Draft>
        const now = Date.now()
        for (const [k, v] of Object.entries(raw)) { const d = { ...cleanDraft(v, now), ...(v.by ? { by: String(v.by) } : {}) }; if (!isEmptyDraft(d) && now - d.at < DraftStore.TTL) this.map.set(k, d) }
      }
    } catch { /* 깨진 파일 — 빈 장부로 시작한다(초안은 편의다) */ }
  }

  private key(botId: string, sid: string): string { return `${botId}:${draftSid(sid)}` }

  get(botId: string, sid: string): Draft | null { return this.map.get(this.key(botId, sid)) ?? null }

  /** 넣고 돌려준다 — 비었으면 지우고 null. 더 옛것이 늦게 도착하면 무시하고 지금 것을 돌려준다 */
  set(botId: string, sid: string, raw: unknown, by: string): Draft | null {
    const k = this.key(botId, sid)
    const d: Draft = { ...cleanDraft(raw), by }
    const cur = this.map.get(k)
    if (cur && cur.at > d.at) return cur
    if (isEmptyDraft(d)) { if (!cur) return null; this.map.delete(k) } else this.map.set(k, d)
    this.flushSoon()
    return isEmptyDraft(d) ? null : d
  }

  private flushSoon(): void {
    if (this.t) return
    this.t = setTimeout(() => { this.t = null; this.flush() }, 500)
    this.t.unref?.()
  }

  flush(): void {
    try { atomicWrite(this.file, JSON.stringify(Object.fromEntries(this.map))) } catch { /* 디스크 실패 — 메모리 값은 남는다 */ }
  }
}
