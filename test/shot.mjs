/**
 * 🔴 **AL · 눈으로 본다** (2026-09-24 Dave: *«전체적으로 직접 눈으로 보고 캡처해서 잘 만들어졌으면»*).
 *
 * 폰 크기로 앱을 띄워 화면마다 PNG 를 남긴다. **홈 인디케이터가 있는 기기를 흉내 낸다** — 브라우저에는
 * 안전영역이 없어 `--sab` 가 0 이라, 실기기에서만 생기는 「빈 띠」가 검사에도 캡처에도 안 나타난다
 * (그래서 여태 스모크가 이 버그를 한 번도 못 잡았다). `--sab` 를 한 토큰으로 모아 뒀으므로 여기서 갈아 끼운다.
 *
 * 쓰기: `node test/shot.mjs [--sab 34] [--w 390] [--h 844]` → `test/tmp/shot-*.png`
 */
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const SAB = Number(arg('sab', 34)), W = Number(arg('w', 390)), H = Number(arg('h', 844))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const root = realpathSync(mkdtempSync(join('/tmp', 'fb-shot-')))
const data = mkdtempSync(join(tmpdir(), 'fb-shotdata-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-shothome-'))
for (const d of ['1. Inbox', '2. Projects/2026-10_해커톤-제안', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), `# Rondo\n\n${'본문 줄입니다. 문서 화면의 아래쪽까지 글이 차도록 채웁니다.\n\n'.repeat(30)}`)
writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 요청 · 할 일\n- [ ] PRD v1.0 확정: Q2·Q5\n- [ ] Tailscale 폰 설치\n- [x] 옛 완료 1\n- [x] 옛 완료 2\n\n## 완료\n')

const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex', FOLDERBOT_NO_AUTH: '1' }
const PORT = 7466
const portFree = (p) => new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))) })
if (!(await portFree(PORT))) { console.error(`포트 ${PORT} 가 이미 잡혀 있어요`); process.exit(1) }
execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env, stdio: 'ignore' })
const base = `http://127.0.0.1:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/bots'); break } catch { await wait(150) } }

mkdirSync('test/tmp', { recursive: true })
const br = await chromium.launch()
const pg = await br.newPage({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await pg.addInitScript((sab) => {
  localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark')
  // 실기기 흉내 — 홈 인디케이터 높이. `--sab` 한 토큰만 갈아 끼우면 탭·시트·입력칸이 다 따라온다
  addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sab', `${sab}px`))
}, SAB)
await pg.goto(base); await wait(1500)

const raw = await (await fetch(base + '/api/bots')).json()
const bots = Array.isArray(raw) ? raw : (raw.bots ?? raw.list ?? [])
if (!bots.length) { console.error('봇 목록이 비었어요:', JSON.stringify(raw).slice(0, 300)); process.exit(1) }
const bot = bots.find((b) => /Rondo/.test(b.name)) ?? bots[0]
await pg.goto(`${base}/#bot=${bot.id}`); await wait(1200)

/**
 * 죽은 여백 — **마지막 잎 요소**와 탭 바 윗변 사이의 빈 공간 (`docs/LAYOUT.md` 불변식 3).
 * ⚠ 컨테이너 상자를 재면 안 된다 — 패딩도 제 상자 안이라 **버그가 0 으로 보인다**(실측에서 속았다).
 *    자식 요소가 없는 **잎**만 센다. 잎의 아래끝은 곧 「마지막으로 칠해진 자리」다.
 */
/** ⚠ 재는 것은 **바닥에 붙는 UI** 뿐 — 스크롤 목록은 탭이 올라가면 다른 줄이 드러나 여백이 들쭉날쭉해진다 */
const SCOPE = { chat: '.chat-foot', doc: '.dfoot', files: '.pfoot' }
const deadGap = (scope) => pg.evaluate((sel) => {
  const tb = document.querySelector('.tabbar'); if (!tb) return null
  const top = tb.getBoundingClientRect().top
  /* ⚠ 범위를 안 좁히면 **딴 화면의 요소**가 잡힌다 — 채팅 입력칸은 어느 탭에서나 살아 있어서
        늘 그것이 «마지막 잎» 으로 나왔다(실측). 지금 보이는 칸 안에서만 센다. */
  const root = document.querySelector(sel) ?? document.querySelector('.app'); if (!root) return null
  let low = -1, who = ''
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length) continue                                   // 잎만
    /* ⚠ 폰에서는 문서·폴더 화면 자체가 서랍 안에 산다 — 서랍을 통째로 빼면 잴 것이 없어진다(실측 null).
       빼는 것은 «지금 보는 화면이 아닌 것» 뿐이다: 봇 목록 서랍 · 시트 · 어둠막. */
    if (el.closest('.tabbar') || el.closest('.drawer.left') || el.closest('.tsheet') || el.closest('.backdrop')) continue
    const st = getComputedStyle(el)
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom > top + 1 || r.bottom < 0) continue
    if (r.bottom > low) { low = r.bottom; who = el.className || el.tagName }
  }
  return { gap: low < 0 ? null : Math.round(top - low), who: String(who).slice(0, 30), view: document.querySelector('.app')?.dataset.view }
}, scope)

