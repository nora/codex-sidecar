#!/usr/bin/env bash
set -euo pipefail

pnpm lint
pnpm fmt:check
pnpm typecheck
pnpm test
pnpm build
