import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  define: { __FB_VERSION__: JSON.stringify(pkg.version) },
  // ⚠ 화면이 둘이다 — 본 앱(`index.html`)과 **메뉴바 패널**(`tray.html`). 패널은 셸이 테두리 없는
  //    작은 창으로 띄워 앱 안과 **같은 `UsageCard`** 를 그린다(`tray.tsx` 머리말).
  build: { outDir: '../../dist/client', emptyOutDir: true, sourcemap: false, target: 'es2022', cssTarget: ['chrome108', 'safari15.4', 'firefox115'], rollupOptions: { input: { main: 'src/client/index.html', tray: 'src/client/tray.html' } } },
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:7373' } }
})
