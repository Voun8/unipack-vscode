import * as vscode from 'vscode';
import { out } from './output';
import { postConfigToView, createViewProvider } from './sidebar';
import { runBuild, PACK_ACTIONS } from './build';
import { TASK_TYPE, taskProvider, runDebug } from './tasks';
import {
  cmdMenu, cmdBuildApp, cmdPackWgt, cmdDiagnose, cmdShowOutput,
  cmdSetHbxPath, cmdSetProjectDir, cmdSetVueVersion, cmdSetAppPlatform
} from './commands';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(out());

  const register = (id: string, fn: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  // 构建 / 调试 / App 资源命令从 PACK_ACTIONS 单一源派生注册
  for (const a of PACK_ACTIONS) {
    register(a.command,
      a.kind === 'serve' ? () => runDebug(a.platform, a.label)
        : a.kind === 'app' ? () => cmdBuildApp(a.label)
          : () => runBuild(a.platform, a.mode, a.label));
  }

  register('hbxPack.menu', cmdMenu);
  register('hbxPack.packWgt', cmdPackWgt);
  register('hbxPack.diagnose', cmdDiagnose);
  register('hbxPack.showOutput', cmdShowOutput);
  register('hbxPack.setHbxPath', cmdSetHbxPath);
  register('hbxPack.setProjectDir', cmdSetProjectDir);
  register('hbxPack.setVueVersion', cmdSetVueVersion);
  register('hbxPack.setAppPlatform', cmdSetAppPlatform);
  register('hbxPack.refreshView', () => postConfigToView());

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('hbxPackView', createViewProvider(context.extensionPath)));
  context.subscriptions.push(vscode.tasks.registerTaskProvider(TASK_TYPE, taskProvider));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('hbxPack')) {
      postConfigToView();
    }
  }));
}

export function deactivate() {}
