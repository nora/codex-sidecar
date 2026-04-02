# Git 規約

## コミットメッセージ

```text
{type}: {head}

- {body1}
- {body2 (optional)}
```

### type

| Type | 用途 |
|------|------|
| feat | 新機能 |
| fix | バグ修正 |
| refactor | リファクタリング |
| test | テスト追加・修正 |
| docs | ドキュメント |
| chore | 設定・ビルド・依存 |
| style | フォーマット |

### ルール

- 日本語、句読点なし、簡潔に書く
- 論理的なまとまりごとにコミットを分ける
- 1コミットで複数の目的を混ぜすぎない

## ブランチ戦略

この repo は当面小さく進めるが、作業ブランチは以下の命名に揃える。

```text
{type}/{短い説明}
```

例:

- `feat/app-server-client`
- `fix/state-file-path`
- `test/cli-basics`
