# Folder Bot — Mac mini 런북 (v0.2)

> 처음 설치라면 **[INSTALL.md](INSTALL.md)** 를 보세요 — 미니·맥북·폰을 한 번에 다룹니다. 이 문서는 미니 운영 세부.

## 0. 준비물
- macOS (Apple Silicon) · Claude Code CLI 설치 + 로그인(`claude` → `/login`, Pro/Max)
- Dropbox 의 PARA 볼트가 미니에 **오프라인 사용 가능**으로 내려와 있을 것
- Tailscale (밖에서 붙을 때) — 미니와 폰이 같은 구글 계정으로 로그인

## 1. 설치 — 🟢 권장: 메뉴바 앱 (터미널 없음)
미니에도 맥북과 **같은 앱**을 설치합니다. 앱 안에 호스트가 들어 있어요.
1. GitHub Releases(`dave-jin/rondo` › `desktop-v2` 이상)에서 `Folder Bot-<ver>-arm64.dmg` → `/Applications`.
2. ad-hoc 서명이라 처음엔 Finder 에서 **우클릭 → 열기**. "손상됨" 이 뜨면 `xattr -dr com.apple.quarantine "/Applications/Folder Bot.app"`.
3. 첫 화면 아래 **「이 맥에서 호스트 실행」** › [루트 폴더 고르고 시작] → PARA 루트 선택.
   - 루트 `CLAUDE.md` 에 `## 폴더 규칙` 절(PARA 프리셋)을 **덧붙이고**(있는 내용은 안 건드림) 호스트가 뜹니다.
   - 메뉴바 폴더봇 아이콘 우클릭 → **로그인 시 자동 실행** 을 켜 두세요. 재부팅해도 사람이 로그인만 하면 다시 뜹니다.
4. 메뉴바 메뉴에 **페어링 코드**(복사·새로 만들기)와 **폰 주소 복사**가 있습니다.

왜 이게 로그인 문제를 없애나: Claude CLI 는 **사람이 GUI 로 로그인한 세션** 안에서만 키체인을 읽습니다.
SSH·launchd·원격 스크립트로 띄운 호스트는 `Not logged in · Please run /login` 이 됩니다(실제 겪은 증상).
앱은 GUI 로그인 항목이라 그 세션 안에서 뜹니다.

## 1′. 대안: 터미널 설치 (CLI)
```bash
curl -fsSL https://raw.githubusercontent.com/dave-jin/rondo-releases/main/folderbot/install.sh | bash
folderbot init "/Users/dave/Library/CloudStorage/Dropbox-Cbsjin/진대연 (Dave)/PARA"
```
🔴 `folderbot start` 는 **Jump Desktop 으로 들어가 GUI 에서 새로 연 Terminal** 에서. tmux 로 띄우면 창을 닫아도 삽니다:
`/opt/homebrew/bin/tmux -L folderbot new -s host` → `folderbot start` → `Ctrl-b d`. SSH 에서 `folderbot start` 하면 키체인을 못 읽습니다.

## 2. 로그인이 안 될 때 (Not logged in · OAuth session expired)
| 순서 | 처리 |
|---|---|
| ① | 미니에서 (GUI 로) `claude` → `/login` → 앱 배너 **[다시 확인]**. 앱이 GUI 로그인 항목이면 이걸로 끝. |
| ② | 그래도 안 되면 **장기 토큰**: 미니 터미널에서 `claude setup-token` → 나온 `sk-ant-oat01-…` 를 앱 **설정 › Claude 토큰** 에 붙여넣기 (또는 `folderbot token <토큰>`). 1년짜리, 키체인 무관. ⚠ 토큰 모드에선 claude.ai 커넥터(Gmail·Notion 등 MCP)를 못 씁니다 — 로컬 MCP 는 됨. |
| ③ | 호스트는 실패 문구를 감지하면 앰버 배너 + 폰 푸시를 보내고, 보낸 메시지는 **대기열**에 두었다가 복구되면 다시 보냅니다. |

