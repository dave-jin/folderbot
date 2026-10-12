#!/usr/bin/env node
/**
 * 퍼포먼스 실측 (2026-10-12) — 픽스처 볼트 + 스텁 CLI 로 호스트를 띄우고, 헤드리스 Chromium 으로
 * ① 첫 실행(콜드·웜) ② 봇 전환 ③ 세션 전환(긴 대화) ④ 원격 폰(느린 망)·재접속 ⑤ 검색·폴더 선택·새 세션·슬래시·문서
 * 를 상황마다 N 회(기본 5) 재서 중앙값·최악을 낸다. 고치기 전과 뒤에 **같은 명령**으로 다시 잰다.
 *
 *   npm run build && node test/perf-measure.mjs                 # 표로
 *   node test/perf-measure.mjs --json                            # JSON 만 (stdout)
 *   node test/perf-measure.mjs --runs 3 --profiles desktop-local,phone-remote --out /tmp/perf.json
 *   node test/perf-measure.mjs --only cold,switch                # 상황 고르기: api,assets,cold,switch,session,reconnect,ui
 *
 * ⚠ 실 앱·실 볼트·실 설정을 건드리지 않는다 — 홈·데이터·볼트를 임시 폴더로 갈아 끼우고 포트는 7420~7430 중 빈 것.
 * ⚠ 망 흉내는 Chromium `Network.emulateNetworkConditions` — 요청마다 지연을 더하는 근사다(TCP 핸드셰이크·HOL 은 흉내 못 낸다).
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { request as httpRequest } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, existsSync, statSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { gzipSync, brotliCompressSync } from 'node:zlib'

// ───────────────────────── 인자
const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const JSON_ONLY = argv.includes('--json')
const RUNS = Number(arg('--runs', 5))
const ONLY = new Set(String(arg('--only', 'api,assets,cold,switch,session,reconnect,ui')).split(','))
const PROFILES_ARG = String(arg('--profiles', 'desktop-local,desktop-remote,phone-remote,phone-bad')).split(',')
const OUT = arg('--out', null)
const LONG_TURNS = Number(arg('--turns', 400))
const SHOTS = arg('--shots', null)   // 폴더를 주면 첫 회차의 전환 «도중» 화면을 찍는다(찍는 동안 시간이 조금 밀린다 — 숫자는 다른 회차를 본다)
const log = (...a) => { if (!JSON_ONLY) console.log(...a) }
const warn = (...a) => console.error(...a)

const PROFILES = {
  'desktop-local': { vp: { width: 1440, height: 900 }, mobile: false, net: null },
  'desktop-remote': { vp: { width: 1440, height: 900 }, mobile: false, net: { latency: 150, down: 10e6, up: 5e6 } },
  'phone-remote': { vp: { width: 390, height: 844 }, mobile: true, net: { latency: 150, down: 10e6, up: 5e6 } },
  'phone-bad': { vp: { width: 390, height: 844 }, mobile: true, net: { latency: 400, down: 3e6, up: 1.5e6 } }
}

// ───────────────────────── 통계
const med = (a) => { const v = a.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2 }
const max = (a) => { const v = a.filter((x) => typeof x === 'number' && isFinite(x)); return v.length ? Math.max(...v) : null }
const stat = (a) => ({ med: med(a) === null ? null : Math.round(med(a)), worst: max(a) === null ? null : Math.round(max(a)), n: a.filter((x) => typeof x === 'number' && isFinite(x)).length })
const statsOf = (runs) => { const keys = new Set(runs.flatMap((r) => Object.keys(r).filter((k) => typeof r[k] === 'number'))); const o = {}; for (const k of keys) o[k] = stat(runs.map((r) => r[k])); return o }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const kb = (n) => (n == null ? '-' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)}MB` : `${(n / 1024).toFixed(1)}KB`)

// ───────────────────────── 픽스처
const cleanup = []
const mk = (p) => { const d = mkdtempSync(join(p === 'vault' ? '/tmp' : tmpdir(), `fb-perf-${p}-`)); cleanup.push(d); return realpathSync(d) }
const root = mk('vault'), data = mk('data'), fbHome = mk('home'), claudeCfg = mk('claude')
mkdirSync(join(fbHome, '.folderbot'), { recursive: true })
const BOTS = [
  { key: 'A', rel: '2. Projects/2026-10_강의-성능A' },
  { key: 'B', rel: '2. Projects/2026-11_컨설팅-성능B' },
  { key: 'C', rel: '3. Area/제품_성능C' },
  { key: 'D', rel: '3. Area/재무_성능D' },
  { key: 'E', rel: '3. Area/운영_성능E' }
]
for (const d of ['1. Inbox', '2. Projects', '3. Area', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
// 결정적 의사 난수 낱말 — 똑같은 글을 되풀이하면 gzip 이 비현실적으로 잘 줄어서(30배) 원격 전송량을 과소평가한다
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const word = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => String.fromCharCode(0xac00 + Math.floor(rnd() * 11172))).join('')
const VOCAB = Array.from({ length: 600 }, word)   // 실제 글처럼 낱말이 되풀이된다 — gzip 비율 3~5배 언저리
const words = (n) => Array.from({ length: n }, () => VOCAB[Math.floor(rnd() * VOCAB.length)]).join(' ')
const para = (i) => `이 문단은 성능 측정 본문 ${i} 입니다. ${words(18)} **${words(1)}** 와 \`${words(1)}\` 와 [링크](https://example.com/${i}) ${words(10)}.`
for (const b of BOTS) {
  const abs = join(root, b.rel); mkdirSync(abs, { recursive: true })
  writeFileSync(join(abs, 'CLAUDE.md'), `# ${b.rel}\n\n목적: 측정용\n`)
  writeFileSync(join(abs, 'readme.md'), `# ${b.key} readme PERFDOC-${b.key}\n\n` + Array.from({ length: 220 }, (_, i) => (i % 20 === 0 ? `\n## 절 ${i / 20}\n\n` : '') + para(i)).join('\n\n') + '\n')
  writeFileSync(join(abs, 'todo.md'), '# todo\n\n## 요청 · 할 일\n' + Array.from({ length: 25 }, (_, i) => `- [${i % 4 === 0 ? 'x' : ' '}] 할 일 ${i}: 설명 ${'가나다 '.repeat(8)}`).join('\n') + '\n')
  for (const sub of ['01_기획', '02_자료', '03_캡처', '04_회의록']) { mkdirSync(join(abs, sub), { recursive: true }); for (let i = 0; i < 15; i++) writeFileSync(join(abs, sub, `문서-${i}.md`), `# ${sub} ${i}\n\n${para(i)}\n`) }
}
// 폴더 선택 창의 색인이 훑을 나무 — 실 볼트보다 작다(실 볼트는 수천 개)
for (let i = 0; i < 60; i++) for (let j = 0; j < 8; j++) mkdirSync(join(root, '5. Archive', `2025-${String(i % 12 + 1).padStart(2, '0')}_보관-${i}`, `0${j}_하위`), { recursive: true })
for (let i = 0; i < 40; i++) for (let j = 0; j < 4; j++) mkdirSync(join(root, '4. Resources', `자료-${i}`, `묶음-${j}`), { recursive: true })

const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_MAC_NOTIFY: '1', FOLDERBOT_NO_AUTH: '1', CLAUDE_CONFIG_DIR: claudeCfg }
const portFree = (port) => new Promise((res) => { const srv = createServer(); srv.once('error', () => res(false)); srv.listen(port, '127.0.0.1', () => srv.close(() => res(true))) })
let PORT = 0
for (let p = 7420; p <= 7430; p++) if (await portFree(p)) { PORT = p; break }
if (!PORT) { warn('7420~7430 에 빈 포트가 없어요'); process.exit(2) }
const base = `http://127.0.0.1:${PORT}`
const runCli = (args) => new Promise((res, rej) => { const p = spawn('node', ['bin/folderbot.mjs', ...args], { env }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('exit', (c) => (c === 0 ? res(out) : rej(new Error(out)))) })
let host = null
const startHost = async () => {
  host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  host.stdout.on('data', () => {}); host.stderr.on('data', () => {})
  for (let i = 0; i < 120; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) return } catch { /* */ } await wait(250) }
  throw new Error('호스트가 안 떴다')
}
const stopHost = async () => { if (!host || host.exitCode !== null) return; const h = host; const done = new Promise((r) => h.once('exit', r)); h.kill('SIGTERM'); await Promise.race([done, wait(5000)]); if (h.exitCode === null) h.kill('SIGKILL') }
const api = async (p, body, method) => { const r = await fetch(base + '/api' + p, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${p}: ${j.error}`); return j }

let browser = null
const bye = async () => { try { await browser?.close() } catch { /* */ } await stopHost(); for (const d of cleanup) try { rmSync(d, { recursive: true, force: true }) } catch { /* */ } }
process.on('SIGINT', async () => { await bye(); process.exit(130) })

// ───────────────────────── 대화 만들기 (호스트를 끈 채 세션 파일에 써 넣는다)
const now = Date.now()
const assistantText = (i, mark) => {
  let t = `## ${i}번째 답\n\n${para(i)}\n\n- 첫째 항목 ${i}\n- 둘째 항목 — 설명이 조금 더 길다 ${'라마바 '.repeat(6)}\n- 셋째 항목\n\n${para(i + 1)}`
  if (i % 5 === 0) t += `\n\n\`\`\`ts\nexport function f${i}(x: number): number {\n  // 코드 블록 ${i}\n  return x * ${i} + 1\n}\n\`\`\``
  if (i % 7 === 0) t += `\n\n| 항목 | 값 | 비고 |\n|---|---|---|\n| 가 | ${i} | 메모 |\n| 나 | ${i * 2} | 메모 |\n| 다 | ${i * 3} | 메모 |`
  return mark ? `${t}\n\n${mark}` : t
}
const turns = (n, label) => {
  const items = []; let t = now - n * 60_000
  for (let i = 0; i < n; i++) {
    items.push({ id: `u_${label}_${i}`, t: t += 1000, kind: 'user', text: `질문 ${i}: ${label} 세션에서 ${words(14)}` })
    items.push({ id: `t1_${label}_${i}`, t: t += 1000, kind: 'tool', name: 'Read', summary: 'readme.md', input: { file_path: '/x/readme.md' }, result: words(120) })
    items.push({ id: `t2_${label}_${i}`, t: t += 1000, kind: 'tool', name: 'Grep', summary: '"성능"', input: { pattern: '성능' }, result: words(60) })
    items.push({ id: `a_${label}_${i}`, t: t += 1000, kind: 'assistant', text: assistantText(i, i === n - 1 ? `END-${label}` : null) })
    items.push({ id: `r_${label}_${i}`, t: t += 1000, kind: 'result', ok: true, durationMs: 3000 })
    t += 50_000
  }
  return items
}

await runCli(['init', root])
await startHost()
const ids = {}
for (const b of BOTS) ids[b.key] = (await api('/bots/start', { rel: b.rel })).id
const sess = {}
const mkSess = async (bk, name) => (sess[name] = (await api(`/bots/${ids[bk]}/sessions`, { name })).id)
await mkSess('A', 'long'); await mkSess('A', 'short'); await mkSess('B', 'mid')
for (const k of ['C', 'D', 'E']) await mkSess(k, `short${k}`)
await stopHost()
const fill = (name, items, lastActivity) => { const f = join(data, 'sessions', `${sess[name]}.json`); const r = JSON.parse(readFileSync(f, 'utf8')); r.items = items; r.lastActivity = lastActivity; r.lastReplyAt = lastActivity; r.readAt = lastActivity; r.named = true; writeFileSync(f, JSON.stringify(r)) }
fill('long', turns(LONG_TURNS, 'long'), now - 3600_000)
fill('short', turns(6, 'short'), now - 60_000)   // 봇 A 를 열면 이것이 먼저 선다(가장 최근)
fill('mid', turns(150, 'mid'), now - 120_000)
for (const k of ['C', 'D', 'E']) fill(`short${k}`, turns(6, `short${k}`), now - 300_000)
await startHost()

const result = { at: new Date().toISOString(), host: process.platform, port: PORT, runs: RUNS, fixture: { bots: BOTS.length, longTurns: LONG_TURNS, longItems: LONG_TURNS * 5, midTurns: 150 }, api: null, assets: null, profiles: {} }

// ───────────────────────── 1) 호스트 API 지연·크기 (브라우저 없이)
const rawGet = (path, gzip) => new Promise((res, rej) => {
  const t0 = performance.now(); let ttfb = null; let bytes = 0
  const req = httpRequest(base + path, { headers: { 'accept-encoding': gzip ? 'gzip' : 'identity', authorization: 'Bearer x' } }, (r) => { ttfb = performance.now() - t0; r.on('data', (c) => (bytes += c.length)); r.on('end', () => res({ status: r.statusCode, ms: performance.now() - t0, ttfb, bytes, enc: r.headers['content-encoding'] ?? '', cc: r.headers['cache-control'] ?? '' })) })
  req.on('error', rej); req.end()
})
if (ONLY.has('api')) {
  log('\n▶ 호스트 API (Node 직접 · gzip 받음)')
  const eps = {
    'state': '/api/state',
    'chat(long·800)': `/api/sessions/${sess.long}/chat`,
    'chat(mid·150턴)': `/api/sessions/${sess.mid}/chat`,
    'chat(short)': `/api/sessions/${sess.short}/chat`,
    'todo': `/api/bots/${ids.A}/todo`,
    'slash': `/api/bots/${ids.A}/slash?sid=${sess.short}`,
    'files?depth=2': `/api/bots/${ids.A}/files?depth=2`,
    'files?depth=4': `/api/bots/${ids.A}/files?depth=4`,
    'files?depth=6': `/api/bots/${ids.A}/files?depth=6`,
    'orch/dirs?depth=6': '/api/bots/orch/dirs?depth=6',
    'file(readme)': `/api/bots/${ids.A}/file?rel=readme.md`,
    'todos(전체)': '/api/todos',
    'search': `/api/search?q=${encodeURIComponent('질문 12')}`,
    'harness': `/api/harness?rel=${encodeURIComponent(BOTS[0].rel)}`,
    'commands': `/api/bots/${ids.A}/commands`,
    'usage': '/api/usage'
  }
  result.api = {}
  for (const [k, p] of Object.entries(eps)) {
    const rs = []; for (let i = 0; i < RUNS; i++) rs.push(await rawGet(p, true))
    const plain = await rawGet(p, false)
    result.api[k] = { path: p.replace(/s_[a-z0-9]+|b_[a-z0-9]+/g, '…'), status: rs[0].status, ms: stat(rs.map((r) => r.ms)), wireBytes: rs[0].bytes, rawBytes: plain.bytes, gzip: rs[0].enc === 'gzip' }
    log(`  ${k.padEnd(20)} ${String(stat(rs.map((r) => r.ms)).med).padStart(5)}ms (최악 ${stat(rs.map((r) => r.ms)).worst})  ${kb(plain.bytes).padStart(9)} → 전송 ${kb(rs[0].bytes)}${rs[0].enc ? ' gz' : ''}  [${rs[0].status}]`)
  }
}

// ───────────────────────── 2) 정적 자산 — 첫 화면에 필요한 것, 압축 여부, 캐시 헤더
if (ONLY.has('assets')) {
  const dist = join(process.cwd(), 'dist/client')
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const initial = ['index.html', ...[...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])]
  const files = initial.map((f) => { const b = readFileSync(join(dist, f)); return { f, raw: b.length, gzip: gzipSync(b, { level: 6 }).length, br: brotliCompressSync(b).length } })
  const heads = {}
  for (const f of ['/', '/' + initial[1], '/sw.js', '/manifest.webmanifest']) { const r = await rawGet(f, true); heads[f.replace(/-[A-Za-z0-9_]{8}\./, '-<hash>.')] = { cc: r.cc, enc: r.enc || '(없음)', bytes: r.bytes } }
  const allAssets = readdirSync(join(dist, 'assets')); const totalAssets = allAssets.reduce((n, f) => n + statSync(join(dist, 'assets', f)).size, 0)
  const big = allAssets.map((f) => ({ f, size: statSync(join(dist, 'assets', f)).size })).sort((a, b) => b.size - a.size).slice(0, 8)
  result.assets = { initial: files, initialRaw: files.reduce((n, x) => n + x.raw, 0), initialGzip: files.reduce((n, x) => n + x.gzip, 0), initialBr: files.reduce((n, x) => n + x.br, 0), headers: heads, distAssets: allAssets.length, distBytes: totalAssets, biggest: big, sw: readFileSync(join(dist, 'sw.js'), 'utf8').includes("'fetch'") ? 'fetch 핸들러 있음' : 'fetch 핸들러 없음(푸시·알림만)' }
  log('\n▶ 첫 화면 자산')
  for (const x of files) log(`  ${x.f.padEnd(40)} ${kb(x.raw).padStart(9)}  gzip ${kb(x.gzip).padStart(8)}  br ${kb(x.br)}`)
  log(`  합계 ${kb(result.assets.initialRaw)} · gzip 이면 ${kb(result.assets.initialGzip)} · br 이면 ${kb(result.assets.initialBr)}`)
  log('  헤더', JSON.stringify(heads))
  log('  SW:', result.assets.sw)
}

