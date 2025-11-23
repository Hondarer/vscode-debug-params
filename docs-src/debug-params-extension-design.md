# VS Code デバッグパラメータ拡張機能 設計書

## 背景と目的

VS Code でカレントファイルのデバッグ実行を行う際、環境変数と引数を柔軟に管理する仕組みを提供します。

### 解決したい課題

- launch.json に環境変数や引数をハードコードすると、複数の実行パターンを管理しにくい
- 複数のプロジェクトフォルダで launch.json を統一したい
- 開発環境、テスト環境、本番環境シミュレーションなど、異なる設定を簡単に切り替えたい

### 解決方法

- launch.json は全プロジェクト共通のシンプルな設定とする
- プロジェクト固有の設定 (環境変数、引数) は `.debug-params.json` に分離する
- 複数の設定セットを用意でき、デバッグ実行時に選択できる

## アーキテクチャ

### 全体構成

```text
workspace/
├── .vscode/
│   └── launch.json              # 全プロジェクト共通
├── c-project/
│   ├── .debug-params.json       # C プロジェクト用設定
│   ├── Makefile
│   ├── calc.c
│   ├── calc.exe                 # Windows ビルド
│   └── calc                     # Linux ビルド
├── python-project/
│   ├── .debug-params.json       # Python プロジェクト用設定
│   ├── main.py
│   └── test.py
└── dotnet-project/
    ├── .debug-params.json       # .NET プロジェクト用設定
    ├── Program.cs
    └── bin/
        └── Debug/
            └── net8.0/
                └── Program.dll
```

### 動作フロー

```
ユーザーが F5 を押下
  ↓
VS Code が launch.json を読み込む
  ↓
useDebugParams フラグをチェック
  ↓
拡張機能の resolveDebugConfigurationWithSubstitutedVariables を呼び出し
  ↓
cwd フォルダから .debug-params.json を探す
  ↓
設定を読み込み、デバッグタイプでフィルタ
  ↓
複数の設定がある場合はクイックピックを表示
  ↓
ユーザーが設定を選択 (1 つの場合は自動選択)
  ↓
環境変数と引数を launch.json の設定にマージ
  ↓
VS Code がプログラムを起動
```

## ファイル仕様

### launch.json

