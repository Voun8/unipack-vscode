import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { cfg, targetForWorkspace } from './config';
import { out } from './output';
import { postConfigToView } from './sidebar';
import {
  resolveContext, detectHbxRoot, detectProjectDir, readManifest,
  detectVueVersion, resolveAppPlatform, outputDirFor, appIdOf
} from './project';
import { buildSpec, runBuild, PACK_ACTIONS } from './build';

// App 平台需按 vue 版本迟解析,故单独成命令(不能纯查表派生)
export function cmdBuildApp(friendlyName: string): void {
  const ctx = resolveContext(false);
  if (!ctx) {
    return;
  }
  runBuild(resolveAppPlatform(ctx.vueVersion), 'production', friendlyName);
}

export async function cmdPackWgt(): Promise<void> {
  const ctx = resolveContext(false);
  if (!ctx) {
    return;
  }
  const { hbxRoot, projectDir, vueVersion, appId } = ctx;

  const appPlatform = resolveAppPlatform(vueVersion);
  const appResDir = outputDirFor(projectDir, appPlatform, appId);
  if (!fs.existsSync(appResDir)) {
    const pick = await vscode.window.showWarningMessage('未找到 App 资源目录,需先生成:' + appResDir, '先生成 App 资源', '取消');
    if (pick === '先生成 App 资源') {
      vscode.commands.executeCommand('hbxPack.buildApp');
    }
    return;
  }

  const wgtDir = path.join(projectDir, 'dist', 'wgt');
  fs.mkdirSync(wgtDir, { recursive: true });
  const wgtPath = path.join(wgtDir, appId + '.wgt');

  const admZipPath = path.join(hbxRoot, 'plugins', 'app-safe-pack', 'node_modules', 'adm-zip');
  if (!fs.existsSync(admZipPath)) {
    vscode.window.showErrorMessage('未找到 HBuilderX 内置 adm-zip,无法打包 wgt:' + admZipPath);
    return;
  }

  // 复用 HBuilderX 内置 adm-zip,运行时按绝对路径动态加载
  const AdmZip = require(admZipPath);
  const zip = new AdmZip();
  zip.addLocalFolder(appResDir);
  zip.writeZip(wgtPath);

  out().appendLine('[HBX] wgt 已生成:' + wgtPath);
  const action = await vscode.window.showInformationMessage('wgt 已生成:' + wgtPath, '打开所在文件夹');
  if (action) {
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(wgtPath));
  }
}

// 菜单顺序固定;构建项文案取自 PACK_ACTIONS 单一源,wgt / 诊断为非构建项单列
const MENU_ORDER = ['hbxPack.buildH5', 'hbxPack.buildApp', 'hbxPack.packWgt', 'hbxPack.buildMpWeixin', 'hbxPack.serveH5', 'hbxPack.diagnose'];
const EXTRA_LABELS: Record<string, string> = {
  'hbxPack.packWgt': '打包 wgt(基于 App 资源)',
  'hbxPack.diagnose': '环境诊断'
};

export async function cmdMenu(): Promise<void> {
  const labels: Record<string, string> = { ...EXTRA_LABELS };
  for (const a of PACK_ACTIONS) {
    labels[a.command] = a.label;
  }
  const items = MENU_ORDER.map(command => ({ label: labels[command], command }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'HBuilderX uni-app 打包' });
  if (pick) {
    vscode.commands.executeCommand(pick.command);
  }
}

export function cmdShowOutput(): void {
  out().show(true);
}

export function cmdDiagnose(): void {
  out().show(true);
  out().appendLine('');
  out().appendLine('===== 环境诊断 =====');
  const hbxRoot = detectHbxRoot();
  out().appendLine('HBuilderX 目录 : ' + (hbxRoot || '未找到(请在侧边栏配置 HBuilderX 路径)'));
  if (hbxRoot) {
    out().appendLine('内置 node     : ' + path.join(hbxRoot, 'plugins', 'node', 'node.exe'));
  }

  const projectDir = detectProjectDir();
  out().appendLine('项目目录      : ' + (projectDir || '未找到'));
  if (projectDir) {
    if (!fs.existsSync(path.join(projectDir, 'manifest.json'))) {
      out().appendLine('manifest.json : 缺失');
    } else {
      let manifest: any;
      try {
        manifest = readManifest(projectDir);
      } catch (e: any) {
        out().appendLine('manifest.json : 解析失败 - ' + e.message);
        out().appendLine('====================');
        return;
      }
      out().appendLine('manifest.json : 存在');
      const vueVersion = detectVueVersion(manifest);
      const appPlatform = resolveAppPlatform(vueVersion);
      const appId = appIdOf(manifest);
      out().appendLine('vue 版本      : ' + vueVersion + ' -> ' + (vueVersion === '3' ? 'uniapp-cli-vite (vite)' : 'uniapp-cli (webpack)'));
      out().appendLine('appid         : ' + appId);
      out().appendLine('H5 输出目录   : ' + outputDirFor(projectDir, 'h5', appId));
      out().appendLine('App 资源目录  : ' + outputDirFor(projectDir, appPlatform, appId));
      if (hbxRoot) {
        const entry = buildSpec('h5', 'production', { hbxRoot, projectDir, manifest, vueVersion, appId }).entry;
        out().appendLine('编译入口      : ' + entry + '  (' + (fs.existsSync(entry) ? '存在' : '缺失!') + ')');
      }
    }
  }
  out().appendLine('====================');
}

// ---------- 命令:配置 ----------

export async function cmdSetHbxPath(): Promise<void> {
  const cur = cfg().get<string>('hbuilderxPath') || '';
  const v = await vscode.window.showInputBox({ prompt: 'HBuilderX 安装目录(需含 plugins\\node\\node.exe);留空则自动探测', value: cur, ignoreFocusOut: true });
  if (v === undefined) {
    return;
  }
  await cfg().update('hbuilderxPath', v.trim(), vscode.ConfigurationTarget.Global);
  postConfigToView();
}

export async function cmdSetProjectDir(): Promise<void> {
  const cur = cfg().get<string>('projectDir') || '';
  const v = await vscode.window.showInputBox({ prompt: '项目根目录(含 manifest.json);留空则用当前工作区', value: cur, ignoreFocusOut: true });
  if (v === undefined) {
    return;
  }
  await cfg().update('projectDir', v.trim(), targetForWorkspace());
  postConfigToView();
}

export async function cmdSetVueVersion(): Promise<void> {
  const pick = await vscode.window.showQuickPick(['auto', '2', '3'], { placeHolder: '选择 vue 版本(项目级);auto=读 manifest 自动判断' });
  if (!pick) {
    return;
  }
  await cfg().update('vueVersion', pick, targetForWorkspace());
  postConfigToView();
}

export async function cmdSetAppPlatform(): Promise<void> {
  const cur = cfg().get<string>('appPlatformName') || 'auto';
  const v = await vscode.window.showInputBox({ prompt: 'App 平台标识:auto / app-plus / app', value: cur, ignoreFocusOut: true });
  if (v === undefined) {
    return;
  }
  await cfg().update('appPlatformName', v.trim() || 'auto', targetForWorkspace());
  postConfigToView();
}
