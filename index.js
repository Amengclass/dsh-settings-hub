/**
 * dsh-settings-hub — node half.
 *
 * Registers a lightweight HTTP endpoint that reads the profile's
 * package.json + node_modules to build a dependency tree for every
 * installed plugin. The browser half fetches this endpoint on startup
 * to dynamically group third-party settings sections by parent plugin.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const name = "dsh-settings-hub";
export const inject = ["webServer"];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function collectDeps(pkgName, visited, nodeModulesDir) {
  if (visited.has(pkgName)) return;
  visited.add(pkgName);
  const pkgJsonPath = path.join(nodeModulesDir, pkgName, "package.json");
  const pkg = readJson(pkgJsonPath);
  if (!pkg || !pkg.dependencies) return;
  for (const dep of Object.keys(pkg.dependencies)) {
    collectDeps(dep, visited, nodeModulesDir);
  }
}

function buildDepMap(profileDir) {
  const profilePkg = readJson(path.join(profileDir, "package.json"));
  if (!profilePkg || !profilePkg.dependencies) {
    return { installedPlugins: [], depMap: {} };
  }
  const installedPlugins = Object.keys(profilePkg.dependencies);
  const nodeModulesDir = path.join(profileDir, "node_modules");
  const depMap = {};
  for (const plugin of installedPlugins) {
    const visited = new Set();
    collectDeps(plugin, visited, nodeModulesDir);
    for (const dep of visited) {
      if (dep === plugin) continue;
      if (!depMap[dep]) depMap[dep] = plugin;
    }
  }
  return { installedPlugins, depMap };
}

function resolveProfileDir() {
  return path.join(os.homedir(), ".dsh", "profiles", "web");
}

function writeJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

export function apply(ctx, config) {
  ctx.inject(["webServer"], (hostCtx) => {
    hostCtx.effect(() => {
      const route = hostCtx.webServer.register({
        kind: "exact",
        path: "/api/dsh-settings-hub/deps",
        handler: (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405);
            res.end("method not allowed");
            return;
          }
          const profileDir = config?.profileDirectory ?? resolveProfileDir();
          const result = buildDepMap(profileDir);
          writeJson(res, 200, result);
        },
      });
      return () => route();
    }, "dsh-settings-hub: deps api");
  });
}