カレントファイルに応じて動的にデバッグ実行する設定を記述します。

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "C/C++: カレントファイル (Windows)",
      "type": "cppvsdbg",
      "request": "launch",
      "program": "${fileDirname}\\${fileBasenameNoExtension}.exe",
      "cwd": "${fileDirname}",
      "environment": [],
      "args": [],
      "useDebugParams": true
    },
    {
      "name": "C/C++: カレントファイル (Linux)",
      "type": "cppdbg",
      "request": "launch",
      "program": "${fileDirname}/${fileBasenameNoExtension}",
      "cwd": "${fileDirname}",
      "environment": [],
      "args": [],
      "MIMode": "gdb",
      "useDebugParams": true
    },
    {
      "name": "Python: カレントファイル",
      "type": "debugpy",
      "request": "launch",
      "program": "${file}",
      "cwd": "${fileDirname}",
      "console": "integratedTerminal",
      "env": {},
      "args": [],
      "useDebugParams": true
    },
    {
      "name": ".NET: カレントファイル",
      "type": "coreclr",
      "request": "launch",
      "program": "${fileDirname}/bin/Debug/net8.0/${fileBasenameNoExtension}.dll",
      "cwd": "${fileDirname}",
      "env": {},
      "args": [],
      "useDebugParams": true
    }
  ]
}
```

### 重要な項目

- `cwd`: `.debug-params.json` を探す基準ディレクトリ
- `useDebugParams`: この拡張機能を有効にするフラグ (true で有効)
- `type`: デバッグタイプ (設定のフィルタリングに使用)

### .debug-params.json

プロジェクト固有のデバッグパラメータを記述します。

```json
{
  "configs": [
    {
      "name": "開発環境 (詳細ログ)",
      "platform": "linux",
      "type": "cppdbg",
      "env": {
        "DEBUG_MODE": "1",
        "LOG_LEVEL": "DEBUG",
        "LD_LIBRARY_PATH": "${workspaceFolder}/c-project/lib:${env:LD_LIBRARY_PATH}"
      },
      "args": [
        "--verbose",
        "--input=${fileDirname}/input.txt",
        "--output=${fileDirname}/output.txt"
      ]
    },
    {
      "name": "本番環境シミュレーション",
      "platform": ["windows", "linux"],
      "env": {
        "DEBUG_MODE": "0",
        "LOG_LEVEL": "ERROR"
      },
      "args": [
        "--input=${fileDirname}/prod_input.txt"
      ]
    },
    {
      "name": "引数なし (全環境共通)",
      "env": {
        "MINIMAL": "true"
      }
    }
  ]
}
```

### 設定項目

- `configs`: 設定の配列
- `name`: 設定の名前 (選択時に表示)
- `platform`: 対象プラットフォーム (省略可)
  - 文字列または文字列の配列
  - 指定した場合、そのプラットフォームでのみ有効
  - 省略した場合、全てのプラットフォームで有効
  - 利用可能な値: `"windows"`, `"linux"`, `"macos"`, `["windows", "linux"]` など
- `type`: デバッグタイプ (省略可)
  - 指定した場合、そのデバッグタイプでのみ有効
  - 省略した場合、全てのデバッグタイプで有効
- `env`: 環境変数のキーと値 (省略可)
- `args`: 実行時に渡す引数の配列または文字列 (省略可)

## プラットフォームとデバッグタイプによるフィルタリング

設定を特定のプラットフォームやデバッグタイプに限定できます。

### platform フィールド

実行プラットフォームを指定することで、OS ごとに異なる設定を管理できます。

#### 利用可能な値

- `"windows"`: Windows のみ
- `"linux"`: Linux のみ
- `"macos"`: macOS のみ
- `["windows", "linux"]`: 複数のプラットフォーム (配列で指定)
- 省略: 全てのプラットフォームで有効

#### 使用例

```json
{
  "configs": [
    {
      "name": "開発環境",
      "platform": "windows",
      "env": {
        "PATH": "${workspaceFolder}\\bin;${env:PATH}"
      },
      "args": ["--config=${fileDirname}\\dev.ini"]
    },
    {
      "name": "開発環境",
      "platform": "linux",
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib:${env:LD_LIBRARY_PATH}"
      },
      "args": ["--config=${fileDirname}/dev.ini"]
    },
    {
      "name": "開発環境",
      "platform": "macos",
      "env": {
        "DYLD_LIBRARY_PATH": "${workspaceFolder}/lib:${env:DYLD_LIBRARY_PATH}"
      },
      "args": ["--config=${fileDirname}/dev.ini"]
    }
  ]
}
```

Windows で実行した場合、1 つ目の設定のみが表示されます。

#### 複数プラットフォームに対応

```json
{
  "configs": [
    {
      "name": "開発環境 (Unix 系)",
      "platform": ["linux", "macos"],
      "env": {
        "DEBUG": "1"
      },
      "args": ["--config=${fileDirname}/dev.ini"]
    },
    {
      "name": "開発環境 (Windows)",
      "platform": "windows",
      "env": {
        "DEBUG": "1"
      },
      "args": ["--config=${fileDirname}\\dev.ini"]
    }
  ]
}
```

### type フィールド

デバッグタイプを指定することで、特定のデバッガーでのみ有効な設定を定義できます。

#### 主なデバッグタイプ

- `"cppdbg"`: C/C++ (GDB/LLDB) - Linux, macOS
- `"cppvsdbg"`: C/C++ (Visual Studio debugger) - Windows
- `"debugpy"`: Python
- `"coreclr"`: .NET
- `"node"`: Node.js

#### 使用例

```json
{
  "configs": [
    {
      "name": "Python デバッグ",
      "type": "debugpy",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/lib"
      },
      "args": ["--verbose"]
    },
    {
      "name": "C++ デバッグ",
      "type": "cppdbg",
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib"
      },
      "args": ["--verbose"]
    }
  ]
}
```

### platform と type の併用

両方を指定することで、より細かく条件を絞り込めます。

```json
{
  "configs": [
    {
      "name": "C++ デバッグ (Windows)",
      "platform": "windows",
      "type": "cppvsdbg",
      "env": {
        "PATH": "${workspaceFolder}\\lib;${env:PATH}"
      },
      "args": ["--verbose"]
    },
    {
      "name": "C++ デバッグ (Linux)",
      "platform": "linux",
      "type": "cppdbg",
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib:${env:LD_LIBRARY_PATH}"
      },
      "args": ["--verbose"]
    },
    {
      "name": "Python デバッグ",
      "type": "debugpy",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/lib"
      },
      "args": ["--verbose"]
    },
    {
      "name": "全環境共通",
      "env": {
        "COMMON_VAR": "value"
      }
    }
  ]
}
```

### 使い分けのガイドライン

#### platform のみ指定

プラットフォームによる違いのみがある場合。

```json
{
  "name": "開発環境",
  "platform": "windows",
  "env": {
    "PATH": "${workspaceFolder}\\bin;${env:PATH}"
  }
}
```

#### type のみ指定

デバッグタイプによる違いのみがある場合。

```json
{
  "name": "Python デバッグ",
  "type": "debugpy",
  "env": {
    "PYTHONPATH": "${workspaceFolder}/lib"
  }
}
```

#### 両方を指定

プラットフォームとデバッグタイプの両方で条件を絞る場合。

```json
{
  "name": "C++ デバッグ (Windows)",
  "platform": "windows",
  "type": "cppvsdbg",
  "env": {
    "PATH": "..."
  }
}
```

#### 両方を省略

全てのプラットフォーム、全てのデバッグタイプで有効な共通設定。

```json
{
  "name": "共通設定",
  "env": {
    "COMMON_VAR": "value"
  }
}
```

### フィルタリングの動作

デバッグ実行時、以下の条件で設定がフィルタリングされます。

1. `platform` が指定されている場合、現在のプラットフォームと一致するもののみ
2. `type` が指定されている場合、launch.json のデバッグタイプと一致するもののみ
3. 両方が指定されている場合、両方の条件を満たすもののみ
4. 両方が省略されている場合、常に有効

表示順序は定義順が維持されます。

## デバッグタイプと type 指定

### C/C++ プロジェクトにおける type の使い分け

**従来の方法 (type のみ)**

C/C++ プロジェクトでは、OS によってデバッグタイプが異なります。

- **Windows**: `cppvsdbg` (Visual Studio debugger)
- **Linux**: `cppdbg` (GDB/LLDB)
- **macOS**: `cppdbg` (GDB/LLDB)

`type` フィールドを使用して、デバッグタイプごとに設定を分ける方法もあります。

```json
{
  "configs": [
    {
      "name": "開発環境 (詳細ログ)",
      "type": "cppvsdbg",
      "env": {
        "PATH": "${workspaceFolder}\\lib;${env:PATH}"
      }
    },
    {
      "name": "開発環境 (詳細ログ)",
      "type": "cppdbg",
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib:${env:LD_LIBRARY_PATH}"
      }
    }
  ]
}
```

**推奨される方法 (platform)**

しかし、本質的には OS (プラットフォーム) の違いであるため、`platform` フィールドを使用することを推奨します。

```json
{
  "configs": [
    {
      "name": "開発環境 (詳細ログ)",
      "platform": "windows",
      "env": {
        "PATH": "${workspaceFolder}\\lib;${env:PATH}"
      }
    },
    {
      "name": "開発環境 (詳細ログ)",
      "platform": ["linux", "macos"],
      "env": {
        "LD_LIBRARY_PATH": "${workspaceFolder}/lib:${env:LD_LIBRARY_PATH}"
      }
    }
  ]
}
```

`platform` を使用することで、設定の意図がより明確になります。

### 他の言語の場合

Python や .NET などは、プラットフォームによってデバッグタイプが変わらないため、基本的に `type` や `platform` の指定は不要です。

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/lib"
      },
      "args": ["--verbose"]
    }
  ]
}
```

