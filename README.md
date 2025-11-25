# vscode-debug-params

NOTE: The explanation in Japanese appears later in this document.

## vscode-debug-params (in English)

A VS Code extension for flexible management of environment variables and arguments during debug sessions.

### Features

- **Configuration Separation**: Keep launch.json simple by separating project-specific settings into `.debug-params.json`
- **Multiple Configuration Sets**: Easily switch between development, test, and production simulation environments
- **Cross-Platform Support**: Manage different settings for Windows/Linux/macOS
- **Dynamic Input**: Specify parameters via file picker or text input at debug time
- **Variable Expansion**: Support for `${workspaceFolder}`, `${fileDirname}`, `${env:VAR}`, etc.

### Usage

#### 1. Add `useDebugParams: true` to launch.json

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Current File",
      "type": "debugpy",
      "request": "launch",
      "program": "${file}",
      "cwd": "${fileDirname}",
      "useDebugParams": true
    }
  ]
}
```

#### 2. Create `.debug-params.json` in the cwd specified in launch.json

For the example launch.json above, you would create `.debug-params.json` in the same directory as the Python file you want to debug.

```json
{
  "configs": [
    {
      "name": "Enter arguments",
      "args": "${input:@args}"
    }
  ]
}
```

#### 3. Press F5 to debug

When you start debugging, you can enter any arguments using an input box.  
That's all! Enjoy!

#### 4. Advanced usage

When multiple configurations exist, you can select from a quick pick menu.

```json
{
  "configs": [
    {
      "name": "Development",
      "env": {
        "DEBUG": "true",
        "LOG_LEVEL": "DEBUG"
      },
      "args": ["--verbose"]
    },
    {
      "name": "Production Simulation",
      "env": {
        "DEBUG": "false",
        "LOG_LEVEL": "ERROR"
      },
      "args": []
    }
  ]
}
```

### Configuration Options

#### .debug-params.json

| Field | Description | Required |
|-------|-------------|----------|
| `name` | Configuration name (displayed in selection) | ✓ |
| `platform` | Target platform (`"windows"`, `"linux"`, `"macos"` or array) | |
| `type` | Debug type (`debugpy`, `cppdbg`, etc.) | |
| `env` | Environment variables object | |
| `args` | Arguments array or string | |
| `inputs` | Dynamic input definitions | |

#### Common Debug Types

- `cppdbg` - C/C++ (GDB/LLDB) - Linux, macOS
- `cppvsdbg` - C/C++ (Visual Studio debugger) - Windows
- `debugpy` - Python
- `coreclr` - .NET
- `node` - Node.js

### Parameter Merge Rules

#### Environment Variables

Environment variables from `.debug-params.json` are merged into launch.json's environment variables. Duplicate keys are overwritten.

#### Arguments

When `args` key exists in `.debug-params.json`, it **replaces** launch.json's arguments. If `args` key is absent, launch.json's arguments are preserved. Use empty array `[]` to clear arguments.

### Platform-Specific Settings

```json
{
  "configs": [
    {
      "name": "Development",
      "platform": "windows",
      "env": {
        "PATH": "${workspaceFolder}\\bin;${env:PATH}"
      }
    },
    {
      "name": "Development",
      "platform": ["linux", "macos"],
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib:${env:LD_LIBRARY_PATH}"
      }
    }
  ]
}
```

### Dynamic Input

Accept user input at debug time.

#### Built-in Input

```json
{
  "configs": [
    {
      "name": "File Processing",
      "args": [
        "--input=${input:@file:Select input file}",
        "--port=${input:@text:Port number:8080}"
      ]
    }
  ]
}
```

##### Available Built-in Inputs

- `${input:@file}` - File selection
- `${input:@folder}` - Folder selection
- `${input:@text}` - Text input
- `${input:@password}` - Password input
- `${input:@args}` - Enter entire arguments

Format: `${input:@type:description:default}`

#### Custom Input

```json
{
  "configs": [
    {
      "name": "Custom Settings",
      "args": ["--format=${input:format}"],
      "inputs": [
        {
          "id": "format",
          "type": "pickString",
          "description": "Output format",
          "options": ["json", "xml", "csv"],
          "default": "json"
        }
      ]
    }
  ]
}
```

##### Input Types

- `promptString` - Text input
- `pickString` - Select from options
- `pickFile` - File selection dialog
- `pickFolder` - Folder selection dialog

##### Input Options

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (required) |
| `type` | Input type (required) |
| `description` | Prompt message (required) |
| `default` | Default value (supports variable expansion) |
| `options` | Options array (for `pickString`) |
| `password` | Password mode (for `promptString`) |

##### Input Value Caching

When running the same configuration consecutively, previous input values are automatically used as defaults.

##### Input Cancellation

If the user cancels an input, the debug session is aborted.

### Supported Variables

- `${workspaceFolder}` - Workspace root path
- `${workspaceRoot}` - Same as `${workspaceFolder}` (for compatibility)
- `${fileDirname}` - Current file's directory
- `${file}` - Current file's absolute path
- `${fileBasename}` - Current file name
- `${fileBasenameNoExtension}` - File name without extension
- `${fileExtname}` - File extension
- `${cwd}` - cwd specified in launch.json
- `${env:VAR}` - Environment variable value
- `${config:KEY}` - VS Code configuration value

### Examples

#### Python Project

```json
{
  "configs": [
    {
      "name": "Development",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/lib",
        "DEBUG": "true"
      },
      "args": ["--verbose"]
    },
    {
      "name": "pytest",
      "args": "${input:@args:Test path:tests/ -v}"
    }
  ]
}
```

#### C/C++ Project

```json
{
  "configs": [
    {
      "name": "Debug Build",
      "platform": "linux",
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib"
      },
      "args": [
        "--input=${input:@file:Input file}",
        "--verbose"
      ]
    }
  ]
}
```

#### .NET Project

```json
{
  "configs": [
    {
      "name": "Development",
      "env": {
        "DOTNET_ENVIRONMENT": "Development",
        "ASPNETCORE_URLS": "http://localhost:${input:@text:Port:5000}"
      }
    }
  ]
}
```

### Build Error Handling

When `preLaunchTask` fails (e.g., build error) and the `program` file doesn't exist, the extension cancels the debug session and displays a warning message.

This prevents unnecessary configuration selection dialogs when build errors occur.

### Troubleshooting

To verify settings are applied correctly, check the output panel for logs.

1. In VS Code, select "View" → "Output" (or `Ctrl+Shift+U`)
2. Select "Debug Params" from the dropdown
3. Check the `Final config` log for the final configuration

You can verify variable expansion results and whether environment variables and arguments are set as expected.

### Compatibility

This extension works safely even when not installed. The `useDebugParams` flag is ignored, and launch.json settings are used as-is.

### License

MIT

---

## vscode-debug-params (in Japanese)

VS Code でデバッグ実行時の環境変数と引数を柔軟に管理する拡張機能です。

### 特徴

- **設定の分離**: launch.json をシンプルに保ち、プロジェクト固有の設定を `.debug-params.json` に分離
- **複数の設定セット**: 開発環境、テスト環境、本番環境シミュレーションなど、複数の設定を簡単に切り替え
- **クロスプラットフォーム対応**: Windows/Linux/macOS ごとに異なる設定を管理
- **動的入力**: デバッグ実行時にファイル選択やテキスト入力でパラメータを指定
- **変数展開**: `${workspaceFolder}`, `${fileDirname}`, `${env:VAR}` などの変数をサポート

### 使い方

#### 1. launch.json に `useDebugParams: true` を追加

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: カレントファイル",
      "type": "debugpy",
      "request": "launch",
      "program": "${file}",
      "cwd": "${fileDirname}",
      "useDebugParams": true
    }
  ]
}
```

