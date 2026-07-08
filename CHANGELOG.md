# Change Log

本扩展的所有重要变更都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-07-08

### 新增

- 支持登记多个 HBuilderX 版本路径（`hbxPack.hbuilderxPaths`，全局级）：离线打包 SDK 与 HBuilderX 版本绑定、无法统一升级时，不同项目可各自选用版本。
  - `hbxPack.hbuilderxPath` 改为按项目（工作区）保存，表示本项目使用的版本；留空自动探测（先查版本列表，再查常见安装位置）。原全局配置仍可读到，向后兼容。
  - `HBX: Set HBuilderX Path` 命令改为版本选择器：从已登记列表选择 / 自动探测 / 添加新路径（校验含 `plugins\node\node.exe` 后登记）。
  - 侧边栏「HBuilderX 路径」输入框支持下拉选择已登记版本；保存时新的有效路径自动登记进全局列表。
  - 环境诊断输出已登记版本列表及各项有效性。

### 变更

- 调试 H5 改为经任务终端启动 dev server(原经 Node 调试器启动):终端不再逐条回显环境变量,也不再出现调试器注入的 `NODE_OPTIONS` / `VSCODE_INSPECTOR_OPTIONS` 与 `Debugger attached` 提示。页面调试本就在浏览器进行,不受影响。

## [0.1.1] - 2026-06-16

本次为缺陷修复 + 内部重构版本，对外行为保持不变（除下述修复）。

### 修复

- `manifest.json` 解析失败时不再静默退化为默认 appid / Vue 版本（原会导致输出目录、wgt 文件名、编译入口选错而静默打出错误包），改为明确报错并中止。

### 变更

- 内部重构（行为等价）：单文件 `extension.ts`（约 645 行）按职责拆分为 8 个模块（output / config / project / build / sidebar / tasks / commands / extension）。
- 命令、菜单、任务的平台 / 模式 / 文案收敛为单一声明源（`PACK_ACTIONS`），避免三处文案漂移。
- 打包子进程隐藏控制台窗口（`windowsHide`）；侧栏状态栏改为显示完整的最近一行编译输出。

## [0.1.0] - 2026-06-15

### 新增

- 首个发布版本：在 VSCode 侧边栏直接调用 HBuilderX 内置编译器打包 uni-app，无需打开 HBuilderX。
- 打包 H5 / 网站（发行）、生成 App 本地打包资源（发行）、打包 wgt（基于 App 资源）、微信小程序（发行）。
- H5 调试（开发 / 热更），通过 VS Code 调试终端启动。
- 自动识别 vue2（webpack / `uniapp-cli`）与 vue3（vite / `uniapp-cli-vite`）。
- 环境诊断命令，以及 HBuilderX 路径、项目目录、Vue 版本、App 平台等配置项。
- 注册 `hbx-pack` 任务类型，可在 `tasks.json` / `launch.json` 中引用。
