import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Host } from './host'
import { Gateway } from './gateway'
import { loadConfig, saveConfig, dataDir } from './paths'
import { Registry, canon } from './registry'
import { tailnetInfo } from './tailnet'

const here = dirname(fileURLToPath(import.meta.url))
const pkgPath = [join(here, '..', 'package.json'), join(here, '..', '..', 'package.json')].find((p) => existsSync(p))
const VERSION = pkgPath ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version : '0.0.0'
const webRoot = [join(here, '..', 'client'), join(here, '..', '..', 'dist', 'client')].find((p) => existsSync(join(p, 'index.html'))) ?? join(here, '..', 'client')

export interface StartOpts { root?: string; port?: number; webRoot?: string; log?: (s: string) => void; onRoot?: (root: string) => void | Promise<void> }
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
  if (opts.log) host.log = opts.log
  if (opts.onRoot) host.onRoot = opts.onRoot
  const gw = new Gateway(host, opts.webRoot ?? webRoot)
  gw.start()
  const urls = gw.addrs.map((a) => `http://${a}:${cfg.port}`)
  return { host, gateway: gw, cfg, urls, stop: () => { host.shutdown(); gw.stop() } }
}

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[0] ?? 'start'
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
  console.log(`folderbot <init <폴더> | start [--port N] | status>`)
}
