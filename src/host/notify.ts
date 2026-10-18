import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import webpush from 'web-push'
import type { NotifyEvent, NotifyKind } from '../core/types'
import { atomicWrite, dataDir, ensureDir, type HostConfig, saveConfig } from './paths'

export class Notifier {
  events: NotifyEvent[] = []
  private file = join(ensureDir(dataDir()), 'notifications.json')
  onEvent: (n: NotifyEvent) => void = () => {}
  /** CF-④ · 푸시 성공·실패를 호스트 로그에 한 줄씩 — 종전엔 다 삼켜서 구독 0건·403 을 몇 주 아무도 몰랐다. endpoint 전체·키는 안 쓴다 */
  log: (s: string) => void = () => {}
  /** 마지막 푸시 결과 — /api/health 가 감시기에 내보낸다 */
  lastPush: { t: number; ok: number; fail: number; code?: number } | null = null
  constructor(private cfg: HostConfig) {
    try { this.events = JSON.parse(readFileSync(this.file, 'utf8')) as NotifyEvent[] } catch { this.events = [] }
    if (!cfg.vapid) { const k = webpush.generateVAPIDKeys(); cfg.vapid = { publicKey: k.publicKey, privateKey: k.privateKey }; saveConfig(cfg) }
    webpush.setVapidDetails(vapidSubject(), cfg.vapid!.publicKey, cfg.vapid!.privateKey)
  }
  quiet(): boolean {
    const q = this.cfg.quiet ?? { from: '23:00', to: '07:00' }
    if (q.off) return false   // 끔 — 시각은 남겨 두고 거르기만 멈춘다(2026-10-19 Dave «켜고 끌 수 있으면»)
    const [fh, fm] = q.from.split(':').map(Number), [th, tm] = q.to.split(':').map(Number)
    const d = new Date(); const cur = d.getHours() * 60 + d.getMinutes(); const f = fh * 60 + fm, t = th * 60 + tm
    return f > t ? cur >= f || cur < t : cur >= f && cur < t
  }
  emit(kind: NotifyKind, botId: string, title: string, body: string, sessionId?: string, opts: { push?: boolean; mac?: boolean; force?: boolean } = {}): NotifyEvent {
    const n: NotifyEvent = { id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, t: Date.now(), kind, botId, sessionId, title, body, read: false }
    this.events.unshift(n); this.events = this.events.slice(0, 300)
    atomicWrite(this.file, JSON.stringify(this.events))
    this.onEvent(n)
    const suppressed = this.quiet() && kind !== 'awaiting' && !opts.force   // force — «푸시 테스트» 는 밤에도 간다
    if (!suppressed) {
      if (opts.mac !== false) this.mac(title, body, n)
      // 폰 푸시는 «확인해 주세요»(awaiting)만 — 끝남·오류·할 일·루틴까지 다 보내면 하루 수백 번 울려 진짜 부름이 묻힌다(2026-10-19 Dave «계획대로» · iOS 기획안 ⑩-②).
      // 나머지는 앱 알림 목록과 맥 배너에만 남는다. «푸시 테스트»(force)는 종류와 상관없이 간다.
      if (opts.push !== false && (kind === 'awaiting' || opts.force)) void this.push(n)
    }
    return n
  }
  markRead(ids?: string[]): void {
    for (const e of this.events) if (!ids || ids.includes(e.id)) e.read = true
    atomicWrite(this.file, JSON.stringify(this.events))
  }
  /** S · 그 세션의 대화를 다 읽었으면 그 세션 알림도 읽음이다 — 두 표면이 어긋나면 배지를 못 믿는다 */
  markReadBySession(sessionId: string): void {
    let hit = false
    for (const e of this.events) if (e.sessionId === sessionId && !e.read) { e.read = true; hit = true }
    if (hit) atomicWrite(this.file, JSON.stringify(this.events))
  }
  /**
   * macOS 알림 센터 — terminal-notifier 가 있으면 클릭 시 **그 대화**(`#bot=…&s=…`)를 열고, 없으면 osascript(클릭 없음).
   * ⚠ 데스크톱 앱이 호스트를 안에서 돌릴 때는 `FOLDERBOT_NO_MAC_NOTIFY` 로 꺼진다 — 배너는 앱이 띄우고 앱이 연다.
   *    이 경로는 터미널로 띄운 호스트의 것이라 갈 곳이 브라우저뿐이다(2026-09-17).
   */
  private mac(title: string, body: string, n?: NotifyEvent): void {
    if (platform() !== 'darwin' || process.env.FOLDERBOT_NO_MAC_NOTIFY) return
    const tn = ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier'].find((p) => existsSync(p))
    const hash = n?.botId ? `#bot=${encodeURIComponent(n.botId)}${n.sessionId ? `&s=${encodeURIComponent(n.sessionId)}` : ''}` : ''
    const url = `http://127.0.0.1:${this.cfg.port}/${hash}`
    if (tn) execFile(tn, ['-title', title, '-message', body, '-open', url, '-sound', 'default', '-group', 'folderbot'], () => {})
    else execFile('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)} sound name "default"`], () => {})
  }
  async push(n: NotifyEvent): Promise<void> {
    const subs = this.cfg.pushSubs ?? []
    if (!subs.length) { this.lastPush = { t: Date.now(), ok: 0, fail: 0 }; return }
    const payload = JSON.stringify({ title: n.title, body: n.body, botId: n.botId, sessionId: n.sessionId, kind: n.kind, id: n.id })
    const dead: string[] = []; let ok = 0, fail = 0, last: number | undefined
    await Promise.all(subs.map(async (s) => {
      const where = pushHost(s.endpoint)
      try {
        const r = await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3600, urgency: n.kind === 'awaiting' ? 'high' : 'normal' })
        ok++; last = r.statusCode; this.log(`푸시 ${n.kind} → ${s.device} (${where}) ${r.statusCode}`)
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode, why = String((e as { body?: string }).body ?? (e as Error).message ?? '').slice(0, 80)
        fail++; last = code; this.log(`⚠ 푸시 실패 ${code ?? 'net'} → ${s.device} (${where}) ${why}`)
        if (code === 404 || code === 410) dead.push(s.endpoint)
      }
    }))
    this.lastPush = { t: Date.now(), ok, fail, code: last }
    if (dead.length) { this.cfg.pushSubs = subs.filter((s) => !dead.includes(s.endpoint)); saveConfig(this.cfg) }
  }
  addSub(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, device: string): void {
    const subs = (this.cfg.pushSubs ?? []).filter((s) => s.endpoint !== sub.endpoint)
    subs.push({ ...sub, device }); this.cfg.pushSubs = subs; saveConfig(this.cfg)
  }
  vapidPublic(): string { return this.cfg.vapid!.publicKey }
  /** 구독 목록 — 기기 이름과 푸시 서버 호스트만(endpoint 전체·키는 내보내지 않는다) */
  subsView(): { device: string; host: string }[] { return (this.cfg.pushSubs ?? []).map((s) => ({ device: s.device, host: pushHost(s.endpoint) })) }
}

const pushHost = (endpoint: string): string => { try { return new URL(endpoint).host } catch { return '?' } }

/**
 * CF-④ · VAPID `sub` 는 실제로 닿는 `mailto:` 나 `https:` 여야 한다(RFC 8292 §2.1).
 *   Apple 은 `mailto:folderbot@local` 같은 .local·localhost 주소를 `403 BadJwtToken` 으로 거절한다 — 종전 값이 그것이었다.
 */
export function vapidSubject(env: string | undefined = process.env.FOLDERBOT_VAPID_SUBJECT): string {
  return env && validVapidSubject(env) ? env : 'https://folderbot.dev'
}
export function validVapidSubject(s: string): boolean {
  const m = /^mailto:[^@\s]+@([^\s>]+)$/.exec(s) ?? /^https:\/\/([^/:\s]+)/.exec(s)
  if (!m) return false
  const host = m[1].toLowerCase()
  return host.includes('.') && !/(^|\.)(local|localhost|internal|lan|home)$/.test(host) && host !== 'localhost'
}
