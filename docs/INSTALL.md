# Folder Bot 설치 가이드 — Mac mini(호스트) · 원격 맥(클라이언트) · 폰

> v0.2.0 · 2026-09-12. 짧은 요약: **미니와 맥북에 같은 앱을 설치**한다. 미니에서는 「이 맥에서 호스트 실행」, 맥북에서는 미니 주소를 넣고 6자리 코드로 연결. 폰은 브라우저로 같은 주소.

```
┌────────────── Mac mini (항상 켜 둠) ──────────────┐
│ Folder Bot.app  ─ 호스트 모드 ─ Claude Code 워커들 │
│   └ 루트 = Dropbox/PARA  (봇 = 폴더 하나 + 에이전트) │
└──────────────┬────── Tailscale ──────────┬────────┘
        맥북 Folder Bot.app            iPhone/Android 브라우저
        (미니 주소 + 페어링 코드)         (같은 주소 + 코드 · 홈 화면 추가)
```

## 0. 준비물 (미니)

| 항목 | 확인 |
|---|---|
| macOS · Apple Silicon | 인텔 맥은 빌드가 없어요 |
| Claude Code CLI | 터미널에서 `claude` 가 뜨고 `/login` 이 끝난 상태 (Pro/Max) |
| Dropbox | PARA 볼트가 **오프라인 사용 가능**으로 내려와 있을 것 (봇이 파일을 직접 읽어요) |
| Tailscale | 미니·맥북·폰이 **같은 계정**으로 로그인. 밖에서 붙을 때 필요 |

## 1. Mac mini — 호스트 설치 (앱, 터미널 없음)

1. 릴리스에서 `Folder Bot-<버전>-arm64.dmg` 를 받아 `/Applications` 로 끌어 놓습니다.
   - https://github.com/dave-jin/rondo/releases (최신 `desktop-v*`)
2. ad-hoc 서명이라 처음엔 Finder 에서 **우클릭 → 열기**. "손상됨" 이 뜨면 터미널에서 한 번:
   ```
   xattr -dr com.apple.quarantine "/Applications/Folder Bot.app"
   ```
3. 첫 화면 아래 **「이 맥에서 호스트 실행」 › [루트 폴더 고르고 시작]** → PARA 루트 선택.
   - 루트 `CLAUDE.md` 에 `## 폴더 규칙` 절이 덧붙고(있는 내용은 안 건드림) 호스트가 뜹니다.
   - 로그인 항목이 자동으로 켜집니다. 재부팅 뒤 사람이 로그인만 하면 다시 뜹니다(자동 로그인을 켜 두면 전원만).
4. 메뉴바 폴더봇 아이콘 우클릭 → **페어링 코드 복사** · **폰에서 열 주소 복사**.

왜 앱이어야 하나: Claude CLI 는 사람이 GUI 로 로그인한 세션 안에서만 키체인을 읽습니다. SSH·launchd·스크립트로 띄우면 `Not logged in · Please run /login` 이 됩니다. 앱은 로그인 항목이라 그 세션 안에서 뜹니다.

### 1′. 대안 — 터미널(CLI) 설치

```bash
curl -fsSL https://raw.githubusercontent.com/dave-jin/rondo-releases/main/folderbot/install.sh | bash
folderbot init "/Users/dave/Library/CloudStorage/Dropbox-Cbsjin/진대연 (Dave)/PARA"
folderbot start        # Jump Desktop 으로 들어가 GUI 에서 새로 연 Terminal 에서. tmux 로 띄우면 창을 닫아도 살아요
```

## 2. 원격 맥(맥북) — 클라이언트 설치

1. 같은 DMG 를 받아 `/Applications` 로. 처음엔 우클릭 → 열기.
2. 첫 화면에 **미니 주소**를 넣습니다: `http://<미니 Tailscale IP>:7373` (메뉴바 › 폰에서 열 주소 복사)
   또는 HTTPS 를 붙였다면 `https://mac-mini.<tailnet>.ts.net`.
3. 미니에서 복사한 **6자리 페어링 코드**를 넣으면 연결. 기기별 토큰이 저장되어 다음부턴 바로 열립니다(설정 › 기기 › 끊기).
4. 메뉴바에 폴더봇 아이콘 — 확인 대기 수가 배지로, 클릭하면 창, 우클릭 메뉴에 **로그인 시 자동 실행**. 알림은 macOS 알림 센터로 오고 누르면 그 대화로 갑니다.

맥북에는 호스트가 없습니다. 미니가 꺼져 있으면 「Mac mini 와 다시 연결하는 중…」 이 뜨고 저장된 대화만 보입니다.

## 3. 폰 (iPhone · Android)

1. Tailscale 앱 켜기 → Safari/Chrome 에서 미니 주소 → 6자리 코드.
2. **홈 화면에 추가** 하면 앱처럼 뜹니다(아래 탭: 목록 · 대화 · 문서 · 폴더).
3. **푸시 알림**은 HTTPS 에서만 동작합니다. 미니에서 한 번:
   ```
   tailscale serve --bg 7373
   ```
   → `https://mac-mini.<tailnet>.ts.net` 으로 열고 홈 화면에 추가 → 설정 › 이 기기 푸시 켜기.

