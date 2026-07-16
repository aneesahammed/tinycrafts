import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ALLOWED_LICENSES = Object.freeze(['0BSD', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'MIT', 'MPL-2.0', 'OFL-1.1']);
const PACKAGE_IMPORT = /(?:from|import)\s*['"]([^'"]+)['"]/g;
const PACKAGE_NAME = /^(@[^/]+\/[^/]+|[^/]+)/;

const DIRECT_PURPOSES = Object.freeze({
  '@codemirror/autocomplete': 'SQL editor completion',
  '@codemirror/commands': 'SQL editor keyboard commands',
  '@codemirror/lang-sql': 'SQL editor language mode',
  '@codemirror/language': 'SQL editor language services',
  '@codemirror/state': 'SQL editor state model',
  '@codemirror/view': 'SQL editor DOM view',
  '@fontsource-variable/inter': 'Self-hosted interface font',
  '@fontsource-variable/jetbrains-mono': 'Self-hosted SQL/result font',
  '@lezer/highlight': 'SQL syntax highlighting tags',
  '@sqlite.org/sqlite-wasm': 'SQLite engine and WASM worker assets',
  react: 'Application UI runtime',
  'react-dom': 'Browser UI renderer',
});

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function walkFiles(directory, relative = '') {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory).sort()) {
    const absolute = path.join(directory, entry);
    const next = path.join(relative, entry);
    if (statSync(absolute).isDirectory()) files.push(...walkFiles(absolute, next));
    else files.push(next.replaceAll(path.sep, '/'));
  }
  return files;
}

function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  return PACKAGE_NAME.exec(specifier)?.[1] ?? null;
}

function packageKey(packageNameValue) {
  return `node_modules/${packageNameValue}`;
}

function resolveDependency(lockPackages, packageNameValue, fromKey = '') {
  let cursor = fromKey;
  while (true) {
    const candidate = cursor ? `${cursor}/node_modules/${packageNameValue}` : packageKey(packageNameValue);
    if (lockPackages[candidate]) return candidate;
    const parent = cursor.replace(/\/node_modules\/[^/]+(?:\/[^/]+)?$/, '');
    if (parent === cursor) break;
    cursor = parent;
  }
  return packageKey(packageNameValue);
}

function importSources(rootDir) {
  const sourceFiles = walkFiles(path.join(rootDir, 'src'), 'src').filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
  const imports = new Map();
  for (const relative of sourceFiles) {
    const source = readFileSync(path.join(rootDir, relative), 'utf8');
    for (const match of source.matchAll(PACKAGE_IMPORT)) {
      const name = packageName(match[1]);
      if (!name) continue;
      const files = imports.get(name) ?? [];
      files.push(relative);
      imports.set(name, files);
    }
  }
  for (const files of imports.values()) files.sort();
  return imports;
}

