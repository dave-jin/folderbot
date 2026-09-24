/**
 * 🔴 **AM · 가로로 새는 것을 잡는다** (2026-09-24 Dave 신고 1·2·5 · `docs/LAYOUT.md`).
 *
 * 세 건이 같은 뿌리였다 — 「폭이 좁아지면 안에 든 것이 상자 밖으로 나가거나 글자가 접힌다」.
 * 눈으로 한 번 보고 끝내면 다음 폭에서 또 난다. **폭을 훑으며 기계로 잰다.**
 *
 * 재는 법 — 「제 자식을 품어야 하는 상자」를 정해 두고, 그 안의 **잎**이 상자의 안쪽(패딩 박스)을
 * 벗어나는지 본다. 화면(뷰포트) 기준이 아니라 **상자 기준**이다: 보내기 단추는 화면 안에 있으면서도
 * 입력창 상자 밖으로 나갔었다(스크린샷_2004).
 *
 * 쓰기: `node test/fit.mjs`  ·  폭을 좁혀 가며 전부 잰다.
 */
import { chromium } from 'playwright-core'
import { execSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const root = realpathSync(mkdtempSync(join('/tmp', 'fb-fit-')))
const data = mkdtempSync(join(tmpdir(), 'fb-fitdata-')), fbHome = mkdtempSync(join(tmpdir(), 'fb-fithome-'))
for (const d of ['1. Inbox', '3. Area/제품_Rondo', '4. Resources', '5. Archive']) mkdirSync(join(root, d), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/CLAUDE.md'), '# 제품_Rondo\n')
writeFileSync(join(root, '3. Area/제품_Rondo/readme.md'), '# Rondo\n\n본문\n')
writeFileSync(join(root, '3. Area/제품_Rondo/todo.md'), '# todo\n\n## 할 일\n- [ ] 하나\n')
/* 이미지 뷰어 바를 재려면 실제 그림이 있어야 한다 — 1×1 PNG 하나 */
mkdirSync(join(root, '3. Area/제품_Rondo/첨부'), { recursive: true })
writeFileSync(join(root, '3. Area/제품_Rondo/첨부/그림.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))

const env = { ...process.env, FOLDERBOT_QA: '1', FOLDERBOT_HOME: fbHome, FOLDERBOT_DATA: data, FOLDERBOT_NO_AUTH: '1', FOLDERBOT_CLI_BIN: join(process.cwd(), 'test/fixtures/stub-claude.mjs'), FOLDERBOT_CODEX_BIN: '/nonexistent/codex' }
const PORT = 7467
const portFree = (p) => new Promise((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))) })
if (!(await portFree(PORT))) { console.error(`포트 ${PORT} 가 이미 잡혀 있어요`); process.exit(1) }
execSync(`node bin/folderbot.mjs init ${JSON.stringify(root)}`, { env, stdio: 'ignore' })
const host = spawn('node', ['bin/folderbot.mjs', 'start', '--port', String(PORT)], { env, stdio: 'ignore' })
const base = `http://127.0.0.1:${PORT}`
for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/bots'); break } catch { await wait(150) } }

/**
 * 품어야 하는 상자들. 여기 없는 것은 안 잰다 — 스크롤 칸처럼 **넘치는 게 정상**인 것도 있다.
 * ⚠ `.live.hold` 는 화면에 늘 있지는 않다(대기 중에만). 그래서 아래에서 **진짜 마크업을 심어** 잰다.
 */
const BOXES = ['.composer', '.live.hold', '.imgv .zbar', '.tabbar', '.cbar']
const overflow = (pg) => pg.evaluate((sels) => {
  const out = []
  for (const sel of sels) for (const box of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(box)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = box.getBoundingClientRect()
    /* ⚠ 잎만 훑으면 놓친다 — 넘친 자식이 제 자식을 또 갖고 있으면(예: 보내기 단추 안의 그림) 안 잡혔다.
       상자 자신이 «담을 수 있는 폭보다 내용이 넓은가» 를 먼저 본다. 실측에서 85px 넘침을 이 줄이 잡았다. */
    if (box.scrollWidth > Math.round(r.width) + 1) out.push({ box: sel, el: '(상자 전체)', over: box.scrollWidth - Math.round(r.width), axis: '가로', txt: '' })
    const padL = r.left + Number.parseFloat(cs.borderLeftWidth) + Number.parseFloat(cs.paddingLeft)
    const padR = r.right - Number.parseFloat(cs.borderRightWidth) - Number.parseFloat(cs.paddingRight)
    if (r.width < 4) continue
    for (const el of box.querySelectorAll('*')) {
      if (el.children.length) continue                                  // 잎만
      const s2 = getComputedStyle(el)
      if (s2.display === 'none' || s2.visibility === 'hidden' || Number(s2.opacity) === 0) continue
      if (s2.position === 'absolute' || s2.position === 'fixed') continue   // 일부러 띄운 것(유령 글 등)은 따로 본다
      const q = el.getBoundingClientRect()
      if (q.width < 1 || q.height < 1) continue
      const padT = r.top + Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.paddingTop)
      const padB = r.bottom - Number.parseFloat(cs.borderBottomWidth) - Number.parseFloat(cs.paddingBottom)
      /* ⚠ **가로만 재면 절반만 본다** — 「알림 켜기」는 점선 상자의 위아래를 뚫고 나갔다(스크린샷_1958). */
      const x = Math.round(Math.max(q.right - padR, padL - q.left))
      const y = Math.round(Math.max(q.bottom - padB, padT - q.top))
      const over = Math.max(x, y)
      if (over > 1) out.push({ box: sel, el: String(el.className || el.tagName).slice(0, 26), over, axis: y > x ? '세로' : '가로', txt: (el.textContent || '').trim().slice(0, 14) })
    }
  }
  return out
}, BOXES)   /* ⚠ 여기에 함수를 넘기면 evaluate 가 통째로 실패하고, `.catch` 가 그걸 삼켜 **늘 초록**이 된다(실제로 그랬다) */

