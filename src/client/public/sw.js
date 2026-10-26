self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Folder Bot', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Folder Bot', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.id || undefined, data: d }))
})
/**
 * DK · 누르면 그 세션으로 — iOS 홈 화면 앱은 `client.navigate()` 가 실패하고(뒤에 떠 있던 앱) `openWindow` 가 해시를 버린다(닫혀 있던 앱).
 * 그래서 «어디로» 를 캐시 저장소 한 칸에 먼저 적고, 화면이 앞에 나올 때 꺼내 간다(`src/client/pushOpen.ts` · 이름이 같아야 한다).
 * 떠 있는 화면에는 메시지도 함께 보낸다. navigate 는 쓰지 않는다 — iOS 에서 실패하면서 보던 화면을 그대로 둔다.
 */
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const d = e.notification.data || {}
  const target = d.botId ? { type: 'fb:open', botId: d.botId, sessionId: d.sessionId || '', at: Date.now() } : null
  const url = '/' + (target ? `#bot=${encodeURIComponent(d.botId)}${d.sessionId ? `&s=${encodeURIComponent(d.sessionId)}` : ''}` : '')
  e.waitUntil((async () => {
    if (target) { try { const c = await caches.open('fb-open'); await c.put('/__fb-open', new Response(JSON.stringify(target), { headers: { 'content-type': 'application/json' } })) } catch { /* 칸 없이도 메시지·주소로 간다 */ } }
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of cs) {
      if (target) { try { c.postMessage(target) } catch { /* */ } }
      if ('focus' in c) { try { await c.focus() } catch { /* */ } return }
    }
    await self.clients.openWindow(url)
  })())
})
