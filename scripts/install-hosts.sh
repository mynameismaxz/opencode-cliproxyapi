#!/usr/bin/env bash
# Install the OpenCode hosts used by integration tests into isolated prefixes.
#
# Both host packages download their real binary in a postinstall script. npm 12+ blocks install
# scripts unless they are allowed explicitly, which leaves a text placeholder at bin/opencode
# (posix_spawn then fails with ENOEXEC). Allow the scripts for exactly these packages, and verify
# that each binary actually runs instead of trusting that the file exists.
#
# Env overrides (used to test this script): HOSTS_DIR (default <repo>/.hosts), NPM (default npm).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOSTS_DIR="${HOSTS_DIR:-$ROOT/.hosts}"
NPM="${NPM:-npm}"

npm_major="$($NPM --version 2>/dev/null | tail -1 | cut -d. -f1)"

works() {
  "$1" --version >/dev/null 2>&1
}

install() {
  local dir="$1" spec="$2" name="${2%@*}"
  local bin="$HOSTS_DIR/$dir/bin/opencode"
  if works "$bin"; then
    echo "$dir: already installed"
  else
    local args=(i -g --prefix "$HOSTS_DIR/$dir" "$spec" --no-fund --no-audit)
    if [ "${npm_major:-0}" -ge 12 ]; then
      args+=("--allow-scripts=$name")
    fi
    $NPM "${args[@]}" >/dev/null
  fi
  if ! works "$bin"; then
    echo "$dir: $bin does not run. The package's postinstall (which downloads the binary) probably did not run." >&2
    exit 1
  fi
  echo "$dir: $bin ($("$bin" --version 2>/dev/null | tail -1))"
}

install v1 opencode-ai@1.19.3
install v2 @opencode/cli@2.0.32
