<div align="center">

# dsh-settings-hub

**Unify third-party plugin settings in DeepSeek Harness**

[![npm version](https://img.shields.io/npm/v/dsh-settings-hub?color=blue&label=npm)](https://www.npmjs.com/package/dsh-settings-hub)
[![npm downloads](https://img.shields.io/npm/dm/dsh-settings-hub?color=green&label=npm%20downloads)](https://www.npmjs.com/package/dsh-settings-hub)
[![GitHub release](https://img.shields.io/github/v/release/Amengclass/dsh-settings-hub?color=blue&label=GitHub)](https://github.com/Amengclass/dsh-settings-hub/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-orange.svg)](https://github.com/deepseek-ai/dsh)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Amengclass/dsh-settings-hub/pulls)

English | [中文](README.md) | [Changelog](CHANGELOG.md)

</div>

---

## Highlights

- **Unified entry** — All third-party plugin settings automatically grouped under "扩展设置项", no more scattered across the sidebar
- **Auto-discovery** — Newly installed plugins appear automatically, no manual config needed
- **Group by parent** — Sub-settings grouped by their parent plugin via dependency analysis
- **Drag reorder** — Drag to reorder groups and items, order persisted to localStorage
- **Ghost drag** — Original item stays in place while a semi-transparent ghost follows the cursor
- **Zero intrusion** — No DSH source modifications; uses the official shadow mechanism on `sidebar.settings`

## How it works

```
┌─────────────────────────────────────────────┐
│              DeepSeek Harness               │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Native       │  │  扩展设置项 ▾        │ │
│  │  通用设置     │  │  ┌─ Plugin Group A ─┐│ │
│  │  模型        │  │  │  Sub-item 1      ││ │
│  │  插件        │  │  │  Sub-item 2      ││ │
│  │  Agent 预设  │  │  ├─ Plugin Group B ─┤│ │
│  │              │  │  │  Sub-item 1      ││ │
│  └──────────────┘  │  └──────────────────┘│ │
│                    └──────────────────────┘ │
└─────────────────────────────────────────────┘
```

Native settings (General/Models/Plugins/Agent Presets) stay untouched. Third-party plugin settings auto-collapse under "扩展设置项".

## Quick Start

### Prerequisites

- [DeepSeek Harness](https://github.com/deepseek-ai/dsh) installed
- Node.js 18+

### Install

**Option1: npm (recommended)**

```bash
dsh plugin --profile web add dsh-settings-hub
```

Update:

```bash
dsh plugin --profile web update dsh-settings-hub@latest
```

**Option 2: GitHub**

```bash
dsh plugin --profile web add github:Amengclass/dsh-settings-hub
```

**Option 3: From source**

```bash
git clone https://github.com/Amengclass/dsh-settings-hub.git
cd ~/.dsh/profiles/web
npm link /path/to/dsh-settings-hub
```

### Run

```bash
dsh web
```

### Uninstall

```bash
dsh plugin --profile web remove dsh-settings-hub
```

Open `http://127.0.0.1:3080` and click "设置" in the bottom-left corner.

## Configuration

No configuration needed. Works out of the box:

| Behavior | Description |
|----------|-------------|
| Auto-discovery | Scans installed plugins, dynamically registers settings groups |
| Drag reorder | Drag to adjust order, saved to localStorage |
| Group attribution | Auto-groups by `node_modules` dependency tree |

## FAQ

<details>
<summary>Settings not showing after install?</summary>

1. Verify: `ls node_modules/dsh-settings-hub`
2. Restart DSH: `dsh web`
3. Clear browser cache and refresh
</details>

<details>
<summary>Newly installed plugin not appearing?</summary>

Plugins must register `settings.section` to be discovered. Some plugins (e.g. dsh-vision-router) use alternative registration mechanisms and are not yet supported.
</details>

<details>
<summary>Blocked by pnpm minimumReleaseAge?</summary>

pnpm 11 blocks packages published within 24 hours by default. If you get an older version, add a whitelist entry in your profile's `pnpm-workspace.yaml`:

```yaml
minimumReleaseAgeExclude:
  - dsh-settings-hub
```

Then reinstall.
</details>

## Development

```bash
git clone https://github.com/Amengclass/dsh-settings-hub.git
cd dsh-settings-hub

cd ~/.dsh/profiles/web
npm link /path/to/dsh-settings-hub

dsh web
```

### Project structure

```text
dsh-settings-hub/
├── index.js              # Node: HTTP API + dependency scanning
├── lib/
│   └── client.js         # Browser: settings UI + drag & drop
├── cordis.patch.yml      # DSH bundle layer declaration
├── package.json
└── README.md
```

## Contributing

Issues and PRs welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

## License

[MIT](LICENSE)
