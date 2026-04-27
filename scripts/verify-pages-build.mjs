import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(root, '.pages-build');

const requiredFiles = [
  'CNAME',
  '.nojekyll',
  'google63c1ffe1585127de.html',
  'index.htm',
  'assets/analytics.js',
  'markv/index.html',
  'markv/manifest.webmanifest',
  'markv/sw.js',
  'pichub/index.html',
  'pichub/manifest.webmanifest',
  'pichub/sw.js',
  'parqview/index.html',
  'parqview/manifest.json',
  'parqview/sw.js',
  'parqview/icon.svg',
  'parqview/icon-192.png',
  'parqview/icon-512.png',
];

const forbiddenFiles = [
  'parqview/app.js',
  'parqview/styles.css',
  'parqview/package.json',
  'parqview/package-lock.json',
  'parqview/vite.config.js',
];

const forbiddenDirs = ['parqview/node_modules', 'parqview/dist'];

const failures = [];

if (!existsSync(pagesDir)) {
  failures.push('Missing Pages artifact directory: .pages-build');
  reportAndExit();
}

for (const file of requiredFiles) {
  assertExists(file);
}

for (const file of forbiddenFiles) {
  assertMissing(file);
}

for (const dir of forbiddenDirs) {
  assertMissing(dir);
}

assertHasAsset('parqview/assets', /\.js$/);
assertHasAsset('parqview/assets', /\.css$/);
assertHasAsset('parqview/assets', /\.wasm$/);
assertHasAsset('parqview/assets', /worker.*\.js$/);

assertParqViewHtml();
assertParqViewManifest();
assertNoMacMetadata(pagesDir);

if (failures.length > 0) {
  reportAndExit();
}

console.log('Pages build verification passed.');

function reportAndExit() {
  console.error('Pages build verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

function assertExists(relativePath) {
  if (!existsSync(join(pagesDir, relativePath))) {
    failures.push(`Missing required file: ${relativePath}`);
  }
}

function assertMissing(relativePath) {
  if (existsSync(join(pagesDir, relativePath))) {
    failures.push(`Unexpected source file in Pages artifact: ${relativePath}`);
  }
}

function assertHasAsset(relativeDir, pattern) {
  const dir = join(pagesDir, relativeDir);
  if (!existsSync(dir)) {
    failures.push(`Missing asset directory: ${relativeDir}`);
    return;
  }

  const matches = readdirSync(dir).some((entry) => pattern.test(entry));
  if (!matches) {
    failures.push(`Missing ${pattern} asset in ${relativeDir}`);
  }
}

function assertParqViewHtml() {
  const htmlPath = join(pagesDir, 'parqview/index.html');
  if (!existsSync(htmlPath)) return;

  const html = readFileSync(htmlPath, 'utf8');
  const expectations = [
    ['href="./manifest.json"', 'ParqView should link the root manifest'],
    ['href="./icon.svg"', 'ParqView should link the root SVG icon'],
    ['href="./icon-192.png"', 'ParqView should link the root touch icon'],
    ['src="./assets/', 'ParqView should load built JS from assets'],
    ['href="./assets/', 'ParqView should load built CSS from assets'],
  ];

  for (const [needle, message] of expectations) {
    if (!html.includes(needle)) {
      failures.push(message);
    }
  }

  if (html.includes('src="./app.js"') || html.includes('href="./styles.css"')) {
    failures.push('ParqView HTML should not reference unbuilt source assets');
  }
}

function assertParqViewManifest() {
  const manifestPath = join(pagesDir, 'parqview/manifest.json');
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const icon of manifest.icons || []) {
    const iconPath = icon.src?.replace(/^\.\//, '');
    if (!iconPath || !existsSync(join(pagesDir, 'parqview', iconPath))) {
      failures.push(`Manifest references missing icon: ${icon.src}`);
    }
  }
}

function assertNoMacMetadata(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (entry === '.DS_Store') {
      failures.push(`Unexpected macOS metadata file: ${fullPath.slice(root.length + 1)}`);
      continue;
    }
    if (statSync(fullPath).isDirectory()) {
      assertNoMacMetadata(fullPath);
    }
  }
}