デバッグタイプが `debugpy` であれば、どのプラットフォームでも同じ設定が使用されます。

## パラメータのマージルール

### 環境変数

launch.json の環境変数に、`.debug-params.json` の環境変数を追加 (マージ) します。同じキーがある場合は上書きします。

#### launch.json の初期状態

```json
"env": {
  "DOTNET_ENVIRONMENT": "Development"
}
```

#### .debug-params.json で追加

```json
"env": {
  "DEBUG_MODE": "true",
  "API_KEY": "dev-key-12345"
}
```

#### 結果

```json
"env": {
  "DOTNET_ENVIRONMENT": "Development",
  "DEBUG_MODE": "true",
  "API_KEY": "dev-key-12345"
}
```

### 引数

`.debug-params.json` に `args` キーがある場合、launch.json の引数を置換します。`args` キーがない場合は、launch.json の引数を維持します。

#### パターン 1: 引数を置換

launch.json の初期状態

```json
"args": ["--default-mode"]
```

.debug-params.json で置換

```json
"args": [
  "--verbose",
  "--config=${workspaceFolder}/config/dev.ini"
]
```

結果

```json
"args": [
  "--verbose",
  "--config=/path/to/workspace/config/dev.ini"
]
```

#### パターン 2: 引数を維持

launch.json の初期状態

```json
"args": ["--default-mode"]
```

.debug-params.json で args を指定しない

```json
"env": {
  "DEBUG_MODE": "true"
}
```

結果 (launch.json のまま)

```json
"args": ["--default-mode"]
```

#### パターン 3: 引数を空にする

launch.json の初期状態

```json
"args": ["--default-mode"]
```

.debug-params.json で空配列を指定

```json
"args": []
```

結果

```json
"args": []
```

## 変数展開

`.debug-params.json` 内で VS Code 標準の変数を使用できます。

### サポートする変数

- `${workspaceFolder}`: ワークスペースのルートフォルダパス
- `${workspaceRoot}`: `${workspaceFolder}` と同じ (非推奨だが互換性のため)
- `${cwd}`: launch.json で指定された cwd のパス
- `${file}`: カレントファイルの絶対パス
- `${fileBasename}`: カレントファイル名 (例: main.py)
- `${fileBasenameNoExtension}`: 拡張子を除いたファイル名 (例: main)
- `${fileExtname}`: ファイルの拡張子 (例: .py)
- `${fileDirname}`: カレントファイルのディレクトリパス
- `${env:VAR}`: 環境変数の値 (例: `${env:PATH}`)
- `${config:KEY}`: VS Code の設定値 (例: `${config:python.defaultInterpreterPath}`)