// ───────────────────────── 브라우저
const { chromium } = await import('playwright-core')
const PW_CHROMIUM = process.env.PW_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
browser = await chromium.launch({ executablePath: PW_CHROMIUM, args: ['--no-sandbox'] })

/** 화면 안 계측기 — 문서가 생기기 전에 심는다. 시각은 모두 performance.now()(내비게이션 시작 기준) */
const INIT = () => {
  try { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark') } catch { /* */ }
  for (const [k, v] of Object.entries(window.__perfSeed ?? {})) try { localStorage.setItem(k, v) } catch { /* */ }
  const P = (window.__perf = { marks: {}, lt: [], key: null })
  const mark = (k) => { if (P.marks[k] == null) P.marks[k] = performance.now() }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true }) } catch { /* */ }
  addEventListener('keydown', () => { P.key = performance.now() }, true)
  // /api 요청 시간표 — 시작 · 머리 도착 · 본문 다 읽음(api.ts 는 r.text() 로 읽는다)
  P.fx = []
  const of = window.fetch.bind(window)
  window.fetch = (u, init) => { const e = { u: String(u), t0: performance.now(), th: null, te: null }; P.fx.push(e); return of(u, init).then((r) => { e.th = performance.now(); const ot = r.text.bind(r); r.text = () => ot().then((t) => { e.te = performance.now(); e.n = t.length; return t }); return r }) }
  const check = () => {
    if (P.marks.rail == null && document.querySelector('.brow')) mark('rail')
    if (P.marks.composer == null && document.querySelector('.composer')) mark('composer')
    if (P.marks.chatItem == null && document.querySelector('.chat-body .umsg, .chat-body .amsg')) mark('chatItem')
    const m = window.__perfMarker
    if (m && P.marks.marker == null) { const a = document.querySelectorAll('.chat-body .amsg'); const last = a[a.length - 1]; if (last && last.textContent.includes(m)) mark('marker') }
  }
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true })
  /**
   * 전환 계측 — 동작(클릭·해시·키)을 하고 rAF 마다 화면을 본다.
   * blank = 대화 칸에 말이 하나도 없는 프레임 · stale = 아직 옛 대화가 보이는 프레임 · jumps = 내용이 선 뒤 스크롤·높이가 바뀐 횟수
   */
  window.__fbTrans = (o) => new Promise((res) => {
    const t0 = performance.now(); let frames = 0, blank = 0, stale = 0, tContent = null, tBottom = null, lastMove = t0, prevTop = -1, prevH = -1, jumps = 0
    const tick = () => {
      const now = performance.now(); frames++
      const body = document.querySelector('.chat-body'); const sc = document.querySelector('.chat-scroll')
      const msgs = body ? body.querySelectorAll('.umsg, .amsg') : []
      const last = msgs.length ? msgs[msgs.length - 1].textContent : ''
      if (tContent == null) {
        if (o.marker && last.includes(o.marker)) tContent = now
        else if (!msgs.length) blank++
        else if (o.oldMarker && last.includes(o.oldMarker)) stale++
      }
      if (sc) {
        if (sc.scrollTop !== prevTop || sc.scrollHeight !== prevH) { if (tContent != null && prevTop >= 0) jumps++; lastMove = now; prevTop = sc.scrollTop; prevH = sc.scrollHeight }
        if (tContent != null && tBottom == null && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 4) tBottom = now
      }
      if (tContent != null && now - Math.max(tContent, lastMove) > (o.settleMs ?? 1000)) return done(false)
      if (now - t0 > (o.timeout ?? 20000)) return done(true)
      requestAnimationFrame(tick)
    }
    const done = (to) => setTimeout(() => {
      const lts = window.__perf.lt.filter(([s]) => s >= t0 - 5)
      res({ timeout: to, content: tContent == null ? null : tContent - t0, bottom: tBottom == null ? null : tBottom - t0, settle: lastMove - t0, frames, blank, stale, jumps,
        longTasks: lts.length, longMax: lts.reduce((m, [, d]) => Math.max(m, d), 0), tbt: lts.reduce((n, [, d]) => n + Math.max(0, d - 50), 0), msgs: document.querySelectorAll('.chat-body .umsg, .chat-body .amsg').length })
    }, 80)
    if (o.click) document.querySelector(o.click)?.click(); else if (o.hash) location.hash = o.hash
    requestAnimationFrame(tick)
  })
  /** 무엇이 «뜰 때까지» — 키를 누른 시각(P.key)부터 잰다 */
  window.__fbUntil = (sel, textIncl, from, timeout = 15000) => new Promise((res) => {
    const t0 = from ?? performance.now()
    const tick = () => { const el = document.querySelector(sel); if (el && (!textIncl || el.textContent.includes(textIncl))) return res(performance.now() - t0); if (performance.now() - t0 > timeout) return res(null); requestAnimationFrame(tick) }
    tick()
  })
}

