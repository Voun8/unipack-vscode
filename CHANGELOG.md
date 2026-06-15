# Change Log

本扩展的所有重要变更都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-06-15

### 新增

- 首个发布版本：在 VSCode 侧边栏直接调用 HBuilderX 内置编译器打包 uni-app，无需打开 HBuilderX。
- 打包 H5 / 网站（发行）、生成 App 本地打包资源（发行）、打包 wgt（基于 App 资源）、微信小程序（发行）。
- H5 调试（开发 / 热更），通过 VS Code 调试终端启动。
- 自动识别 vue2（webpack / `uniapp-cli`）与 vue3（vite / `uniapp-cli-vite`）。
- 环境诊断命令，以及 HBuilderX 路径、项目目录、Vue 版本、App 平台等配置项。
- 注册 `hbx-pack` 任务类型，可在 `tasks.json` / `launch.json` 中引用。
