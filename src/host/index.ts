import { existsSync, linkSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { ASK_CARD, ASK_EXIT, ASK_TIMEOUT_MAX, askKind, exitOf, firstLine, lastAskId, parseAskArgs, peerOfId } from '../core/askCli'
import { parseBridges, type PeerDef } from '../core/bridges'
import { formatLetter, frontMatterClosed, isoLocal, letterId, monthOf, normId, parseLetter } from '../core/fbmf'
import { DEFAULT_PORT } from '../core/types'
import { readTokenEnv } from './wake'
import { letterFiles } from './bridge'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { Host, type ShellUpdate } from './host'
import { Gateway } from './gateway'
import { loadConfig, saveConfig, dataDir } from './paths'
import { DailyLog } from './logfile'
import { Registry, canon } from './registry'
import { tailnetInfo } from './tailnet'

const here = dirname(fileURLToPath(import.meta.url))
const pkgPath = [join(here, '..', 'package.json'), join(here, '..', '..', 'package.json')].find((p) => existsSync(p))
const VERSION = pkgPath ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version : '0.0.0'
const webRoot = [join(here, '..', 'client'), join(here, '..', '..', 'dist', 'client')].find((p) => existsSync(join(p, 'index.html'))) ?? join(here, '..', 'client')

export interface StartOpts { root?: string; port?: number; webRoot?: string; log?: (s: string) => void; onRoot?: (root: string) => void | Promise<void>; /** BX · 셸의 업데이트 손잡이 — 원격 화면의 «새벽 적용» */ update?: ShellUpdate }
export interface Started { host: Host; gateway: Gateway; cfg: ReturnType<typeof loadConfig>; urls: string[]; stop: () => void }
/** 프로그램에서 호스트 띄우기 (Electron 호스트 모드가 쓴다) */
export async function startHost(opts: StartOpts = {}): Promise<Started> {
  const cfg = loadConfig()
  if (opts.root) { cfg.root = canon(resolve(opts.root)); saveConfig(cfg) }
  if (opts.port) { cfg.port = opts.port; saveConfig(cfg) }
  if (!cfg.root) throw new Error('root not set')
  const reg = new Registry(cfg.root)
  if (!reg.rulesInstalled()) reg.installRules('para')
  const host = new Host(cfg, VERSION)
  // BY · 호스트 로그를 날짜별 파일로(7일) — 데스크톱 앱의 console 은 아무 데도 안 남는다
  const daily = new DailyLog(join(dataDir(), 'logs'))
  const sink = opts.log ?? host.log
  host.log = (s) => { daily.write(s); sink(s) }
  if (opts.onRoot) host.onRoot = opts.onRoot
  if (opts.update) host.update = opts.update
  const gw = new Gateway(host, opts.webRoot ?? webRoot)
  gw.start()
  writeHostInfo(cfg.root, cfg.port)
  const urls = gw.addrs.map((a) => `http://${a}:${cfg.port}`)
  return { host, gateway: gw, cfg, urls, stop: () => { host.shutdown(); gw.stop() } }
}

/**
 * DA · 비밀 없는 호스트 안내 — `folderbot ask` 가 볼트 경로와 포트를 여기서만 읽는다.
 * 🔴 CLI 는 `config.json`(기기 토큰이 든 파일)을 읽지 않는다 — 볼트 규칙 «로컬 API 토큰 우회 금지»(2026-09-27 사고)와 같은 이유.
 */
export const HOST_INFO = 'host-info.json'
function writeHostInfo(root: string, port: number): void {
  try { writeFileSync(join(dataDir(), HOST_INFO), JSON.stringify({ root, port, pid: process.pid, version: VERSION, at: new Date().toISOString() })) } catch { /* 안내는 덤이다 — ask 는 기본값으로 */ }
}
/** 데스크톱 앱의 호스트는 `<userData>/host` 에 산다(desktop/main.js · `folderbot-desktop`) — CLI 의 기본 dataDir 과 다르다. 가장 최근에 쓴 안내를 쓴다 */
function readHostInfo(): { root?: string; port: number } {
  // FOLDERBOT_DATA 를 주면 그것만 — 검사가 실 앱의 호스트를 부르지 않게(QA 격리)
  const dirs = process.env.FOLDERBOT_DATA ? [process.env.FOLDERBOT_DATA] : [join(homedir(), 'Library', 'Application Support', 'folderbot-desktop', 'host'), dataDir()]
  let best: { root?: string; port?: number; at?: string } | null = null
  for (const d of dirs) { try { const j = JSON.parse(readFileSync(join(d, HOST_INFO), 'utf8')) as { root?: string; port?: number; at?: string }; if (!best || String(j.at ?? '') > String(best.at ?? '')) best = j } catch { /* 없음 */ } }
  return { root: best?.root || process.env.FOLDERBOT_ROOT, port: Number(best?.port) || DEFAULT_PORT }
}
function peerFromVault(root: string | undefined, id: string): PeerDef | undefined {
  if (!root) return undefined
  try { return parseBridges(readFileSync(join(root, '.claude', 'bridges.yml'), 'utf8')).peers.find((p) => p.id === id) } catch { return undefined }
}
const mailboxOf = (root: string, p: PeerDef) => (isAbsolute(p.mailbox) ? p.mailbox : resolve(root, p.mailbox))

/** 우편함 한쪽의 편지(이번 달·지난달) — 머리말이 닫힌 것만 */
function readSide(root: string, peer: PeerDef, side: 'to-folderbot' | 'from-folderbot') {
  // `at` — 파일을 쓴 시각(ms). 같은 초에 쓴 편지끼리 «마지막» 을 가를 때만 쓴다(`lastAskId`)
  return letterFiles(join(mailboxOf(root, peer), side), false, new Date()).map((f) => { try { const t = readFileSync(f, 'utf8'); return frontMatterClosed(t) ? { ...parseLetter(t, { id: normId(f.split('/').pop()!.replace(/\.(md|txt)$/i, '')), from: side === 'to-folderbot' ? peer.id : 'folderbot' }), at: statSync(f).mtimeMs } : null } catch { return null } }).filter((l): l is NonNullable<typeof l> => !!l)
}

/**
 * 🔴 DA · `folderbot ask` — 바깥 상대가 Folder Bot 에 묻고, 답이 날 때까지 기다렸다가 찍는다(`claude -p` 처럼).
 *  - **편지 id 가 맨 첫 줄이다** — 기다리기 전에 찍는다. 할일이 셸이 먼저 끊겨도 id 는 남는다(설계 2판 §7 ①).
 *  - 기다림은 기본 50초 · 0 이면 한 번 보고 끝 · 최대 720초(넘치면 줄이고 그렇다고 찍는다).
 *  - 토큰은 `~/.config/secrets/folderbot-bridge-<상대>-in.env`(0600)에서만 읽는다 — 인자·환경변수로 받지 않는다.
 *  - Folder Bot 이 꺼져 있으면 편지 파일만 우편함에 직접 쓰고 4 로 끝난다 — 묻는 말은 사라지지 않는다. 켜지면 폴링이 넣는다.
 *  - `--wait [id]` 는 우편함에서 그 편지의 답을 찾는다(호스트가 꺼져 있어도 된다). id 를 빼면 이 상대의 마지막 ask.
 */
export async function ask(argv: string[], io: { out: (s: string) => void; err: (s: string) => void; stdin?: () => Promise<string> } = { out: (s) => process.stdout.write(s + '\n'), err: (s) => process.stderr.write(s + '\n') }): Promise<number> {
  let o
  try { o = parseAskArgs(argv) } catch (e) { io.err(`${(e as Error).message}\n\n${ASK_CARD}`); return ASK_EXIT.usage }
  if (o.help) { io.out(ASK_CARD); return 0 }
  if (o.clamped !== undefined) io.err(`--timeout ${o.clamped} 은 너무 길어요 — ${ASK_TIMEOUT_MAX} 초로 줄였어요`)
  const info = readHostInfo()
  if (o.waiting) {
    const pid = o.as ?? (o.wait ? peerOfId(o.wait) : undefined) ?? ''
    const peer = peerFromVault(info.root, pid)
    if (!peer || !info.root) { io.err(`«${pid}» 연결이나 볼트를 못 찾았어요 — --as 를 주세요`); return ASK_EXIT.refused }
    const id = o.wait ?? lastAskId(readSide(info.root, peer, 'to-folderbot'), peer.id)
    if (!id) { io.err(`«${peer.id}» 가 ask 로 보낸 편지가 이번 달·지난달에 없어요`); return ASK_EXIT.refused }
    io.out(firstLine(id, o.json, { state: 'waiting' }))
    const until = Date.now() + o.timeout * 1000
    for (;;) {
      const hit = readSide(info.root, peer, 'from-folderbot').filter((l) => l.re === id).sort((a, b) => (a.id < b.id ? -1 : 1))[0]
      if (hit) { if (o.json) io.out(JSON.stringify({ id, reply: hit.id, state: hit.needsHuman ? 'needs_human' : 'answered', answer: hit.body })); else io.out(hit.body); return hit.needsHuman ? ASK_EXIT.needsHuman : ASK_EXIT.answered }
      if (Date.now() >= until) { if (o.json) io.out(JSON.stringify({ id, state: 'pending' })); io.err(`아직 답이 없어요 — 같은 슬롯에서 되풀이해 부르지 말고 다음 슬롯에 편지로 읽어요(folderbot ask --wait ${id})`); return ASK_EXIT.pending }
      await new Promise((r) => setTimeout(r, Math.min(2000, Math.max(50, until - Date.now()))))
    }
  }
  const peerId = o.as!
  if (o.text === '-' && io.stdin) o.text = (await io.stdin()).trim()
  const peer = peerFromVault(info.root, peerId)
  let token: string
  try { token = readTokenEnv(peer?.inbound?.env ?? `~/.config/secrets/folderbot-bridge-${peerId}-in.env`) } catch (e) { io.err(`토큰을 못 읽었어요 — ${(e as Error).message}`); return ASK_EXIT.refused }
  const kind = askKind(o)
  const body = { text: o.text, kind, wait: !o.noWait, timeout: o.timeout, ...(o.to ? { to: o.to } : {}), ...(o.re ? { re: o.re } : {}), ...(o.title ? { title: o.title } : {}), ...(o.urgent ? { urgent: true } : {}) }
  let r: Response
  // ⚠ 10초 문턱은 «붙고 첫 응답» 까지만 — fetch 의 signal 은 본문 읽기까지 따라가서, 그대로 두면 50초 기다림이 10초에 끊긴다(스모크 S2 가 잡았다)
  const connect = new AbortController(), connectTimer = setTimeout(() => connect.abort(), 10_000)
  try {
    r = await fetch(`http://127.0.0.1:${info.port}/api/bridges/${encodeURIComponent(peerId)}/ask`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: connect.signal })
    clearTimeout(connectTimer)
  } catch (e) {
    clearTimeout(connectTimer)
    // 꺼져 있다 — 편지만 우편함에 직접 남긴다(받는 봇은 `to:` 로 · 켜지면 폴링이 넣고 답은 우편함으로)
    const why = 'Folder Bot 이 안 떠 있어요'
    if (!peer || !info.root) { io.err(`${why} — 볼트를 몰라 편지도 못 남겼어요 · ${(e as Error).message}`); return ASK_EXIT.hostDown }
    try {
      const d = new Date(), id = letterId(d, peerId, randomBytes(2).toString('hex'))
      const dir = join(mailboxOf(info.root, peer), 'to-folderbot', monthOf(id, d)); mkdirSync(dir, { recursive: true })
      const fin = join(dir, `${id}.md`), tmp = join(dir, `.${id}.md.${process.pid}.tmp`)
      writeFileSync(tmp, formatLetter({ id, from: peerId, to: o.to ?? peer.deliver.bot, kind, ...(o.title ? { title: o.title } : {}), ...(o.re ? { re: o.re } : {}), urgent: o.urgent, needsHuman: false, via: 'ask', created: isoLocal(d), body: o.text }))
      linkSync(tmp, fin); unlinkSync(tmp)
      io.out(firstLine(id, o.json)); if (o.json) io.out(JSON.stringify({ id, state: 'host_down' }))
      io.err(`${why} — 편지를 우편함에 남겼어요. 켜지면 들어가고 답은 우편함으로 와요(folderbot ask --wait ${id}).`)
    } catch (e2) { io.err(`${why} — 편지도 못 남겼어요 · ${(e2 as Error).message}`) }
    return ASK_EXIT.hostDown
  }
  if (r.status !== 200) {
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (o.json) io.out(JSON.stringify({ status: r.status, ...j })); else io.err(`거절 · ${String(j.error ?? r.status)}`)
    return exitOf(r.status, {})
  }
  // 받았다 — NDJSON 을 줄마다 읽는다. 첫 줄(편지 id)은 받자마자 찍는다
  let id = '', last: Record<string, unknown> = {}, buf = ''
  const reader = r.body!.getReader(), dec = new TextDecoder()
  const deadline = setTimeout(() => { void reader.cancel().catch(() => {}) }, (o.timeout + 15) * 1000); deadline.unref?.()   // 창구가 마지막 줄을 못 쓰고 멈췄을 때만
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break
      buf += dec.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const ln = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!ln) continue
        let j: Record<string, unknown>; try { j = JSON.parse(ln) } catch { continue }
        if (!id) { id = String(j.id ?? ''); io.out(firstLine(id, o.json, { bot: j.bot })) } else { last = j; if (o.json) io.out(ln) }
      }
    }
  } catch { /* 끊겼다 — 마지막 줄 없이 끝난 것으로(아직) */ } finally { clearTimeout(deadline) }
  const code = exitOf(200, last as { state?: string })
  if (!o.json) {
    if (last.state === 'answered' || last.state === 'needs_human' || last.state === 'error') io.out(String(last.answer ?? ''))
    if (last.state === 'error') io.err(`턴이 오류로 끝났어요 — ${String(last.error ?? '')}`)
    if (last.state === 'needs_human') io.err('Dave 확인을 기다려요 — 위 답에 무엇을 기다리는지 있어요')
    if (code === ASK_EXIT.pending) io.err(`아직 일하는 중이에요 — 같은 슬롯 끝에 한 번: folderbot ask --wait ${id}${o.urgent ? ' · 급함이라 답이 나면 긴급 메일이 가요' : ''}`)
  }
  return code
}

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[0] ?? 'start'
  if (cmd === 'ask') {
    const stdin = async () => { const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer); return Buffer.concat(chunks).toString('utf8') }
    process.exitCode = await ask(argv.slice(1), { out: (s) => process.stdout.write(s + '\n'), err: (s) => process.stderr.write(s + '\n'), stdin })
    return
  }
  const cfg = loadConfig()
  if (cmd === 'init') {
    const root = argv[1]; if (!root) { console.error('사용법: folderbot init <루트 폴더>  [--preset para|johnny-decimal]'); process.exit(2) }
    const abs = canon(resolve(root)); if (!existsSync(abs)) { console.error(`폴더가 없어요: ${abs}`); process.exit(2) }
    cfg.root = abs; saveConfig(cfg)
    const reg = new Registry(abs)
    const pi = argv.indexOf('--preset'); const preset = (pi >= 0 ? argv[pi + 1] : 'para') as 'para' | 'johnny-decimal'
    if (!reg.rulesInstalled()) { reg.installRules(preset); console.log(`폴더 규칙(${preset})을 ${reg.rulesFile()} 에 설치했어요.`) } else console.log(`폴더 규칙이 이미 있어요: ${reg.rulesFile()}`)
    const c = reg.candidates(); console.log(`후보 ${c.length}개: ${c.slice(0, 8).map((x) => x.rel).join(' · ')}${c.length > 8 ? ' …' : ''}`)
    console.log(`\n다음: folderbot start`)
    return
  }
  if (cmd === 'status') { const tn = await tailnetInfo(); console.log(JSON.stringify({ root: cfg.root, port: cfg.port, devices: cfg.devices.map((d) => d.name), data: dataDir(), tailnet: tn }, null, 2)); return }
  if (cmd === 'start' || cmd === 'serve') {
    if (!cfg.root) { console.error('먼저 루트를 정하세요: folderbot init <폴더>'); process.exit(2) }
    const pi = argv.indexOf('--port'); if (pi >= 0) { cfg.port = Number(argv[pi + 1]); saveConfig(cfg) }
    const started = await startHost()
    const { host, gateway: gw, urls } = started
    const tn = await tailnetInfo()
    const pair = gw.openPairing()
    console.log(`\n  Folder Bot v${VERSION} · 루트 ${cfg.root}\n  주소: ${urls.join('  ')}${tn.dnsName ? `\n  Tailscale: http://${tn.dnsName}:${cfg.port}  (tailscale serve 로 HTTPS 를 붙이면 폰 푸시가 됩니다)` : ''}\n  페어링 코드: ${pair.code}  (2분 · 이 터미널에서 'p' + Enter 로 새 코드)\n`)
    if (process.stdin.isTTY) {
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (d: string) => { if (d.trim() === 'p') { const p = gw.openPairing(); console.log(`  새 페어링 코드: ${p.code}`) } })
    }
    const bye = () => { host.shutdown(); gw.stop(); process.exit(0) }
    process.on('SIGINT', bye); process.on('SIGTERM', bye)
    return
  }
  if (cmd === 'token') {
    const t = argv[1]
    if (!t) { console.log('사용법: folderbot token <claude setup-token 으로 받은 토큰>   (지우기: folderbot token clear)'); return }
    cfg.claudeOauthToken = t === 'clear' ? undefined : t; saveConfig(cfg)
    console.log(t === 'clear' ? '토큰을 지웠어요. 키체인 로그인을 씁니다.' : '토큰을 저장했어요. 호스트를 다시 시작하면 적용됩니다.'); return
  }
  if (cmd === 'pair') { console.log('호스트가 떠 있는 터미널에서 p + Enter 를 누르면 새 코드가 나옵니다. (또는 앱 설정 › 기기 연결)'); return }
  console.log(`folderbot <init <폴더> | start [--port N] | status | ask --help>`)
}

/**
 * DA · 바로 실행됐을 때만 돈다 — 앱 안의 CLI(`Folder Bot.app/Contents/Resources/folderbot` → Electron 의 node 로 이 번들)를 위해서다.
 * 앱 메인 프로세스가 `startHost` 를 쓰려고 import 할 때와 `bin/folderbot.mjs` 가 import 할 때는 돌지 않는다(argv[1] 이 이 파일이 아니다).
 */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main(process.argv.slice(2))
