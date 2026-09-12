// electron-builder afterPack — 앱 번들을 ad-hoc 서명한다 (알파 Rondo scripts/dmg.sh 승계).
// 🔴 왜: `identity: null` 은 «서명을 건너뛴다» 이지 «ad-hoc 서명» 이 아니다. 그래서 v17 까지의 번들에는
//    _CodeSignature 가 아예 없었고(실측: zip 안 0개), macOS 알림 센터는 서명 없는 앱을 등록하지 않아
//    알림이 조용히 버려졌다(설정 › 알림 목록에도 안 뜸). 개발자 인증서 없이도 `codesign --sign -` 면 등록된다.
// ⚠ 이 훅은 dmg/zip 을 만들기 전에 돈다 — 그래서 받는 zip 도, 자동 업데이트로 들어오는 번들도 서명돼 있다.
'use strict'
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'darwin') return
  const app = join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log(`[afterPack] ad-hoc signed: ${app}`)
}
