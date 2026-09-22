import { watch, type FSWatcher } from 'node:fs'
import { CONFIG_DEBOUNCE_MS, ignoredChange, isBotConfigChange, WATCH_DEBOUNCE_MS } from '../core/fileWatch'

/**
 * 봇 폴더 감시자 (2026-09-18) — 호스트가 봇 폴더를 직접 보고 «파일 바뀜»(`files` 프레임)을 알린다.
 *
 * 종전에는 신호가 두 갈래뿐이었다: ① 세션이 Write·Edit 도구를 *부르는* 줄(쓰기 전에 나갔다) ② UI 에서
 * 직접 한 조작. Bash(`cat >` · `mv`)·MCP·Codex·Dropbox 동기화·Finder 가 만든 파일은 아무 신호가 없어
 * 트리가 다른 조작을 할 때까지 낡아 있었다 — 원격에서는 트리가 유일한 창이라 그대로 보였다.
 *
 * - 봇마다 `fs.watch(abs, { recursive: true })` 하나. macOS(FSEvents)·Linux(Node 20+) 모두 재귀를 지원한다.
 *   겹치는 폴더(루트 봇 + 하위 봇)는 **둘 다** 알린다 — 화면은 봇 id 로 트리를 갱신하므로 둘 다 맞다.
 * - 앱 상태·도구 폴더는 `core/fileWatch.ignoredChange` 로 거른다(세션 저장이 트리 갱신을 부르면 소음이다).
 * - 감시를 못 걸면(권한·한도) 조용히 넘어간다 — 세션 경로의 신호는 그대로 살아 있다. 이유는 로그에 남긴다.
 */
export class FolderWatch {
  private ws = new Map<string, { abs: string; w: FSWatcher }>()
  private timers = new Map<string, NodeJS.Timeout>()
  private cfgTimers = new Map<string, NodeJS.Timeout>()
  log: (s: string) => void = () => {}
  /** `onConfig` — 봇 폴더의 `.bot.yml` 이 바뀌었다(AA-2). 파일 신호와 **따로** 알린다: 하는 일이 다르다(스케줄 다시 걸기) */
  constructor(private onChange: (botId: string) => void, private onConfig: (botId: string) => void = () => {}) {}

  /** 현재 봇 목록에 맞춘다 — 새 봇은 걸고, 사라진 봇은 풀고, 폴더가 바뀐 봇은 다시 건다 */
  sync(bots: { id: string; abs: string }[]): void {
    const want = new Map(bots.map((b) => [b.id, b.abs]))
    for (const [id, cur] of this.ws) if (want.get(id) !== cur.abs) this.drop(id)
    for (const [id, abs] of want) if (!this.ws.has(id)) this.add(id, abs)
  }
  private add(id: string, abs: string): void {
    try {
      const w = watch(abs, { recursive: true, persistent: false }, (_ev, name) => {
        const rel = name == null ? '' : String(name)
        if (ignoredChange(rel)) return
        if (isBotConfigChange(rel)) this.bumpCfg(id)
        this.bump(id)
      })
      w.on('error', (e: Error) => { this.log(`폴더 감시 오류 · ${abs} · ${e.message}`); this.drop(id) })
      this.ws.set(id, { abs, w })
    } catch (e) { this.log(`폴더 감시 실패 · ${abs} · ${(e as Error).message}`) }
  }
  private drop(id: string): void {
    const cur = this.ws.get(id); if (!cur) return
    try { cur.w.close() } catch { /* */ }
    this.ws.delete(id)
    const t = this.timers.get(id); if (t) { clearTimeout(t); this.timers.delete(id) }
    const ct = this.cfgTimers.get(id); if (ct) { clearTimeout(ct); this.cfgTimers.delete(id) }
  }
  private bump(id: string): void {
    const t = this.timers.get(id); if (t) clearTimeout(t)
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); if (this.ws.has(id)) this.onChange(id) }, WATCH_DEBOUNCE_MS))
  }
  private bumpCfg(id: string): void {
    const t = this.cfgTimers.get(id); if (t) clearTimeout(t)
    this.cfgTimers.set(id, setTimeout(() => { this.cfgTimers.delete(id); if (this.ws.has(id)) this.onConfig(id) }, CONFIG_DEBOUNCE_MS))
  }
  close(): void { for (const id of [...this.ws.keys()]) this.drop(id) }
}
