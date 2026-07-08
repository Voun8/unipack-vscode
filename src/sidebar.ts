import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { cfg, configValues, targetForWorkspace, addHbxPathToList } from './config';
import { isValidHbxRoot } from './project';

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
  const target = targetForWorkspace();
  // 路径按项目(工作区)保存,支持多项目各用不同 HBuilderX 版本;新的有效路径自动登记进全局版本列表
  const hbxPath = (values.hbuilderxPath || '').trim();
  await c.update('hbuilderxPath', hbxPath, target);
  if (isValidHbxRoot(hbxPath)) {
    await addHbxPathToList(hbxPath);
  }
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
