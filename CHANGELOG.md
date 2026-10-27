# Changelog

All notable changes to this project are documented in this file.

## 0.1.3

### Fixed

- **桌面端（DeepSeek Harness 桌面应用）无法使用本插件** —— 插件加载成功但渲染崩溃，设置面板被 ErrorBoundary 接住，表现为「扩展设置项」不出现。三处根因：
  - `index.js` 把 profile 目录硬编码为 `~/.dsh/profiles/web`，而桌面端使用独立的 `~/.dsh/profiles/desktop`，导致读到错误的插件依赖表、分组归属全部算错。改为从插件自身位置向上查找 `dsh-profile-*` 命名的 profile 根目录，两种 profile 自动各认各的。
  - `ctx.slots.hostFace()` 由 `@deepseek-ai/dsh-client-runtime` 提供，而桌面端使用的 DSH 0.2.x 已不再携带该包（功能迁移至 `@deepseek-ai/dsh-client-ui-renderer`），调用返回 `undefined` 后读取属性抛错。改为拿不到时降级为空 kit，不影响不依赖宿主数据面的设置项渲染。
  - DSH 0.2.x 将图标导出名从「像素尺寸」改为「视觉权重」（`IconSettingsOutline16` → `IconSettingsOutlineMedium` / `Regular` / `Artwork`），旧名不存在，传入 `undefined` 触发 React error #130。新增带 fallback 的图标查找，同时兼容 0.1.x 与 0.2.x 两套命名。

- **「扩展设置项」展开后只有分组标题、没有任何子项**（DSH 0.2.x）。分组原本靠正则从模块 `apply()` 源码里抓 `id:` 字面量来推测，而 0.2.x 把设置项注册移出了 `apply()`，抓到的多是别的插槽的 id（例如 `task-board`）；这些 id 在真实槽位里不存在，逐项查找时被 `.filter(Boolean)` 全部丢弃。
  - 改为以槽位里**实际存在的**条目为准，模块扫描只用于「归属到哪个插件」，绝不凭空生成 id。
  - 归属按强弱依次尝试：条目自带的 `registrant`（仅当它是像样的包名）→ 模块 `apply()` 内联了 `id: "<section>"` → 模块 `apply()` 中出现该 id 字面量 → 按 token 前缀匹配模块 id（`archived-sessions` ↔ `dsh-session-archive`）。
  - 仍未归属的条目放入「其他插件」兜底组，**不再静默消失**——用户装了的设置项必须能被找到。
  - 槽位内容变化时（插件晚于首次渲染加载）会重新扫描。

### Changed

- `package.json` 的 `inject` 移除 `@deepseek-ai/dsh-client-runtime`（0.2.x 中已不存在）。

## 0.1.2

### Fixed

- 设置面板初始化崩溃：provider profile 缺少 `"modules"` 注入声明，导致无法访问 `ctx.modules`，整个 `llm-pi-ai` 段挂载失败且日志无任何输出。
- 「扩展设置项」展开为空：改为从框架提供的 `ctx.modules.loadCache` 读取插件清单，不再依赖不存在的 `window.__DSH_MODULES__`。

## 0.1.1

### Added

- 首个公开版本：统一管理第三方插件设置项，支持自动发现、按父插件分组、拖拽排序。
