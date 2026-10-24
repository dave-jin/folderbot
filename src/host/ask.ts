/**
 * 🔴 DA · `folderbot ask` 의 대기 창구 (2026-10-24 Dave «claude -p 처럼 바로 묻고 답받기»).
 * 설계 `PARA/2. Area/제품_FolderBot/01_기획/2026-10-24_기획_folderbot-ask-바깥-에이전트-실시간-대화.md`(2판) §7.
 *
 * ask 는 새 우편함이 아니다 — 묻는 말은 `to-folderbot/` 편지, 답은 `from-folderbot/` 편지 그대로다. 여기서 하는 일은 하나:
 * **묻는 편지 id 마다 «누가 화면 앞에서 기다리나» 를 들고 있다가, 답 편지가 생기는 순간 돌려준다.**
 *  - 답 = 그 편지 id 를 `re` 로 단 첫 `bridge_send`. 그것 없이 턴이 끝나면 호스트가 마지막 답으로 답 편지를 쓴다(host.ts `askTurnEnded`).
 *  - 기다리는 쪽이 살아 있을 때 쓴 답 편지에만 `delivered: live` 가 붙는다 — 상대는 그 편지를 슬롯에서 다시 처리하지 않는다.
 *    그래서 «살아 있나» 를 편지를 쓰기 **직전에** 묻고(`state`), 쓴 **직후에** 돌려준다(`answered`) — 그 사이에 비동기 틈이 없다.
 *  - 시간이 다 되면 기다림만 끝난다(항목은 남는다) — 턴이 끝나면 답 편지는 그래도 생기고, `--wait` 나 다음 슬롯이 읽는다.
 * 호스트가 다시 뜨면 비어 있다 — 그때는 봇의 `bridge_send` 가 평소 답 편지를 쓴다(묻는 말은 잃지 않는다).
 */
export interface AskAnswer { reply: string; rel: string; answer: string; needsHuman: boolean; error?: string }
interface Entry { peerId: string; botId: string; sid: string; at: number; answered: boolean; urgent: boolean; error?: string; waiter?: (a: AskAnswer | null) => void; timer?: NodeJS.Timeout }

/** 상대마다 동시에 기다리는 ask 수 */
export const ASK_MAX_OPEN = 3
/** 하루 넘은 항목은 버린다(답이 끝내 안 온 것) */
const KEEP_MS = 24 * 3600_000

export class AskDesk {
  private m = new Map<string, Entry>()
  constructor(private now: () => number = Date.now) {}

  /** `urgent` — 기다리는 쪽이 떠난 뒤에 답이 나면 긴급 메일로 알린다(설계 2판 §2 · 10분에 한 통 규칙은 그대로) */
  track(id: string, e: { peerId: string; botId: string; sid: string; urgent?: boolean }): void {
    for (const [k, v] of this.m) if (this.now() - v.at > KEEP_MS && !v.waiter) this.m.delete(k)
    this.m.set(id, { ...e, urgent: !!e.urgent, at: this.now(), answered: false })
  }
  /** 지금 화면 앞에서 기다리는 수 — 상한(`ASK_MAX_OPEN`) 판정 */
  openFor(peerId: string): number { let n = 0; for (const v of this.m.values()) if (v.peerId === peerId && v.waiter) n++; return n }
  /** 답을 기다린다 — 시간이 다 되면 null(항목은 남는다) */
  wait(id: string, ms: number): Promise<AskAnswer | null> {
    const e = this.m.get(id); if (!e) return Promise.resolve(null)
    return new Promise((res) => {
      const done = (a: AskAnswer | null) => { if (e.timer) clearTimeout(e.timer); e.timer = undefined; e.waiter = undefined; res(a) }
      e.waiter = done
      e.timer = setTimeout(() => done(null), Math.max(0, ms)); e.timer.unref?.()
    })
  }
  /** 묻는 쪽이 끊고 나갔다 */
  cancel(id: string): void { this.m.get(id)?.waiter?.(null) }
  /**
   * 답 편지를 쓰기 직전 — live(지금 기다리는 중 → `delivered: live`) · 아니면 ask 로 왔지만 아무도 안 기다림.
   * `wake` — 급한 ask 인데 기다리는 쪽이 떠났다 → 답 편지를 쓰면서 깨운다. null 은 ask 가 아니거나 이미 답함
   */
  state(peerId: string, re: string): { live: boolean; wake: boolean } | null {
    const e = this.m.get(re); if (!e || e.peerId !== peerId || e.answered) return null
    return { live: !!e.waiter, wake: !e.waiter && e.urgent }
  }
  /** 답 편지를 쓴 직후 — 기다리는 쪽에 돌려준다 */
  answered(peerId: string, re: string, a: Omit<AskAnswer, 'error'>): void {
    const e = this.m.get(re); if (!e || e.peerId !== peerId || e.answered) return
    e.answered = true
    e.waiter?.({ ...a, ...(e.error ? { error: e.error } : {}) })
  }
  /** 턴이 오류로 끝났다 — 다음 `answered` 에 실어 보낸다 */
  fail(id: string, why: string): void { const e = this.m.get(id); if (e) e.error = why }
  /** 이 세션에서 아직 답이 없는 ask 편지 id */
  pendingIn(sid: string): { id: string; peerId: string; botId: string }[] {
    return [...this.m].filter(([, v]) => v.sid === sid && !v.answered).map(([id, v]) => ({ id, peerId: v.peerId, botId: v.botId }))
  }
}

/**
 * 턴이 끝난 세션에서 그 편지의 답을 고른다 — 그 편지가 든 사람 줄(편지 묶음)부터 **다음 사람 줄 앞까지**(그 편지의 턴)의 마지막 봇 말.
 * ⚠ 뒤 턴의 말을 앞 편지의 답으로 집지 않는다 — 큐에서 나간 다음 편지의 턴이 끝날 때 앞 편지가 아직 걸려 있을 수 있다.
 * @returns 편지가 아직 안 들어갔으면(큐에 있음) null · 들어갔는데 그 턴에 봇 말이 없으면 빈 글
 */
export function answerAfter(items: readonly { kind: string; text?: string }[], letterId: string): string | null {
  let at = -1
  for (let i = items.length - 1; i >= 0; i--) { const it = items[i]; if (it.kind === 'user' && (it.text ?? '').includes(`id="${letterId}"`)) { at = i; break } }
  if (at < 0) return null
  let end = items.length
  for (let i = at + 1; i < items.length; i++) if (items[i].kind === 'user') { end = i; break }
  for (let i = end - 1; i > at; i--) { const it = items[i]; if (it.kind === 'assistant' && (it.text ?? '').trim()) return (it.text ?? '').trim() }
  return ''
}
