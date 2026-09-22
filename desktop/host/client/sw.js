self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Folder Bot', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Folder Bot', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.id || undefined, data: d }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const d = e.notification.data || {}
  const url = '/' + (d.botId ? `#bot=${d.botId}${d.sessionId ? `&s=${d.sessionId}` : ''}` : '')
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) { if ('focus' in c) { c.navigate(url); return c.focus() } } return self.clients.openWindow(url) }))
})
