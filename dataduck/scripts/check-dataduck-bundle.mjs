import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const INITIAL_WARN_BYTES = 500 * 1024;
export const INITIAL_FAIL_BYTES = 650 * 1024;
export const TOTAL_WARN_BYTES = 750 * 1024;
export const TOTAL_FAIL_BYTES = 950 * 1024;

const forbiddenInitialPatterns = [
  /@assistant-ui/i,
  /recharts/i,
  /react-dom/i,
  /react-jsx-runtime/i,
];

const distDir = join(process.cwd(), 'dist');
const assetsDir = join(distDir, 'assets');
const manifestPath = join(distDir, '.vite', 'manifest.json');

if (!existsSync(assetsDir)) {
  console.error('Missing dist/assets. Run npm run build before npm run check:bundle.');
  process.exit(1);
}

const files = readdirSync(assetsDir).filter((file) => file.endsWith('.js'));
const total = files.reduce((sum, file) => sum + gzipSize(join(assetsDir, file)), 0);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const initialFiles = manifest ? initialChunkFiles(manifest) : files.filter((file) => /^index-/.test(file));
const initial = initialFiles.reduce((sum, file) => sum + gzipSize(join(distDir, file)), 0);
const forbidden = forbiddenInitialMatches(initialFiles.map((file) => join(distDir, file)));

reportBudget('initial DataDuck JS bundle', initial, INITIAL_WARN_BYTES, INITIAL_FAIL_BYTES);
reportBudget('total DataDuck JS bundle', total, TOTAL_WARN_BYTES, TOTAL_FAIL_BYTES);

if (forbidden.length) {
  console.error(`Initial DataDuck JS bundle contains lazy-only dependencies: ${forbidden.join(', ')}.`);
  process.exit(1);
}

function reportBudget(label, bytes, warnBytes, failBytes) {
  const kb = (bytes / 1024).toFixed(1);
  if (bytes > failBytes) {
    console.error(`${label} is ${kb} KB gzip, above the ${(failBytes / 1024).toFixed(0)} KB limit.`);
    process.exitCode = 1;
    return;
  }
  if (bytes > warnBytes) {
    console.warn(`${label} is ${kb} KB gzip, above the ${(warnBytes / 1024).toFixed(0)} KB warning threshold.`);
  } else {
    console.log(`${label} is ${kb} KB gzip.`);
  }
}

function gzipSize(path) {
  return gzipSync(readFileSync(path)).length;
}

function initialChunkFiles(manifest) {
  const byFile = new Map(Object.values(manifest).filter((entry) => entry.file).map((entry) => [entry.file, entry]));
  const initial = new Set();
  const visit = (file) => {
    if (!file || initial.has(file)) return;
    initial.add(file);
    const entry = byFile.get(file);
    for (const imported of entry?.imports || []) {
      const nested = manifest[imported]?.file || imported;
      visit(nested);
    }
  };
  for (const entry of Object.values(manifest)) {
    if (entry.isEntry) visit(entry.file);
  }
  return [...initial].filter((file) => file.endsWith('.js'));
}

function forbiddenInitialMatches(paths) {
  const matches = new Set();
  for (const path of paths) {
    const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
    for (const pattern of forbiddenInitialPatterns) {
      if (pattern.test(source)) matches.add(pattern.source.replace(/\\/g, ''));
    }
  }
  return [...matches];
}
