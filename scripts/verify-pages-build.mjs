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
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/icons/favicon.ico',
  'assets/icons/favicon.svg',
  'markv/index.html',
  'markv/manifest.webmanifest',
  'markv/sw.js',
  'pichub/index.html',
  'pichub/manifest.webmanifest',
  'pichub/sw.js',
  'pagecrumb/index.html',
  'pagecrumb/privacy/index.html',
  'dataduck/index.html',
  'dataduck/manifest.json',
  'dataduck/sw.js',
  'dataduck/icon.svg',
  'dataduck/icon-192.png',
  'dataduck/icon-512.png',
  'seeqlite/index.html',
  'seeqlite/manifest.webmanifest',
  'seeqlite/sw.js',
  'seeqlite/seeqlite-icon.svg',
  'seeqlite/sample.sqlite',
];

const forbiddenFiles = [
  'dataduck/app.js',
  'dataduck/styles.css',
  'dataduck/package.json',
  'dataduck/package-lock.json',
  'dataduck/vite.config.js',
  'seeqlite/package.json',
  'seeqlite/package-lock.json',
  'seeqlite/vite.config.js',
];

const forbiddenDirs = ['dataduck/node_modules', 'dataduck/dist', 'seeqlite/node_modules', 'seeqlite/dist', 'seeqlite/src', 'seeqlite/tests', 'parqview'];

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

assertHasAsset('dataduck/assets', /\.js$/);
assertHasAsset('dataduck/assets', /\.css$/);
assertHasAsset('dataduck/assets', /\.wasm$/);
assertHasAsset('dataduck/assets', /worker.*\.js$/);

assertDataDuckHtml();
assertPagecrumbLandingHtml();
assertPagecrumbPrivacyHtml();
assertDataDuckManifest();
assertDataDuckServiceWorkerRegistration();
assertSeeQLiteAssets();
assertSeeQLiteHtml();
assertSeeQLiteSample();
assertSeeQLiteServiceWorker();
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

function assertDataDuckHtml() {
  const htmlPath = join(pagesDir, 'dataduck/index.html');
  if (!existsSync(htmlPath)) return;

  const html = readFileSync(htmlPath, 'utf8');
  const expectations = [
    ['href="./manifest.json"', 'DataDuck should link the root manifest'],
    ['href="./icon.svg"', 'DataDuck should link the root SVG icon'],
    ['href="./icon-192.png"', 'DataDuck should link the root touch icon'],
    ['src="./assets/', 'DataDuck should load built JS from assets'],
    ['href="./assets/', 'DataDuck should load built CSS from assets'],
  ];

  for (const [needle, message] of expectations) {
    if (!html.includes(needle)) {
      failures.push(message);
    }
  }

  if (html.includes('src="./app.js"') || html.includes('href="./styles.css"')) {
    failures.push('DataDuck HTML should not reference unbuilt source assets');
  }
}

function assertPagecrumbLandingHtml() {
  const htmlPath = join(pagesDir, 'pagecrumb/index.html');
  if (!existsSync(htmlPath)) return;

  const html = readFileSync(htmlPath, 'utf8');
  const expectations = [
    [
      '<title>Pagecrumb - Copy pages and YouTube transcripts as Markdown</title>',
      'Pagecrumb landing page should set the expected title',
    ],
    [
      'copies YouTube transcripts and readable web pages as clean Markdown',
      'Pagecrumb landing page should describe the copy-only workflow',
    ],
    [
      'id="themeToggleBtn"',
      'Pagecrumb landing page should include the TinyCrafts theme toggle',
    ],
    [
      'https://chromewebstore.google.com/detail/pagecrumb/ejianncpkokaeocioncfjkppdgkhllod',
      'Pagecrumb landing page should link to the Chrome Web Store listing',
    ],
    [
      'target="_blank"',
      'Pagecrumb landing page should open the external store link in a new tab',
    ],
    [
      'rel="noopener"',
      'Pagecrumb landing page should protect external store links',
    ],
  ];

  for (const [needle, message] of expectations) {
    if (!html.includes(needle)) {
      failures.push(message);
    }
  }
}

function assertPagecrumbPrivacyHtml() {
  const htmlPath = join(pagesDir, 'pagecrumb/privacy/index.html');
  if (!existsSync(htmlPath)) return;

  const html = readFileSync(htmlPath, 'utf8');
  const expectations = [
    [
      '<title>Pagecrumb Privacy Policy - TinyCrafts</title>',
      'Pagecrumb privacy page should set the expected title',
    ],
    [
      'Pagecrumb has no account, no server, no database, and no',
      'Pagecrumb privacy page should include the core no-server privacy claim',
    ],
    [
      ':root[data-theme="dark"]',
      'Pagecrumb privacy page should include dark-theme styles',
    ],
    [
      'id="themeToggleBtn"',
      'Pagecrumb privacy page should include the TinyCrafts theme toggle',
    ],
  ];

  for (const [needle, message] of expectations) {
    if (!html.includes(needle)) {
      failures.push(message);
    }
  }

  if (html.includes('goatcounter') || html.includes('gc.zgo.at')) {
    failures.push('Pagecrumb privacy page should not include analytics scripts');
  }
}

