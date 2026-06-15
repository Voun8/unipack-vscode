# UniPack VSCode

[![Release](https://img.shields.io/github/v/release/Voun8/unipack-vscode)](https://github.com/Voun8/unipack-vscode/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

不打开 HBuilderX，直接在 VSCode 里调用 HBuilderX **内置的编译器**打包 uni-app 项目。
自动识别 vue2（webpack / `uniapp-cli`）与 vue3（vite / `uniapp-cli-vite`）。

> 仅在 Windows + HBuilderX 正式版验证。绿色版 / 其他盘符请用配置项指定路径。

## 功能

| HBuilderX 菜单 | 本扩展命令 | 实质 |
|---|---|---|
| 发行 → 网站-PC Web / 手机 H5 | `HBX: Build H5 (release)` | `UNI_PLATFORM=h5` + `NODE_ENV=production` 编译 |
| 发行 → App 本地打包 → 生成本地打包 App 资源 | `HBX: Build App resources (release)` | `UNI_PLATFORM=app-plus`(vue2) / `app`(vue3) + `NODE_ENV=production` 编译 |
| App 资源 → 打 wgt | `HBX: Pack wgt` | 把 App 资源目录压成 `.wgt`（zip） |
| 运行 → 运行到浏览器 | `HBX: Debug H5 (dev)` | `NODE_ENV=development`，经 VS Code 调试终端启动（webpack 走 serve / vite 走 dev） |
| 发行 → 微信小程序 | `HBX: Build WeChat MiniProgram` | `UNI_PLATFORM=mp-weixin` 编译 |

另提供 `HBX: Diagnose`（环境诊断）、`HBX: Show Output`（输出面板）及一组配置命令。

## 安装

### 方式一：下载 vsix 安装（推荐）

从 [Releases](https://github.com/Voun8/unipack-vscode/releases) 下载 `unipack-vscode-<version>.vsix`，然后在 VSCode 扩展面板右上角 `...` → 「从 VSIX 安装」，或命令行：

```
code --install-extension unipack-vscode-0.1.0.vsix
```

### 方式二：源码 F5 调试（开发期）

1. 用 VSCode 打开本仓库目录。
2. `npm install`，按 `F5`（Run Extension），弹出「扩展开发宿主」窗口。
3. 在新窗口里打开你的 uni-app 项目，执行命令即可。

## 使用

三种触发入口：

- **侧边栏**：活动栏 `HBX Pack`，直接点击打包、调试、诊断入口。
- **命令面板**：`Ctrl+Shift+P` → 输入 `HBX`，选择对应命令。
- **任务 / 调试**：`Ctrl+Shift+P` → `Run Task` → `hbx`，或在 `tasks.json` 引用。

扩展注册了任务类型 `hbx-pack`，可在项目的 `.vscode/tasks.json` 中：

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    { "type": "hbx-pack", "platform": "h5",       "mode": "production",  "label": "打包H5" },
    { "type": "hbx-pack", "platform": "app-plus", "mode": "production",  "label": "生成App资源" },
    { "type": "hbx-pack", "platform": "h5",       "mode": "development", "label": "调试H5" }
  ]
}
```

之后 `Ctrl+Shift+B` 选任务即可；也可在 `launch.json` 用 `preLaunchTask` 引用，实现「调试前自动打包」。

## 配置项（settings.json）

| 配置 | 默认 | 说明 |
|---|---|---|
| `hbxPack.hbuilderxPath` | 空 | HBuilderX 安装目录；留空自动探测常见路径 |
| `hbxPack.projectDir` | 空 | 项目根目录；留空用当前工作区 |
| `hbxPack.vueVersion` | `auto` | `auto` / `2` / `3`，强制编译器 |
| `hbxPack.appPlatformName` | `auto` | App 平台标识，auto 按 vue 版本取 `app-plus` / `app` |
| `hbxPack.nodeMemoryMB` | `4096` | 编译进程内存上限（MB） |
| `hbxPack.extraEnv` | `{}` | 追加 / 覆盖编译环境变量 |

## 原理

HBuilderX 的「发行 / 打包」本质是用内置 node 跑 uni-app CLI，GUI 只是壳。本扩展完全复刻其调用方式：

- node 可执行：`<HBuilderX>/plugins/node/node.exe`
- vue2 入口：`<HBuilderX>/plugins/uniapp-cli/bin/uniapp-cli.js`（cwd 设为该插件目录）
- vue3 入口：`<HBuilderX>/plugins/uniapp-cli-vite/node_modules/@dcloudio/vite-plugin-uni/bin/uni.js`
- 通过环境变量驱动：`UNI_INPUT_DIR`（源码）、`UNI_OUTPUT_DIR`（产物）、`UNI_PLATFORM`、`NODE_ENV`、`UNI_HBUILDERX_PLUGINS`

### 产物位置（相对项目根）

| 类型 | 路径 |
|---|---|
| H5（发行 / 开发） | `dist/h5` |
| App 本地打包资源 | `dist/app/<appid>/www` |
| 微信小程序 | `dist/mp-weixin` |
| wgt | `dist/wgt/<appid>.wgt` |

`dist/app/<appid>/www` 即离线打包 SDK（Android Studio / Xcode）所需的 `www` 资源。

## 开发

```
npm install      # 安装依赖
npm run watch    # 监听编译；或直接按 F5 起「扩展开发宿主」
npm run lint     # eslint
npm test         # vscode-test
```

源码入口 `src/extension.ts`，编译产物输出到 `out/`（已在 `.gitignore` / `.vscodeignore` 中忽略）。

## 发布

```
npm install -g @vscode/vsce
vsce package                 # 生成 unipack-vscode-<version>.vsix
vsce publish                 # 需先 vsce login <publisher>
```

## 排错

- 先跑 `HBX: Diagnose`，确认 HBuilderX 目录、项目目录、vue 版本、编译入口是否都 OK。
- 找不到 HBuilderX：配置 `hbxPack.hbuilderxPath`。
- 编译报缺依赖：确认对应插件（`uniapp-cli` / `uniapp-cli-vite`）已在 HBuilderX 中安装（打开过对应类型项目即会安装）。

## 已知边界

- 仅做「编译 / 生成资源 / 打 wgt」。**云打包、生成 apk/ipa 安装包**需 DCloud 云端或离线 SDK，本扩展不涉及。
- 仅在 Windows + HBuilderX 正式版验证路径。

## License

[MIT](./LICENSE) © morty
