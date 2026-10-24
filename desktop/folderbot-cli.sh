#!/bin/sh
# DA · `folderbot ask` — 앱 안의 호스트 번들을 앱의 Electron(node 모드)으로 돌린다 (2026-10-24).
# 맥에 node 가 없어도 되고, CLI 와 호스트가 늘 같은 판이다. 링크: ln -s "/Applications/Folder Bot.app/Contents/Resources/folderbot" ~/.local/bin/folderbot
# 링크를 따라가 앱 자리를 찾는다(헤드리스·SSH 의 좁은 PATH 에서도 /bin/sh 와 readlink 만 쓴다).
SELF="$0"
while [ -L "$SELF" ]; do L=$(/usr/bin/readlink "$SELF"); case "$L" in /*) SELF="$L" ;; *) SELF="$(/usr/bin/dirname "$SELF")/$L" ;; esac; done
CONTENTS="$(cd "$(/usr/bin/dirname "$SELF")/.." && pwd -P)"
ELECTRON_RUN_AS_NODE=1 exec "$CONTENTS/MacOS/Folder Bot" "$CONTENTS/Resources/app.asar/host/host/index.mjs" "$@"