#### 2. launch.json に指定されている cwd に `.debug-params.json` を作成

上記の launch.json に対応する例としては、デバッグしたい Python ファイルと同じディレクトリに `.debug-params.json` を作成しておきます。

```json
{
  "configs": [
    {
      "name": "引数任意入力",
      "args": "${input:@args}"
    }
  ]
}
```

#### 3. F5 でデバッグ実行

デバッグ実行を開始する際、引数を入力する入力ボックスを使って引数を任意に設定できます。  
たっだこれだけです。シンプル！

#### 4. 応用

複数の設定がある場合、クイックピックで選択できます。

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "DEBUG": "true",
        "LOG_LEVEL": "DEBUG"
      },
      "args": ["--verbose"]
    },
    {
      "name": "本番環境シミュレーション",
      "env": {
        "DEBUG": "false",
        "LOG_LEVEL": "ERROR"
      },
      "args": []
    }
  ]
}
```

### 設定項目

#### .debug-params.json

| 項目 | 説明 | 必須 |
|------|------|------|
| `name` | 設定の名前 (選択時に表示) | ✓ |
| `platform` | 対象プラットフォーム (`"windows"`, `"linux"`, `"macos"` または配列) | |
| `type` | デバッグタイプ (`debugpy`, `cppdbg` など) | |
| `env` | 環境変数のオブジェクト | |
| `args` | 引数の配列または文字列 | |
| `inputs` | 動的入力の定義 | |

#### 主なデバッグタイプ

- `cppdbg` - C/C++ (GDB/LLDB) - Linux, macOS
- `cppvsdbg` - C/C++ (Visual Studio debugger) - Windows
- `debugpy` - Python
- `coreclr` - .NET
- `node` - Node.js

### パラメータのマージルール

#### 環境変数

launch.json の環境変数に、`.debug-params.json` の環境変数をマージします。同じキーがある場合は上書きします。

#### 引数

`.debug-params.json` に `args` キーがある場合、launch.json の引数を**置換**します。`args` キーがない場合は、launch.json の引数を維持します。空配列 `[]` を指定すると引数を空にできます。

### プラットフォーム別設定

```json
{
  "configs": [
    {
      "name": "開発環境",
      "platform": "windows",
      "env": {
        "PATH": "${workspaceFolder}\\bin;${env:PATH}"
      }
    },
    {
      "name": "開発環境",
      "platform": ["linux", "macos"],
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib:${env:LD_LIBRARY_PATH}"
      }
    }
  ]
}
```

### 動的入力

デバッグ実行時にユーザー入力を受け付けることができます。

#### 組み込み input

```json
{
  "configs": [
    {
      "name": "ファイル処理",
      "args": [
        "--input=${input:@file:入力ファイルを選択}",
        "--port=${input:@text:ポート番号:8080}"
      ]
    }
  ]
}
```

##### 利用可能な組み込み input

- `${input:@file}` - ファイル選択
- `${input:@folder}` - フォルダ選択
- `${input:@text}` - テキスト入力
- `${input:@password}` - パスワード入力
- `${input:@args}` - 引数全体を入力

形式: `${input:@type:説明:デフォルト値}`

#### カスタム input

```json
{
  "configs": [
    {
      "name": "カスタム設定",
      "args": ["--format=${input:format}"],
      "inputs": [
        {
          "id": "format",
          "type": "pickString",
          "description": "出力フォーマット",
          "options": ["json", "xml", "csv"],
          "default": "json"
        }
      ]
    }
  ]
}
```

##### input タイプ

- `promptString` - テキスト入力
- `pickString` - 選択肢から選択
- `pickFile` - ファイル選択ダイアログ
- `pickFolder` - フォルダ選択ダイアログ

##### input のオプション

| 項目 | 説明 |
|------|------|
| `id` | 一意の識別子 (必須) |
| `type` | 入力タイプ (必須) |
| `description` | ユーザーへの説明文 (必須) |
| `default` | デフォルト値 (変数展開可能) |
| `options` | 選択肢の配列 (`pickString` の場合に使用) |
| `password` | パスワード入力モード (`promptString` の場合に使用) |

##### 入力値のキャッシュ

同じ設定を連続して実行する場合、前回の入力値が自動的にデフォルト値として使用されます。

##### 入力のキャンセル

ユーザーが入力をキャンセルした場合、デバッグ実行は中止されます。

### サポートする変数

- `${workspaceFolder}` - ワークスペースのルートパス
- `${workspaceRoot}` - `${workspaceFolder}` と同じ (互換性のため)
- `${fileDirname}` - カレントファイルのディレクトリ
- `${file}` - カレントファイルの絶対パス
- `${fileBasename}` - カレントファイル名
- `${fileBasenameNoExtension}` - 拡張子を除いたファイル名
- `${fileExtname}` - ファイルの拡張子
- `${cwd}` - launch.json で指定された cwd
- `${env:VAR}` - 環境変数の値
- `${config:KEY}` - VS Code の設定値

### サンプル

#### Python プロジェクト

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/lib",
        "DEBUG": "true"
      },
      "args": ["--verbose"]
    },
    {
      "name": "pytest",
      "args": "${input:@args:テストパス:tests/ -v}"
    }
  ]
}
```

