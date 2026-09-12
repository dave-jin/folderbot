#!/bin/bash
# Folder Bot 설치 — Mac mini(호스트)용. 사용법:
#   curl -fsSL https://raw.githubusercontent.com/dave-jin/rondo-releases/main/folderbot/install.sh | bash
#   (또는 이 파일을 받아서: bash install.sh [루트 폴더])
set -euo pipefail
VER="${FOLDERBOT_VERSION:-0.2.0}"
URL="${FOLDERBOT_URL:-https://raw.githubusercontent.com/dave-jin/rondo-releases/main/folderbot/folderbot-${VER}.tgz}"
DEST="${FOLDERBOT_HOME:-$HOME/.folderbot/app}"
ROOT="${1:-}"
say() { printf '\033[1;33m%s\033[0m\n' "$*"; }
if ! command -v node >/dev/null 2>&1; then say "Node.js 20+ 가 필요해요. 설치: brew install node  (Homebrew 가 없으면 https://nodejs.org)"; exit 1; fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then say "Node.js 20 이상이 필요해요 (지금 $(node -v))"; exit 1; fi
if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then say "Claude Code CLI 가 없어요. 설치 후 'claude' 로 로그인하세요: curl -fsSL https://claude.ai/install.sh | bash"; fi
say "Folder Bot v${VER} 을 ${DEST} 에 설치합니다"
mkdir -p "$DEST"
TMP=$(mktemp -d)
curl -fsSL "$URL" -o "$TMP/fb.tgz"
tar -xzf "$TMP/fb.tgz" -C "$DEST" --strip-components=1
rm -rf "$TMP"
( cd "$DEST" && npm install --omit=dev --no-audit --no-fund --silent )
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/folderbot" <<SH
#!/bin/bash
exec node "$DEST/bin/folderbot.mjs" "\$@"
SH
chmod +x "$HOME/.local/bin/folderbot"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) say "PATH 에 ~/.local/bin 을 추가하세요: echo 'export PATH=\$HOME/.local/bin:\$PATH' >> ~/.zshrc";; esac
say "설치 완료."
if [ -n "$ROOT" ]; then "$HOME/.local/bin/folderbot" init "$ROOT"; fi
cat <<TXT

다음 순서 (Mac mini 에서, 사람이 GUI 로 연 터미널에서):
  1) folderbot init "/Users/dave/Library/CloudStorage/Dropbox-Cbsjin/진대연 (Dave)/PARA"
  2) /opt/homebrew/bin/tmux -L folderbot new -s host    # 없으면 그냥 3) 을 터미널에서
  3) folderbot start
     → 주소와 6자리 페어링 코드가 뜹니다. 폰/맥북 브라우저에서 주소를 열고 코드를 넣으세요.
  Tailscale 로 밖에서: tailscale serve --bg 7373   (HTTPS · 폰 푸시에 필요)
TXT
