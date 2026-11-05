#!/bin/sh
set -eu
: "${CODEX_MCP_NODE_PATH:?Codex desktopの同梱Node.jsを参照できません。デスクトップのローカルセッションで実行してください。}"
exec "$CODEX_MCP_NODE_PATH" "${0%/*}/gate.cjs" "$@"
