# Change Log

本扩展的所有重要变更都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
