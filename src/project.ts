import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { cfg } from './config';

export interface Ctx {
  hbxRoot: string;
  projectDir: string;
  manifest: any;
  vueVersion: string;
  appId: string;
}

// ---------- HBuilderX 路径探测 ----------

export function isValidHbxRoot(root: string): boolean {
  return !!root && fs.existsSync(path.join(root, 'plugins', 'node', 'node.exe'));
}

export function detectHbxRoot(): string | null {
  const candidates = [
    (cfg().get<string>('hbuilderxPath') || '').trim(),
    'D:\\App\\devlopTool\\HBuilderX',
    'C:\\Program Files\\HBuilderX',
    'C:\\Program Files (x86)\\HBuilderX',
    'C:\\HBuilderX',
    'D:\\HBuilderX',
    (process.env.HBUILDERX_HOME || '').trim()
  ];
  return candidates.find(isValidHbxRoot) || null;
}

// ---------- 项目目录 / manifest ----------

export function detectProjectDir(): string | null {
  const configured = (cfg().get<string>('projectDir') || '').trim();
  if (configured) {
    return configured;
  }
  const folders = vscode.workspace.workspaceFolders || [];
  const withManifest = folders.find(f => fs.existsSync(path.join(f.uri.fsPath, 'manifest.json')));
  if (withManifest) {
    return withManifest.uri.fsPath;
  }
  return folders.length ? folders[0].uri.fsPath : null;
}

// manifest.json 常含注释/尾逗号(JSONC),剥离后重试;仍失败则抛出原始解析错误,不静默兜底
export function parseManifest(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  }
}

export function readManifest(projectDir: string): any {
  return parseManifest(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8'));
}

// 仅在"字段缺失"时回退默认值;"解析失败"由 resolveContext / cmdDiagnose 显式报错处理
export function appIdOf(manifest: any): string {
  const id = manifest && (manifest.appid || manifest.id);
  return id ? String(id) : 'HBuilder';
}

export function detectVueVersion(manifest: any): string {
  const forced = cfg().get<string>('vueVersion');
  if (forced === '2' || forced === '3') {
    return forced;
  }
  const v = manifest && manifest.vueVersion != null ? String(manifest.vueVersion).trim() : '';
  return v === '3' ? '3' : '2';
}

export function resolveAppPlatform(vueVersion: string): string {
  const v = (cfg().get<string>('appPlatformName') || 'auto').trim();
  if (v && v !== 'auto') {
    return v;
  }
  return vueVersion === '3' ? 'app' : 'app-plus';
}

export function outputDirFor(projectDir: string, platform: string, appId: string): string {
  if (platform === 'app' || platform === 'app-plus') {
    return path.join(projectDir, 'dist', 'app', appId, 'www');
  }
  return path.join(projectDir, 'dist', platform);
}

// 解析一次 manifest 存入 Ctx,vueVersion / appId 由它派生(单一数据源,避免多次读盘);
// 解析失败显式报错并中止,不再静默退化为默认 appid/vue 版本
export function resolveContext(quiet: boolean): Ctx | null {
  const hbxRoot = detectHbxRoot();
  if (!hbxRoot) {
    if (!quiet) {
      vscode.window.showErrorMessage('未找到 HBuilderX。请在侧边栏「配置」里设置 HBuilderX 路径(需含 plugins\\node\\node.exe)。');
    }
    return null;
  }
  const projectDir = detectProjectDir();
  if (!projectDir) {
    if (!quiet) {
      vscode.window.showErrorMessage('未找到 uni-app 项目目录。请打开项目工作区,或在侧边栏「配置」里设置项目目录。');
    }
    return null;
  }
  if (!fs.existsSync(path.join(projectDir, 'manifest.json'))) {
    if (!quiet) {
      vscode.window.showErrorMessage('项目目录缺少 manifest.json,不是有效 uni-app 项目:' + projectDir);
    }
    return null;
  }
  let manifest: any;
  try {
    manifest = readManifest(projectDir);
  } catch (e: any) {
    if (!quiet) {
      vscode.window.showErrorMessage('manifest.json 解析失败:' + e.message);
    }
    return null;
  }
  return { hbxRoot, projectDir, manifest, vueVersion: detectVueVersion(manifest), appId: appIdOf(manifest) };
}
