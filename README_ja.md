# codex-sidecar

[English](README.md) | [日本語](README_ja.md)

Claude Code から、同じ Codex thread に継続して相談するための sidecar CLI です。

Claude Code が実装の主担当、Codex Sidecar が横にいる reviewer / design partner、という使い方を想定しています。同じ project directory で `ask` を繰り返すと、Codex 側の文脈を引き継いだまま続きの相談ができます。

## Install

```bash
npm install -g codex-sidecar
npx skills add nora/codex-sidecar
```

`npx skills add` は skill を入れたい project root で実行してください。global install にしたい場合だけ `--global` を付けます。

前提は Node.js 22+ と OpenAI Codex CLI です。

## Claude Code から使う

```text
Use $codex-sidecar to review this design and list the top 3 risks.
```

```text
Use $codex-sidecar to focus on the second risk and suggest the smallest safe fix.
```

この skill は内部で `codex-sidecar status/start/ask/reset/stop` を呼びます。

## CLI

```bash
codex-sidecar start
codex-sidecar ask "Review this implementation and point out likely regressions."
codex-sidecar ask "Continue from your previous answer and propose a minimal fix."
codex-sidecar status
codex-sidecar reset
codex-sidecar ask "Start fresh under this new assumption: ..."
codex-sidecar stop
```

- `start`: 新しい Codex thread を作って保存する
- `ask <message>`: active thread にメッセージを送り、Codex の返答を表示する
- `status`: 保存中の thread state と既定 model 設定を表示する
- `reset`: 現在の thread を archive して新しい thread に切り替える
- `stop`: 現在の thread を archive して local state を消す

## セッションの持ち方

- state file は各 project directory の `.agents/state/codex-sidecar.json`
- 現状は `1 directory = 1 sidecar session`
- 既定 model は `gpt-5.4`
- 既定 reasoning effort は `high`
- daemon は持たず、各コマンドごとに `codex app-server` を起動し、保存済み thread を resume して 1 操作だけ実行して終了する

`ask` が state/resume エラーになったら、まず `codex-sidecar status` を見て、必要なら `codex-sidecar reset` してください。完全に片付けたいときは `codex-sidecar stop` です。
