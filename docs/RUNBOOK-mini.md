# Folder Bot — Mac mini 런북 (v0.1)

## 0. 준비물
- macOS · Node.js 20+ (`brew install node`) · Claude Code CLI 로그인 상태(`claude` → `/login`)
- Dropbox 의 PARA 볼트가 미니에 **오프라인 사용 가능**으로 내려와 있을 것
- Tailscale (밖에서 붙을 때) — 미니와 폰이 같은 구글 계정으로 로그인

## 1. 설치
```bash
curl -fsSL https://raw.githubusercontent.com/dave-jin/rondo-releases/main/folderbot/install.sh | bash
```
`~/.folderbot/app` 에 풀리고 `~/.local/bin/folderbot` 명령이 생깁니다.

## 2. 루트 정하기 (한 번)
```bash
folderbot init "/Users/dave/Library/CloudStorage/Dropbox-Cbsjin/진대연 (Dave)/PARA"
```
루트 `CLAUDE.md` 에 `## 폴더 규칙` 절(PARA 프리셋)을 **덧붙입니다**(있는 내용은 안 건드림). 후보 폴더 수를 보여 줍니다.

## 3. 호스트 띄우기 — 🔴 사람이 GUI 로 연 터미널에서
Claude CLI 는 헤드리스(SSH·launchd)에서 키체인을 못 읽습니다. 그래서:
1. Jump Desktop 으로 미니 화면에 들어가 **Terminal 을 새로 엽니다.**
2. (권장) tmux 로 띄워 두면 창을 닫아도 삽니다: `/opt/homebrew/bin/tmux -L folderbot new -s host`
3. `folderbot start`
   - 주소(127.0.0.1 · Tailscale IP)와 **6자리 페어링 코드**가 뜹니다. 코드는 2분짜리, `p` + Enter 로 새로.
4. 나올 때 `Ctrl-b` `d`. 다시 붙을 때 `tmux -L folderbot attach -t host` (SSH 로도 됨 — 서버를 GUI 에서 띄웠으면 키체인은 열립니다).

호스트가 "이 문맥에선 못 읽음" 을 감지하면 앱에 앰버 배너 + 폰 푸시가 옵니다. 그럼 위 터미널에서 `claude` → `/login`.

## 4. 폰·맥북에서 열기
- 같은 tailnet: `http://<미니 Tailscale IP>:7373` (또는 `http://mac-mini.<tailnet>.ts.net:7373`)
- 코드 6자리 → 연결. 기기별 토큰이 저장됩니다(설정에서 끊기).
- **HTTPS + 푸시**: 미니에서 `tailscale serve --bg 7373` → `https://mac-mini.<tailnet>.ts.net` 로 열고 **홈 화면에 추가** → 설정 › 이 기기 푸시 켜기.

## 5. 재부팅했을 때
`folderbot start` 를 3번 절차대로 다시. (로그인 항목으로 자동 실행하는 GUI 셸은 M5 에서.)

## 6. 데이터 위치
- 호스트 설정·기기 토큰·세션 기록: `~/Library/Application Support/folderbot/`
- 활성 봇 목록·되돌리기: `<루트>/.projectbot/`
- 봇 설정·루틴: `<봇 폴더>/.bot.yml` · 오케스트레이터 지침: `<루트>/.claude/orchestrator.md`

## 7. 자주 겪는 것
| 증상 | 처리 |
|---|---|
| 세션을 못 띄웠어요 · Not logged in | 3번 절차의 터미널에서 `claude` → `/login` → 앱 배너 [다시 확인] |
| 폰에서 주소가 안 열림 | 폰 Tailscale 켜짐? `folderbot status` 로 tailnet state 확인 |
| 푸시가 안 옴 | HTTP 로는 서비스 워커가 안 뜹니다. `tailscale serve` HTTPS + 홈 화면 설치 |
| 후보가 0 | 루트 `CLAUDE.md` 의 `active:` 글롭이 실제 폴더명과 같은지 (예: `2. Projects/*`) |

## 8. 맥북 — 설치형 앱 (Folder Bot.app)
Grok Bot 처럼 앱으로 씁니다. 앱은 **미니의 호스트에 붙는 셸**이라 맥북에는 호스트가 필요 없습니다.
1. GitHub Releases(`dave-jin/rondo` › `desktop-v*`)에서 `Folder Bot-<ver>-arm64.dmg` 를 받아 `/Applications` 에 끌어 놓습니다.
2. ad-hoc 서명이라 처음엔 Finder 에서 **우클릭 → 열기**. "손상됨" 이 뜨면 터미널에서 `xattr -dr com.apple.quarantine "/Applications/Folder Bot.app"`.
3. 첫 화면에 미니 호스트 주소(`http://100.x.x.x:7373` 또는 `https://mac-mini.<tailnet>.ts.net`)를 넣고 연결 → 6자리 페어링 코드.
4. 메뉴바에 폴더봇 아이콘이 생깁니다 — 확인 대기 수가 배지로, 클릭하면 창, 우클릭 메뉴에 **로그인 시 자동 실행**.
5. 알림은 macOS 알림 센터로 오고, 누르면 그 대화로 갑니다. 창을 닫아도 메뉴바에 남아 있어요.
