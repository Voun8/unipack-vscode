import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

const TASK_TYPE = 'hbx-pack';
let out: vscode.OutputChannel;
let extensionPath: string;

interface Ctx {
  hbxRoot: string;
  projectDir: string;
  vueVersion: string;
}

interface BuildSpec {
  program: string;
  args: string[];
  cwd: string;
  entry: string;
  env: { [key: string]: string };
  outDir: string;
}

// ---------- 配置 / 环境探测 ----------

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('hbxPack');
}

function isValidHbxRoot(root: string): boolean {
  return !!root && fs.existsSync(path.join(root, 'plugins', 'node', 'node.exe'));
}

function detectHbxRoot(): string | null {
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

function detectProjectDir(): string | null {
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

function parseManifest(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch (e) {
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  }
}

function readManifest(projectDir: string): any {
  return parseManifest(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf8'));
}

function appIdOf(projectDir: string): string {
  try {
    const m = readManifest(projectDir);
    const id = m && (m.appid || m.id);
    if (id) {
      return String(id);
    }
  } catch (e) { /* ignore */ }
  return 'HBuilder';
}

function detectVueVersion(projectDir: string): string {
  const forced = cfg().get<string>('vueVersion');
  if (forced === '2' || forced === '3') {
    return forced;
  }
  try {
    const m = readManifest(projectDir);
    const v = m && m.vueVersion != null ? String(m.vueVersion).trim() : '';
    return v === '3' ? '3' : '2';
  } catch (e) {
    return '2';
  }
}

function resolveAppPlatform(vueVersion: string): string {
  const v = (cfg().get<string>('appPlatformName') || 'auto').trim();
  if (v && v !== 'auto') {
    return v;
  }
  return vueVersion === '3' ? 'app' : 'app-plus';
}

function outputDirFor(projectDir: string, platform: string): string {
  if (platform === 'app' || platform === 'app-plus') {
    return path.join(projectDir, 'dist', 'app', appIdOf(projectDir), 'www');
  }
  return path.join(projectDir, 'dist', platform);
}

function resolveContext(quiet: boolean): Ctx | null {
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
  return { hbxRoot, projectDir, vueVersion: detectVueVersion(projectDir) };
}

// ---------- 编译命令构造 ----------

function buildSpec(platform: string, mode: string, ctx: Ctx): BuildSpec {
  const { hbxRoot, projectDir, vueVersion } = ctx;
  const isProd = mode !== 'development';
  const mem = Number(cfg().get('nodeMemoryMB')) || 4096;
  const node = path.join(hbxRoot, 'plugins', 'node', 'node.exe');
  const pluginsDir = path.join(hbxRoot, 'plugins');
  const outDir = outputDirFor(projectDir, platform);

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
      out.appendLine('[HBX] 已删除 .automator: ' + dir);
    }
  } catch (e: any) {
    out.appendLine('[HBX] 删除 .automator 失败(' + dir + '): ' + e.message);
  }
}

function workspaceScopeOf(projectDir: string): vscode.WorkspaceFolder | vscode.TaskScope {
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectDir)) || vscode.TaskScope.Workspace;
}

function makeTask(name: string, platform: string, mode: string, spec: BuildSpec, scope: vscode.WorkspaceFolder | vscode.TaskScope): vscode.Task {
  const definition: vscode.TaskDefinition = { type: TASK_TYPE, platform, mode: mode !== 'development' ? 'production' : 'development' };
  const execution = new vscode.ProcessExecution(spec.program, spec.args, { cwd: spec.cwd, env: spec.env });
  const task = new vscode.Task(definition, scope || vscode.TaskScope.Workspace, name, 'hbx', execution);
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
  return task;
}

function ensureCompileEntry(ctx: Ctx, spec: BuildSpec): boolean {
  if (fs.existsSync(spec.entry)) {
    return true;
  }
  vscode.window.showErrorMessage('未找到编译入口:' + spec.entry + '。请确认已安装对应 HBuilderX 插件(' + (ctx.vueVersion === '3' ? 'uniapp-cli-vite' : 'uniapp-cli') + ')。');
  return false;
}

