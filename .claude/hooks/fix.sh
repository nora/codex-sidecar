#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

FILE="${1:?file path required}"

case "$FILE" in
  src/*.ts)
    pnpm oxlint --fix "$FILE" 2>/dev/null || true
    pnpm oxfmt --write "$FILE" 2>/dev/null || true
    ;;
esac