### 使用例

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "PATH": "${workspaceFolder}/bin:${env:PATH}",
        "CONFIG_DIR": "${fileDirname}/config",
        "PYTHON_PATH": "${config:python.defaultInterpreterPath}"
      },
      "args": [
        "--input=${fileDirname}/input.txt",
        "--output=${workspaceFolder}/output/${fileBasenameNoExtension}_result.txt"
      ]
    }
  ]
}
```

カレントファイルが `/workspace/python-project/main.py` の場合、以下のように展開されます。

```json
{
  "env": {
    "PATH": "/workspace/bin:/usr/local/bin:/usr/bin",
    "CONFIG_DIR": "/workspace/python-project/config",
    "PYTHON_PATH": "/usr/bin/python3"
  },
  "args": [
    "--input=/workspace/python-project/input.txt",
    "--output=/workspace/output/main_result.txt"
  ]
}
```

## 実装の詳細

### DebugConfigurationProvider

VS Code の `DebugConfigurationProvider` インターフェースを実装し、デバッグ設定を動的に解決します。

#### resolveDebugConfigurationWithSubstitutedVariables の使用理由

このメソッドを使用することで、VS Code が変数 (`${workspaceFolder}`, `${fileDirname}` など) を展開した後に処理できます。これにより、`cwd` が既に展開された状態で取得でき、正確なパスで `.debug-params.json` を探せます。

#### 実装の流れ

1. `useDebugParams` フラグをチェック
2. `cwd` から `.debug-params.json` を探す
3. 設定を読み込み、デバッグタイプでフィルタ
4. 複数の設定がある場合はクイックピックを表示
5. 選択された設定の環境変数と引数を展開
6. launch.json の設定にマージ
7. `useDebugParams` フラグを削除して返す

### 複数の Provider がある場合

同じデバッグタイプに複数の `DebugConfigurationProvider` が登録されている場合、登録順に呼び出されます。この拡張機能は、`useDebugParams` フラグで制御するため、他の拡張機能と競合しません。

### 全デバッグタイプへの対応

Provider を登録する際、デバッグタイプに `'*'` を指定することで、全てのデバッグタイプに対応します。

```typescript
vscode.debug.registerDebugConfigurationProvider(
  '*',
  new DebugParamsProvider(),
  vscode.DebugConfigurationProviderTriggerKind.Dynamic
);
```

## サンプル

### C/C++ プロジェクト (Windows/Linux 両対応)

#### .debug-params.json

```json
{
  "configs": [
    {
      "name": "開発環境 (詳細ログ)",
      "platform": "windows",
      "env": {
        "DEBUG_MODE": "1",
        "LOG_LEVEL": "DEBUG",
        "PATH": "${workspaceFolder}\\c-project\\lib;${env:PATH}"
      },
      "args": [
        "--verbose",
        "--input=${fileDirname}\\input.txt",
        "--output=${fileDirname}\\output.txt"
      ]
    },
    {
      "name": "開発環境 (詳細ログ)",
      "platform": "linux",
      "env": {
        "DEBUG_MODE": "1",
        "LOG_LEVEL": "DEBUG",
        "LD_LIBRARY_PATH": "${workspaceFolder}/c-project/lib:${env:LD_LIBRARY_PATH}"
      },
      "args": [
        "--verbose",
        "--input=${fileDirname}/input.txt",
        "--output=${fileDirname}/output.txt"
      ]
    },
    {
      "name": "本番環境シミュレーション",
      "platform": ["windows", "linux"],
      "env": {
        "DEBUG_MODE": "0",
        "LOG_LEVEL": "ERROR"
      },
      "args": [
        "--input=${input:@file:入力ファイル}"
      ]
    },
    {
      "name": "カスタム引数 (組み込み input)",
      "env": {
        "DEBUG_MODE": "1"
      },
      "args": [
        "--input=${input:@file:入力ファイル}",
        "--output=${input:@text:出力ファイル:${fileDirname}/output.txt}",
        "${input:@args:追加の引数}"
      ]
    },
    {
      "name": "自由な引数指定",
      "args": "${input:@args:引数を入力:--input data.txt --output result.txt}"
    }
  ]
}
```

### Python プロジェクト

#### .debug-params.json

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "ENV": "development",
        "PYTHONPATH": "${workspaceFolder}/python-project:${env:PYTHONPATH}",
        "DEBUG": "true"
      },
      "args": [
        "--verbose",
        "--data-dir=${fileDirname}/data"
      ]
    },
    {
      "name": "テスト環境",
      "env": {
        "ENV": "test",
        "PYTEST_CURRENT_TEST": "true"
      },
      "args": [
        "--test-mode"
      ]
    },
    {
      "name": "本番環境シミュレーション",
      "env": {
        "ENV": "production"
      },
      "args": [
        "--config=${workspaceFolder}/config/prod.yaml"
      ]
    },
    {
      "name": "pytest (テストパス指定)",
      "env": {
        "PYTEST_CURRENT_TEST": "true"
      },
      "args": "${input:@args:テストパスを入力:tests/test_api.py -v}"
    },
    {
      "name": "データ処理 (ディレクトリ選択)",
      "env": {
        "DATA_DIR": "${input:@folder:データディレクトリ:${workspaceFolder}/data}"
      },
      "args": [
        "--verbose",
        "${input:@args:追加の引数}"
      ]
    }
  ]
}
```

### .NET プロジェクト

#### .debug-params.json

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "DOTNET_ENVIRONMENT": "Development",
        "ASPNETCORE_URLS": "http://localhost:5000"
      },
      "args": [
        "--verbose"
      ]
    },
    {
      "name": "ステージング環境",
      "env": {
        "DOTNET_ENVIRONMENT": "Staging",
        "ASPNETCORE_URLS": "http://localhost:5001"
      },
      "args": []
    },
    {
      "name": "カスタムポート指定",
      "env": {
        "DOTNET_ENVIRONMENT": "Development",
        "API_KEY": "${input:@password:API キー}"
      },
      "args": [
        "--urls",
        "http://localhost:${input:@text:ポート番号:5000}"
      ]
    },
    {
      "name": "引数を自由に指定",
      "env": {
        "DOTNET_ENVIRONMENT": "Development"
      },
      "args": "${input:@args:引数を入力:--urls http://localhost:5000}"
    }
  ]
}
```

## 動的引数入力機能

デバッグ実行時に引数や環境変数を動的に入力できる機能です。`.debug-params.json` で特別な記法を使うことで、ユーザーに入力を促すことができます。

### 基本的な記法

`${input:id}` というプレースホルダーを使用し、`inputs` 配列で入力の詳細を定義します。

```json
{
  "configs": [
    {
      "name": "ファイル処理 (入力指定)",
      "env": {
        "DEBUG_MODE": "1"
      },
      "args": [
        "--input=${input:inputFile}",
        "--output=${input:outputFile}",
        "--verbose"
      ],
      "inputs": [
        {
          "id": "inputFile",
          "type": "pickFile",
          "description": "入力ファイルを選択"
        },
        {
          "id": "outputFile",
          "type": "promptString",
          "description": "出力ファイルのパス",
          "default": "${fileDirname}/output.txt"
        }
      ]
    }
  ]
}
```

### inputs の構造

```json
{
  "id": "inputFile",
  "type": "promptString",
  "description": "ユーザーへの説明",
  "default": "デフォルト値 (省略可)",
  "options": ["選択肢1", "選択肢2"],
  "password": false
}
```

#### 必須項目

- `id`: 一意の識別子 (同じ設定内で重複不可)
- `type`: 入力タイプ
- `description`: ユーザーへの説明文

#### 省略可能項目

- `default`: デフォルト値 (変数展開が可能)
- `options`: 選択肢の配列 (`pickString` の場合に使用)
- `password`: パスワード入力モード (`promptString` の場合に使用)

### 入力タイプ

#### promptString: 文字列入力

ユーザーにテキスト入力ボックスを表示します。

```json
{
  "id": "serverPort",
  "type": "promptString",
  "description": "サーバーのポート番号",
  "default": "8080"
}
```

パスワード入力モード:

```json
{
  "id": "apiKey",
  "type": "promptString",
  "description": "API キーを入力",
  "password": true
}
```

#### pickString: 選択肢から選択

クイックピックで選択肢を表示します。

```json
{
  "id": "logLevel",
  "type": "pickString",
  "description": "ログレベルを選択",
  "options": ["DEBUG", "INFO", "WARNING", "ERROR"],
  "default": "INFO"
}
```

#### pickFile: ファイル選択

ファイル選択ダイアログを表示します。

```json
{
  "id": "configFile",
  "type": "pickFile",
  "description": "設定ファイルを選択",
  "default": "${fileDirname}/config.ini"
}
```

#### pickFolder: フォルダ選択

フォルダ選択ダイアログを表示します。

```json
{
  "id": "dataDir",
  "type": "pickFolder",
  "description": "データディレクトリを選択",
  "default": "${workspaceFolder}/data"
}
```

### args の指定方法

`args` は配列形式と文字列形式の両方をサポートします。

#### 形式 1: 配列形式 (推奨)

各要素が個別の引数として扱われます。

```json
{
  "args": [
    "--verbose",
    "--input=${input:inputFile}",
    "--output=${input:outputFile}"
  ]
}
```

#### 形式 2: 文字列形式

文字列全体を展開した後、スペースで分割して引数配列にします。

```json
{
  "args": "${input:allArgs}",
  "inputs": [
    {
      "id": "allArgs",
      "type": "promptString",
      "description": "すべての引数を入力",
      "default": "--verbose --input=data.txt"
    }
  ]
}
```

クォート (`"` または `'`) で囲まれた部分はスペースを含んでも 1 つの引数として扱います。

