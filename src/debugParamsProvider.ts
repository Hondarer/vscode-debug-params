import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { DebugParamsConfig, DebugParamEntry, InputDefinition, InputCache } from './types';

export class DebugParamsProvider implements vscode.DebugConfigurationProvider {
  private inputCache: InputCache = {};
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ): Promise<vscode.DebugConfiguration | undefined> {
    if (!config.useDebugParams) {
      return config;
    }

    const cwd = config.cwd as string;
    if (!cwd) {
      return config;
    }

    // Check if program exists (e.g., build may have failed in preLaunchTask)
    if (config.program && !fs.existsSync(config.program)) {
      vscode.window.showWarningMessage(`Debug cancelled: program not found: ${config.program}`);
      return undefined;
    }

    const debugParamsPath = path.join(cwd, '.debug-params.json');
    if (!fs.existsSync(debugParamsPath)) {
      return config;
    }

    let paramsConfig: DebugParamsConfig;
    try {
      const content = fs.readFileSync(debugParamsPath, 'utf-8');
      const errors: jsonc.ParseError[] = [];
      paramsConfig = jsonc.parse(content, errors, { allowTrailingComma: true });
      if (errors.length > 0) {
        const errorMessages = errors.map(e => jsonc.printParseErrorCode(e.error)).join(', ');
        vscode.window.showWarningMessage(`Failed to parse .debug-params.json: ${errorMessages}`);
        return config;
      }
    } catch (error) {
      vscode.window.showWarningMessage(`Failed to parse .debug-params.json: ${error}`);
      return config;
    }

    if (!Array.isArray(paramsConfig.configs)) {
      vscode.window.showWarningMessage('.debug-params.json: configs must be an array');
      return config;
    }

    const filteredConfigs = this.filterConfigs(paramsConfig.configs, config.type);
    if (filteredConfigs.length === 0) {
      vscode.window.showInformationMessage('No matching configurations found in .debug-params.json');
      return config;
    }

    let selectedConfig: DebugParamEntry;
    if (filteredConfigs.length === 1) {
      selectedConfig = filteredConfigs[0];
    } else {
      const items = filteredConfigs.map(c => ({ label: c.name, config: c }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select debug configuration'
      });
      if (!selected) {
        return undefined;
      }
      selectedConfig = selected.config;
    }

    try {
      const resolvedConfig = await this.applyConfig(config, selectedConfig, folder);
      delete resolvedConfig.useDebugParams;
      return resolvedConfig;
    } catch (error) {
      if (error instanceof Error && error.message === 'Input cancelled') {
        return undefined;
      }
      throw error;
    }
  }

  private filterConfigs(configs: DebugParamEntry[], debugType: string): DebugParamEntry[] {
    const platform = this.getCurrentPlatform();

    return configs.filter(config => {
      if (config.platform) {
        const platforms = Array.isArray(config.platform) ? config.platform : [config.platform];
        if (!platforms.includes(platform)) {
          return false;
        }
      }

      if (config.type && config.type !== debugType) {
        return false;
      }

      return true;
    });
  }

  private getCurrentPlatform(): string {
    switch (process.platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'macos';
      default: return 'linux';
    }
  }

  private async applyConfig(
    debugConfig: vscode.DebugConfiguration,
    paramConfig: DebugParamEntry,
    folder: vscode.WorkspaceFolder | undefined
  ): Promise<vscode.DebugConfiguration> {
    const result = { ...debugConfig };
    console.log('[debug-params] Input debugConfig:', JSON.stringify(debugConfig, null, 2));
    console.log('[debug-params] Selected paramConfig:', JSON.stringify(paramConfig, null, 2));

    const inputValues = await this.collectInputs(paramConfig, folder, debugConfig);

    if (paramConfig.env) {
      const expandedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(paramConfig.env)) {
        expandedEnv[key] = this.expandVariables(value, folder, debugConfig, inputValues);
      }

      if (debugConfig.type === 'cppdbg' || debugConfig.type === 'cppvsdbg') {
        const envArray = result.environment || [];
        for (const [name, value] of Object.entries(expandedEnv)) {
          const existing = envArray.findIndex((e: {name: string}) => e.name === name);
          if (existing >= 0) {
            envArray[existing].value = value;
          } else {
            envArray.push({ name, value });
          }
        }
        result.environment = envArray;
      } else {
        result.env = { ...(result.env || {}), ...expandedEnv };
      }
    }

    if (paramConfig.args !== undefined) {
      let args: string[];
      if (typeof paramConfig.args === 'string') {
        const expanded = this.expandVariables(paramConfig.args, folder, debugConfig, inputValues);
        args = this.parseArgsString(expanded);
      } else {
        args = [];
        for (const arg of paramConfig.args) {
          const expanded = this.expandVariables(arg, folder, debugConfig, inputValues);
          if (this.isBuiltinArgsInput(arg)) {
            args.push(...this.parseArgsString(expanded));
          } else {
            args.push(expanded);
          }
        }
      }
      result.args = args;
      console.log('[debug-params] args set to:', JSON.stringify(args));
    }

    console.log('[debug-params] Final config:', JSON.stringify(result, null, 2));
    return result;
  }

  private isBuiltinArgsInput(value: string): boolean {
    return /\$\{input:@args(?::[^}]*)?\}/.test(value) && !!value.trim().match(/^\$\{input:@args(?::[^}]*)?\}$/);
  }

  private async collectInputs(
    config: DebugParamEntry,
    folder: vscode.WorkspaceFolder | undefined,
    debugConfig: vscode.DebugConfiguration
  ): Promise<Record<string, string>> {
    const values: Record<string, string> = {};
    const configCache = this.inputCache[config.name] || {};

    const allText = JSON.stringify(config);
    const builtinMatches = allText.matchAll(/\$\{input:(@\w+)(?::([^}]*))?\}/g);
    const builtinInputs: Array<{id: string, type: string, desc: string, defaultVal: string}> = [];

    for (const match of builtinMatches) {
      const fullType = match[1];
      const params = match[2] || '';
      const parts = params.split(':');
      const desc = parts[0] || this.getBuiltinDescription(fullType);
      const defaultVal = parts.slice(1).join(':') || '';
      const id = `${fullType}:${desc}:${defaultVal}`;

      if (!builtinInputs.find(i => i.id === id)) {
        builtinInputs.push({ id, type: fullType, desc, defaultVal });
      }
    }

    for (const input of builtinInputs) {
      const expandedDefault = this.expandVariables(input.defaultVal, folder, debugConfig, values);
      const cached = configCache[input.id];
      const value = await this.promptBuiltinInput(input.type, input.desc, cached || expandedDefault);
      if (value === undefined) {
        throw new Error('Input cancelled');
      }
      values[input.id] = value;
      configCache[input.id] = value;
    }

    if (config.inputs) {
      for (const input of config.inputs) {
        if (!this.validateInput(input)) {
          continue;
        }

        const expandedDefault = input.default
          ? this.expandVariables(input.default, folder, debugConfig, values)
          : undefined;
        const cached = configCache[input.id];
        const value = await this.promptInput(input, cached || expandedDefault);
        if (value === undefined) {
          throw new Error('Input cancelled');
        }
        values[input.id] = value;
        configCache[input.id] = value;
      }
    }

    this.inputCache[config.name] = configCache;
    return values;
  }

  private getBuiltinDescription(type: string): string {
    switch (type) {
      case '@file': return 'Select file';
      case '@folder': return 'Select folder';
      case '@text': return 'Enter text';
      case '@password': return 'Enter password';
      case '@args': return 'Enter arguments';
      default: return 'Enter value';
    }
  }

  private async promptBuiltinInput(type: string, description: string, defaultValue?: string): Promise<string | undefined> {
    switch (type) {
      case '@file': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          defaultUri: defaultValue ? vscode.Uri.file(defaultValue) : undefined
        });
        return uris?.[0]?.fsPath;
      }
      case '@folder': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          defaultUri: defaultValue ? vscode.Uri.file(defaultValue) : undefined
        });
        return uris?.[0]?.fsPath;
      }
      case '@password':
        return vscode.window.showInputBox({
          prompt: description,
          password: true,
          value: defaultValue
        });
      case '@text':
      case '@args':
        return vscode.window.showInputBox({
          prompt: description,
          value: defaultValue
        });
      default:
        return vscode.window.showInputBox({
          prompt: description,
          value: defaultValue
        });
    }
  }

  private validateInput(input: InputDefinition): boolean {
    if (!input.id || !input.type || !input.description) {
      vscode.window.showWarningMessage(`Invalid input definition: missing required fields`);
      return false;
    }

    const validTypes = ['promptString', 'pickString', 'pickFile', 'pickFolder'];
    if (!validTypes.includes(input.type)) {
      vscode.window.showWarningMessage(`Invalid input type: ${input.type}`);
      return false;
    }

    if (input.type === 'pickString' && (!input.options || input.options.length === 0)) {
      vscode.window.showWarningMessage(`pickString input "${input.id}" requires options`);
      return false;
    }

    return true;
  }

  private async promptInput(input: InputDefinition, defaultValue?: string): Promise<string | undefined> {
    switch (input.type) {
      case 'promptString':
        return vscode.window.showInputBox({
          prompt: input.description,
          value: defaultValue,
          password: input.password
        });

      case 'pickString': {
        const items = input.options!.map(opt => ({ label: opt }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: input.description
        });
        return selected?.label;
      }

      case 'pickFile': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          defaultUri: defaultValue ? vscode.Uri.file(defaultValue) : undefined
        });
        return uris?.[0]?.fsPath;
      }

      case 'pickFolder': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          defaultUri: defaultValue ? vscode.Uri.file(defaultValue) : undefined
        });
        return uris?.[0]?.fsPath;
      }

      default:
        return undefined;
    }
  }

  private expandVariables(
    value: string,
    folder: vscode.WorkspaceFolder | undefined,
    debugConfig: vscode.DebugConfiguration,
    inputValues: Record<string, string>
  ): string {
    let result = value;

    // Expand built-in inputs
    result = result.replace(/\$\{input:(@\w+)(?::([^}]*))?\}/g, (match, type, params) => {
      const parts = (params || '').split(':');
      const desc = parts[0] || this.getBuiltinDescription(type);
      const defaultVal = parts.slice(1).join(':') || '';
      const id = `${type}:${desc}:${defaultVal}`;
      return inputValues[id] || '';
    });

    // Expand regular inputs
    result = result.replace(/\$\{input:([^}]+)\}/g, (match, id) => {
      return inputValues[id] || '';
    });

    // Expand VS Code variables
    const workspaceFolder = folder?.uri.fsPath || '';
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath || '';
    const fileDirname = activeFile ? path.dirname(activeFile) : '';
    const fileBasename = activeFile ? path.basename(activeFile) : '';
    const fileExtname = activeFile ? path.extname(activeFile) : '';
    const fileBasenameNoExtension = activeFile ? path.basename(activeFile, fileExtname) : '';

    result = result.replace(/\$\{workspaceFolder\}/g, workspaceFolder);
    result = result.replace(/\$\{workspaceRoot\}/g, workspaceFolder);
    result = result.replace(/\$\{cwd\}/g, debugConfig.cwd || '');
    result = result.replace(/\$\{file\}/g, activeFile);
    result = result.replace(/\$\{fileBasename\}/g, fileBasename);
    result = result.replace(/\$\{fileBasenameNoExtension\}/g, fileBasenameNoExtension);
    result = result.replace(/\$\{fileExtname\}/g, fileExtname);
    result = result.replace(/\$\{fileDirname\}/g, fileDirname);

    // Expand environment variables
    result = result.replace(/\$\{env:([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || '';
    });

    // Expand VS Code config
    result = result.replace(/\$\{config:([^}]+)\}/g, (match, key) => {
      const config = vscode.workspace.getConfiguration();
      return config.get(key, '');
    });

    return result;
  }

  private parseArgsString(argsString: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && char === ' ') {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current);
    }

    return args;
  }
}
