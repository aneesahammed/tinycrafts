import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(root, '.pages-build');
const parqviewDir = join(root, 'parqview');

const rootItems = ['CNAME', '.nojekyll', 'google63c1ffe1585127de.html', 'index.htm', 'assets'];

const staticToolItems = [
  'markv/index.html',
  'markv/manifest.webmanifest',
  'markv/sw.js',
  'markv/assets',
  'markv/vendor',
  'pichub/index.html',
  'pichub/manifest.webmanifest',
  'pichub/sw.js',
  'pichub/assets',
];

rmSync(pagesDir, { recursive: true, force: true });
mkdirSync(pagesDir, { recursive: true });

for (const item of [...rootItems, ...staticToolItems]) {
  copySiteItem(item);
}

console.log('Building ParqView...');
execFileSync('npm', ['run', 'build'], {
  cwd: parqviewDir,
  stdio: 'inherit',
});

copySiteItem('parqview/dist', 'parqview');
console.log(`Pages artifact written to ${pagesDir}`);

function copySiteItem(relativeSource, relativeDestination = relativeSource) {
  const source = join(root, relativeSource);
  if (!existsSync(source)) return;

  const destination = join(pagesDir, relativeDestination);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    filter: shouldCopy,
  });
}

function shouldCopy(source) {
  return !source.split(/[\\/]/).some((part) => part === '.DS_Store');
}
