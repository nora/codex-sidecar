# Base Plan

## 目的

Claude Code から Codex を sidecar 的に使う。最小構成で、同じ Codex thread を継続利用しながら相談・レビュー・修正ラリーを回せるようにする。

## 今回の前提

- 最初は小さく作る
- Busy / notification / room / broker は考えない
- Claude Channel は使わない
- Claude Code は操作インターフェースとして使う
- Codex 側は `Codex App Server` に新しい thread を立てて使う
- 既存の Codex TUI セッションを sidecar として再利用する前提は置かない

## 採用する構成

```text
Claude Code
  -> Bash / plugin
    -> codex-sidecar CLI
      -> codex app-server --listen stdio://
        -> one persistent Codex thread
```

## この構成を選ぶ理由

- `codex-plugin-cc` より会話の連続性が強い
- `Claude Channel + broker` より実装が小さい
- `it2` や polling に依存しない
- sidecar らしい長いラリーを同一 thread で継続できる

## 最小機能

1. `start`
2. `ask`
3. `reset`
4. `stop`

### `start`

- `codex app-server` を子プロセスで起動する
- App Server に接続する
- sidecar 用の thread を 1 本作る
- Codex に senior engineer persona を与える
- `threadId` と `pid` を state file に保存する

### `ask`

- 既存 state を読む
- 同じ `threadId` に turn を送る
- App Server のイベントストリームを同期で待つ
- 最終 assistant message を stdout に返す

### `reset`

- 新しい thread を作る
- 既存の会話文脈を捨てる

### `stop`

- sidecar 用プロセスを止める
- state file を削除する

## state

最初は DB を入れない。state file だけでよい。

候補:

```json
{
  "threadId": "thr_xxx",
  "pid": 12345,
  "startedAt": "2026-04-02T12:34:56+09:00"
}
```

保存先候補:

- `.agents/state/codex-sidecar.json`

## system prompt の役割

start 時に固定 persona を入れる。

- あなたはこのリポジトリの senior engineer
- KISS / DRY / YAGNI を優先する
- 日本語で返す
- 批判的にレビューする
- 必要なら代替案を提案する
- 返答は簡潔にする

この persona を thread に固定して、Claude 側の毎回の説明を減らす。

## 実装単位

- `src/index.ts`
- `src/codex/app-server-client.ts`
- `src/codex/state.ts`
- `src/codex/types.ts`
- `src/commands/start.ts`
- `src/commands/ask.ts`
- `src/commands/reset.ts`
- `src/commands/stop.ts`

最初は package を分けず、単一 npm package 内に閉じ込める。

## テスト方針

最初から実 Codex 依存にはしない。fake transport を切る。

- state 保存/読込
- `start` が thread 作成結果を保存する
- `ask` が同じ thread を再利用する
- `ask` が最終メッセージを返す
- `reset` が thread を差し替える
- `stop` が state を消す

## 技術リスク

最大の不確実性は App Server の wire protocol。

実装前に以下を確認する:

- `codex app-server generate-ts`
- `codex app-server generate-json-schema`

もし想定より重い、または protocol 取得が不十分なら、
PoC は `codex exec` ベースで先に UX を検証し、その後 App Server に戻す。

## 次の作業順

1. App Server protocol shape を確認する
2. `start` の PoC を作る
3. `ask` で同一 thread 継続を確認する
4. state file を固める
5. `reset` / `stop` を足す
6. fake transport で unit test を書く
7. 余裕があれば Claude plugin を薄く載せる

## plugin 方針

Claude Code plugin は後段にする。

- 本体は npm package な CLI
- plugin はこの CLI を呼ぶ薄いアダプタ

理由:

- plugin 依存を本体に持ち込まない
- CLI 単体で検証できる
- 将来 Claude 以外からも使える
