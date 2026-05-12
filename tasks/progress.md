# Progress

更新日: 2026-04-03

## Current Focus

- package 公開と skill 配布の直前状態まで仕上げる
- 残りは npm publish と、GitHub push 後の別マシン install テスト

## Lightweight Roadmap

### Phase A: 個人利用で十分に使える状態にする

- [x] `start / ask / reset / stop` を実装した
- [x] `status` を実装した
- [x] state file による thread 継続を実装した
- [x] model は Codex CLI 既定値へ委譲し、reasoning effort は `high` を既定値にした
- [x] 実 App Server で PoC を通した
- [x] `pnpm qc` を通した
- [x] resume / rollout 失敗時の復旧メッセージを最後まで整える
- [x] 壊れた state の逃げ道を README に短く書く
- [x] 自分用の最短運用手順を README にまとめる

### Phase B: npm package として公開できる状態にする

- [x] package name / version / description / license / repository を整理する
- [x] `files` / publish 対象を整理する
- [x] npm install 後の実行手順を README に書く
- [x] 公開前に `pnpm build` 成果物と CLI 起動を確認する
- [x] サポート範囲を明記する

### Phase C: 配布可能な Claude skill を作る

- [x] skill の呼び出し文面を設計する
- [x] `codex-sidecar start/ask/reset/stop/status` を呼ぶ薄い skill にする
- [x] セッション開始・継続・終了の運用ルールを書く
- [x] 失敗時に `status` / `reset` / `stop` へ誘導する文面を入れる
- [x] `quick_validate.py` で skill 定義を検証する
- [ ] 個人環境で install して往復テストする

## Current State Snapshot

- `codex app-server` protocol shape は確認済み
- `stdio://` は別プロセスから既存 app-server に再接続できない
- そのため現実装は各 command ごとに app-server を起動し、`threadId` + `threadPath` で resume する
- state file が `.agents/state/codex-sidecar.json` 固定なので、現状は `1 cwd = 1 sidecar session`
- `start` / `reset` では rollout を materialize するため bootstrap turn を 1 回流す
- 現時点の構成は `Claude Code -> Bash / skill -> codex-sidecar CLI -> codex app-server --listen stdio:// -> persisted thread`

## Outlook

ここから先は「今すぐ必要」ではないが、もとの展望として残す。

### Phase D: 配布品質を上げる

- [ ] 同一 cwd で複数 thread を使い分ける named session を追加する
- [x] CLI option で model / effort を上書きできるようにする
- [ ] `status --json` のような機械可読出力を検討する
- [ ] エラー分類をもう少し体系化する
- [ ] integration test の層を増やす

### Phase E: Claude plugin 化

- [ ] skill で足りない場合だけ plugin 化を検討する
- [ ] ただし本体ロジックは CLI に閉じ込める
- [ ] plugin は CLI を呼ぶ薄いアダプタに留める

## Done Log

- [x] `codex app-server generate-ts` / `generate-json-schema` で protocol を確認した
- [x] `thread/start` / `thread/resume` / `thread/archive` / `turn/start` を実装した
- [x] `item/completed` + `turn/completed` から最終 assistant message を復元した
- [x] `.agents/state/codex-sidecar.json` に `threadId` / `threadPath` / `cwd` / timestamps を保存した
- [x] fake transport ベースの unit test を書いた
- [x] state helper test と command 異常系 test を書いた
- [x] PoC で文脈継続、`reset` 後の切り替え、`stop` 後の state 削除を確認した
