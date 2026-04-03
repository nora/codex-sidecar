# npm 公開手順

## この package の配布構造

`codex-sidecar` は 2 段で配布する。

- CLI 本体: npm package として公開し、`npm install -g codex-sidecar` で入れる
- Skill 定義: GitHub repo から入れ、`npx skills add https://github.com/nora/codex-sidecar` で使う

## npm に公開される情報

### package page に出るもの

- `package.json` の `name`
- `package.json` の `version`
- `package.json` の `description`
- `package.json` の `license`
- `package.json` の `repository`
- `package.json` の `homepage`
- `package.json` の `bugs`
- `README.md`

### tarball に入るもの

`package.json` の `files` で制御している。現時点では以下だけを入れる。

- `dist/`
- `README.md`
- `LICENSE`
- `package.json`

確認コマンド:

```bash
pnpm pack --dry-run
```

`SKILL.md` と `agents/openai.yaml` は npm tarball には入れず、GitHub から配布する。

## 初回公開

前提:

- npm アカウントを作る
- npm アカウントの 2FA を有効にする
- この repo を GitHub に push しておく
- working tree に publish 対象外のゴミが混ざっていないことを確認する

手順:

```bash
pnpm qc
pnpm pack --dry-run
npm login
npm publish
```

公開後の確認:

```bash
npm view codex-sidecar name version description license repository.url
npm install -g codex-sidecar
codex-sidecar status
npx skills add https://github.com/nora/codex-sidecar --yes --global
```

npm package page は `https://www.npmjs.com/package/codex-sidecar` に出る。

## 更新手順

### CLI を更新する場合

1. code / docs を更新する
2. `package.json` の `version` を semver で上げる
3. `tasks/progress.md` を必要なら更新する
4. `pnpm qc`
5. `pnpm pack --dry-run`
6. commit する
7. `git push`
8. GitHub Actions の `Publish` workflow を `workflow_dispatch` で実行する
9. 別マシンで `npm install -g codex-sidecar` して確認する

### Skill だけ更新する場合

1. `SKILL.md` / `agents/openai.yaml` を更新する
2. `uv run --with pyyaml python "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" .`
3. commit する
4. `git push`
5. 別マシンで `npx skills add https://github.com/nora/codex-sidecar --yes --global` を再実行して確認する

CLI の npm 配布物を変えないなら、`npm publish` は不要。

## CI publish

`.github/workflows/publish.yml` は npm Trusted Publishing + OIDC 前提で `npm publish` を実行する。
長期 npm token は使わない。

初回だけ npmjs.com の package settings で Trusted Publisher を登録する。

- Publisher: GitHub Actions
- Organization/user: `nora`
- Repository: `codex-sidecar`
- Workflow filename: `publish.yml`
- Environment name: 空でよい

設定後、GitHub Actions の `Publish` workflow を手動実行すると、`package.json` の version が npm に publish され、成功後に `vX.Y.Z` tag が push される。
同じ version は再 publish できない。同名 Git tag も既にあると失敗する。更新時は必ず version を上げる。

tag 処理は以下の script に分けている。

- `scripts/resolve-release-tag.sh`: `package.json` の version から `vX.Y.Z` を作り、同名 tag が既にあれば失敗する
- `scripts/push-release-tag.sh`: `github-actions[bot]` 名義を設定し、publish 対象 commit に tag を打って `origin` へ push する

public repo + public package + Trusted Publishing の条件を満たすと、npm provenance が自動生成される。

## セキュリティ

### 必ずやる

- npm アカウントで 2FA を有効化する
- `.npmrc` や npm access token を repo に入れない
- publish 前に `pnpm pack --dry-run` で tarball 内容を毎回確認する
- package settings で可能なら `Require two-factor authentication and disallow tokens` を選ぶ
- GitHub Actions の `uses:` は tag ではなく commit SHA pin にする

### 避ける

- bypass 2FA を有効にした npm token を常用しない
- 機密ファイルを `files` に含めない
- `tmp/`, `.agents/state/`, `dist/` の生成物をそのまま commit しない

### 参考

- npm publish: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages
- Trusted Publishing: https://docs.npmjs.com/trusted-publishers/
- 2FA policy: https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification
- access tokens: https://docs.npmjs.com/about-access-tokens
- semver: https://docs.npmjs.com/about-semantic-versioning