**例**

入力: `--input "file with space.txt" --output result.txt`

結果: `["--input", "file with space.txt", "--output", "result.txt"]`

#### 形式の併用

配列内の要素として文字列形式の input を使用することもできます。

```json
{
  "args": [
    "--config=${workspaceFolder}/config.ini",
    "--verbose",
    "${input:extraArgs}"
  ],
  "inputs": [
    {
      "id": "extraArgs",
      "type": "promptString",
      "description": "追加の引数 (スペース区切り)",
      "default": ""
    }
  ]
}
```

この場合、`extraArgs` の値がスペースで分割され、既存の引数の後ろに追加されます。

### 環境変数での使用

環境変数でも `${input:id}` を使用できます。

```json
{
  "env": {
    "API_KEY": "${input:apiKey}",
    "API_ENDPOINT": "${input:endpoint}",
    "DEBUG_MODE": "1"
  },
  "inputs": [
    {
      "id": "apiKey",
      "type": "promptString",
      "description": "API キーを入力",
      "password": true
    },
    {
      "id": "endpoint",
      "type": "pickString",
      "description": "API エンドポイントを選択",
      "options": [
        "https://api.dev.example.com",
        "https://api.staging.example.com",
        "https://api.prod.example.com"
      ],
      "default": "https://api.dev.example.com"
    }
  ]
}
```

### 実用例

#### 例 1: テストケースの選択

```json
{
  "configs": [
    {
      "name": "特定のテストを実行",
      "type": "debugpy",
      "env": {
        "PYTEST_CURRENT_TEST": "true"
      },
      "args": [
        "-v",
        "${input:testPath}"
      ],
      "inputs": [
        {
          "id": "testPath",
          "type": "promptString",
          "description": "テストパスを入力 (例: tests/test_api.py::test_login)",
          "default": "tests/"
        }
      ]
    }
  ]
}
```

#### 例 2: サーバー起動時のポート番号指定

```json
{
  "configs": [
    {
      "name": "開発サーバー (ポート指定)",
      "type": "debugpy",
      "env": {
        "FLASK_ENV": "development"
      },
      "args": [
        "--host=0.0.0.0",
        "--port=${input:port}"
      ],
      "inputs": [
        {
          "id": "port",
          "type": "promptString",
          "description": "ポート番号を入力",
          "default": "5000"
        }
      ]
    }
  ]
}
```

#### 例 3: 入力ファイルと出力フォーマットの選択

