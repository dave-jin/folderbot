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
  constructor(private cfg: HostConfig) {
    try { this.events = JSON.parse(readFileSync(this.file, 'utf8')) as NotifyEvent[] } catch { this.events = [] }
    if (!cfg.vapid) { const k = webpush.generateVAPIDKeys(); cfg.vapid = { publicKey: k.publicKey, privateKey: k.privateKey }; saveConfig(cfg) }
    webpush.setVapidDetails('mailto:folderbot@local', cfg.vapid!.publicKey, cfg.vapid!.privateKey)
  }
  quiet(): boolean {
    const q = this.cfg.quiet ?? { from: '23:00', to: '07:00' }
    const [fh, fm] = q.from.split(':').map(Number), [th, tm] = q.to.split(':').map(Number)
    const d = new Date(); const cur = d.getHours() * 60 + d.getMinutes(); const f = fh * 60 + fm, t = th * 60 + tm
    return f > t ? cur >= f || cur < t : cur >= f && cur < t
  }
  emit(kind: NotifyKind, botId: string, title: string, body: string, sessionId?: string, opts: { push?: boolean; mac?: boolean } = {}): NotifyEvent {
    const n: NotifyEvent = { id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, t: Date.now(), kind, botId, sessionId, title, body, read: false }
    this.events.unshift(n); this.events = this.events.slice(0, 300)
    atomicWrite(this.file, JSON.stringify(this.events))
    this.onEvent(n)
    const suppressed = this.quiet() && kind !== 'awaiting'
    if (!suppressed) {
      if (opts.mac !== false) this.mac(title, body, n)
      if (opts.push !== false) void this.push(n)
    }
    return n
  }
  markRead(ids?: string[]): void {
    for (const e of this.events) if (!ids || ids.includes(e.id)) e.read = true
    atomicWrite(this.file, JSON.stringify(this.events))
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
    if (!subs.length) return
    const payload = JSON.stringify({ title: n.title, body: n.body, botId: n.botId, sessionId: n.sessionId, kind: n.kind, id: n.id })
    const dead: string[] = []
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3600 }) }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) dead.push(s.endpoint) }
    }))
    if (dead.length) { this.cfg.pushSubs = subs.filter((s) => !dead.includes(s.endpoint)); saveConfig(this.cfg) }
  }
  addSub(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, device: string): void {
    const subs = (this.cfg.pushSubs ?? []).filter((s) => s.endpoint !== sub.endpoint)
    subs.push({ ...sub, device }); this.cfg.pushSubs = subs; saveConfig(this.cfg)
  }
  vapidPublic(): string { return this.cfg.vapid!.publicKey }
}