function artifactDigest(rootDir, artifactFiles) {
  const hash = createHash('sha256');
  for (const relative of artifactFiles) {
    hash.update(relative);
    hash.update('\0');
    hash.update(readFileSync(path.join(rootDir, 'dist', relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function packageAssets(name, artifactFiles) {
  if (name === '@fontsource-variable/inter') return artifactFiles.filter((file) => /inter-.*\.woff2$/.test(file));
  if (name === '@fontsource-variable/jetbrains-mono') return artifactFiles.filter((file) => /jetbrains-mono-.*\.woff2$/.test(file));
  if (name === '@sqlite.org/sqlite-wasm') return artifactFiles.filter((file) => /sqlite(?:3|\.worker|3-worker|3-opfs).*\.(?:js|wasm)$/.test(file));
  if (name.startsWith('@codemirror/') || name.startsWith('@lezer/') || ['crelt', 'style-mod', 'w3c-keyname', '@marijn/find-cluster-break'].includes(name)) return artifactFiles.filter((file) => /SqlEditor-.*\.(?:js|css)$/.test(file));
  return artifactFiles.filter((file) => /index-.*\.(?:js|css)$/.test(file));
}

function noticeSource(packageDir, packageMetadata, rootDir) {
  const noticeFiles = readdirSync(packageDir).filter((file) => /^(?:license|licence|notice|copying)(?:\.|$)/i.test(file)).sort();
  if (noticeFiles.length > 0) return noticeFiles.map((file) => path.relative(rootDir, path.join(packageDir, file)).replaceAll(path.sep, '/'));
  if (typeof packageMetadata.license === 'string' && packageMetadata.license.trim()) return [`${path.relative(rootDir, path.join(packageDir, 'package.json')).replaceAll(path.sep, '/')} (license field; no standalone notice/license file)`];
  return [];
}

function purposeFor(name, parents) {
  if (DIRECT_PURPOSES[name]) return DIRECT_PURPOSES[name];
  const parent = [...parents].sort()[0];
  return parent ? `Transitive dependency required by ${parent}` : 'Runtime package with no recorded parent';
}

export function normalizeAuditReport(auditReport) {
  if (!auditReport || typeof auditReport !== 'object' || !auditReport.metadata?.vulnerabilities) return { status: 'incomplete', source: 'npm audit --omit=dev --json', reason: 'audit report missing metadata' };
  const counts = { ...auditReport.metadata.vulnerabilities };
  const vulnerabilities = Object.entries(auditReport.vulnerabilities ?? {}).map(([name, value]) => ({ name, severity: value.severity ?? 'unknown', via: Array.isArray(value.via) ? value.via.map((entry) => typeof entry === 'string' ? entry : entry.title ?? entry.name ?? 'advisory').sort() : [] })).sort((a, b) => a.name.localeCompare(b.name));
  const blocked = Number(counts.high ?? 0) > 0 || Number(counts.critical ?? 0) > 0;
  return { status: blocked ? 'blocked' : 'clean', source: 'npm audit --omit=dev --json', counts, vulnerabilities };
}

export function buildInventory({ rootDir, packageJson, lockfile, auditReport }) {
  const imports = importSources(rootDir);
  const artifactFiles = walkFiles(path.join(rootDir, 'dist')).filter((file) => !file.endsWith('.map')).sort();
  const lockPackages = lockfile.packages ?? {};
  const rootDependencies = Object.keys(lockPackages['']?.dependencies ?? {});
  const runtimeRoots = rootDependencies.filter((name) => imports.has(name));
  const queue = runtimeRoots.map((name) => ({ name, fromKey: '' }));
  const packageEntries = new Map();
  const parents = new Map();
  while (queue.length > 0) {
    const current = queue.shift();
    const key = resolveDependency(lockPackages, current.name, current.fromKey);
    const metadata = lockPackages[key];
    if (!metadata || packageEntries.has(key)) continue;
    packageEntries.set(key, { key, name: current.name, metadata });
    for (const dependency of Object.keys(metadata.dependencies ?? {})) {
      const dependencyKey = resolveDependency(lockPackages, dependency, key);
      const parentSet = parents.get(dependency) ?? new Set();
      parentSet.add(current.name);
      parents.set(dependency, parentSet);
      queue.push({ name: dependency, fromKey: key });
      if (!lockPackages[dependencyKey]) packageEntries.set(dependencyKey, { key: dependencyKey, name: dependency, metadata: null });
    }
  }

  const packages = [...packageEntries.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)).map(({ key, name, metadata }) => {
    if (!metadata) return { name, version: null, purpose: purposeFor(name, parents.get(name) ?? []), runtimeReachability: 'missing-lockfile-entry', license: null, licenseSource: null, noticeSources: [], artifactAssets: [], remoteRequests: 'none' };
    const packageDir = path.join(rootDir, 'node_modules', key.replace(/^node_modules\//, ''));
    const packageMetadata = existsSync(path.join(packageDir, 'package.json')) ? readJson(path.join(packageDir, 'package.json')) : {};
    const license = metadata.license ?? packageMetadata.license ?? null;
    const sourceImports = imports.get(name) ?? [];
    return {
      name,
      version: metadata.version,
      purpose: purposeFor(name, parents.get(name) ?? []),
      runtimeReachability: sourceImports.length > 0 ? 'direct-source-import' : 'transitive-lockfile-closure',
      sourceImports,
      license,
      licenseSource: `node_modules/${key.replace(/^node_modules\//, '')}/package.json`,
      noticeSources: noticeSource(packageDir, packageMetadata, rootDir),
      artifactAssets: packageAssets(name, artifactFiles),
      remoteRequests: 'none (bundled same-origin artifact)',
    };
  });

  return {
    schemaVersion: 1,
    project: packageJson.name,
    lockfileSha256: sha256(JSON.stringify(lockfile)),
    artifactFiles,
    artifactDigest: artifactDigest(rootDir, artifactFiles),
    runtimePackageCount: packages.length,
    packages,
    advisories: normalizeAuditReport(auditReport),
  };
}

export function validateInventory(inventory, { rootDir, expected }) {
  const issues = [];
  if (!inventory || inventory.schemaVersion !== 1) issues.push('inventory schemaVersion must be 1.');
  if (!Array.isArray(inventory?.packages) || inventory.packages.length !== inventory?.runtimePackageCount) issues.push('runtime package count does not match inventory rows.');
  const seen = new Set();
  for (const entry of inventory?.packages ?? []) {
    if (seen.has(`${entry.name}@${entry.version}`)) issues.push(`duplicate runtime package ${entry.name}@${entry.version}.`);
    seen.add(`${entry.name}@${entry.version}`);
    if (!entry.version) issues.push(`${entry.name} has no exact version.`);
    if (!entry.license || !ALLOWED_LICENSES.includes(entry.license)) issues.push(`${entry.name} has an unknown or prohibited license ${String(entry.license)}.`);
    if (!entry.licenseSource) issues.push(`${entry.name} has no license source.`);
    if (entry.licenseSource && rootDir && !existsSync(path.join(rootDir, entry.licenseSource))) issues.push(`${entry.name} license source is missing: ${entry.licenseSource}.`);
    if (!Array.isArray(entry.noticeSources) || entry.noticeSources.length === 0) issues.push(`${entry.name} has no notice/license evidence.`);
    for (const notice of entry.noticeSources ?? []) {
      const noticePath = String(notice).split(' (', 1)[0];
      if (!rootDir || !existsSync(path.join(rootDir, noticePath))) issues.push(`${entry.name} notice/license source is missing: ${noticePath}.`);
    }
    if (!Array.isArray(entry.artifactAssets) || entry.artifactAssets.some((file) => !inventory.artifactFiles.includes(file))) issues.push(`${entry.name} references a missing artifact asset.`);
    if (entry.remoteRequests !== 'none (bundled same-origin artifact)' && entry.remoteRequests !== 'none') issues.push(`${entry.name} has unexpected runtime request behavior.`);
  }
  if (inventory.advisories?.status !== 'clean') issues.push(`advisory status is ${String(inventory.advisories?.status)}; clean evidence is required.`);
  if (Number(inventory.advisories?.counts?.high ?? 0) > 0 || Number(inventory.advisories?.counts?.critical ?? 0) > 0) issues.push('unresolved High/Critical production advisory blocks release.');
  if (expected) {
    if (inventory.lockfileSha256 !== expected.lockfileSha256) issues.push('lockfile digest drifted from the checked inventory.');
    if (inventory.artifactDigest !== expected.artifactDigest) issues.push('built artifact digest drifted from the checked inventory.');
    if (JSON.stringify(inventory.packages) !== JSON.stringify(expected.packages)) issues.push('runtime package inventory drifted from the checked inventory.');
    if (JSON.stringify(inventory.advisories) !== JSON.stringify(expected.advisories)) issues.push('advisory evidence drifted from the checked inventory.');
  }
  if (rootDir && !existsSync(path.join(rootDir, 'dist'))) issues.push('dist is missing; runtime reachability cannot be verified.');
  return { ok: issues.length === 0, issues };
}

export function renderInventory(inventory) {
  const lines = [
    '# SeeQLite runtime dependency inventory',
    '',
    'Generated by `scripts/audit-release-dependencies.mjs`; this document is release-gated and must be regenerated after lockfile or artifact changes.',
    '',
    `- Runtime packages: ${inventory.runtimePackageCount}`,
    `- Lockfile SHA-256: \`${inventory.lockfileSha256}\``,
    `- Built artifact SHA-256: \`${inventory.artifactDigest}\``,
    `- Advisory source: ${inventory.advisories.source}`,
    `- Advisory status: **${inventory.advisories.status}**`,
    '',
    '```json',
    JSON.stringify(inventory, null, 2),
    '```',
    '',
    '## Package table',
    '',
    '| Package | Version | Purpose | Reachability | License | Notice/license source | Artifact assets | Requests |',
    '|---|---|---|---|---|---|---|---|',
    ...inventory.packages.map((entry) => `| ${entry.name} | ${entry.version} | ${entry.purpose} | ${entry.runtimeReachability} | ${entry.license} | ${entry.noticeSources.join('<br>')} | ${entry.artifactAssets.join('<br>')} | ${entry.remoteRequests} |`),
    '',
  ];
  return lines.join('\n');
}

export function renderNotices(inventory) {
  const sections = inventory.packages.map((entry) => [
    `## ${entry.name} ${entry.version}`,
    '',
    `- Purpose: ${entry.purpose}`,
    `- License: ${entry.license}`,
    `- License/notice source: ${entry.noticeSources.join(', ')}`,
    `- Runtime requests: ${entry.remoteRequests}`,
    '',
  ].join('\n'));
  return ['# SeeQLite third-party runtime notices', '', `This notice inventory covers the ${inventory.runtimePackageCount} packages reachable from SeeQLite browser runtime imports and their lockfile dependency closure. Versions, license expressions, and notice paths are generated from the pinned lockfile and installed package metadata.`, '', ...sections, ''].join('\n');
}

function runAudit(rootDir) {
  try {
    const output = execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (error) {
    const output = error?.stdout?.toString?.() || '';
    if (output.trim()) {
      try { return JSON.parse(output); } catch { /* fall through to incomplete */ }
    }
    throw new Error(`npm audit unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readEmbeddedInventory(markdown) {
  const match = /```json\s*([\s\S]*?)```/i.exec(markdown);
  if (!match) throw new Error('dependency inventory must contain one fenced JSON block.');
  return JSON.parse(match[1]);
}

function cli() {
  const args = new Set(process.argv.slice(2));
  const rootDir = path.resolve(process.env.SEEQLITE_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const inventoryPath = path.resolve(process.env.SEEQLITE_INVENTORY ?? path.join(rootDir, 'docs/release/dependency-inventory.md'));
  const noticesPath = path.resolve(process.env.SEEQLITE_NOTICES ?? path.join(rootDir, '..', 'THIRD_PARTY_NOTICES.md'));
  try {
    const packageJson = readJson(path.join(rootDir, 'package.json'));
    const lockfile = readJson(path.join(rootDir, 'package-lock.json'));
    const inventory = buildInventory({ rootDir, packageJson, lockfile, auditReport: runAudit(rootDir) });
    const existing = existsSync(inventoryPath) ? readEmbeddedInventory(readFileSync(inventoryPath, 'utf8')) : null;
    const check = validateInventory(inventory, { rootDir, expected: args.has('--check') ? existing : undefined });
    if (args.has('--write')) {
      writeFileSync(inventoryPath, renderInventory(inventory), 'utf8');
      writeFileSync(noticesPath, renderNotices(inventory), 'utf8');
    }
    for (const issue of check.issues) console.error(`ERROR: ${issue}`);
    if (!check.ok) process.exitCode = 1;
    else console.log(`Dependency evidence ${args.has('--check') ? 'PASS' : 'READY'}: ${inventory.runtimePackageCount} runtime packages; advisory status ${inventory.advisories.status}.`);
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