## 3. 폰·맥북에서 열기
- 같은 tailnet: `http://<미니 Tailscale IP>:7373` (메뉴바 › 폰 주소 복사) → 6자리 코드 → 연결. 기기별 토큰 저장(설정에서 끊기).
- **HTTPS + 푸시**: 미니에서 `tailscale serve --bg 7373` → `https://mac-mini.<tailnet>.ts.net` 로 열고 **홈 화면에 추가** → 설정 › 이 기기 푸시 켜기.
- 맥북: 같은 앱을 설치하고 첫 화면에 미니 주소 입력 → 페어링. (맥북엔 호스트 불필요)

## 4. 파일 첨부
- 작성창 **+** › **이 기기에서 파일 올리기** — 폰·맥북의 파일이 `<봇 폴더>/첨부/` 에 저장되고(같은 이름은 `-1`), 메시지에 경로가 붙어 봇이 읽습니다.
- **+** › **이 폴더에서 고르기** — 미니의 봇 폴더 트리에서 선택. 여러 개 가능, 칩으로 표시.

## 4′. 자동 업데이트
앱이 부팅 15초 뒤 + 6시간마다 공개 릴리스(`dave-jin/rondo-releases`, 태그 `folderbot-desktop-v*`)를 보고 **조용히 받아 둡니다.**
- 맥북(클라이언트): 다 받으면 확인창 하나 — [지금 재시작해서 적용] / [나중에]. 메뉴바 › 업데이트 확인 으로 수동도 됨.
- 미니(호스트): 진행 중 세션이 있으면 **기다렸다가 전부 유휴가 되는 순간 자동 적용**(세션을 죽이지 않음). 없으면 바로.
- 교체는 앱이 완전히 끝난 뒤 분리된 스크립트가 `ditto --noqtn` 으로 합니다(검역 딱지 없음 → Gatekeeper 안 걸림). `/Applications` 밖에서 실행 중이면 자동 교체 대신 받은 zip 을 보여 줍니다.
- 🔴 **한 번만 할 일(Dave)**: GitHub Actions 가 공개 리포에 올리려면 PAT 가 필요합니다. github.com › Settings › Developer settings › Fine-grained token — 리포 `rondo-releases`, 권한 **Contents: Read and write** → 그 값을 `dave-jin/rondo` › Settings › Secrets and variables › Actions › `RELEASES_TOKEN` 에 저장. 그 다음 main 푸시부터 프리릴리스가 올라가고 설치된 앱이 받기 시작합니다. (secret 이 없으면 그 단계만 건너뛰고 `dave-jin/rondo` 릴리스만 만듭니다.)

## 5. 재부팅했을 때
앱 방식: 로그인 항목이라 사람이 미니에 로그인하면 자동으로 뜸(자동 로그인을 켜 두면 전원만 켜도 됨).
CLI 방식: 1′ 절차로 다시.

## 6. 데이터 위치
- 앱 호스트 모드: `~/Library/Application Support/Folder Bot/host/` · CLI: `~/Library/Application Support/folderbot/`
- 활성 봇 목록·되돌리기: `<루트>/.folderbot/` · 봇 설정·루틴: `<봇 폴더>/.bot.yml` · 오케스트레이터 지침: `<루트>/.claude/orchestrator.md`

## 7. 자주 겪는 것
| 증상 | 처리 |
|---|---|
| 세션을 못 띄웠어요 · Not logged in | §2 |
| `claude` 를 못 찾음 | 앱은 `/opt/homebrew/bin`·`~/.local/bin` 을 PATH 에 넣습니다. 다른 곳이면 `config.json` 의 `claudeBin` |
| 폰에서 주소가 안 열림 | 폰 Tailscale 켜짐? 메뉴바 › 폰 주소 복사로 IP 확인 |
| 푸시가 안 옴 | HTTP 로는 서비스 워커가 안 뜹니다. `tailscale serve` HTTPS + 홈 화면 설치 |
| 후보가 0 | 루트 `CLAUDE.md` 의 `active:` 글롭이 실제 폴더명과 같은지 (예: `2. Projects/*`) |
| 앱 안 호스트를 다른 루트로 | 메뉴바 › 루트 바꾸기 |
