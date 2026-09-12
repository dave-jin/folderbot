// 배포 tarball — dist(host·client) + bin + package.json(런타임 의존성만) + install.sh
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const out = `release/folderbot-${pkg.version}`
rmSync('release', { recursive: true, force: true }); mkdirSync(out, { recursive: true })
cpSync('dist', `${out}/dist`, { recursive: true }); cpSync('bin', `${out}/bin`, { recursive: true }); cpSync('install.sh', `${out}/install.sh`); cpSync('docs/RUNBOOK-mini.md', `${out}/RUNBOOK-mini.md`)
writeFileSync(`${out}/package.json`, JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module', bin: pkg.bin, engines: pkg.engines, dependencies: pkg.dependencies }, null, 2))
writeFileSync(`${out}/README.md`, `# Folder Bot v${pkg.version}\n\n설치: bash install.sh [루트 폴더]  ·  실행: folderbot start\n자세한 절차: RUNBOOK-mini.md\n`)
execSync(`tar -czf release/folderbot-${pkg.version}.tgz -C release folderbot-${pkg.version}`)
execSync(`shasum -a 256 release/folderbot-${pkg.version}.tgz > release/folderbot-${pkg.version}.tgz.sha256 || sha256sum release/folderbot-${pkg.version}.tgz > release/folderbot-${pkg.version}.tgz.sha256`)
console.log(readFileSync(`release/folderbot-${pkg.version}.tgz.sha256`, 'utf8').trim())
