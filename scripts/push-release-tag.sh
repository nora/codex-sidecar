#!/usr/bin/env bash
# 指定 commit に release tag を打ち、その tag だけを `origin` に push する。
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: scripts/push-release-tag.sh <tag> [commit-sha]" >&2
  exit 1
fi

tag="$1"
commit_sha="${2:-HEAD}"

git tag "$tag" "$commit_sha"
git push origin "$tag"