/** CDP 로 요청을 센다 — 바이트는 망에 실린 양(encodedDataLength) */
async function openPage(profile, { seed = {}, marker = null, ctx = null } = {}) {
  const P = PROFILES[profile]
  const context = ctx ?? await browser.newContext({ viewport: P.vp, deviceScaleFactor: P.mobile ? 3 : 2, ...(P.mobile ? { isMobile: true, hasTouch: true } : {}) })
  const page = await context.newPage()
  await page.addInitScript(({ seed, marker }) => { window.__perfSeed = seed; window.__perfMarker = marker }, { seed, marker })
  await page.addInitScript(INIT)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  if (P.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: P.net.latency, downloadThroughput: P.net.down / 8, uploadThroughput: P.net.up / 8 })
  const reqs = new Map()
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type, t0: e.timestamp, bytes: 0, cache: false, done: false, status: 0 }))
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.cache = true })
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; if (e.response.fromDiskCache || e.response.fromServiceWorker) r.cache = true } })
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = true; r.t1 = e.timestamp } })
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.done = true; r.failed = true; r.t1 = e.timestamp } })
  return { context, page, cdp, reqs, own: !ctx }
}
const apiName = (u) => { const p = new URL(u).pathname.replace(/s_[a-z0-9]+/g, ':sid').replace(/b_[a-z0-9]+/g, ':bot'); return p }
const reqSummary = (reqs, filter = () => true) => {
  const l = [...reqs.values()].filter(filter)
  const by = {}; for (const r of l) { const k = r.type ?? 'Other'; by[k] ??= { n: 0, bytes: 0, cached: 0 }; by[k].n++; by[k].bytes += r.bytes; if (r.cache) by[k].cached++ }
  return { n: l.length, bytes: l.reduce((n, r) => n + r.bytes, 0), cached: l.filter((r) => r.cache).length, by, api: l.filter((r) => r.url.includes('/api/') && !r.url.endsWith('/api/events')).map((r) => apiName(r.url)) }
}
const waitMark = (page, k, timeout = 30000) => page.waitForFunction((k) => window.__perf.marks[k] != null, k, { timeout, polling: 30 }).then(() => true, () => false)
const marks = (page) => page.evaluate(() => { const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null; const nav = performance.getEntriesByType('navigation')[0]; const lt = window.__perf.lt; return { ...window.__perf.marks, fcp, domContentLoaded: nav?.domContentLoadedEventEnd ?? null, load: nav?.loadEventEnd ?? null, ttfb: nav?.responseStart ?? null, longTasks: lt.length, longMax: lt.reduce((m, [, d]) => Math.max(m, d), 0), tbt: lt.reduce((n, [, d]) => n + Math.max(0, d - 50), 0) } })
const idle = async (reqs, quietMs = 400, timeout = 15000) => { const t0 = Date.now(); let last = Date.now(); let pend = -1; while (Date.now() - t0 < timeout) { const p = [...reqs.values()].filter((r) => !r.done && !r.url.endsWith('/api/events')).length; if (p !== pend || p > 0) { pend = p; last = Date.now() } if (p === 0 && Date.now() - last > quietMs) return; await wait(50) } }
/** 첫 화면의 줄서기 — JS 다 받음 → /api/state → 대화(/chat). 대화 요청이 상태 답을 기다리는지 본다 */
const waterfall = (page) => page.evaluate(() => {
  const fx = window.__perf.fx; const f = (re) => fx.find((e) => re.test(e.u))
  const st = f(/\/api\/state$/); const ch = f(/\/api\/sessions\/[^/]+\/chat$/); const ev = f(/\/api\/events$/)
  const js = performance.getEntriesByType('resource').filter((e) => /\/assets\/.*\.(js|css)$/.test(e.name))
  return { assetsEnd: js.length ? Math.max(...js.map((e) => e.responseEnd)) : null, stateStart: st?.t0 ?? null, stateEnd: st?.te ?? null, chatStart: ch?.t0 ?? null, chatEnd: ch?.te ?? null, eventsOpen: ev?.th ?? null }
})
const url = (bot, sid) => `${base}/#bot=${bot}${sid ? `&s=${sid}` : ''}`

