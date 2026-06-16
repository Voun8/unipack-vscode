import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { cfg, configValues, targetForWorkspace } from './config';

// 侧边栏 Webview 的可见性收敛在本模块内,对外只暴露 postStatus / postConfigToView
let sidebarView: vscode.WebviewView | null = null;

export function postConfigToView(): void {
  if (sidebarView) {
    sidebarView.webview.postMessage({ type: 'config', values: configValues() });
  }
}

export function postStatus(text: string): void {
  if (sidebarView) {
    sidebarView.webview.postMessage({ type: 'status', text });
  }
}

async function saveConfigFromView(values: any): Promise<void> {
  const c = cfg();
  await c.update('hbuilderxPath', (values.hbuilderxPath || '').trim(), vscode.ConfigurationTarget.Global);
  const target = targetForWorkspace();
  await c.update('projectDir', (values.projectDir || '').trim(), target);
  await c.update('vueVersion', values.vueVersion || 'auto', target);
  await c.update('appPlatformName', (values.appPlatformName || '').trim() || 'auto', target);
  postStatus('配置已保存');
}

export function createViewProvider(extensionPath: string): vscode.WebviewViewProvider {
  return {
    resolveWebviewView(view) {
      sidebarView = view;
      view.webview.options = { enableScripts: true };
      view.webview.html = fs.readFileSync(path.join(extensionPath, 'media', 'view.html'), 'utf8');
      view.webview.onDidReceiveMessage((m: any) => {
        if (!m) {
          return;
        }
        if (m.type === 'cmd') {
          vscode.commands.executeCommand(m.command);
        } else if (m.type === 'saveConfig') {
          saveConfigFromView(m.values || {});
        } else if (m.type === 'ready') {
          postConfigToView();
        }
      });
      view.onDidDispose(() => {
        if (sidebarView === view) {
          sidebarView = null;
        }
      });
    }
  };
}
