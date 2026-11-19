/**
 * 여러 맥 — 맥마다 연결(SSE) 하나 (2026-11-19).
 *
 * 종전 `main.js` 의 `startSse`·`syncState`·`onFrame`·`recount` 를 맥 수만큼 늘린 것이다. 연결은 배지·알림의 유일한 출처라,
 * 보고 있지 않은 맥도 여기서 연결을 열어 둔다(«다른 맥 봇이 내 답을 기다리면 놓치지 않는다»).
 * 🔴 401 이면 다시 붙지 않는다 — 상대 맥에서 이 기기를 지웠다는 뜻이다. 5초마다 두드리면 상대 로그만 더럽힌다.
 *    다음 `sync` 에서 토큰이 바뀌면(다시 페어링) 그때 다시 연다.
 */
const http = require('node:http')
const https = require('node:https')

function createLinks(opt) {
  const retryMs = opt.retryMs ?? 5000
  const links = new Map() // id → { url, token, req, timer, states: Map, reach: bool|null, auth: bool, dead: bool }
  const mod = (url) => (url.startsWith('https') ? https : http)

  const setReach = (L, id, ok) => { if (L.reach !== ok) { L.reach = ok; opt.onReach(id, ok) } }
  const lost = (L, id) => { if (L.auth) return; L.auth = true; L.dead = true; try { L.req?.destroy() } catch {} opt.onAuthLost(id) }
  const retry = (L, id) => { if (L.dead || L.timer) return; L.timer = setTimeout(() => { L.timer = null; open(L, id) }, retryMs) }

  function syncState(L, id) {
    const req = mod(L.url).get(L.url + '/api/state', { headers: { authorization: `Bearer ${L.token}` } }, (r) => {
      if (r.statusCode === 401) { r.resume(); lost(L, id); return }
      if (r.statusCode !== 200) { r.resume(); return }
      let s = ''; r.setEncoding('utf8'); r.on('data', (d) => (s += d))
      r.on('end', () => {
        if (L.dead) return
        try {
          const st = JSON.parse(s); L.states.clear()
          for (const list of Object.values(st.sessionsByBot || {})) for (const x of list) L.states.set(x.id, x.state)
          opt.onState(id, { hostName: st.hostName, version: st.version, auth: st.auth && st.auth.verdict })
          opt.onChange(id)
        } catch {}
      })
    })
    req.on('error', () => {})
  }

  function onFrame(L, id, f) {
    if (f.ev === 'state') { L.states.set(f.sessionId, f.state); opt.onChange(id) }
    if (f.ev === 'sessions') { for (const x of f.sessions) L.states.set(x.id, x.bg ? 'running' : x.state); opt.onChange(id) }
    if (f.ev === 'notify') opt.onNotify(id, f.n)
    if (f.ev === 'hello') syncState(L, id)
  }

  function open(L, id) {
    if (L.dead) return
    const req = mod(L.url).get(L.url + '/api/events', { headers: { authorization: `Bearer ${L.token}`, accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode === 401) { res.resume(); lost(L, id); return }
      if (res.statusCode !== 200) { res.resume(); setReach(L, id, false); retry(L, id); return }
      setReach(L, id, true)
      let buf = ''; res.setEncoding('utf8')
      res.on('data', (d) => {
        buf += d; let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const c = buf.slice(0, i); buf = buf.slice(i + 2)
          for (const l of c.split('\n')) if (l.startsWith('data: ')) { try { onFrame(L, id, JSON.parse(l.slice(6))) } catch {} }
        }
      })
      const down = () => { if (L.req !== req || L.dead) return; setReach(L, id, false); retry(L, id) }
      res.on('end', down); res.on('error', down); res.on('close', down)
      syncState(L, id)
    })
    req.on('error', () => { if (L.req !== req || L.dead) return; setReach(L, id, false); retry(L, id) })
    L.req = req
  }

  function close(L) { L.dead = true; clearTimeout(L.timer); L.timer = null; try { L.req?.destroy() } catch {} }

  const count = (id, pred) => { const L = links.get(id); if (!L) return 0; let n = 0; for (const s of L.states.values()) if (pred(s)) n++; return n }

  return {
    sync(macs, tokenOf) {
      const want = new Map(macs.map((m) => [m.id, m]))
      for (const [id, L] of links) if (!want.has(id) || want.get(id).url !== L.url || tokenOf(id) !== L.token) { close(L); links.delete(id) }
      for (const m of macs) {
        if (links.has(m.id)) continue
        const token = tokenOf(m.id); if (!token) continue
        const L = { url: m.url.replace(/\/$/, ''), token, req: null, timer: null, states: new Map(), reach: null, auth: false, dead: false }
        links.set(m.id, L); open(L, m.id)
      }
    },
    waiting: (id) => count(id, (s) => s === 'awaiting_input'),
    working: (id) => count(id, (s) => s === 'running'),
    busy: (id) => count(id, (s) => s === 'running' || s === 'awaiting_input'),
    reachable: (id) => !!links.get(id)?.reach,
    authLost: (id) => !!links.get(id)?.auth,
    stopAll() { for (const L of links.values()) close(L); links.clear() }
  }
}

module.exports = { createLinks }