function assertDataDuckManifest() {
  const manifestPath = join(pagesDir, 'dataduck/manifest.json');
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const icon of manifest.icons || []) {
    const iconPath = icon.src?.replace(/^\.\//, '');
    if (!iconPath || !existsSync(join(pagesDir, 'dataduck', iconPath))) {
      failures.push(`Manifest references missing icon: ${icon.src}`);
    }
  }
}

function assertDataDuckServiceWorkerRegistration() {
  const assetsDir = join(pagesDir, 'dataduck/assets');
  if (!existsSync(assetsDir)) return;

  const jsSources = readdirSync(assetsDir)
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => readFileSync(join(assetsDir, entry), 'utf8'));

  if (jsSources.some((source) => source.includes('data:text/javascript'))) {
    failures.push('DataDuck bundle should not inline the service worker as a data URL');
  }

  if (!jsSources.some((source) => source.includes('./sw.js'))) {
    failures.push('DataDuck bundle should register the root service-worker script');
  }
}

function assertSeeQLiteAssets() {
  const assetsDir = join(pagesDir, 'seeqlite/assets');
  if (!existsSync(assetsDir)) {
    failures.push('Missing SeeQLite asset directory');
    return;
  }

  for (const [pattern, label] of [[/\.js$/, 'JavaScript'], [/\.css$/, 'CSS'], [/\.wasm$/, 'WASM'], [/sqlite\.worker-.*\.js$/, 'SQLite database worker'], [/sqlite3-worker1-.*\.js$/, 'SQLite runtime worker']]) {
    if (!readdirSync(assetsDir).some((entry) => pattern.test(entry))) {
      failures.push(`Missing SeeQLite ${label} asset`);
    }
  }
}

function assertSeeQLiteHtml() {
  const htmlPath = join(pagesDir, 'seeqlite/index.html');
  if (!existsSync(htmlPath)) return;

  const html = readFileSync(htmlPath, 'utf8');
  for (const [needle, message] of [
    ['SeeQLite', 'SeeQLite HTML should contain the app title'],
    ['href="./manifest.webmanifest"', 'SeeQLite HTML should link the relative manifest'],
    ['src="./assets/', 'SeeQLite HTML should load built JavaScript from assets'],
  ]) {
    if (!html.includes(needle)) failures.push(message);
  }
  if (html.includes('src="/') || html.includes('href="/')) failures.push('SeeQLite HTML must not contain root-relative asset paths');
  if (!html.includes('href="./manifest.webmanifest"')) failures.push('SeeQLite HTML should expose its relative manifest link');
}

function assertSeeQLiteSample() {
  const samplePath = join(pagesDir, 'seeqlite/sample.sqlite');
  if (!existsSync(samplePath)) return;
  const header = readFileSync(samplePath).subarray(0, 16).toString('utf8');
  if (header !== 'SQLite format 3\u0000') failures.push('SeeQLite sample must be a SQLite 3 database');
}

function assertSeeQLiteServiceWorker() {
  const workerPath = join(pagesDir, 'seeqlite/sw.js');
  if (!existsSync(workerPath)) return;
  const source = readFileSync(workerPath, 'utf8');
  if (!source.includes("const CACHE_PREFIX = 'seeqlite-'")) failures.push('SeeQLite service worker must use a scoped cache prefix');
  const precacheMatch = /const PRECACHE = (\[[\s\S]*?\]);/.exec(source);
  if (!precacheMatch) {
    failures.push('SeeQLite service worker precache manifest is unreadable');
    return;
  }
  let precache;
  try {
    precache = JSON.parse(precacheMatch[1]);
  } catch {
    failures.push('SeeQLite service worker precache manifest is invalid JSON');
    return;
  }
  for (const asset of precache) {
    if (typeof asset !== 'string') {
      failures.push('SeeQLite service worker precache contains a non-string path');
      continue;
    }
    if (/\.(?:sqlite|sqlite3|db|wal|shm|journal)$/i.test(asset)) failures.push(`SeeQLite service worker must not precache database path: ${asset}`);
    if (asset.startsWith('/') || asset.includes('..')) failures.push(`SeeQLite precache path must stay relative: ${asset}`);
    if (!existsSync(join(pagesDir, 'seeqlite', asset.replace(/^\.\//, '')))) failures.push(`SeeQLite precache references missing asset: ${asset}`);
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
