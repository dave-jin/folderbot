#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const built = join(here, '..', 'dist', 'host', 'index.mjs')
if (!existsSync(built)) { console.error('빌드가 없어요. npm run build 를 먼저 실행하세요.'); process.exit(1) }
const { main } = await import(built)
await main(process.argv.slice(2))
