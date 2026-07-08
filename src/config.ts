import * as vscode from 'vscode';

export function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('hbxPack');
}

export function targetForWorkspace(): vscode.ConfigurationTarget {
  return (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length)
    ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

export function configValues() {
  const c = cfg();
  return {
    hbuilderxPath: c.get<string>('hbuilderxPath') || '',
    hbuilderxPaths: c.get<string[]>('hbuilderxPaths') || [],
    projectDir: c.get<string>('projectDir') || '',
    vueVersion: c.get<string>('vueVersion') || 'auto',
    appPlatformName: c.get<string>('appPlatformName') || 'auto'
  };
}

// 去重登记进全局版本列表;有效性校验留在调用方(isValidHbxRoot 在 project.ts,反向引入会成环)
export async function addHbxPathToList(p: string): Promise<void> {
  const list = cfg().get<string[]>('hbuilderxPaths') || [];
  if (!p || list.includes(p)) {
    return;
  }
  await cfg().update('hbuilderxPaths', [...list, p], vscode.ConfigurationTarget.Global);
}
