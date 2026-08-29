#!/usr/bin/env node
/**
 * 版本 bump 機制（monorepo 統一版號）
 *
 * 用法：
 *   node scripts/bump-version.mjs patch|minor|major|<x.y.z>
 *   npm run version:patch | version:minor | version:major
 *
 * 行為：
 *  - 以「根 package.json 的 version」為單一版號來源，計算新版號
 *  - 將根與所有 workspace 套件（apps/*、packages/*）的 version 一併更新為新版號
 *  - 同步更新彼此互相引用的內部相依（@otc/* 等）版號，避免 npm 解析失敗
 *  - 於 CHANGELOG.md 依新版號 + 日期新增區段（把 [Unreleased] 內容歸檔到該版）
 *
 * 不會自動 git commit / tag：更新完成後印出建議指令，由使用者決定。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const arg = process.argv[2];

function usageExit() {
  console.error('用法：node scripts/bump-version.mjs patch|minor|major|<x.y.z>');
  process.exit(1);
}
if (!arg) usageExit();

function nextVersion(cur, kind) {
  const m = cur.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`目前版號非 x.y.z：${cur}`);
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `${a + 1}.0.0`;
  if (kind === 'minor') return `${a}.${b + 1}.0`;
  if (kind === 'patch') return `${a}.${b}.${c + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  usageExit();
}

const rootPkgPath = path.join(root, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const cur = rootPkg.version;
const next = nextVersion(cur, arg);

// 收集 workspace package.json
const globs = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : [];
const pkgPaths = [rootPkgPath];
for (const g of globs) {
  const base = g.replace(/\/\*$/, '');
  const dir = path.join(root, base);
  if (!fs.existsSync(dir)) continue;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const p = path.join(dir, d.name, 'package.json');
    if (fs.existsSync(p)) pkgPaths.push(p);
  }
}

const pkgs = pkgPaths.map((p) => ({ p, json: JSON.parse(fs.readFileSync(p, 'utf8')) }));
const wsNames = new Set(pkgs.map(({ json }) => json.name).filter(Boolean));

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
for (const { p, json } of pkgs) {
  json.version = next;
  for (const field of DEP_FIELDS) {
    if (!json[field]) continue;
    for (const dep of Object.keys(json[field])) {
      // 只同步「內部 workspace 套件」的版號（不動第三方相依）
      if (wsNames.has(dep) && /^\d+\.\d+\.\d+$/.test(json[field][dep])) {
        json[field][dep] = next;
      }
    }
  }
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
}

// 更新 CHANGELOG.md
const clPath = path.join(root, 'CHANGELOG.md');
const today = new Date().toISOString().slice(0, 10);
if (fs.existsSync(clPath)) {
  let cl = fs.readFileSync(clPath, 'utf8');
  const unreleasedRe = /## \[Unreleased\]\s*\n/;
  if (unreleasedRe.test(cl)) {
    cl = cl.replace(unreleasedRe, `## [Unreleased]\n\n## [${next}] - ${today}\n`);
  } else {
    cl = cl.replace(/(# .*\n)/, `$1\n## [${next}] - ${today}\n`);
  }
  fs.writeFileSync(clPath, cl);
} else {
  fs.writeFileSync(
    clPath,
    `# Changelog\n\n本專案版號遵循語意化版本（SemVer）。\n\n## [Unreleased]\n\n## [${next}] - ${today}\n`
  );
}

console.log(`版號已更新：${cur} -> ${next}（共 ${pkgs.length} 個 package.json）`);
console.log('建議接續：');
console.log(`  git add -A`);
console.log(`  git commit -m "chore(release): v${next}"`);
console.log(`  git tag v${next}`);