// ───────────────────────── 3) 상황별
async function scenarioCold(profile) {
  const cold = [], warm = []; let reqCold = null, reqWarm = null
  for (let i = 0; i < RUNS; i++) {
    const o = await openPage(profile, { marker: 'END-short' })
    await o.page.goto(url(ids.A, sess.short), { waitUntil: 'commit' })
    if (SHOTS && i === 0) { mkdirSync(SHOTS, { recursive: true }); for (const k of ['fcp', 'composer']) { await o.page.waitForFunction((k) => (k === 'fcp' ? performance.getEntriesByName('first-contentful-paint').length : window.__perf?.marks[k] != null), k, { polling: 10, timeout: 30000 }).catch(() => {}); await o.page.screenshot({ path: join(SHOTS, `${profile}-cold-${k}.png`) }).catch(() => {}) } }
    await waitMark(o.page, 'marker'); await idle(o.reqs)
    const m = await marks(o.page); const rs = reqSummary(o.reqs); const wf = await waterfall(o.page)
    cold.push({ ...m, ...wf, requests: rs.n, bytes: rs.bytes, apiCalls: rs.api.length, stateCalls: rs.api.filter((x) => x === '/api/state').length }); reqCold = rs
    // 웜 — 같은 문맥(HTTP 캐시 그대로)에서 다시 연다
    o.reqs.clear()
    await o.page.reload({ waitUntil: 'commit' })
    await waitMark(o.page, 'marker'); await idle(o.reqs)
    const m2 = await marks(o.page); const rs2 = reqSummary(o.reqs)
    warm.push({ ...m2, ...(await waterfall(o.page)), requests: rs2.n, bytes: rs2.bytes, cachedRequests: rs2.cached, apiCalls: rs2.api.length }); reqWarm = rs2
    await o.context.close()
  }
  return { cold: statsOf(cold), warm: statsOf(warm), coldRequests: reqCold, warmRequests: reqWarm }
}

