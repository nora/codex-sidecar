# codex-sidecar

Claude Code から Codex App Server を薄い CLI 経由で呼び出し、同じ Codex thread を継続利用するための小さな sidecar。

## Install

```bash
npm install -g codex-sidecar
npx skills add https://github.com/nora/codex-sidecar/tree/main/skills/codex-sidecar --yes --global
```

前提:

- Node.js 22+
- `codex` CLI が使えること
- `codex app-server --listen stdio://` が動くこと

## Why

- Claude Code を主担当にする
- Codex を senior engineer / reviewer として横に置く
- broker や Claude Channel を入れず、小さい構成で長いラリーを回せるようにする

## Current Scope

- `codex app-server` を各 CLI 実行時にローカル子プロセスで起動する
- 1 本の `thread` を state file で保持し、次回以降は resume する
- CLI から `start / ask / status / reset / stop` を提供する
- Claude Code 側は Bash または plugin からこの CLI を叩く
- 既定モデルは `gpt-5.4`、既定 reasoning effort は `high`
- 現状は state file が `.agents/state/codex-sidecar.json` 固定なので、`1 cwd = 1 sidecar session`
- thread state は各プロジェクト配下の `.agents/state/codex-sidecar.json` に保存する

`stdio://` は別プロセスから再接続できないため、現実装では常駐 app-server は持たず、各 command が app-server を起動して `threadId` / `threadPath` を再利用する。
`start` は resume 可能な rollout を materialize するために bootstrap turn を 1 回だけ流す。

## Commands

グローバルインストール後:

```bash
codex-sidecar start
codex-sidecar ask "この設計の弱点を挙げて"
codex-sidecar ask "さっきの2番目の弱点について、最小修正案を具体化して"
codex-sidecar status
codex-sidecar reset
codex-sidecar ask "新しい前提で、この実装方針をレビューして"
codex-sidecar stop
```

リポジトリ内での開発:

```bash
pnpm install
pnpm qc
pnpm dev -- help
pnpm dev -- start
pnpm dev -- ask "この設計の弱点を挙げて"
pnpm dev -- status
pnpm dev -- reset
pnpm dev -- stop
```

## Recovery

- `codex-sidecar status` で現在の thread / state を確認する
- `ask` が resume/state エラーなら `codex-sidecar reset`
- state file を強制的に消したいなら `codex-sidecar stop`

## Quality

ローカル CI の入口は `pnpm qc`。

- `pnpm lint`
- `pnpm fmt:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Claude Code の `PostToolUse` hook で、`src/*.ts` への編集後に `oxlint --fix` と `oxfmt --write` が自動で走る。

## Docs

- [docs/npm.md](docs/npm.md): npm 更新手順と Publish workflow
- [tasks/progress.md](tasks/progress.md): 軽量ロードマップと進捗チェックリスト
- [AGENTS.md](AGENTS.md): リポジトリ運用ルール