## 4. 자동 업데이트

- 앱이 부팅 15초 뒤 + 6시간마다 공개 릴리스를 보고 **조용히 받아 둡니다**.
- 맥북: 다 받으면 확인창 하나 — [지금 재시작해서 적용] / [나중에]. 메뉴바 › 업데이트 확인 으로 수동도.
- 미니: 진행 중 세션이 있으면 **전부 유휴가 되는 순간 자동 적용**(세션을 죽이지 않음). 없으면 바로.
- 🔴 한 번만 할 일: CI 가 공개 리포에 올리려면 PAT 가 필요합니다. github.com › Settings › Developer settings › Fine-grained token — 리포 `rondo-releases`, **Contents: Read and write** → `dave-jin/rondo` › Settings › Secrets and variables › Actions › `RELEASES_TOKEN`. 그 다음 푸시부터 설치된 앱이 스스로 받습니다.

## 5. 로그인이 안 될 때 (`Not logged in` · `OAuth session expired`)

| 순서 | 처리 |
|---|---|
| ① | 미니에서 GUI 로 `claude` → `/login` → 앱 배너 **[다시 확인]**. 앱이 로그인 항목이면 보통 여기서 끝. |
| ② | 그래도 안 되면 **장기 토큰**: 미니 터미널에서 `claude setup-token` → `sk-ant-oat01-…` 를 설정 › **Claude 토큰** 에 붙여넣기(1년). ⚠ 토큰 모드는 claude.ai 커넥터(Gmail·Notion MCP)를 못 씁니다. |
| ③ | 실패 문구를 감지하면 배너 + 폰 푸시가 오고, 보낸 지시는 **대기열**에 두었다가 복구되면 다시 보냅니다. |

## 6. 화면 — 네 열

```
목록 │ 대화 │ 문서 │ 이 폴더에서(세션 · 할 일 · 파일 · 루틴)
```

- **모든 경계가 핸들**: 열 사이 3곳, 패널 섹션 사이 2곳을 드래그. 더블클릭 = 기본값. 창이 좁으면 목록·패널이 44px 아이콘 열로 접힙니다(겹치는 창 없음).
- **문서 열**: 오른쪽 파일 트리를 클릭하면 미리보기 탭(기울임), 더블클릭·편집이면 고정. 폴더 안 ↑↓ 로 이전·다음 파일. 본문 더블클릭 = 편집(자동 저장). 봇이 파일을 쓰면 한 줄 배너.
- **진행**: 대화 맨 아래 한 줄 — 펄스 점 · 지금 하는 일 · 경과 · 중단. 실행 중에 보내면 **대기열**에 들어가 턴이 끝나면 순서대로.
- **서브에이전트**: `↳ 이름 · 실행 중 · 도구 N회` 한 줄 → 꺾쇠로 마지막 도구 몇 줄 → 「열기」로 안으로.
- 단축키: `⌘B` 목록 · `⌘⇧B` 패널 · `⌘⇧D` 문서 열 · `⌘W` 탭 닫기 · `⎋` 편집 끝.

## 7. 기본 모델 · 생각 레벨

설정 › **모델 · 생각 레벨**. 기본은 **Opus 5 + 높음**. 바꾸면 **다음 세션부터** 적용되고, 열려 있는 세션은 만들 때의 값을 그대로 씁니다. 세션마다 고르는 메뉴는 없습니다(하나로 고정).

## 8. 데이터 위치

| 무엇 | 어디 |
|---|---|
| 앱 호스트 모드 설정·기기 토큰·세션 기록 | `~/Library/Application Support/Folder Bot/host/` |
| CLI 설치 시 | `~/Library/Application Support/folderbot/` |
| 활성 봇 목록·되돌리기 | `<루트>/.projectbot/` |
| 봇 설정·루틴 | `<봇 폴더>/.bot.yml` · 오케스트레이터 지침 `<루트>/.claude/orchestrator.md` |
| 원격에서 올린 첨부 | `<봇 폴더>/첨부/` |

## 9. 자주 겪는 것

| 증상 | 처리 |
|---|---|
| 세션을 못 띄웠어요 · Not logged in | §5 |
| `claude` 를 못 찾음 | 앱은 `/opt/homebrew/bin`·`~/.local/bin` 을 봅니다. 다른 곳이면 `config.json` 의 `claudeBin` |
| 폰에서 주소가 안 열림 | 폰 Tailscale 켜짐? 메뉴바 › 폰에서 열 주소 복사로 IP 확인 |
| 푸시가 안 옴 | HTTP 로는 서비스 워커가 안 뜹니다 → §3 의 `tailscale serve` |
| 후보가 0 | 루트 `CLAUDE.md` 의 `active:` 글롭이 실제 폴더명과 같은지 (예: `2. Projects/*`) |
| 다른 루트로 바꾸고 싶다 | 메뉴바 › 루트 바꾸기 |
| 첫 답이 몇 초 늦다 | 절전 세션을 깨우는 중 — 대화 아래에 「절전」 표시 |