async function scenarioSwitch(profile) {
  const first = [], revisit = [], apis = []
  for (let i = 0; i < RUNS; i++) {
    const o = await openPage(profile, { marker: 'END-short' })
    await o.page.goto(url(ids.A, sess.short), { waitUntil: 'commit' }); await waitMark(o.page, 'marker'); await idle(o.reqs)
    const phone = PROFILES[profile].mobile
    const act = (bk) => (phone ? { hash: `bot=${ids[bk]}` } : { click: `.brow[data-id="${ids[bk]}"]` })
    o.reqs.clear()
    const p1 = o.page.evaluate((o2) => window.__fbTrans(o2), { ...act('B'), marker: 'END-mid', oldMarker: 'END-short' })
    if (SHOTS && i === 0) { mkdirSync(SHOTS, { recursive: true }); await wait(PROFILES[profile].net ? 120 : 15); await o.page.screenshot({ path: join(SHOTS, `${profile}-switch-mid.png`) }) }
    const r1 = await p1
    await idle(o.reqs); apis.push(reqSummary(o.reqs).api); first.push({ ...r1, apiCalls: reqSummary(o.reqs).api.length, apiBytes: reqSummary(o.reqs).bytes })
    o.reqs.clear()
    const r2 = await o.page.evaluate((o2) => window.__fbTrans(o2), { ...act('A'), marker: 'END-short', oldMarker: 'END-mid' })
    await idle(o.reqs); const rs2 = reqSummary(o.reqs)
    o.reqs.clear()
    const r3 = await o.page.evaluate((o2) => window.__fbTrans(o2), { ...act('B'), marker: 'END-mid', oldMarker: 'END-short' })
    await idle(o.reqs); const rs3 = reqSummary(o.reqs)
    revisit.push({ ...r3, apiCalls: rs3.api.length, apiBytes: rs3.bytes, backToA: r2.content, backToAApis: rs2.api.length })
    await o.context.close()
  }
  return { first: statsOf(first), revisit: statsOf(revisit), firstApis: apis[0], timeouts: first.filter((x) => x.timeout).length + revisit.filter((x) => x.timeout).length }
}

