import * as vscode from 'vscode';
import { DebugParamsProvider } from './debugParamsProvider';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Debug Params', { log: true });
  context.subscriptions.push(outputChannel);

  const provider = new DebugParamsProvider(context, outputChannel);

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      '*',
      provider,
      vscode.DebugConfigurationProviderTriggerKind.Dynamic
    )
  );
}

export function deactivate() {}
