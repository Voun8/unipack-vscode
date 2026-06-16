import * as vscode from 'vscode';
import { resolveContext, resolveAppPlatform } from './project';
import { BuildSpec, buildSpec, PACK_ACTIONS } from './build';

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