```json
{
  "configs": [
    {
      "name": "カスタムファイル処理",
      "type": "cppdbg",
      "env": {
        "DEBUG_MODE": "1"
      },
      "args": [
        "--input=${input:inputFile}",
        "--output=${input:outputFile}",
        "--format=${input:format}"
      ],
      "inputs": [
        {
          "id": "inputFile",
          "type": "pickFile",
          "description": "入力ファイルを選択"
        },
        {
          "id": "outputFile",
          "type": "promptString",
          "description": "出力ファイルのパス",
          "default": "${fileDirname}/output.txt"
        },
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

### 組み込み input タイプ

よく使う入力パターンを簡略化するため、`inputs` を省略できる組み込み input タイプを提供します。組み込み input は `@` プレフィックスで識別します。

#### 利用可能な組み込み input

- `${input:@file}`: ファイル選択
- `${input:@folder}`: フォルダ選択
- `${input:@text}`: テキスト入力
- `${input:@password}`: パスワード入力
- `${input:@args}`: 引数全体を入力

#### 基本的な使い方

`inputs` を定義せずに使用できます。

```json
{
  "configs": [
    {
      "name": "シンプルな設定",
      "args": [
        "--input=${input:@file}",
        "--output=${input:@text}"
      ]
    }
  ]
}
```

#### パラメータ付きの使い方

説明やデフォルト値を指定できます。

```json
{
  "args": [
    "--input=${input:@file:入力ファイルを選択}",
    "--port=${input:@text:ポート番号:8080}",
    "--data-dir=${input:@folder:データディレクトリ:${workspaceFolder}/data}"
  ]
}
```

形式: `${input:@type:description:default}`

#### 組み込み input の詳細

##### @file: ファイル選択

ファイル選択ダイアログを表示します。

```json
"${input:@file}"
"${input:@file:設定ファイルを選択}"
"${input:@file:設定ファイルを選択:${fileDirname}/config.ini}"
```

##### @folder: フォルダ選択

フォルダ選択ダイアログを表示します。

```json
"${input:@folder}"
"${input:@folder:データディレクトリを選択}"
"${input:@folder:出力先:${workspaceFolder}/output}"
```

##### @text: テキスト入力

テキスト入力ボックスを表示します。

```json
"${input:@text}"
"${input:@text:ポート番号}"
"${input:@text:ポート番号:8080}"
```

##### @password: パスワード入力

パスワード入力ボックスを表示します (入力文字が隠されます)。

```json
"${input:@password}"
"${input:@password:API キーを入力}"
```

##### @args: 引数全体を入力

引数全体をテキスト入力で受け取り、スペースで分割して引数配列にします。

```json
"${input:@args}"
"${input:@args:追加の引数を入力}"
"${input:@args:引数を入力:--verbose --debug}"
```

#### args での組み込み input の使用

`args` に直接組み込み input を指定できます。

**文字列形式での使用**

```json
{
  "configs": [
    {
      "name": "引数を自由入力",
      "args": "${input:@args}"
    }
  ]
}
```

デバッグ実行時に、引数全体を入力できます。入力された文字列はスペースで分割されて引数配列になります。

**デフォルト値の指定**

```json
{
  "args": "${input:@args:引数を入力:--verbose --input=data.txt}"
}
```

デフォルト値に変数を含めることもできます。

```json
{
  "args": "${input:@args:引数を入力:--data-dir=${fileDirname}/data --verbose}"
}
```

**配列内での使用**

固定の引数と組み合わせることもできます。

```json
{
  "args": [
    "--config=${workspaceFolder}/config.ini",
    "--verbose",
    "${input:@args:追加の引数}"
  ]
}
```

#### 組み込み input の実用例

**例 1: 完全に自由な引数指定**

```json
{
  "configs": [
    {
      "name": "C プログラム (引数自由入力)",
      "type": "cppdbg",
      "args": "${input:@args}"
    }
  ]
}
```

ユーザー入力例: `--input data.txt --output result.txt --verbose`

結果: `["--input", "data.txt", "--output", "result.txt", "--verbose"]`

**例 2: シンプルなファイル処理**

```json
{
  "configs": [
    {
      "name": "ファイル変換",
      "args": [
        "--input=${input:@file:入力ファイル}",
        "--output=${input:@text:出力ファイルのパス:${fileDirname}/output.txt}"
      ]
    }
  ]
}
```

**例 3: サーバー起動**

```json
{
  "configs": [
    {
      "name": "開発サーバー",
      "env": {
        "API_KEY": "${input:@password:API キー}"
      },
      "args": [
        "--port=${input:@text:ポート番号:5000}",
        "--host=0.0.0.0"
      ]
    }
  ]
}
```

**例 4: pytest の特定のテスト実行**

```json
{
  "configs": [
    {
      "name": "pytest (テストパス指定)",
      "type": "debugpy",
      "args": "${input:@args:テストパスを入力:tests/test_api.py -v}"
    }
  ]
}
```

**例 5: データディレクトリの指定**

```json
{
  "configs": [
    {
      "name": "データ処理",
      "env": {
        "DATA_DIR": "${input:@folder:データディレクトリ:${workspaceFolder}/data}"
      },
      "args": ["--verbose"]
    }
  ]
}
```

#### 通常の inputs との併用

組み込み input と通常の inputs を併用できます。

```json
{
  "configs": [
    {
      "name": "混在パターン",
      "args": [
        "--input=${input:@file:入力ファイル}",
        "--format=${input:format}",
        "--output=${input:@text:出力ファイル}"
      ],
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

#### 使い分けのガイドライン

**組み込み input を使うべき場合**

- シンプルな入力で十分
- 1 回限りの使用
- プロトタイピングや試行
- 記述を簡潔にしたい

**通常の inputs を使うべき場合**

- 複雑な入力 (選択肢、検証など)
- 入力値をキャッシュしたい
- 説明やデフォルト値を詳細に設定したい
- 複数の設定で同じ input を再利用したい

#### 組み込み input の制約

- 入力値はキャッシュされません (毎回入力が必要)
- 選択肢の提供はできません (通常の inputs を使用)
- 入力値の検証機能は提供されません

### 動作の流れ

```
デバッグ開始
  ↓
設定を選択
  ↓
inputs と組み込み input を解析
  ↓
各 input に対してユーザー入力を取得
  (promptString → テキスト入力ボックス)
  (pickString → クイックピック)
  (pickFile → ファイル選択ダイアログ)
  (pickFolder → フォルダ選択ダイアログ)
  (組み込み input → 対応するダイアログ)
  ↓
入力値をキャッシュ (通常の inputs のみ)
  ↓
env と args 内の ${input:id} と組み込み input を置換
  ↓
他の変数 (${workspaceFolder} など) を展開
  ↓
デバッグ実行
```

### 入力値のキャッシュ

同じ設定を連続して実行する場合、前回の入力値が自動的にデフォルト値として使用されます。これにより、繰り返しのデバッグ作業が効率化されます。

### 入力のキャンセル

ユーザーが入力をキャンセルした場合、デバッグ実行は中止されます。

### 変数展開の順序

1. `${input:id}` を展開 (ユーザー入力値)
2. `${workspaceFolder}`, `${fileDirname}` などを展開
3. `${env:VAR}` を展開

この順序により、`default` 値内で他の変数を使用できます。

```json
{
  "id": "outputFile",
  "type": "promptString",
  "description": "出力ファイル",
  "default": "${fileDirname}/output_${fileBasenameNoExtension}.txt"
}
```

### エラーハンドリング

#### inputs の検証

以下の検証を行います。

- `id` が同じ設定内で重複していないか
- `type` が有効な値か (`promptString`, `pickString`, `pickFile`, `pickFolder`)
- `pickString` の場合、`options` が定義されているか

不正な input はスキップし、警告を表示します。

#### 参照エラー

存在しない input を参照した場合、空文字列に置換し、警告を表示します。

```json
"args": ["--input=${input:nonExistent}"]
```

→ `"args": ["--input="]` + 警告表示

## 拡張性

将来的に以下の機能を追加できます。

### グローバル設定ファイル

ユーザーホームディレクトリの `.debug-params.json` を読み込み、プロジェクトローカルの設定とマージします。

### 環境変数ファイルの参照

`.env` ファイルを読み込む機能を追加します。

```json
{
  "configs": [
    {
      "name": "開発環境",
      "envFile": "${workspaceFolder}/.env.development",
      "args": ["--verbose"]
    }
  ]
}
```

### 設定のテンプレート

よく使う設定をテンプレートとして保存し、再利用できるようにします。

### プリセット選択の記憶

前回選択した設定を記憶し、次回は自動選択または優先表示します。

### 入力値の検証

入力値に対して正規表現による検証を行います。

```json
{
  "id": "port",
  "type": "promptString",
  "description": "ポート番号",
  "default": "8080",
  "validation": {
    "pattern": "^[0-9]+$",
    "message": "数値を入力してください"
  }
}
```

## プラグインなしでの動作

この拡張機能がインストールされていない状態でも、launch.json は正常に動作します。

### 基本的な動作

プラグインがインストールされていない場合:

- `useDebugParams` フラグは無視されます (未知のプロパティとして扱われ、エラーは発生しません)
- `.debug-params.json` は読み込まれません
- launch.json の設定がそのまま使用されます
- VS Code 標準の変数 (`${fileDirname}`, `${workspaceFolder}` など) は正常に展開されます

### 具体例

#### launch.json

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "C: カレントファイル",
      "type": "cppdbg",
      "request": "launch",
      "program": "${fileDirname}/${fileBasenameNoExtension}.exe",
      "cwd": "${fileDirname}",
      "environment": [],
      "args": [],
      "useDebugParams": true
    }
  ]
}
```

#### .debug-params.json

```json
{
  "configs": [
    {
      "name": "開発環境",
      "env": {
        "DEBUG_MODE": "1"
      },
      "args": ["--verbose"]
    }
  ]
}
```

#### プラグインなしでの実行結果

```text
program: /path/to/current/file.exe
cwd: /path/to/current
environment: []
args: []
```

`.debug-params.json` の設定は適用されません。

#### プラグインありでの実行結果

```text
program: /path/to/current/file.exe
cwd: /path/to/current
environment: [{ name: "DEBUG_MODE", value: "1" }]
args: ["--verbose"]
```

`.debug-params.json` の設定が適用されます。

### 互換性

この設計は後方互換性を持っています。

- プラグインをインストールすると、既存の launch.json にフラグを追加するだけで機能を有効化できる
- プラグインをアンインストールしても、launch.json はエラーなく動作する
- チーム内で一部のメンバーだけがプラグインを使用することも可能

### 推奨される運用パターン

#### パターン 1: プラグイン前提の運用

プロジェクト全体でプラグインを使用することを前提とする場合、launch.json をシンプルに保ちます。

**launch.json**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "カレントファイル",
      "type": "cppdbg",
      "request": "launch",
      "program": "${fileDirname}/${fileBasenameNoExtension}.exe",
      "cwd": "${fileDirname}",
      "useDebugParams": true
    }
  ]
}
```