#### C/C++ プロジェクト

```json
{
  "configs": [
    {
      "name": "デバッグビルド",
      "platform": "linux",
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib"
      },
      "args": [
        "--input=${input:@file:入力ファイル}",
        "--verbose"
      ]
    }
  ]
}
```

#### .NET プロジェクト

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "DOTNET_ENVIRONMENT": "Development",
        "ASPNETCORE_URLS": "http://localhost:${input:@text:ポート:5000}"
      }
    }
  ]
}
```

### ビルドエラー時の動作

`preLaunchTask` でビルドが失敗した場合など、`program` に指定されたファイルが存在しないとき、拡張機能はデバッグセッションをキャンセルし、警告メッセージを表示します。

これにより、ビルドエラー時に不要な設定選択ダイアログが表示されることを防ぎます。

### トラブルシューティング

設定が正しく適用されているか確認したい場合は、出力パネルでログを確認できます。

1. VS Code で「表示」→「出力」を選択 (または `Ctrl+Shift+U`)
2. ドロップダウンから「Debug Params」を選択
3. `Final config` のログで最終的な設定を確認

変数の展開結果や、環境変数・引数が期待通りに設定されているかを確認できます。

### 互換性

この拡張機能がインストールされていない環境でも、launch.json は正常に動作します。`useDebugParams` フラグは無視され、launch.json の設定がそのまま使用されます。

### ライセンス

MIT
