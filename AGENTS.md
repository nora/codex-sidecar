# AGENTS.md

## コーディング原則

- **KISS**：最もシンプルな実装を選ぶ。複雑さは敵。
- **DRY**：重複を排除し、単一の情報源を維持する。
- **YAGNI**：今必要なものだけ作る。将来の要件を先取りしない。
- **テストケース名は日本語で記載する**

## 設計・実装方針

- **関数型中心**：純粋関数・イミュータブルデータ・副作用の分離を基本とする

## 思考原則

- 作業者になるな。指示の Why を考え、本質的な代替手段があれば提案せよ。

## 品質チェック（必須）

コード変更後は `pnpm qc` を実行すること。
`pnpm qc` はこのリポジトリのローカル CI とみなす。

```bash
pnpm qc
```

内容:

- `pnpm lint`
- `pnpm fmt:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## よく使うコマンド

```bash
pnpm install
pnpm qc
pnpm lint:fix
pnpm fmt
pnpm build
pnpm dev -- help
pnpm dev -- start
pnpm dev -- ask "この設計の弱点を挙げて"
```

## ドキュメント

作業に関連する場合、以下から情報を取得すること。

| ドキュメント | 内容 |
|-------------|------|
| [README.md](README.md) | リポジトリ概要 |
| [tasks/base-plan.md](tasks/base-plan.md) | 基本設計と作業順序 |

## ツール運用

- `npx` 禁止。`pnpm` 経由で実行すること

## Commit

- コミット前に、何を最小機能として出すかを明確にすること