**.debug-params.json**

詳細な設定はプロジェクトごとに配置します。

**README への記載例**

```markdown
## デバッグ実行

このプロジェクトでは、VS Code のデバッグ実行を最適化するため、
以下の拡張機能が必要です。

### 必要な拡張機能

- Debug Params (拡張機能 ID: `xxx.debug-params`)

### 使い方

1. 拡張機能をインストール
2. デバッグしたいファイルを開く
3. F5 を押してデバッグ実行
4. 設定を選択 (開発環境、本番環境シミュレーションなど)
```

#### パターン 2: プラグインなしでも動作する運用

プラグインがなくても最低限動作するようにする場合、launch.json にデフォルト設定を記述します。

**launch.json (デフォルト設定あり)**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "カレントファイル",
      "type": "cppdbg",
      "request": "launch",
      "program": "${fileDirname}/${fileBasenameNoExtension}.exe",
      "cwd": "${fileDirname}",
      "environment": [
        {
          "name": "DEBUG_MODE",
          "value": "0"
        }
      ],
      "args": [],
      "useDebugParams": true
    }
  ]
}
```

**.debug-params.json (上書き設定)**

プラグインがある場合は、より便利な設定に置き換えます。

```json
{
  "configs": [
    {
      "name": "開発環境 (詳細ログ)",
      "env": {
        "DEBUG_MODE": "1",
        "LOG_LEVEL": "DEBUG"
      },
      "args": ["--verbose"]
    },
    {
      "name": "本番環境シミュレーション",
      "env": {
        "DEBUG_MODE": "0",
        "LOG_LEVEL": "ERROR"
      },
      "args": []
    }
  ]
}
```

この場合:
- **プラグインなし**: `DEBUG_MODE=0`, `args=[]` で実行
- **プラグインあり**: ユーザーが選択した設定で実行

**README への記載例**

```markdown
## デバッグ実行

### 推奨拡張機能

- Debug Params (拡張機能 ID: `xxx.debug-params`)

拡張機能をインストールすると、複数の環境設定を簡単に切り替えられます。

### 拡張機能なしでの実行

