import { writeFile } from 'node:fs/promises';

const baseUrl = process.argv[2];
const outputPath = process.argv[3];
if (!baseUrl) {
  console.error('Usage: node scripts/check-deployed-seeqlite.mjs <https://host/seeqlite/> [evidence.json]');
  process.exit(2);
}

const origin = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
const checks = [];
const failures = [];

const entry = await fetchAsset('', 'text/html');
const html = entry.body;
const serviceWorker = await fetchAsset('sw.js', 'javascript');
if (/<(?:script|link)[^>]+(?:src|href)="https?:\/\//i.test(html)) failures.push('Deployed SeeQLite HTML references a remote script or stylesheet');
const assetPaths = new Set([
  ...[...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)].map((match) => match[1]),
  ...readPrecache(serviceWorker.body),
]);
for (const assetPath of assetPaths) await fetchAsset(assetPath);

const headerEvidence = {
  contentSecurityPolicy: entry.headers['content-security-policy'] ?? null,
  serviceWorkerAllowed: entry.headers['service-worker-allowed'] ?? null,
  crossOriginOpenerPolicy: entry.headers['cross-origin-opener-policy'] ?? null,
  crossOriginEmbedderPolicy: entry.headers['cross-origin-embedder-policy'] ?? null,
  xContentTypeOptions: entry.headers['x-content-type-options'] ?? null,
};
const evidence = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  baseUrl: origin.href,
  outcome: failures.length ? 'failed' : 'passed',
  headers: headerEvidence,
  checks,
  failures,
  limitations: [
    ...(headerEvidence.contentSecurityPolicy ? [] : ['Content-Security-Policy response header is absent; retain the documented meta-CSP limitation.']),
    ...(headerEvidence.crossOriginOpenerPolicy ? [] : ['Cross-Origin-Opener-Policy response header is absent; no isolation claim is made.']),
    ...(headerEvidence.crossOriginEmbedderPolicy ? [] : ['Cross-Origin-Embedder-Policy response header is absent; no isolation claim is made.']),
  ],
};

if (outputPath) await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (failures.length) process.exit(1);

async function fetchAsset(relativePath, expectedKind) {
  const url = new URL(relativePath, origin);
  if (url.origin !== origin.origin || !url.pathname.startsWith(origin.pathname)) {
    failures.push(`Asset escapes the deployed SeeQLite path: ${relativePath}`);
    return { body: '', headers: {} };
  }
  const response = await fetch(url, { redirect: 'error' }).catch((error) => {
    failures.push(`Request failed for ${relativePath || '.'}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  if (!response) return { body: '', headers: {} };
  const body = await response.text();
  const headers = Object.fromEntries(response.headers.entries());
  const contentType = headers['content-type'] ?? '';
  checks.push({ path: relativePath || '.', status: response.status, contentType });
  if (!response.ok) failures.push(`${relativePath || '.'} returned HTTP ${response.status}`);
  if (expectedKind && !contentType.toLowerCase().includes(expectedKind)) failures.push(`${relativePath || '.'} has unexpected content type ${contentType}`);
  if (/\.js$/i.test(relativePath) && !contentType.includes('javascript')) failures.push(`${relativePath} must be served as JavaScript`);
  if (/\.css$/i.test(relativePath) && !contentType.includes('css')) failures.push(`${relativePath} must be served as CSS`);
  if (/\.wasm$/i.test(relativePath) && !contentType.includes('wasm')) failures.push(`${relativePath} must be served as WebAssembly`);
  if (relativePath === 'sw.js' && !contentType.includes('javascript')) failures.push('sw.js must be served as JavaScript');
  return { body, headers };
}

function readPrecache(source) {
  const match = /const PRECACHE = (\[[\s\S]*?\]);/.exec(source);
  if (!match) {
    failures.push('Deployed sw.js does not expose a readable generated PRECACHE manifest');
    return [];
  }
  try {
    const paths = JSON.parse(match[1]);
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) throw new Error('not a string array');
    if (paths.some((path) => /\.(?:sqlite|sqlite3|db|wal|shm|journal)$/i.test(path))) failures.push('Deployed service worker precaches a database or sidecar path');
    return paths.map((path) => path.replace(/^\.\//, '')).filter(Boolean);
  } catch {
    failures.push('Deployed sw.js PRECACHE manifest is invalid JSON');
    return [];
  }
}
