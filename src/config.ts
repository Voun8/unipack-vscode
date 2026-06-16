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
    projectDir: c.get<string>('projectDir') || '',
    vueVersion: c.get<string>('vueVersion') || 'auto',
    appPlatformName: c.get<string>('appPlatformName') || 'auto'
  };
}