拡張機能がインストールされていない場合でも、基本的なデバッグ実行は可能です。
F5 を押すとデフォルト設定で実行されます。
```

#### パターン 3: プラグイン専用設定と通常設定を併用

両方の設定を用意する場合。

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "カレントファイル (通常)",
      "type": "cppdbg",
      "request": "launch",
      "program": "${fileDirname}/${fileBasenameNoExtension}.exe",
      "cwd": "${fileDirname}",
      "environment": [],
      "args": []
    },
    {
      "name": "カレントファイル (パラメータ付き)",
      "type": "cppdbg",
      "request": "launch",
      "program": "${fileDirname}/${fileBasenameNoExtension}.exe",
      "cwd": "${fileDirname}",
      "environment": [],
      "args": [],
      "useDebugParams": true
    }
  ]
}
```

この場合:
- **プラグインなし**: 「通常」を選択して実行
- **プラグインあり**: 「パラメータ付き」を選択して柔軟に実行

### プラグインの検出

ユーザーは以下の動作からプラグインの有無を推測できます。

**プラグインがある場合**

1. デバッグ実行時に設定選択のクイックピックが表示される
2. `.debug-params.json` の設定が反映される

**プラグインがない場合**

1. デバッグ実行が即座に開始される (選択なし)
2. launch.json の設定がそのまま使用される

## まとめ

この設計により、以下を実現できます。

- launch.json をシンプルかつ複数のフォルダで統一
- プロジェクトごとに柔軟なデバッグパラメータを管理
- 複数の実行環境 (開発、テスト、本番シミュレーション) を簡単に切り替え
- クロスプラットフォーム開発での適切な設定選択
- 変数展開による動的なパラメータ設定
- デバッグ実行時の動的な引数・環境変数入力

## 設計上の考慮事項

### .debug-params.json の探索ルール

現在の仕様では、`cwd` フォルダから `.debug-params.json` を探します。

#### 現在の動作

```text
c-project/
├── .debug-params.json
└── src/
    └── main.c
```

`cwd` が `${fileDirname}` で `src/main.c` を開いた場合、`cwd` は `c-project/src` になり、`.debug-params.json` が見つかりません。

#### 推奨される運用

- `cwd` を明示的にプロジェクトルートに設定する
- または `.debug-params.json` を各サブフォルダに配置する

#### 将来の拡張案

上方向に探索する機能を追加することで、柔軟性を向上できます。

1. `cwd` フォルダ内の `.debug-params.json`
2. `cwd` の親フォルダを上方向に探索 (最大 N 階層)
3. `workspaceFolder` 直下の `.debug-params.json`

### 環境変数の形式

launch.json では、デバッグタイプによって環境変数の形式が異なります。

- C/C++: `environment` 配列 (`[{ "name": "PATH", "value": "..." }]`)
- Python/.NET: `env` オブジェクト (`{ "PATH": "..." }`)

`.debug-params.json` では常にオブジェクト形式で記述し、拡張機能が launch.json の形式に応じて自動変換します。

### 変数展開のルール

`${env:VAR}` は常にプロセスの現在の環境変数を参照します。`.debug-params.json` 内で定義した `env` の値は参照しません。

```json
{
  "env": {
    "PATH": "${workspaceFolder}/bin:${env:PATH}",
    "MY_PATH": "${env:PATH}"
  }
}
```

この場合、`MY_PATH` は元のシステムの `PATH` を参照し、`.debug-params.json` で定義した `PATH` は参照しません。

### 引数の置換ルール

`.debug-params.json` に `args` キーがある場合、launch.json の引数を完全に置換します。`args` キーがない場合は、launch.json の引数を維持します。

**完全置換の例**

```json
// launch.json
"args": ["--log-file=${fileDirname}/debug.log"]

// .debug-params.json
"args": ["--verbose"]

// 結果
"args": ["--verbose"]  // --log-file は消える
```

この動作は、固定の引数を `.debug-params.json` で柔軟に変更できるという利点がありますが、launch.json の引数を維持したい場合は、`.debug-params.json` で `args` キーを省略する必要があります。

### type 指定時の表示順序

複数の設定で type や platform が混在している場合、定義順が維持されます。

```json
{
  "configs": [
    {"name": "設定A", "platform": "linux"},
    {"name": "設定B"},
    {"name": "設定C", "platform": "linux"},
    {"name": "設定D"}
  ]
}
```

プラットフォームが Linux の場合、表示順序は: 設定A → 設定B → 設定C → 設定D

### 相対パスの扱い

`.debug-params.json` 内で相対パスを使った場合、その基準は実行時の `cwd` になります。ただし、相対パスの使用は推奨されません。常に変数を使うことを推奨します。

**推奨される書き方**

```json
"args": ["--config=${fileDirname}/config/dev.ini"]
```

**推奨されない書き方**

```json
"args": ["--config=config/dev.ini"]
```

### エラーハンドリング

以下のケースでのエラーハンドリングを実装します。

- **JSON パースエラー**: 警告を表示し、デバッグを中止
- **必須項目の欠落** (`name` など): その設定をスキップ
- **環境変数が存在しない**: 空文字列に展開
- **ファイル読み込みエラー**: 警告を表示し、launch.json のまま実行
- **type 不一致**: 適合する設定がない場合、メッセージを表示
- **input の参照エラー**: 空文字列に置換し、警告を表示
- **input のキャンセル**: デバッグ実行を中止

### 設定の検証

起動時に以下の検証を行います。

- `configs` が配列であること
- `name` が文字列であること
- `platform` が文字列または文字列の配列であること (指定されている場合)
- `type` が文字列であること (指定されている場合)
- `env` がオブジェクトであること
- `args` が配列または文字列であること
- `inputs` が配列であること
- `input.id` が重複していないこと
- `input.type` が有効な値であること
- `pickString` の場合、`options` が定義されていること

不正な設定はスキップし、警告を表示します。
