import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { cfg } from './config';
import { out } from './output';
import { postStatus } from './sidebar';
import { Ctx, resolveContext, outputDirFor } from './project';

export interface BuildSpec {
  program: string;
  args: string[];
  cwd: string;
  entry: string;
  env: { [key: string]: string };
  outDir: string;
}

export type ActionKind = 'build' | 'serve' | 'app';

export interface PackAction {
  command: string;
  label: string;
  platform: string;          // kind 'app' 为占位,实际平台在使用处按 vue 版本迟解析
  mode: 'production' | 'development';
  kind: ActionKind;
}

// 平台 / 模式 / 文案的单一声明源:命令注册、菜单、Task 供给都从此派生,避免三处文案漂移
export const PACK_ACTIONS: PackAction[] = [
  { command: 'hbxPack.buildH5', label: '打包 H5 / 网站(发行)', platform: 'h5', mode: 'production', kind: 'build' },
  { command: 'hbxPack.serveH5', label: '调试 H5(开发/热更)', platform: 'h5', mode: 'development', kind: 'serve' },
  { command: 'hbxPack.buildApp', label: '生成 App 本地打包资源(发行)', platform: 'app', mode: 'production', kind: 'app' },
  { command: 'hbxPack.buildMpWeixin', label: '打包 微信小程序(发行)', platform: 'mp-weixin', mode: 'production', kind: 'build' }
];

// ---------- 编译命令构造 ----------

export function buildSpec(platform: string, mode: string | undefined, ctx: Ctx): BuildSpec {
  const { hbxRoot, projectDir, vueVersion, appId } = ctx;
  const isProd = mode !== 'development';
  const mem = cfg().get<number>('nodeMemoryMB', 4096);
  const node = path.join(hbxRoot, 'plugins', 'node', 'node.exe');
  const pluginsDir = path.join(hbxRoot, 'plugins');
  const outDir = outputDirFor(projectDir, platform, appId);

  const env: { [key: string]: string } = {
    UNI_INPUT_DIR: projectDir,
    UNI_OUTPUT_DIR: outDir,
    UNI_PLATFORM: platform,
    NODE_ENV: isProd ? 'production' : 'development',
    UNI_HBUILDERX_PLUGINS: pluginsDir,
    NODE_SKIP_PLATFORM_CHECK: '1',
    NO_COLOR: '1'
  };
  const extra = cfg().get<Record<string, unknown>>('extraEnv') || {};
  for (const k of Object.keys(extra)) {
    env[k] = String(extra[k]);
  }

  let cwd: string;
  let entry: string;
  let args: string[];
  if (vueVersion === '3') {
    cwd = path.join(pluginsDir, 'uniapp-cli-vite');
    entry = path.join(cwd, 'node_modules', '@dcloudio', 'vite-plugin-uni', 'bin', 'uni.js');
    args = ['--max-old-space-size=' + mem, '--no-warnings', entry];
    if (isProd) {
      args.push('build');
    }
    args.push('-p', platform);
  } else {
    cwd = path.join(pluginsDir, 'uniapp-cli');
    entry = path.join(cwd, 'bin', 'uniapp-cli.js');
    args = ['--max-old-space-size=' + mem, '--no-warnings', entry];
  }

  return {
    program: node,
    args,
    cwd,
    entry,
    env: Object.assign({}, process.env, env) as { [key: string]: string },
    outDir
  };
}

function automatorDirOf(outDir: string): string {
  return path.join(path.dirname(outDir), '.automator');
}

function removeAutomator(outDir: string): void {
  const dir = automatorDirOf(outDir);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      out().appendLine('[HBX] 已删除 .automator: ' + dir);
    }
  } catch (e: any) {
    out().appendLine('[HBX] 删除 .automator 失败(' + dir + '): ' + e.message);
  }
}

function ensureCompileEntry(ctx: Ctx, spec: BuildSpec): boolean {
  if (fs.existsSync(spec.entry)) {
    return true;
  }
  vscode.window.showErrorMessage('未找到编译入口:' + spec.entry + '。请确认已安装对应 HBuilderX 插件(' + (ctx.vueVersion === '3' ? 'uniapp-cli-vite' : 'uniapp-cli') + ')。');
  return false;
}

function appendRunHeader(platform: string, friendlyName: string, ctx: Ctx, spec: BuildSpec): void {
  out().appendLine('');
  out().appendLine('========================================');
  out().appendLine('[HBX] ' + friendlyName + '  (' + (ctx.vueVersion === '3' ? 'vite/vue3' : 'webpack/vue2') + ')');
  out().appendLine('  平台      : ' + platform);
  out().appendLine('  模式      : ' + spec.env.NODE_ENV);
  out().appendLine('  项目目录  : ' + ctx.projectDir);
  out().appendLine('  输出目录  : ' + spec.outDir);
  out().appendLine('========================================');
}