async function scenarioSession(profile) {
  const toLong = [], toLongAgain = [], toShort = [], apis = []
  for (let i = 0; i < RUNS; i++) {
    const o = await openPage(profile, { marker: 'END-short' })
    await o.page.goto(url(ids.A, sess.short), { waitUntil: 'commit' }); await waitMark(o.page, 'marker'); await idle(o.reqs)
    o.reqs.clear()
    const p1 = o.page.evaluate((o2) => window.__fbTrans(o2), { hash: `bot=${ids.A}&s=${sess.long}`, marker: 'END-long', oldMarker: 'END-short', settleMs: 1200 })
    if (SHOTS && i === 0) { mkdirSync(SHOTS, { recursive: true }); await wait(PROFILES[profile].net ? 120 : 15); await o.page.screenshot({ path: join(SHOTS, `${profile}-session-mid.png`) }) }
    const r1 = await p1
    await idle(o.reqs); const rs1 = reqSummary(o.reqs); apis.push(rs1.api); toLong.push({ ...r1, apiCalls: rs1.api.length, apiBytes: rs1.bytes })
    const r2 = await o.page.evaluate((o2) => window.__fbTrans(o2), { hash: `bot=${ids.A}&s=${sess.short}`, marker: 'END-short', oldMarker: 'END-long' })
    toShort.push(r2)
    const r3 = await o.page.evaluate((o2) => window.__fbTrans(o2), { hash: `bot=${ids.A}&s=${sess.long}`, marker: 'END-long', oldMarker: 'END-short', settleMs: 1200 })
    toLongAgain.push(r3)
    await o.context.close()
  }
  return { toLongFirst: statsOf(toLong), toLongCached: statsOf(toLongAgain), longToShort: statsOf(toShort), firstApis: apis[0], timeouts: [...toLong, ...toShort, ...toLongAgain].filter((x) => x.timeout).length }
}

