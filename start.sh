#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "错误：需要先安装 Node.js 18 或更高版本。" >&2
  exit 1
fi

if [[ ! -d node_modules/electron ]]; then
  npm install --include=dev
fi

if [[ ! -f node_modules/electron/path.txt ]]; then
  echo "正在补全 Electron 运行时..."
  ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
    node node_modules/electron/install.js
fi

exec npm start
