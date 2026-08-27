#!/usr/bin/env node
/**
 * build-dep-map.js — Auto-generate DEP_MAP for dsh-settings-hub.
 *
 * Reads the dsh profile's package.json + node_modules to build a
 * dependency tree for each installed plugin. Outputs a JavaScript
 * constant (DEP_MAP) that maps sub-dependency names to their parent
 * installed plugin. Injects it into client.js between markers.
 *
 * Usage: node build-dep-map.js [profile-dir] [client-js-path]
 */
const fs = require('fs');
const path = require('path');

const profileDir = process.argv[2] || path.join(
  require('os').homedir(), '.dsh', 'profiles', 'web'
);
const clientJsPath = process.argv[3] || path.join(__dirname, '..', 'lib', 'client.js');

const START_MARKER = '// __DEP_MAP_START__';
const END_MARKER = '// __DEP_MAP_END__';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function collectDeps(pkgName, visited, nodeModulesDir) {
  if (visited.has(pkgName)) return;
  visited.add(pkgName);

  const pkgJsonPath = path.join(nodeModulesDir, pkgName, 'package.json');
  const pkg = readJson(pkgJsonPath);
  if (!pkg || !pkg.dependencies) return;

  for (const dep of Object.keys(pkg.dependencies)) {
    collectDeps(dep, visited, nodeModulesDir);
  }
}

function buildDepMap() {
  const profilePkg = readJson(path.join(profileDir, 'package.json'));
  if (!profilePkg || !profilePkg.dependencies) {
    console.error('Cannot read profile package.json');
    process.exit(1);
  }

  const installedPlugins = Object.keys(profilePkg.dependencies);
  const nodeModulesDir = path.join(profileDir, 'node_modules');
  const depMap = {};

  for (const plugin of installedPlugins) {
    const visited = new Set();
    collectDeps(plugin, visited, nodeModulesDir);

    for (const dep of visited) {
      if (dep === plugin) continue; // skip self
      if (!depMap[dep]) depMap[dep] = plugin;
    }
  }

  return { installedPlugins, depMap };
}

function generateCode(installedPlugins, depMap) {
  const pluginLines = installedPlugins
    .map(p => `\t\t\t"${p}",`)
    .join('\n');

  const depLines = Object.entries(depMap)
    .map(([dep, parent]) => `\t\t\t"${dep}": "${parent}",`)
    .join('\n');

  return `
${START_MARKER}
\t\tconst INSTALLED_PLUGINS = [
${pluginLines}
\t\t];

\t\tconst DEP_MAP = {
${depLines}
\t\t};
${END_MARKER}
`;
}

function injectIntoClient(installedPlugins, depMap) {
  let clientCode = fs.readFileSync(clientJsPath, 'utf-8');
  const newCode = generateCode(installedPlugins, depMap);

  const startIdx = clientCode.indexOf(START_MARKER);
  const endIdx = clientCode.indexOf(END_MARKER);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    clientCode = clientCode.slice(0, startIdx) + newCode.trimEnd() + clientCode.slice(endIdx + END_MARKER.length);
  } else {
    // First time: insert before the closing `},` of buildParentMap's return
    const insertAfter = 'const INSTALLED_PLUGINS = [';
    const idx = clientCode.indexOf(insertAfter);
    if (idx === -1) {
      console.error('Cannot find INSTALLED_PLUGINS in client.js — has the structure changed?');
      process.exit(1);
    }
    // Find the start of INSTALLED_PLUGINS block
    const blockStart = clientCode.lastIndexOf('\n', idx);
    clientCode = clientCode.slice(0, blockStart) + '\n' + newCode + clientCode.slice(idx);
  }

  fs.writeFileSync(clientJsPath, clientCode, 'utf-8');
}

// --- Main ---
const { installedPlugins, depMap } = buildDepMap();

console.log(`Found ${installedPlugins.length} installed plugins:`);
installedPlugins.forEach(p => console.log(`  - ${p}`));
console.log(`Mapped ${Object.keys(depMap).length} sub-dependencies.`);

injectIntoClient(installedPlugins, depMap);
console.log(`DEP_MAP injected into ${clientJsPath}`);