// runBuild / runDebug 共享前导:解析上下文 -> 构建 spec -> 校验编译入口 -> 写表头
function prepare(platform: string, mode: string, friendlyName: string): { ctx: Ctx; spec: BuildSpec } | null {
  const ctx = resolveContext(false);
  if (!ctx) {
    return null;
  }
  const spec = buildSpec(platform, mode, ctx);
  if (!ensureCompileEntry(ctx, spec)) {
    return null;
  }
  appendRunHeader(platform, friendlyName, ctx, spec);
  return { ctx, spec };
}

// ---------- 命令:发行构建(带进度) ----------

export function runBuild(platform: string, mode: string, friendlyName: string): void {
  const prep = prepare(platform, mode, friendlyName);
  if (!prep) {
    return;
  }
  const { spec } = prep;
  out().show(true);

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: friendlyName,
    cancellable: true
  }, (progress, token) => {
    return new Promise<void>((resolve) => {
      progress.report({ message: '正在启动编译...' });
      postStatus(friendlyName + '\n正在启动编译...');
      const child = spawn(spec.program, spec.args, { cwd: spec.cwd, env: spec.env, windowsHide: true });

      token.onCancellationRequested(() => {
        try {
          child.kill();
        } catch (e) { /* ignore */ }
        out().appendLine('[HBX] 已取消打包');
      });

      const onData = (d: Buffer) => {
        const text = d.toString();
        out().append(text);
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length) {
          // 进度气泡有长度限制需截断;侧栏 #status 可完整换行显示,传完整文本
          const lastLine = lines[lines.length - 1].trim();
          const short = lastLine.length > 50 ? lastLine.slice(0, 50) + '...' : lastLine;
          progress.report({ message: short });
          postStatus(friendlyName + '\n' + lastLine);
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);

      child.on('error', (err) => {
        out().appendLine('[HBX] 启动失败: ' + err.message);
        postStatus('启动编译失败: ' + err.message);
        vscode.window.showErrorMessage('启动编译失败: ' + err.message);
        resolve();
      });
      child.on('close', (code) => {
        out().appendLine('');
        out().appendLine('[HBX] 进程结束,code=' + code);
        removeAutomator(spec.outDir);
        if (code === 0) {
          out().appendLine('[HBX] 完成 -> ' + spec.outDir);
          progress.report({ message: '完成' });
          postStatus(friendlyName + '\n完成:' + spec.outDir);
          vscode.window.showInformationMessage(friendlyName + ' 完成:' + spec.outDir);
        } else {
          postStatus(friendlyName + '\n失败(code ' + code + '),详见输出面板');
          vscode.window.showErrorMessage(friendlyName + ' 失败(code ' + code + '),详见「HBX uni-app 打包」输出面板。');
        }
        resolve();
      });
    });
  });
}

function debugArgsOf(spec: BuildSpec): { runtimeArgs: string[]; args: string[] } {
  const entryIndex = spec.args.indexOf(spec.entry);
  if (entryIndex === -1) {
    return { runtimeArgs: [], args: spec.args };
  }
  return {
    runtimeArgs: spec.args.slice(0, entryIndex),
    args: spec.args.slice(entryIndex + 1)
  };
}

export async function runDebug(platform: string, friendlyName: string): Promise<void> {
  const prep = prepare(platform, 'development', friendlyName);
  if (!prep) {
    return;
  }
  const { ctx, spec } = prep;

  const debugArgs = debugArgsOf(spec);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ctx.projectDir));
  const debugConfig: vscode.DebugConfiguration = {
    type: 'node',
    request: 'launch',
    name: friendlyName,
    runtimeExecutable: spec.program,
    runtimeArgs: debugArgs.runtimeArgs,
    program: spec.entry,
    args: debugArgs.args,
    cwd: spec.cwd,
    env: spec.env,
    console: 'integratedTerminal',
    internalConsoleOptions: 'neverOpen',
    outputCapture: 'std',
    skipFiles: ['<node_internals>/**']
  };

  postStatus(friendlyName + '\n正在启动 VS Code 调试终端...');
  try {
    const started = await vscode.debug.startDebugging(workspaceFolder, debugConfig);
    if (started) {
      out().appendLine('[HBX] 已启动 VS Code 调试: ' + friendlyName);
      postStatus(friendlyName + '\n调试已启动,请在终端查看 H5 服务地址');
    } else {
      out().appendLine('[HBX] VS Code 调试启动被取消或失败');
      postStatus(friendlyName + '\n调试启动失败或已取消');
      vscode.window.showErrorMessage(friendlyName + ' 启动失败,请查看调试面板。');
    }
  } catch (e: any) {
    out().appendLine('[HBX] VS Code 调试启动异常: ' + e.message);
    postStatus(friendlyName + '\n调试启动异常:' + e.message);
    vscode.window.showErrorMessage(friendlyName + ' 启动异常:' + e.message);
  }
}
