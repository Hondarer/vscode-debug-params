import * as vscode from 'vscode';
import { DebugParamsProvider } from './debugParamsProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new DebugParamsProvider(context);

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      '*',
      provider,
      vscode.DebugConfigurationProviderTriggerKind.Dynamic
    )
  );
}

export function deactivate() {}