/** 글자가 단추 안에서 두 줄로 접혔나 — 「맞/춤」 같은 것 */
const wrapped = (pg) => pg.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('.zbar button, .cbtn, .hact, .sendb, .tabbar [data-tab] span')) {
    const t = (el.textContent || '').trim(); if (!t) continue
    const lh = Number.parseFloat(getComputedStyle(el).lineHeight) || 16
    if (el.getBoundingClientRect().height > lh * 1.7) out.push({ el: String(el.className || el.tagName).slice(0, 24), txt: t.slice(0, 12), h: Math.round(el.getBoundingClientRect().height), lh: Math.round(lh) })
  }
  return out
})

const rawBots = await (await fetch(base + '/api/bots')).json()
const botList = Array.isArray(rawBots) ? rawBots : (rawBots.bots ?? [])
const BOT = (botList.find((b) => /Rondo/.test(b.name ?? '')) ?? botList[0])?.id ?? ''
if (!BOT) console.log('⚠ 봇을 못 찾았어요 — 봇 화면 검사는 헛돕니다')

const br = await chromium.launch()
let bad = 0
/**
 * ⚠ **채팅 칸이 좁은 상황은 창을 줄여서는 안 만들어진다** — 창이 좁으면 양옆 칸이 아예 사라지고 채팅이
 *    넓어진다(stage). Dave 가 겪은 것은 **넓은 창에서 양옆을 키워** 채팅을 한계(CHAT_MIN 360)까지 민 경우다.
 *    그래서 저장된 열 너비(`fb:layout`)를 직접 넣어 그 상황을 만든다.
 */