async function scenarioReconnect(profile) {
  const out = []; let apisSeen = null
  for (let i = 0; i < RUNS; i++) {
    const o = await openPage(profile, { marker: 'END-short' })
    await o.page.goto(url(ids.A, sess.short), { waitUntil: 'commit' }); await waitMark(o.page, 'marker'); await idle(o.reqs)
    // 긴 대화와 다른 봇 하나를 «본» 상태로 — 폰에서 흔한 모양(여러 대화를 열어 본 뒤 잠갔다 켬)
    await o.page.evaluate((o2) => window.__fbTrans(o2), { hash: `bot=${ids.A}&s=${sess.long}`, marker: 'END-long', settleMs: 300 })
    await o.page.evaluate((o2) => window.__fbTrans(o2), { hash: `bot=${ids.B}`, marker: 'END-mid', settleMs: 300 })
    await idle(o.reqs)
    o.reqs.clear()
    await o.page.evaluate(() => { window.__rc = performance.now(); dispatchEvent(new Event('online')) })   // api.ts 의 kick() — 화면이 다시 보일 때(visibilitychange)와 같은 길
    // 새 /api/events 가 서고 → hello → resync(상태 + 본 것 전부) 가 끝날 때까지
    const tEnd = Date.now() + 20000
    while (Date.now() < tEnd) { const l = [...o.reqs.values()]; if (l.some((r) => r.url.endsWith('/api/state') && r.done) && !l.some((r) => !r.done && !r.url.endsWith('/api/events'))) break; await wait(30) }
    await idle(o.reqs, 300)
    const l = [...o.reqs.values()]; const rest = l.filter((r) => !r.url.endsWith('/api/events'))
    const tl = await o.page.evaluate(() => {
      const tk = window.__rc; const fx = window.__perf.fx.filter((e) => e.t0 >= tk - 1)
      const ev = fx.find((e) => e.u.endsWith('/api/events')); const rest = fx.filter((e) => !e.u.endsWith('/api/events'))
      return { eventsStart: ev ? ev.t0 - tk : null, eventsOpen: ev?.th != null ? ev.th - tk : null, firstApi: rest.length ? Math.min(...rest.map((e) => e.t0)) - tk : null, resyncDone: rest.length ? Math.max(...rest.map((e) => e.te ?? e.th ?? e.t0)) - tk : null, chatBytesRaw: rest.filter((e) => /\/chat$/.test(e.u)).reduce((n, e) => n + (e.n ?? 0), 0) }
    })
    const rs = reqSummary(o.reqs); apisSeen = rs.api
    out.push({ ...tl, requests: rest.length, bytes: rest.reduce((n, r) => n + r.bytes, 0) })
    await o.context.close()
  }
  return { reconnect: statsOf(out), apis: apisSeen }
}

