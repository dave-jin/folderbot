# Folder Bot (Project Bot)

내 Mac mini 위에서 사는, 폴더마다 하나씩 붙는 AI 동료들 — 그리고 그들을 PARA 로 관제하는 오케스트레이터.

- 기획: [docs/PRD.md](docs/PRD.md) · 시나리오: [docs/SCENARIOS.md](docs/SCENARIOS.md) · 미니 런북: [docs/RUNBOOK-mini.md](docs/RUNBOOK-mini.md)
- 목업: https://claude.ai/code/artifact/046fd71a-18f5-40df-980e-f7725380d2c2

## 구조
```
src/core    순수 TS — 타입 · 폴더 규칙 · todo.md · 상태 머신 · 인증 판정
src/host    Node 호스트 — 봇 레지스트리 · Claude 워커(stream-json) · 게이트웨이(HTTP+SSE) · MCP · 루틴 · 알림/푸시
src/client  PWA — 3분할 메신저 · 파일 시트 · 폴더 선택 · 알림 센터
bin/        folderbot CLI (init · start · status)
```

## 개발
```bash
npm install
npm run qa        # typecheck · unit · build · smoke(스텁 CLI + 화면)
npm run build && node bin/folderbot.mjs init <루트> && node bin/folderbot.mjs start
```
