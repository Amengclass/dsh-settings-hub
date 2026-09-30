# Changelog

All notable changes to this project are documented in this file.

## 0.1.3

### Fixed

- **桌面端（DeepSeek Harness 桌面应用）无法使用本插件** —— 插件加载成功但渲染崩溃，设置面板被 ErrorBoundary 接住，表现为「扩展设置项」不出现。三处根因：
  - `index.js` 把 profile 目录硬编码为 `~/.dsh/profiles/web`，而桌面端使用独立的 `~/.dsh/profiles/desktop`，导致读到错误的插件依赖表、分组归属全部算错。改为从插件自身位置向上查找 `dsh-profile-*` 命名的 profile 根目录，两种 profile 自动各认各的。
  - `ctx.slots.hostFace()` 由 `@deepseek-ai/dsh-client-runtime` 提供，而桌面端使用的 DSH 0.2.x 已不再携带该包（功能迁移至 `@deepseek-ai/dsh-client-ui-renderer`），调用返回 `undefined` 后读取属性抛错。改为拿不到时降级为空 kit，不影响不依赖宿主数据面的设置项渲染。
  - DSH 0.2.x 将图标导出名从「像素尺寸」改为「视觉权重」（`IconSettingsOutline16` → `IconSettingsOutlineMedium` / `Regular` / `Artwork`），旧名不存在，传入 `undefined` 触发 React error #130。新增带 fallback 的图标查找，同时兼容 0.1.x 与 0.2.x 两套命名。

### Changed

- `package.json` 的 `inject` 移除 `@deepseek-ai/dsh-client-runtime`（0.2.x 中已不存在）。

## 0.1.2

### Fixed

- 设置面板初始化崩溃：provider profile 缺少 `"modules"` 注入声明，导致无法访问 `ctx.modules`，整个 `llm-pi-ai` 段挂载失败且日志无任何输出。
- 「扩展设置项」展开为空：改为从框架提供的 `ctx.modules.loadCache` 读取插件清单，不再依赖不存在的 `window.__DSH_MODULES__`。

## 0.1.1

### Added

- 首个公开版本：统一管理第三方插件设置项，支持自动发现、按父插件分组、拖拽排序。