async function scenarioUi(profile) {
  const rows = []
  for (let i = 0; i < RUNS; i++) {
    const o = await openPage(profile, { marker: 'END-short', seed: { [`fb:docs:${ids.A}`]: JSON.stringify({ tabs: [{ rel: 'readme.md', pinned: true }], active: 'readme.md' }), 'fb:docopen': '{}' } })
    const pg = o.page
    await pg.goto(url(ids.A, sess.short), { waitUntil: 'commit' }); await waitMark(pg, 'marker'); await idle(o.reqs)
    const r = {}
    const keyThen = async (key, sel, text) => { await pg.keyboard.press(key); return pg.evaluate(([sel, text]) => window.__fbUntil(sel, text, window.__perf.key), [sel, text]) }
    // ⌘K 검색 — 창이 뜨기까지 · 대화 본문 검색 결과가 붙기까지(200ms 디바운스 포함)
    r.searchOpen = await keyThen('Meta+k', '.modal.srch')
    await pg.keyboard.type('질문 12', { delay: 0 }); r.searchHits = await pg.evaluate(() => window.__fbUntil('.modal.srch .plist', '지난 대화', window.__perf.key))
    await pg.keyboard.press('Escape'); await wait(200)
    // ⌘⇧N 폴더 선택 — 창 · 첫 폴더 줄
    o.reqs.clear()
    r.pickerOpen = await keyThen('Meta+Shift+n', '.modal.pk')
    r.pickerRows = await pg.evaluate(() => window.__fbUntil('.modal.pk .trow.dir', null, window.__perf.key))
    await idle(o.reqs); r.pickerApiBytes = reqSummary(o.reqs).bytes
    await pg.keyboard.type('보관-4', { delay: 0 }); r.pickerFilter = await pg.evaluate(() => window.__fbUntil('.modal.pk .hitn', null, window.__perf.key))
    await pg.keyboard.press('Escape'); await wait(200); await pg.keyboard.press('Escape'); await wait(200)
    // 슬래시 — 입력칸에 «/» 를 치고 목록이 뜨기까지
    await pg.click('.composer .cin'); r.slash = await keyThen('/', '.cpop')
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Backspace'); await wait(150)
    // 문서 열 ⌘⇧D — 첫 번째(편집기 조각을 받는다) · 닫았다 다시
    o.reqs.clear()
    await pg.evaluate(() => document.activeElement?.blur())
    r.docFirst = await keyThen('Meta+Shift+d', '.cm-content', 'PERFDOC-A')
    await idle(o.reqs); const ds = reqSummary(o.reqs); r.docFirstBytes = ds.bytes; r.docFirstReqs = ds.n
    await pg.keyboard.press('Meta+Shift+d'); await wait(300)
    r.docAgain = await keyThen('Meta+Shift+d', '.cm-content', 'PERFDOC-A')
    await pg.keyboard.press('Meta+Shift+d'); await wait(200)
    // ⌘N 새 세션 — 빈 대화가 서기까지(해시의 s 가 바뀌고 대화 칸이 빈다)
    const before = await pg.evaluate(() => location.hash)
    await pg.keyboard.press('Meta+n')
    r.newSession = await pg.evaluate((before) => new Promise((res) => { const t0 = window.__perf.key; const tick = () => { if (location.hash !== before && !document.querySelector('.chat-body .umsg, .chat-body .amsg')) return res(performance.now() - t0); if (performance.now() - t0 > 10000) return res(null); requestAnimationFrame(tick) }; tick() }), before)
    rows.push(r)
    await o.context.close()
  }
  return { ui: statsOf(rows) }
}

const scen = { cold: scenarioCold, switch: scenarioSwitch, session: scenarioSession, reconnect: scenarioReconnect, ui: scenarioUi }
try {
  for (const pf of PROFILES_ARG) {
    if (!PROFILES[pf]) { warn('모르는 프로필', pf); continue }
    result.profiles[pf] = {}
    for (const [k, fn] of Object.entries(scen)) {
      if (!ONLY.has(k)) continue
      if (k === 'ui' && PROFILES[pf].mobile) continue           // 단축키 상황은 데스크톱만
      const t = Date.now(); log(`\n▶ ${pf} · ${k}`)
      try { result.profiles[pf][k] = await fn(pf) } catch (e) { result.profiles[pf][k] = { error: String(e.stack ?? e).split('\n').slice(0, 3).join(' | ') }; warn(`  ✗ ${pf}/${k}:`, e.message) }
      log(JSON.stringify(result.profiles[pf][k], null, 0).slice(0, 1800), `  (${((Date.now() - t) / 1000).toFixed(1)}s)`)
    }
  }
} finally {
  await bye()
}
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2))
if (JSON_ONLY) process.stdout.write(JSON.stringify(result, null, 2) + '\n')
else log(`\n끝 — ${OUT ? `JSON: ${OUT}` : '--json 이나 --out 으로 JSON 을 받을 수 있어요'}`)
