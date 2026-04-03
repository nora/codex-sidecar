# npm 更新手順

## 手動更新

CLI を更新するときは、version を上げて `Publish` workflow を起動する。

```bash
pnpm qc
npm version patch --no-git-tag-version
git add package.json pnpm-lock.yaml
git commit
git push origin main
pnpm publish:workflow
```

公開後に確認する。

```bash
npm view codex-sidecar version
npm install -g codex-sidecar
codex-sidecar status
```

Skill だけ更新するなら npm publish は不要。`SKILL.md` / `agents/openai.yaml` を更新して push し、別マシンで入れ直す。

```bash
npx skills add https://github.com/nora/codex-sidecar --yes --global
```

## 自動更新の仕組み

`.github/workflows/publish.yml` は手動実行の release workflow。

1. `pnpm install --frozen-lockfile`
2. `pnpm qc`
3. `scripts/resolve-release-tag.sh` で `package.json` の version から `vX.Y.Z` を作り、同名 tag が既にあれば失敗する
4. `npm publish`
5. `scripts/push-release-tag.sh` で publish した commit に tag を打って `origin` に push する

npm への認証は Trusted Publishing + OIDC で行う。長期 npm token は使わない。

初回だけ npmjs.com の package settings で Trusted Publisher を登録する。
package settings は package 作成後にしか触れないので、未公開 package なら先に1回手動 `npm publish` する。

- Publisher: GitHub Actions
- Organization/user: `nora`
- Repository: `codex-sidecar`
- Workflow filename: `publish.yml`
- Environment name: 空欄
