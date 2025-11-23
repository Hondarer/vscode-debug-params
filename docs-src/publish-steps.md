# VS Code 拡張機能の発行手順

このドキュメントでは、vscode-debug-params 拡張機能を VSIX ファイルとしてパッケージ化し、Visual Studio Marketplace に発行する手順を説明します。

## 事前準備

vsce (Visual Studio Code Extensions) というツールを使って VSIX ファイルを作成します。グローバルにインストールしておくと便利です。

```bash
npm install -g @vscode/vsce
```

プロジェクト内だけで使う場合は、以下のコマンドでインストールします。
この場合、パスが通っていないので、`node_modules/.bin/vsce` として vsce を指定する必要があります。

```bash
npm install --save-dev @vscode/vsce
```

## VSIX ファイルの作成

プロジェクトのルートディレクトリで以下のコマンドを実行すると、VSIX ファイルが生成されます。

```bash
# グローバルインストールの場合
vsce package
# プロジェクト内インストールの場合
node_modules/.bin/vsce package
```

実行すると、`vscode-debug-params-0.1.0.vsix` のような名前のファイルが作成されます。バージョン番号は package.json の `version` フィールドから取得されます。

## ローカルでのインストール

作成した VSIX ファイルをローカルでテストする場合は、以下のコマンドでインストールできます。

```bash
code --install-extension vscode-debug-params-0.1.0.vsix
```

または、VS Code の UI から Extensions ビュー (`Ctrl+Shift+X`) を開き、右上の `...` メニューから "Install from VSIX..." を選択して、VSIX ファイルを指定します。

## Marketplace への発行

### Personal Access Token の作成 (初回のみ)

Marketplace に発行するには、Azure DevOps の Personal Access Token (PAT) が必要です。

1. [Azure DevOps](https://dev.azure.com/) にアクセスします
2. 右上のユーザーアイコンをクリックして、"Personal access tokens" を選択します
3. "New Token" をクリックして、新しいトークンを作成します
4. Organization は "All accessible organizations" を選択します
5. Scopes で "Custom defined" を選択し、**Marketplace > Manage** にチェックを入れます
6. "Create" をクリックして、表示されたトークンをコピーして安全な場所に保存します

### Publisher の作成 (初回のみ)

[Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage) にアクセスして、Publisher アカウントを作成します。

Publisher ID は package.json の `publisher` フィールドと一致させる必要があります。

### 発行コマンド

以下のコマンドで Marketplace に発行できます。

```bash
# グローバルインストールの場合
vsce publish
# プロジェクト内インストールの場合
node_modules/.bin/vsce publish
```

初回は PAT の入力を求められるので、先ほど作成した Personal Access Token を入力します。

バージョン番号を自動的に更新して発行する場合は、以下のオプションが使えます。

```bash
# グローバルインストールの場合
vsce publish patch  # 0.0.6 → 0.0.7 (パッチバージョンを上げる)
vsce publish minor  # 0.0.6 → 0.1.0 (マイナーバージョンを上げる)
vsce publish major  # 0.0.6 → 1.0.0 (メジャーバージョンを上げる)
# プロジェクト内インストールの場合
node_modules/.bin/vsce publish patch  # 0.0.6 → 0.0.7 (パッチバージョンを上げる)
node_modules/.bin/vsce publish minor  # 0.0.6 → 0.1.0 (マイナーバージョンを上げる)
node_modules/.bin/vsce publish major  # 0.0.6 → 1.0.0 (メジャーバージョンを上げる)
```

これらのコマンドは、package.json の `version` フィールドを自動的に更新してから発行します。

### PAT の更新

PAT の有効期限が切れた場合や、セキュリティ上の理由で PAT を更新する必要がある場合は、以下の手順を実行します。

#### 方法 1: vsce login コマンドを使う

Publisher ID (package.json の `publisher` フィールドの値) を指定して実行すると、新しい PAT の入力を求められます。

```bash
# グローバルインストールの場合
vsce login <Publisher ID>
# プロジェクト内インストールの場合
node_modules/.bin/vsce login <Publisher ID>
```

#### 方法 2: Azure DevOps で新しい PAT を生成する

1. [Azure DevOps](https://dev.azure.com/) にアクセスします
2. 右上のユーザーアイコンをクリックして、"Personal access tokens" を選択します
3. 既存のトークンの横にある `...` メニューから "Revoke" を選択して、古いトークンを無効化します (オプション)
4. "New Token" をクリックして、新しいトークンを作成します (作成手順は上記の「Personal Access Token の作成」を参照)
5. 次回 `vsce publish` を実行した際に、新しい PAT の入力を求められます

#### PAT の保存場所

vsce は、入力された PAT を以下の場所に保存します。

- Windows: `%USERPROFILE%\.vsce`
- macOS/Linux: `~/.vsce`

このファイルを削除すると、次回 `vsce publish` 実行時に PAT の再入力を求められます。

## 参考リンク

- [Publishing Extensions - VS Code API Documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce - GitHub Repository](https://github.com/microsoft/vscode-vsce)
- [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
