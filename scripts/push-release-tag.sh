#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: scripts/push-release-tag.sh <tag> [commit-sha]" >&2
  exit 1
fi

tag="$1"
commit_sha="${2:-HEAD}"

# GitHub Actions bot identity for the tag object and push attribution.
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git tag "$tag" "$commit_sha"
git push origin "$tag"
