import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const warnBytes = 750 * 1024;
const failBytes = 950 * 1024;
const assetsDir = join(process.cwd(), 'dist', 'assets');

if (!existsSync(assetsDir)) {
  console.error('Missing dist/assets. Run npm run build before npm run check:bundle.');
  process.exit(1);
}

const files = readdirSync(assetsDir).filter((file) => file.endsWith('.js'));
const total = files.reduce((sum, file) => {
  const source = readFileSync(join(assetsDir, file));
  return sum + gzipSync(source).length;
}, 0);

const kb = (total / 1024).toFixed(1);
if (total > failBytes) {
  console.error(`DataDuck JS bundle is ${kb} KB gzip, above the ${(failBytes / 1024).toFixed(0)} KB limit.`);
  process.exit(1);
}
if (total > warnBytes) {
  console.warn(`DataDuck JS bundle is ${kb} KB gzip, above the ${(warnBytes / 1024).toFixed(0)} KB warning threshold.`);
} else {
  console.log(`DataDuck JS bundle is ${kb} KB gzip.`);
}