const shots = []
const tabs = await pg.$$eval('.tabbar [data-tab]', (r) => r.map((x) => [x.dataset.tab, (x.textContent || '').trim()]))
console.log('탭:', JSON.stringify(tabs))
for (const [id, label] of tabs) {
  const sel = `.tabbar [data-tab="${id}"]`
  await pg.click(sel); await wait(900)
  /* 문서 화면은 **문서를 실제로 열어야** 아래 줄(`.dfoot`)이 생긴다 — 빈 화면만 찍으면 여백 버그가 안 보인다 */
  if (id === 'doc' && !(await pg.$('.dfoot'))) {
    const back = await pg.$('.tabbar [data-tab="files"]')
    if (back) { await back.click(); await wait(700); const f = await pg.$('.panel .secb button.trow:not(.dir)'); if (f) { await f.click(); await wait(1400) } }
    await pg.click(sel); await wait(900)
  }
  /**
   * 🔴 **기기에 안 기대는 판정** — 안전영역을 0 → SAB 로 키워 본다.
   *    제대로 만들었으면 탭 바도 내용도 **같이** 올라가므로 **죽은 여백은 그대로**다.
   *    두 곳에서 세면 여백만 그만큼 **커진다** — 그 차이가 곧 버그의 크기다(`docs/LAYOUT.md` 불변식 1).
   */
  const setSab = (v) => pg.evaluate((n) => document.documentElement.style.setProperty('--sab', `${n}px`), v)
  await setSab(0); await wait(250); const g0 = SCOPE[id] ? await deadGap(SCOPE[id]) : null
  await setSab(SAB); await wait(250); const g1 = SCOPE[id] ? await deadGap(SCOPE[id]) : null
  const f = `test/tmp/shot-${id}.png`
  await pg.screenshot({ path: f })
  shots.push({ label, gap: g1?.gap ?? null, grow: g0 && g1 ? g1.gap - g0.gap : null, who: g1?.who ?? '', file: f })
}
// 모델 시트
await pg.click('.tabbar [data-tab="chat"]'); await wait(600)
if (await pg.$('.cchips .cbtn:nth-child(2)')) { await pg.click('.cchips .cbtn:nth-child(2)'); await wait(700); await pg.screenshot({ path: 'test/tmp/shot-model.png' }); shots.push({ label: '모델 시트', file: 'test/tmp/shot-model.png' }) }

console.log(`\n안전영역 ${SAB}px · ${W}×${H} 로 흉내`)
let bad = 0
for (const s of shots) {
  const grow = s.grow == null ? '' : `· 안전영역 키울 때 ${s.grow > 0 ? '+' : ''}${s.grow}px`
  /**
   * 🔴 판정은 **grow 하나**로 한다. 절대 여백(`gap`)은 못 쓴다 — 목록이 짧아 화면을 안 채우면
   *    아래가 비는 것이 **정상**이라(폴더·할 일) 거짓 빨강이 난다. 「안전영역을 키웠는데 여백이 같이
   *    커진다」만이 두 곳에서 셌다는 증거다.
   */
  if (s.grow > 2) bad++
  console.log(`  ${s.label.padEnd(8)} ${s.gap == null ? '' : `죽은 여백 ${String(s.gap).padStart(3)}px`} ${grow.padEnd(26)} ${s.who ?? ''}  ${s.file}`)
}
console.log(bad ? `\n🔴 ${bad}개 화면이 규칙을 어겼어요 (안전영역을 두 곳에서 셉니다)` : '\n✅ 모든 화면이 규칙 안')
await br.close(); host.kill(); rmSync(root, { recursive: true, force: true })
