#!/usr/bin/env bash
set -euo pipefail

package_json_path="${1:-package.json}"

version="$(
  node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).version" \
    "$package_json_path"
)"
tag="v${version}"

if git rev-parse "refs/tags/${tag}" >/dev/null 2>&1; then
  echo "Git tag ${tag} already exists" >&2
  exit 1
fi

printf '%s\n' "$tag"
