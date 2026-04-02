# codex-sidecar

Claude Code から Codex App Server を薄い CLI 経由で呼び出し、同じ Codex thread を継続利用するための小さな sidecar。

## Why

- Claude Code を主担当にする
- Codex を senior engineer / reviewer として横に置く
- broker や Claude Channel を入れず、小さい構成で長いラリーを回せるようにする

## Current Scope

- `codex app-server` をローカル子プロセスで起動する
- 1 本の `thread` を state file で保持する
- CLI から `start / ask / reset / stop` を提供する
- Claude Code 側は Bash または plugin からこの CLI を叩く

現時点では CLI 骨格、品質チェック、Claude hook まで入っていて、App Server client 自体はこれから実装する段階。

## Commands

```bash
pnpm install
pnpm qc
pnpm dev -- help
pnpm dev -- start
pnpm dev -- ask "この設計の弱点を挙げて"
```

## Quality

ローカル CI の入口は `pnpm qc`。

- `pnpm lint`
- `pnpm fmt:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Claude Code の `PostToolUse` hook で、`src/*.ts` への編集後に `oxlint --fix` と `oxfmt --write` が自動で走る。

## Docs

- [tasks/base-plan.md](/Users/nora/dev/codex-sidecar/tasks/base-plan.md): 現時点の基本設計と作業順序
- [AGENTS.md](/Users/nora/dev/codex-sidecar/AGENTS.md): リポジトリ運用ルール
