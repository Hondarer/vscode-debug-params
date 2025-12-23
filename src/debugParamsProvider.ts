import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { execSync } from 'child_process';
import { DebugParamsConfig, DebugParamDefaults, DebugParamEntry, InputDefinition, InputCache } from './types';

export class DebugParamsProvider implements vscode.DebugConfigurationProvider {
  private inputCache: InputCache = {};
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.LogOutputChannel;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.LogOutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ): Promise<vscode.DebugConfiguration | undefined> {
    this.outputChannel.info('resolveDebugConfigurationWithSubstitutedVariables called');

    if (!config.useDebugParams) {
      this.outputChannel.info('useDebugParams not set, skipping');
      return config;
    }

    const cwd = config.cwd as string;
    if (!cwd) {
      this.outputChannel.info('cwd not set, skipping');
      return config;
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

    // Merge defaults into each config entry
    const configsWithDefaults = this.mergeDefaultsToConfigs(paramsConfig.configs, paramsConfig.defaults);

    const filteredConfigs = this.filterConfigs(configsWithDefaults, config.type);
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

      // Check if program exists after override (e.g., build may have failed in preLaunchTask)
      if (resolvedConfig.program && !fs.existsSync(resolvedConfig.program)) {
        vscode.window.showWarningMessage(`Debug cancelled: program not found: ${resolvedConfig.program}`);
        return undefined;
      }

      return resolvedConfig;
    } catch (error) {
      if (error instanceof Error && error.message === 'Input cancelled') {
        return undefined;
      }
      // Shell command errors and other errors should also cancel debug
      this.outputChannel.error('Debug cancelled due to error:', error instanceof Error ? error.message : String(error));
      return undefined;
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
    this.outputChannel.info('Input debugConfig:', JSON.stringify(debugConfig, null, 2));
    this.outputChannel.info('Selected paramConfig:', JSON.stringify(paramConfig, null, 2));

    const inputValues = await this.collectInputs(paramConfig, folder, debugConfig);

    if (paramConfig.env) {
      const expandedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(paramConfig.env)) {
        expandedEnv[key] = this.expandVariables(value, folder, debugConfig, inputValues, debugConfig.cwd);
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
      this.outputChannel.info('env set to:', JSON.stringify(result.environment || result.env));
    }

    if (paramConfig.args !== undefined) {
      let args: string[];
      if (typeof paramConfig.args === 'string') {
        const expanded = this.expandVariables(paramConfig.args, folder, debugConfig, inputValues, debugConfig.cwd);
        args = this.parseArgsString(expanded);
      } else {
        args = [];
        for (const arg of paramConfig.args) {
          const expanded = this.expandVariables(arg, folder, debugConfig, inputValues, debugConfig.cwd);
          if (this.isBuiltinArgsInput(arg)) {
            args.push(...this.parseArgsString(expanded));
          } else {
            args.push(expanded);
          }
        }
      }
      result.args = args;
      this.outputChannel.info('args set to:', JSON.stringify(args));
    }

    // Program path override
    if (paramConfig.program !== undefined) {
      if (paramConfig.program.trim() === '') {
        this.outputChannel.warn('program field is empty in .debug-params.json, keeping original program');
      } else {
        const expandedProgram = this.expandVariables(
          paramConfig.program,
          folder,
          debugConfig,
          inputValues,
          debugConfig.cwd
        );
        result.program = expandedProgram;
        this.outputChannel.info(`program overridden to: ${expandedProgram}`);
      }
    }

    this.outputChannel.info('Final config:', JSON.stringify(result, null, 2));
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
      const expandedDefault = this.expandVariables(input.defaultVal, folder, debugConfig, values, debugConfig.cwd);
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
          ? this.expandVariables(input.default, folder, debugConfig, values, debugConfig.cwd)
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

  private mergeDefaultsToConfigs(
    configs: DebugParamEntry[],
    defaults?: DebugParamDefaults
  ): DebugParamEntry[] {
    if (!defaults) {
      return configs;
    }

    return configs.map(config => {
      const merged: DebugParamEntry = { ...config };

      // Merge env: defaults env + config env (config takes precedence)
      if (defaults.env || config.env) {
        merged.env = { ...(defaults.env || {}), ...(config.env || {}) };
      }

      // Merge program: config takes precedence, fallback to defaults
      if (!config.program && defaults.program) {
        merged.program = defaults.program;
      }

      // Merge inputs: defaults inputs + config inputs (config takes precedence by ID)
      if (defaults.inputs || config.inputs) {
        const defaultInputs = defaults.inputs || [];
        const configInputs = config.inputs || [];
        const configInputIds = new Set(configInputs.map(i => i.id));

        // Start with config inputs, then add defaults that don't conflict
        merged.inputs = [
          ...configInputs,
          ...defaultInputs.filter(di => !configInputIds.has(di.id))
        ];
      }

      return merged;
    });
  }

  private executeShellCommand(command: string, cwd?: string): string {
    const platform = this.getCurrentPlatform();

    try {
      this.outputChannel.info(`Executing shell command: ${command}`);

      // Determine shell based on platform
      let shell: string;
      if (platform === 'windows') {
        shell = process.env.COMSPEC || 'cmd.exe';
      } else {
        shell = process.env.SHELL || '/bin/sh';
      }

      const result = execSync(command, {
        encoding: 'utf-8',
        shell: shell,
        cwd: cwd,
        timeout: 10000, // 10 second timeout
        maxBuffer: 1024 * 1024, // 1MB max output
        windowsHide: true
      });

      // Trim whitespace and newlines, take first line only
      const trimmedResult = result.toString().trim();
      const firstLine = trimmedResult.split('\n')[0] || '';
      this.outputChannel.info(`Command result: ${firstLine}`);

      return firstLine;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.error(`Shell command failed: ${command}`, errorMessage);
      vscode.window.showWarningMessage(
        `Debug cancelled: Shell command failed: ${command}\nError: ${errorMessage}`
      );
      throw error; // Re-throw error to abort debug process
    }
  }

  private expandVariables(
    value: string,
    folder: vscode.WorkspaceFolder | undefined,
    debugConfig: vscode.DebugConfiguration,
    inputValues: Record<string, string>,
    cwd?: string
  ): string {
    let result = value;

    // First pass: Expand all non-shell variables
    result = this.expandNonShellVariables(result, folder, debugConfig, inputValues);

    // Second pass: Expand shell commands (which can now use expanded variables)
    result = this.expandShellCommands(result, cwd);

    return result;
  }

  private expandNonShellVariables(
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

  private expandShellCommands(value: string, cwd?: string): string {
    let result = value;
    const shellVarPattern = /\$\{shell:([^}]+)\}/;
    const maxExpansions = 10; // Prevent infinite loops
    let expansionCount = 0;

    while (shellVarPattern.test(result) && expansionCount < maxExpansions) {
      const previousResult = result;
      result = result.replace(/\$\{shell:([^}]+)\}/g, (match, command) => {
        return this.executeShellCommand(command, cwd);
      });

      if (result === previousResult) {
        break;
      }
      expansionCount++;
    }

    if (expansionCount >= maxExpansions) {
      this.outputChannel.warn('Maximum shell variable expansions reached, possible circular reference');
    }

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
