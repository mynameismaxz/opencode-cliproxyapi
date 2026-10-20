#!/usr/bin/env bash
# Install the OpenCode hosts used by integration tests into isolated prefixes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
install() {
  local dir="$1" pkg="$2"
  if [ -x "$ROOT/.hosts/$dir/bin/opencode" ]; then
    echo "$dir: already installed"
  else
    npm i -g --prefix "$ROOT/.hosts/$dir" "$pkg" --no-fund --no-audit >/dev/null
  fi
  echo "$dir: $ROOT/.hosts/$dir/bin/opencode ($("$ROOT/.hosts/$dir/bin/opencode" --version 2>/dev/null | tail -1))"
}
install v1 opencode-ai@1.19.3
install v2 @opencode/cli@2.0.32