function appendRunHeader(platform: string, friendlyName: string, ctx: Ctx, spec: BuildSpec): void {
  out.appendLine('');
  out.appendLine('========================================');
  out.appendLine('[HBX] ' + friendlyName + '  (' + (ctx.vueVersion === '3' ? 'vite/vue3' : 'webpack/vue2') + ')');
  out.appendLine('  平台      : ' + platform);
  out.appendLine('  模式      : ' + spec.env.NODE_ENV);
  out.appendLine('  项目目录  : ' + ctx.projectDir);
  out.appendLine('  输出目录  : ' + spec.outDir);
  out.appendLine('========================================');
}

// ---------- 命令:发行构建(带进度) ----------

function runBuild(platform: string, mode: string, friendlyName: string): void {
  const ctx = resolveContext(false);
  if (!ctx) {
    return;
  }

  const spec = buildSpec(platform, mode, ctx);
  if (!ensureCompileEntry(ctx, spec)) {
    return;
  }

  out.show(true);
  appendRunHeader(platform, friendlyName, ctx, spec);

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: friendlyName,
    cancellable: true
  }, (progress, token) => {
    return new Promise<void>((resolve) => {
      progress.report({ message: '正在启动编译...' });
      postStatus(friendlyName + '\n正在启动编译...');
      const child = spawn(spec.program, spec.args, { cwd: spec.cwd, env: spec.env });

      token.onCancellationRequested(() => {
        try {
          child.kill();
        } catch (e) { /* ignore */ }
        out.appendLine('[HBX] 已取消打包');
      });

      const onData = (d: Buffer) => {
        const text = d.toString();
        out.append(text);
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length) {
          let msg = lines[lines.length - 1].trim();
          if (msg.length > 50) {
            msg = msg.slice(0, 50) + '...';
          }
          progress.report({ message: msg });
          postStatus(friendlyName + '\n' + msg);
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);

      child.on('error', (err) => {
        out.appendLine('[HBX] 启动失败: ' + err.message);
        postStatus('启动编译失败: ' + err.message);
        vscode.window.showErrorMessage('启动编译失败: ' + err.message);
        resolve();
      });
      child.on('close', (code) => {
        out.appendLine('');
        out.appendLine('[HBX] 进程结束,code=' + code);
        removeAutomator(spec.outDir);
        if (code === 0) {
          out.appendLine('[HBX] 完成 -> ' + spec.outDir);
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

async function runDebug(platform: string, friendlyName: string): Promise<void> {
  const ctx = resolveContext(false);
  if (!ctx) {
    return;
  }

  const spec = buildSpec(platform, 'development', ctx);
  if (!ensureCompileEntry(ctx, spec)) {
    return;
  }

  appendRunHeader(platform, friendlyName, ctx, spec);

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
      out.appendLine('[HBX] 已启动 VS Code 调试: ' + friendlyName);
      postStatus(friendlyName + '\n调试已启动,请在终端查看 H5 服务地址');
    } else {
      out.appendLine('[HBX] VS Code 调试启动被取消或失败');
      postStatus(friendlyName + '\n调试启动失败或已取消');
      vscode.window.showErrorMessage(friendlyName + ' 启动失败,请查看调试面板。');
    }
  } catch (e: any) {
    out.appendLine('[HBX] VS Code 调试启动异常: ' + e.message);
    postStatus(friendlyName + '\n调试启动异常:' + e.message);
    vscode.window.showErrorMessage(friendlyName + ' 启动异常:' + e.message);
  }
}

const cmdBuildH5 = () => runBuild('h5', 'production', '打包 H5 / 网站(发行)');
const cmdServeH5 = () => runDebug('h5', '调试 H5(开发/热更)');
const cmdBuildMpWeixin = () => runBuild('mp-weixin', 'production', '打包 微信小程序(发行)');

function cmdBuildApp(): void {
  const ctx = resolveContext(false);
  if (!ctx) {
    return;
  }
  runBuild(resolveAppPlatform(ctx.vueVersion), 'production', '生成 App 本地打包资源(发行)');
}

async function cmdPackWgt(): Promise<void> {
  const ctx = resolveContext(false);
  if (!ctx) {
    return;
  }
  const { hbxRoot, projectDir, vueVersion } = ctx;

  const appPlatform = resolveAppPlatform(vueVersion);
  const appResDir = outputDirFor(projectDir, appPlatform);
  if (!fs.existsSync(appResDir)) {
    const pick = await vscode.window.showWarningMessage('未找到 App 资源目录,需先生成:' + appResDir, '先生成 App 资源', '取消');
    if (pick === '先生成 App 资源') {
      cmdBuildApp();
    }
    return;
  }

  const appId = appIdOf(projectDir);
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

  out.appendLine('[HBX] wgt 已生成:' + wgtPath);
  const action = await vscode.window.showInformationMessage('wgt 已生成:' + wgtPath, '打开所在文件夹');
  if (action) {
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(wgtPath));
  }
}

async function cmdMenu(): Promise<void> {
  const items = [
    { label: '打包 H5 / 网站(发行)', command: 'hbxPack.buildH5' },
    { label: '生成 App 本地打包资源(发行)', command: 'hbxPack.buildApp' },
    { label: '打包 wgt(基于 App 资源)', command: 'hbxPack.packWgt' },
    { label: '打包 微信小程序(发行)', command: 'hbxPack.buildMpWeixin' },
    { label: '调试 H5(开发/热更)', command: 'hbxPack.serveH5' },
    { label: '环境诊断', command: 'hbxPack.diagnose' }
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'HBuilderX uni-app 打包' });
  if (pick) {
    vscode.commands.executeCommand(pick.command);
  }
}

function cmdShowOutput(): void {
  out.show(true);
}

function cmdDiagnose(): void {
  out.show(true);
  out.appendLine('');
  out.appendLine('===== 环境诊断 =====');
  const hbxRoot = detectHbxRoot();
  out.appendLine('HBuilderX 目录 : ' + (hbxRoot || '未找到(请在侧边栏配置 HBuilderX 路径)'));
  if (hbxRoot) {
    out.appendLine('内置 node     : ' + path.join(hbxRoot, 'plugins', 'node', 'node.exe'));
  }

  const projectDir = detectProjectDir();
  out.appendLine('项目目录      : ' + (projectDir || '未找到'));
  if (projectDir) {
    const hasManifest = fs.existsSync(path.join(projectDir, 'manifest.json'));
    out.appendLine('manifest.json : ' + (hasManifest ? '存在' : '缺失'));
    if (hasManifest) {
      const vueVersion = detectVueVersion(projectDir);
      const appPlatform = resolveAppPlatform(vueVersion);
      out.appendLine('vue 版本      : ' + vueVersion + ' -> ' + (vueVersion === '3' ? 'uniapp-cli-vite (vite)' : 'uniapp-cli (webpack)'));
      out.appendLine('appid         : ' + appIdOf(projectDir));
      out.appendLine('H5 输出目录   : ' + outputDirFor(projectDir, 'h5'));
      out.appendLine('App 资源目录  : ' + outputDirFor(projectDir, appPlatform));
      if (hbxRoot) {
        const entry = buildSpec('h5', 'production', { hbxRoot, projectDir, vueVersion }).entry;
        out.appendLine('编译入口      : ' + entry + '  (' + (fs.existsSync(entry) ? '存在' : '缺失!') + ')');
      }
    }
  }
  out.appendLine('====================');
}

// ---------- 命令:配置 ----------

function targetForWorkspace(): vscode.ConfigurationTarget {
  return (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length)
    ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

async function cmdSetHbxPath(): Promise<void> {
  const cur = cfg().get<string>('hbuilderxPath') || '';
  const v = await vscode.window.showInputBox({ prompt: 'HBuilderX 安装目录(需含 plugins\\node\\node.exe);留空则自动探测', value: cur, ignoreFocusOut: true });
  if (v === undefined) {
    return;
  }
  await cfg().update('hbuilderxPath', v.trim(), vscode.ConfigurationTarget.Global);
  postConfigToView();
}

async function cmdSetProjectDir(): Promise<void> {
  const cur = cfg().get<string>('projectDir') || '';
  const v = await vscode.window.showInputBox({ prompt: '项目根目录(含 manifest.json);留空则用当前工作区', value: cur, ignoreFocusOut: true });
  if (v === undefined) {
    return;
  }
  await cfg().update('projectDir', v.trim(), targetForWorkspace());
  postConfigToView();
}

async function cmdSetVueVersion(): Promise<void> {
  const pick = await vscode.window.showQuickPick(['auto', '2', '3'], { placeHolder: '选择 vue 版本(项目级);auto=读 manifest 自动判断' });
  if (!pick) {
    return;
  }
  await cfg().update('vueVersion', pick, targetForWorkspace());
  postConfigToView();
}

async function cmdSetAppPlatform(): Promise<void> {
  const cur = cfg().get<string>('appPlatformName') || 'auto';
  const v = await vscode.window.showInputBox({ prompt: 'App 平台标识:auto / app-plus / app', value: cur, ignoreFocusOut: true });
  if (v === undefined) {
    return;
  }
  await cfg().update('appPlatformName', v.trim() || 'auto', targetForWorkspace());
  postConfigToView();
}

// ---------- 侧边栏 Webview(HTML 界面) ----------

let sidebarView: vscode.WebviewView | null = null;

function configValues() {
  const c = cfg();
  return {
    hbuilderxPath: c.get<string>('hbuilderxPath') || '',
    projectDir: c.get<string>('projectDir') || '',
    vueVersion: c.get<string>('vueVersion') || 'auto',
    appPlatformName: c.get<string>('appPlatformName') || 'auto'
  };
}

function postConfigToView(): void {
  if (sidebarView) {
    sidebarView.webview.postMessage({ type: 'config', values: configValues() });
  }
}

function postStatus(text: string): void {
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

const viewProvider: vscode.WebviewViewProvider = {
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

const taskProvider: vscode.TaskProvider = {
  provideTasks() {
    const ctx = resolveContext(true);
    if (!ctx) {
      return [];
    }
    const scope = workspaceScopeOf(ctx.projectDir);
    const app = resolveAppPlatform(ctx.vueVersion);
    const defs: Array<[string, string, string]> = [
      ['h5', 'production', '打包 H5 / 网站(发行)'],
      ['h5', 'development', '调试 H5(开发)'],
      [app, 'production', '生成 App 本地打包资源(发行)'],
      ['mp-weixin', 'production', '打包 微信小程序(发行)']
    ];
    return defs.map(d => makeTask(d[2], d[0], d[1], buildSpec(d[0], d[1], ctx), scope));
  },
  resolveTask(task) {
    const platform = task.definition && task.definition.platform;
    if (!platform) {
      return undefined;
    }
    const ctx = resolveContext(true);
    if (!ctx) {
      return undefined;
    }
    const mode = task.definition.mode || 'production';
    const spec = buildSpec(platform, mode, ctx);
    const execution = new vscode.ProcessExecution(spec.program, spec.args, { cwd: spec.cwd, env: spec.env });
    return new vscode.Task(task.definition, task.scope || workspaceScopeOf(ctx.projectDir), task.name || ('hbx ' + platform), 'hbx', execution);
  }
};

// ---------- 激活 ----------

export function activate(context: vscode.ExtensionContext) {
  out = vscode.window.createOutputChannel('HBX uni-app 打包');
  extensionPath = context.extensionPath;

  const register = (id: string, fn: (...args: any[]) => any) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  register('hbxPack.menu', cmdMenu);
  register('hbxPack.buildH5', cmdBuildH5);
  register('hbxPack.buildApp', cmdBuildApp);
  register('hbxPack.packWgt', cmdPackWgt);
  register('hbxPack.buildMpWeixin', cmdBuildMpWeixin);
  register('hbxPack.serveH5', cmdServeH5);
  register('hbxPack.diagnose', cmdDiagnose);
  register('hbxPack.showOutput', cmdShowOutput);
  register('hbxPack.setHbxPath', cmdSetHbxPath);
  register('hbxPack.setProjectDir', cmdSetProjectDir);
  register('hbxPack.setVueVersion', cmdSetVueVersion);
  register('hbxPack.setAppPlatform', cmdSetAppPlatform);
  register('hbxPack.refreshView', () => postConfigToView());

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('hbxPackView', viewProvider));
  context.subscriptions.push(vscode.tasks.registerTaskProvider(TASK_TYPE, taskProvider));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('hbxPack')) {
      postConfigToView();
    }
  }));
}

export function deactivate() {}
