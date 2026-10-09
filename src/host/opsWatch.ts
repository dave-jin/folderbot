import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ownsPeer } from '../core/bridges'
import { OPS_ALERT_AFTER, parseOps, tailLines, type OpsConfig } from '../core/ops'

/**
 * BZ · 호스트 운영 감시 — `.claude/ops.yml` 의 명령을 주기마다 LLM 없이 실행한다(core/ops.ts 머리말).
 *  - 앞 회차가 아직 돌면 이번 회차는 건너뛴다(겹쳐 돌지 않는다) · `timeout` 넘으면 끊고 실패로 적는다.
 *  - 결과(종료 코드·소요 시간·stderr 끝 5줄)는 루틴 실행 기록(runs.jsonl)에 `ops_watch` 로 남긴다.
 *  - 연속 3회 실패하면 오케스트레이터 소통 세션에 한 번 알리고, 다시 성공하면 «회복» 을 한 번 알린다.
 *  - `host:` 가 이 호스트가 아니면 돌지 않는다.
 */
export interface OpsDeps {
  root: string
  hostNames: () => string[]
  log: (s: string) => void
  note: (e: { event: 'ops_watch'; ok: boolean; code: number | null; ms: number; command: string; stderr?: string; timedOut?: boolean; skipped?: boolean }) => void
  alert: (text: string) => void
  /** 첫 회차까지 기다리는 시간(켜자마자 몰리지 않게) */
  firstDelayMs?: number
}

export class OpsWatch {
  cfg: OpsConfig = { errors: [] }
  private timer: NodeJS.Timeout | null = null
  private first: NodeJS.Timeout | null = null
  private running = false
  private fails = 0
  private alerted = false
  private lastKey = ''
  constructor(private d: OpsDeps) {}

  file(): string { return join(this.d.root, '.claude', 'ops.yml') }

  /** 설정을 다시 읽어 주기를 맞춘다 — 켤 때 · `.claude/ops.yml` 이 바뀔 때 */
  reload(): void {
    const f = this.file()
    this.cfg = existsSync(f) ? parseOps(readFileSync(f, 'utf8')) : { errors: [] }
    if (this.cfg.errors.length) this.d.log(`⚠ 운영 감시 설정: ${this.cfg.errors.join(' · ')}`)
    const w = this.cfg.watch
    const mine = !!w && ownsPeer({ host: this.cfg.host }, this.d.hostNames())
    const key = !w ? '' : `${mine ? 'run' : 'skip'}:${JSON.stringify(w)}`
    if (key === this.lastKey) return
    this.lastKey = key
    this.stop()
    if (!w) return
    if (!mine) { this.d.log(`운영 감시는 ${this.cfg.host} 호스트가 돌려요 — 이 호스트는 안 돌림`); return }
    this.d.log(`운영 감시 켜짐 · ${Math.round(w.everyMs / 1000)}초마다 · ${w.command}`)
    this.first = setTimeout(() => { this.first = null; this.tick() }, this.d.firstDelayMs ?? 30_000); this.first.unref?.()
    this.timer = setInterval(() => this.tick(), w.everyMs); this.timer.unref?.()
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.first) clearTimeout(this.first)
    this.timer = null; this.first = null
  }

  /** 한 회차 — 앞 회차가 돌고 있으면 건너뛴다. 끝나면 결과를 돌려준다(검사용) */
  tick(): Promise<{ ok: boolean; code: number | null; skipped?: boolean }> {
    const w = this.cfg.watch
    if (!w) return Promise.resolve({ ok: false, code: null, skipped: true })
    if (this.running) { this.d.log('운영 감시: 앞 회차가 아직 돌아서 이번 회차는 건너뛰어요'); return Promise.resolve({ ok: false, code: null, skipped: true }) }
    this.running = true
    const t0 = Date.now()
    return new Promise((resolve) => {
      const env = { ...process.env, PATH: [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`, '/usr/bin', '/bin'].filter(Boolean).join(':') }
      execFile('/bin/sh', ['-c', w.command], { cwd: this.d.root, timeout: w.timeoutMs, killSignal: 'SIGTERM', env, maxBuffer: 4 * 1024 * 1024 }, (err, _out, stderr) => {
        this.running = false
        const ms = Date.now() - t0
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean; signal?: string }) | null
        const timedOut = !!e && (e.killed === true || e.signal === 'SIGTERM') && ms >= w.timeoutMs - 50
        const code = !e ? 0 : typeof e.code === 'number' ? e.code : null
        const ok = !e
        const tail = tailLines(String(stderr ?? '') || (e && !timedOut ? e.message : ''))
        this.d.note({ event: 'ops_watch', ok, code, ms, command: w.command, ...(tail ? { stderr: tail } : {}), ...(timedOut ? { timedOut: true } : {}) })
        if (ok) {
          if (this.alerted) this.d.alert(`[운영 감시 회복] ${w.command} — 다시 성공했어요(연속 실패 ${this.fails}회 뒤).`)
          this.fails = 0; this.alerted = false
        } else {
          this.fails++
          this.d.log(`⚠ 운영 감시 실패 ${this.fails}회째 · 코드 ${code ?? '-'}${timedOut ? ' · 시간 초과' : ''} · ${tail.split('\n').pop() ?? ''}`)
          if (this.fails >= OPS_ALERT_AFTER && !this.alerted) {
            this.alerted = true
            this.d.alert(`[운영 감시 실패] ${w.command} — 연속 ${this.fails}회 실패했어요(마지막: 코드 ${code ?? '-'}${timedOut ? ' · 시간 초과' : ''}).\n${tail || '(stderr 없음)'}\n실행 기록: .folderbot/ops/runs-*.jsonl 의 ops_watch 줄. 명령·권한·볼트 접근을 확인해 주세요.`)
          }
        }
        resolve({ ok, code })
      })
    })
  }
}
