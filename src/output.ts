import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

// 惰性单例:首次访问时创建,activate 里 push 进 subscriptions 由宿主统一回收
export function out(): vscode.OutputChannel {
  return channel ??= vscode.window.createOutputChannel('HBX uni-app 打包');
}
