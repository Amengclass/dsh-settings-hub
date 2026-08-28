<div align="center">

# dsh-settings-hub

**统一管理 DeepSeek Harness 第三方插件设置项的插件**

[![Version](https://img.shields.io/github/v/release/Amengclass/dsh-settings-hub?color=blue&label=version)](https://github.com/Amengclass/dsh-settings-hub/releases)
[![Downloads](https://img.shields.io/github/downloads/Amengclass/dsh-settings-hub/total?color=green)](https://github.com/Amengclass/dsh-settings-hub/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-orange.svg)](https://github.com/deepseek-ai/dsh)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Amengclass/dsh-settings-hub/pulls)

[English](README_EN.md) | 中文 | [更新日志](CHANGELOG.md)

</div>

---

## Highlights

- **统一入口** — 所有第三方插件的设置项自动归入「扩展设置项」分组，不再散落在侧边栏各处
- **动态发现** — 新安装的插件自动出现，无需手动配置或修改代码
- **分组归属** — 按父插件自动分组，每个插件的子设置项聚合在一起
- **拖拽排序** — 支持拖拽调整分组和子项顺序，顺序持久化到 localStorage
- **幽灵拖拽** — 拖拽时原位置保持不变，半透明幽灵跟随鼠标，视觉反馈清晰
- **零侵入** — 不修改 DSH 源码，通过官方 shadow 机制接管 `sidebar.settings` 插槽

## 工作原理

```
┌─────────────────────────────────────────────┐
│              DeepSeek Harness               │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  原生设置项   │  │    扩展设置项 ▾      │ │
│  │  通用设置     │  │  ┌─ 插件分组 A ─────┐ │ │
│  │  模型        │  │  │  子项 1          │ │ │
│  │  插件        │  │  │  子项 2          │ │ │
│  │  Agent 预设  │  │  ├─ 插件分组 B ─────┤ │ │
│  │              │  │  │  子项 1          │ │ │
│  └──────────────┘  │  └──────────────────┘ │ │
│                    └──────────────────────┘ │
└─────────────────────────────────────────────┘
```

原生设置项（通用设置/模型/插件/Agent 预设）保持原样，第三方插件的设置项自动折叠到「扩展设置项」下。

## 快速开始

### 前置条件

- [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 已安装
- Node.js 18+

### 安装

```bash
dsh plugin --profile web add github:Amengclass/dsh-settings-hub
```

### 启动

```bash
dsh web
```

### 卸载

```bash
dsh plugin --profile web remove dsh-settings-hub
```

打开浏览器访问 `http://127.0.0.1:3080`，点击左下角「设置」即可看到效果。

## 配置

无需额外配置。安装后自动生效：

| 行为 | 说明 |
|------|------|
| 自动发现 | 扫描已安装插件，动态注册设置分组 |
| 拖拽排序 | 拖拽调整顺序，自动保存到 localStorage |
| 分组归属 | 根据 `node_modules` 依赖关系自动归属父插项 |

## FAQ

<details>
<summary>安装后看不到效果？</summary>

1. 确认插件已安装：`ls node_modules/dsh-settings-hub`
2. 重启 DSH：`dsh web`
3. 清除浏览器缓存后刷新
</details>

<details>
<summary>新安装的插件没有出现在设置里？</summary>

插件需要注册 `settings.section` 才会被发现。部分插件（如 dsh-vision-router）使用不同的设置注册机制，暂不支持。
</details>

<details>
<summary>拖拽排序不生效？</summary>

排序保存在浏览器 localStorage 中。清除浏览器数据后排序会重置为默认。
</details>

## 开发

```bash
# 克隆
git clone https://github.com/Amengclass/dsh-settings-hub.git
cd dsh-settings-hub

# 本地开发（链接到 DSH profile）
cd ~/.dsh/profiles/web
npm link /path/to/dsh-settings-hub

# 重启 DSH
dsh web
```

### 项目结构

```text
dsh-settings-hub/
├── index.js              # Node 端：HTTP API + 依赖扫描
├── lib/
│   └── client.js         # 浏览器端：设置面板 UI + 拖拽
├── cordis.patch.yml      # DSH bundle 层声明
├── package.json
└── README.md
```

## 贡献

欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 创建 Pull Request

## License

[MIT](LICENSE)
