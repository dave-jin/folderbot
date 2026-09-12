import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  define: { __FB_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: '../../dist/client', emptyOutDir: true, sourcemap: false, target: 'es2022' },
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:7373' } }
})
