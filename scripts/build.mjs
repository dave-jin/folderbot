import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
mkdirSync('dist/host', { recursive: true })
await build({ entryPoints: ['src/host/index.ts'], outfile: 'dist/host/index.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node20', sourcemap: true, external: process.env.BUNDLE_ALL ? [] : ['web-push', 'croner', 'yaml'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
console.log('host built → dist/host/index.mjs')
execSync('npx vite build --config vite.client.config.ts', { stdio: 'inherit' })