const CASES = [
  ['폰 320', 320, 700, true, null], ['폰 390', 390, 844, true, null], ['폰 430', 430, 932, true, null],
  ['데스크톱 900', 900, 800, false, null], ['데스크톱 1440', 1440, 900, false, null],
  ['데스크톱 1440 · 채팅 좁힘', 1440, 900, false, { sb: 520, rp: 558 }],
]
for (const [label, W, H, phone, lay] of CASES) {
  const pg = await br.newPage({ viewport: { width: W, height: H }, hasTouch: phone, isMobile: phone })
  await pg.addInitScript((l) => { localStorage.setItem('folderbot:token', 'x'); localStorage.setItem('fb:theme', 'dark'); if (l) localStorage.setItem('fb:layout', JSON.stringify({ sb: l.sb, rp: l.rp, doc: 520, sbOpen: true, rpOpen: true, sbPin: true, rpPin: true, secH: { sessions: 120, todo: 128 } })) }, lay)
  await pg.goto(base); await wait(1200)
  /* ⚠ 그냥 열면 봇 목록이라 탭도 입력칸도 «그 봇의 것» 이 아니다 — 실제 봇으로 들어가서 잰다 */
  if (BOT) { await pg.goto(`${base}/#bot=${BOT}`); await wait(1200) }
  // 대기 줄은 대화 중에만 뜬다 — **진짜 마크업**을 심어 폭만 잰다(CSS 는 실물 그대로)
  await pg.evaluate(() => {
    const host2 = document.querySelector('.chat-body'); if (!host2 || document.querySelector('.live.hold')) return
    const d = document.createElement('div'); d.className = 'live hold'
    d.innerHTML = '<span style="width:22px;height:22px;flex:none;display:inline-block"></span><span class="bounce"><i></i><i></i><i></i></span><span class="tx">오래 걸리네요 — 다른 일 보셔도 됩니다. 끝나면 알려 드릴게요</span><span class="el mono">38분 9초</span><span class="sp"></span><button class="hact">알림 켜기</button>'
    host2.appendChild(d)
  })
  /**
   * 이미지 뷰어 바(`.zbar`)는 그림을 열어야 생긴다. 여기서는 **진짜 마크업을 심어** 폭만 잰다 —
   * CSS 와 미디어쿼리는 실물 그대로라 「줄내림이 나는가 · 아이콘만 남는가」는 정확히 재진다.
   */
  await pg.evaluate(() => {
    if (document.querySelector('.imgv .zbar')) return
    const app = document.querySelector('.app'); if (!app) return
    const v = document.createElement('div'); v.className = 'imgv'; v.style.cssText = 'position:relative;height:200px;width:100%'
    const ic = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/></svg>'
    v.innerHTML = `<div class="zbar"><button>−</button><span class="pct">21%</span><button>+</button>` +
      `<button aria-label="맞춤">${ic}<span class="lb">맞춤</span></button>` +
      `<button aria-label="원본">${ic}<span class="lb">원본</span></button>` +
      `<button class="cp" aria-label="복사">${ic}<span class="lb">복사</span></button></div>`
    app.appendChild(v)
  })
  await wait(250)
  /* 데스크톱 아래 줄은 **첨부가 있을 때** 가장 길어진다 — Dave 가 겪은 상태를 그대로 만든다 */
  await pg.evaluate(() => {
    const bar = document.querySelector('.cbar'); if (!bar || bar.querySelector('.acount')) return
    const sp = document.createElement('span'); sp.className = 'acount'; sp.textContent = '첨부 4개 · 봇이 읽어서 참고'
    bar.insertBefore(sp, bar.querySelector('.sp'))
  })
  await wait(300)
  /** ⚠ **잴 상자가 없으면 검사는 헛돈다** — 초록이 「괜찮다」가 아니라 「안 봤다」가 된다(스모크에서 겪었다) */
  const seen = await pg.evaluate((sels) => Object.fromEntries(sels.map((s2) => [s2, document.querySelectorAll(s2).length])), BOXES)
  if (process.env.FB_DEBUG) console.log('   대기줄:', JSON.stringify(await pg.evaluate(() => {
    const row = document.querySelector('.live.hold'); if (!row) return null
    const b2 = row.querySelector('.hact'); const cs = getComputedStyle(row)
    const par = row.parentElement; const pcs = getComputedStyle(par)
    return { row: Math.round(row.getBoundingClientRect().height), h: cs.height, minH: cs.minHeight, box: cs.boxSizing, disp: cs.display, flex: cs.flex, pad: cs.padding, btn: Math.round(b2.getBoundingClientRect().height), btnTop: Math.round(b2.getBoundingClientRect().top - row.getBoundingClientRect().top), align: cs.alignItems, kids: [...row.children].map((k) => `${k.className || k.tagName}:${Math.round(k.getBoundingClientRect().height)}`).join(','), par: `${par.className}|${pcs.display}|${pcs.overflowY}|${Math.round(par.getBoundingClientRect().height)}` }
  })))
  if (process.env.FB_DEBUG2) console.log('   입력칸:', JSON.stringify(await pg.evaluate(() => {
    const cin = document.querySelector('.composer .cin'); if (!cin) return null
    const row = cin.closest('.composer'); const left = row.querySelector('.cleft button, .crow > :first-child')
    const r = cin.getBoundingClientRect(), L = left?.getBoundingClientRect()
    const rng = document.createRange(); rng.selectNodeContents(cin); const line = rng.getBoundingClientRect()
    return { par: cin.parentElement.className, cinFlex: getComputedStyle(cin).flex, cinH: Math.round(r.height), cinTop: Math.round(r.top), lineTop: Math.round(line.top), lineH: Math.round(line.height), btnMid: L ? Math.round(L.top + L.height / 2) : null, cinMid: Math.round(r.top + r.height / 2), ph: getComputedStyle(cin, '::before').top }
  })))
  /** AM-4 · 글줄 속 칩이 글자 가운데선과 얼마나 어긋나나 (+면 칩이 아래로 처진 것) */
  const chipOff = await pg.evaluate(() => {
    const cin = document.querySelector('.composer .cin'); if (!cin) return null
    cin.innerHTML = '앞 글자 <span class="ichip"><span class="nm">스크린샷_2002.png</span><span class="fb">첨부</span></span> 뒤 글자'
    const chip = cin.querySelector('.ichip'); const r = chip.getBoundingClientRect()
    const rng = document.createRange(); rng.setStart(cin.firstChild, 0); rng.setEnd(cin.firstChild, 2)
    const t = rng.getBoundingClientRect()
    const off = Math.round((r.top + r.height / 2) - (t.top + t.height / 2))
    const va = getComputedStyle(chip).verticalAlign, fs = getComputedStyle(cin).fontSize, lh = getComputedStyle(cin).lineHeight, ch = Math.round(r.height), th = Math.round(t.height)
    cin.innerHTML = ''
    return { off, va, fs, lh, ch, th }
  }).catch(() => null)
  if (process.env.FB_DEBUG3) console.log('   칩:', JSON.stringify(chipOff))
  const [ov, wr] = [await overflow(pg), await wrapped(pg)]
  if (ov.length || wr.length) bad++
  console.log(`\n■ ${label}`)
  if (process.env.FB_DEBUG4) console.log('   바:', JSON.stringify(await pg.evaluate(() => {
    const bar = document.querySelector('.cbar'); if (!bar) return null
    const r = bar.getBoundingClientRect()
    return { w: Math.round(r.width), scroll: bar.scrollWidth, over: bar.scrollWidth - Math.round(r.width), items: [...bar.children].map((c) => `${(c.className || c.tagName).toString().slice(0, 10)}:${Math.round(c.getBoundingClientRect().width)}`).join(' '), last: Math.round([...bar.children].at(-1).getBoundingClientRect().right - r.right) }
  })))
  const cw = await pg.evaluate(() => Math.round(document.querySelector('.col.chat')?.getBoundingClientRect().width ?? 0))
  console.log(`   채팅 칸 ${cw}px · 상자:`, Object.entries(seen).map(([k, v]) => `${k}=${v}`).join(' '))
  if (!ov.length && !wr.length) console.log('   ✅ 넘침 0 · 줄내림 0')
  for (const o of ov) console.log(`   🔴 ${o.axis} 넘침 ${String(o.over).padStart(3)}px  ${o.box} → ${o.el} «${o.txt}»`)
  for (const w of wr) console.log(`   🔴 줄내림  ${w.el} «${w.txt}» 높이 ${w.h} (한 줄 ${w.lh})`)
  await pg.close()
}
console.log(bad ? `\n🔴 ${bad}개 폭에서 깨집니다` : '\n✅ 모든 폭에서 안 깨집니다')
await br.close(); host.kill(); rmSync(root, { recursive: true, force: true })
process.exit(bad ? 1 : 0)   // ⚠ QA 가 이 값을 본다 — 빨간데 0 을 돌려주면 검사가 없는 것과 같다
