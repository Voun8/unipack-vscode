import * as vscode from 'vscode';
import { resolveContext, resolveAppPlatform } from './project';
import { BuildSpec, buildSpec, prepare, PACK_ACTIONS } from './build';
import { out } from './output';
import { postStatus } from './sidebar';

export const TASK_TYPE = 'hbx-pack';

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

// 「调试 H5」本质是起 dev server,页面调试在浏览器进行,无需挂 Node 调试器;
// 经任务终端启动:环境变量直接传给子进程,终端不会逐条回显,也没有调试器注入的 NODE_OPTIONS 等变量
export async function runDebug(platform: string, friendlyName: string): Promise<void> {
  const prep = prepare(platform, 'development', friendlyName);
  if (!prep) {
    return;
  }
  const { ctx, spec } = prep;
  try {
    await vscode.tasks.executeTask(makeTask(friendlyName, platform, 'development', spec, workspaceScopeOf(ctx.projectDir)));
    out().appendLine('[HBX] 已在任务终端启动: ' + friendlyName);
    postStatus(friendlyName + '\n已在任务终端启动,请在终端查看 H5 服务地址');
  } catch (e: any) {
    out().appendLine('[HBX] 任务启动失败: ' + e.message);
    postStatus(friendlyName + '\n启动失败:' + e.message);
    vscode.window.showErrorMessage(friendlyName + ' 启动失败:' + e.message);
  }
}

export const taskProvider: vscode.TaskProvider = {
  provideTasks() {
    const ctx = resolveContext(true);
    if (!ctx) {
      return [];
    }
    const scope = workspaceScopeOf(ctx.projectDir);
    return PACK_ACTIONS.map(a => {
      const platform = a.kind === 'app' ? resolveAppPlatform(ctx.vueVersion) : a.platform;
      return makeTask(a.label, platform, a.mode, buildSpec(platform, a.mode, ctx), scope);
    });
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
    const spec = buildSpec(platform, task.definition.mode, ctx);
    const execution = new vscode.ProcessExecution(spec.program, spec.args, { cwd: spec.cwd, env: spec.env });
    return new vscode.Task(task.definition, task.scope || workspaceScopeOf(ctx.projectDir), task.name || ('hbx ' + platform), 'hbx', execution);
  }
};
