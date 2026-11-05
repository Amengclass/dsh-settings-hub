// verify.mjs — @aico/settings-hub 收录前自检
// 只用 Node 内置模块，不碰 DSH 运行时。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

// 本文件位于 script/，仓库根目录是它的上一级
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass, detail });

// ── 1. package.json 形状 ──
const pkg = JSON.parse(read("package.json"));
ok("name 以 @aico/ 开头", /^@aico\/[a-z0-9-]+$/.test(pkg.name), pkg.name);
ok("type: module", pkg.type === "module");
ok("main 指向入口", pkg.main === "index.js");
ok("exports 暴露 ./client", pkg.exports && pkg.exports["./client"] === "./modules/client.js");
ok("engines.dsh 已声明", !!(pkg.engines && pkg.engines.dsh), pkg.engines?.dsh ?? "缺失");
ok("零运行时 dependencies", !pkg.dependencies || Object.keys(pkg.dependencies).length === 0,
  pkg.dependencies ? JSON.stringify(pkg.dependencies) : "无");
ok("dsh.bundle.patch", pkg.dsh?.bundle?.patch === "./cordis.patch.yml");
ok("dsh.client 声明", pkg.dsh?.client?.platform === "web" && Array.isArray(pkg.dsh.client.inject),
  (pkg.dsh?.client?.inject ?? []).join(", "));
ok("files 覆盖必要文件", ["index.js", "modules", "locale", "assets", "cordis.patch.yml", "README.md", "LICENSE"]
  .every((f) => (pkg.files ?? []).includes(f)), (pkg.files ?? []).join(", "));
ok("README 引用的本地资源都在 files 里", (() => {
  const refs = ["README.md", "README_EN.md"].flatMap((f) => [...read(f).matchAll(/\((assets\/[^)]+)\)/g)].map((m) => m[1].split("/")[0]));
  return refs.length === 0 || (pkg.files ?? []).includes("assets");
})(), "assets");
ok("无 prepare/install 脚本", !pkg.scripts?.prepare && !pkg.scripts?.install);

// ── 2. 三处一致 ──
const patch = read("cordis.patch.yml");
const patchName = (patch.match(/^\s*name:\s*'?"?([^'"\s]+)'?"?/m) ?? [])[1];
// id 行形如 "    - id: '@aico/...'"，要允许前面的列表短横线
const patchId = (patch.match(/^\s*-\s*id:\s*'?"?([^'"\s]+)'?"?/m) ?? [])[1];
const clientSrc = read("modules/client.js");
const clientId = (clientSrc.match(/load\(\{\s*[\s\S]*?id:\s*["']([^"']+)["']/) ?? [])[1];
const indexSrc = read("index.js");
const indexName = (indexSrc.match(/export const name\s*=\s*["']([^"']+)["']/) ?? [])[1];
ok("三处一致（package / patch / client）",
  pkg.name === patchName && pkg.name === patchId && pkg.name === clientId,
  `pkg=${pkg.name} patch=${patchName}/${patchId} client=${clientId}`);
ok("node 半边 name 一致", indexName === pkg.name, indexName);

// ── 3. locale ──
const zh = JSON.parse(read("locale/zh.json"));
ok("locale/zh.json 有 meta.title/description", !!(zh.meta?.title && zh.meta?.description),
  `${zh.meta?.title} — ${zh.meta?.description}`);

// ── 4. 凭据零内置 ──
const badFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/^(\.npmrc|\.env|id_rsa|\.git-credentials)$/.test(e.name) || /\.(pem|key)$/.test(e.name)) badFiles.push(p);
  }
})(root);
ok("无凭据类文件", badFiles.length === 0, badFiles.join(", "));

const secretHits = [];
for (const f of ["index.js", "modules/client.js"]) {
  const s = read(f);
  if (/sk-[A-Za-z0-9]{16,}/.test(s) || /api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]{16,}["']/i.test(s)) secretHits.push(f);
}
ok("无硬编码密钥", secretHits.length === 0, secretHits.join(", "));

// ── 5. 客户端包挂载冒烟：伪造 __ModuleLoader__ 与 require ──
let registered = null;
const sandbox = {
  window: { __ModuleLoader__: { load: (spec) => { registered = spec; } } },
  console,
  setTimeout,
  clearTimeout,
};
const fakeReact = {
  Component: class Component {},
  createElement: () => ({}),
  Fragment: "Fragment",
  useState: (v) => [typeof v === "function" ? v() : v, () => {}],
  useEffect: () => {},
  useMemo: (f) => f(),
  useRef: (v) => ({ current: v }),
  useCallback: (f) => f,
};
const fakeRequire = (id) => {
  if (id === "react") return fakeReact;
  if (id === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}), Fragment: "Fragment" };
  // 宿主侧 UI 包：工厂里可能 class extends 其中某个导出，用 Proxy 兜底成可继承的类
  if (id.startsWith("@deepseek-ai/")) return new Proxy({}, { get: () => class HostExport {} });
  throw new Error("unexpected require: " + id);
};
try {
  vm.createContext(sandbox);
  vm.runInContext(clientSrc, sandbox, { filename: "modules/client.js" });
  ok("客户端脚本可执行并注册", !!registered, registered ? "id=" + registered.id : "未注册");
  ok("客户端注册 id 与包名一致", registered?.id === pkg.name, registered?.id ?? "无");
  const exported = registered?.factory ? registered.factory(fakeRequire) : null;
  ok("客户端 factory 返回模块", !!exported && typeof exported === "object",
    exported ? Object.keys(exported).join(", ") : "无导出");
  ok("客户端导出 apply", typeof exported?.apply === "function", typeof exported?.apply);
} catch (e) {
  ok("客户端脚本可执行并注册", false, String(e?.message ?? e));
}

// ── 6. node 半边可加载 ──
try {
  const mod = await import(pathToFileURL(path.join(root, "index.js")).href);
  ok("node 半边可 import", typeof mod.apply === "function", "apply=" + typeof mod.apply + " name=" + mod.name);
  ok("node 半边 name 与包名一致", mod.name === pkg.name, mod.name);
} catch (e) {
  ok("node 半边可 import", false, String(e?.message ?? e));
}

// ── 输出 ──
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  [" + r.detail + "]" : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
