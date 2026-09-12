// 릴리스 목록 → 받을 것 하나. Electron 에 안 기대는 순수 함수라 vitest 로 고정한다.
// · 리포 dave-jin/rondo 의 desktop-v<n> 릴리스 — 버전은 태그가 아니라 zip 이름(Folder.Bot-<ver>-arm64-mac.zip)에 있다
// · 초안·zip 없는 릴리스는 건너뛴다 · 가장 높은 버전 하나 · 지금보다 새로울 때만 newer

function cmp(a, b) { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d } return 0 }

function pickLatest(releases, current, opts = {}) {
  const prefix = opts.tagPrefix || 'desktop-v'
  let best = null
  for (const x of releases || []) {
    if (x.draft || !String(x.tag_name || '').startsWith(prefix)) continue
    const assets = x.assets || []
    const zip = assets.find((a) => /arm64.*\.zip$/i.test(a.name) && !/\.sha256$/i.test(a.name))
    if (!zip) continue
    const m = /-(\d+\.\d+\.\d+)-arm64/.exec(zip.name)
    const v = m ? m[1] : null
    if (!v) continue
    if (!best || cmp(v, best.version) > 0) {
      const sha = assets.find((a) => a.name === `${zip.name}.sha256`)
      best = { version: v, zipUrl: zip.browser_download_url, size: zip.size, shaUrl: sha ? sha.browser_download_url : undefined, notes: String(x.body || '').slice(0, 800), tag: x.tag_name }
    }
  }
  if (!best) return null
  return { ...best, newer: cmp(best.version, current || '0.0.0') > 0 }
}

module.exports = { cmp, pickLatest }
