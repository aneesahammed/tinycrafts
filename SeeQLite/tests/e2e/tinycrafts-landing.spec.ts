import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

const siteRoot = resolve(process.cwd(), '..');
const seeqliteDist = resolve(process.cwd(), 'dist');

const viewports = [
  { name: 'narrow', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1024, height: 900 },
  { name: 'wide', width: 1440, height: 900 },
] as const;

const existingSpecimens = [
  {
    href: 'https://sentinel.tinycrafts.ai',
    name: 'Open sentinel, log-tail error tracker',
    title: 'sentinel',
    ordinal: 'No. 01',
    caption: 'log-tail error tracker',
    blurb:
      'Error tracking that reads the logs you already write. No SDK to install, no third-party cloud - point it at a file and it surfaces what broke.',
    tags: ['no-sdk', 'self-host', 'live'],
  },
  {
    href: 'markv/',
    name: 'Open markV, browser-only markdown viewer',
    title: 'markV',
    ordinal: 'No. 02',
    caption: 'browser-only markdown viewer',
    blurb:
      'Drag-and-drop Markdown viewer with Mermaid diagrams, reading mode, and document insights. Pure browser - your files never leave the page.',
    tags: ['browser-only', 'mermaid', 'live'],
  },
  {
    href: 'dataduck/',
    name: 'Open DataDuck, browser-only Parquet and CSV viewer',
    title: 'DataDuck',
    ordinal: 'No. 03',
    caption: 'browser-only data viewer',
    blurb:
      'Open local Parquet and CSV files, inspect schema, run SQL, and export results. DuckDB-WASM does the work in the browser - no upload path.',
    tags: ['parquet', 'csv', 'duckdb-wasm', 'live'],
  },
  {
    href: 'https://shotbar.tinycrafts.ai',
    name: 'Open ShotBar, fast menu bar screenshots for macOS',
    title: 'ShotBar',
    ordinal: 'No. 04',
    caption: 'menu-bar screenshots for macOS',
    blurb:
      'Capture selection, active window, or full screen from the menu bar with simple F-key shortcuts. Signed, notarized, sandboxed, and built for sharp Retina output.',
    tags: ['macos', 'screenshots', 'menu-bar', 'live'],
  },
  {
    href: 'pichub/',
    name: 'Open PicHub, image to public URL tool',
    title: 'PicHub',
    ordinal: 'No. 05',
    caption: 'image to public URL via your repo',
    blurb:
      'Drop an image, get a public URL. Uploads straight to your own GitHub repo with a fine-grained token - browser only, nothing routes through a third-party.',
    tags: ['github', 'browser-only', 'live'],
  },
  {
    href: 'https://chronicle.tinycrafts.ai/',
    name: 'Open Chronicle, daily AI signal filter',
    title: 'Chronicle',
    ordinal: 'No. 06',
    caption: 'daily AI signal filter',
    blurb:
      'Daily AI/ML links clustered, classified, and ranked for builders. Hacker News stays in the mix, while repeated hype and low-signal coverage gets pushed down.',
    tags: ['ai', 'hacker-news', 'daily', 'live'],
  },
  {
    href: 'pagecrumb/',
    name: 'Open Pagecrumb, clean transcript and page Markdown copier',
    title: 'Pagecrumb',
    ordinal: 'No. 07',
    caption: 'clean transcript and page Markdown copier',
    blurb:
      'Copy YouTube transcripts and readable web pages as clean Markdown. No account, no sync service, no AI key - just copy the source you need.',
    tags: ['chrome', 'markdown', 'copy-only', 'live'],
  },
] as const;

const seeqlite = {
  href: 'seeqlite/',
  name: 'Open SeeQLite, browser-only SQLite explorer',
  title: 'SeeQLite',
  ordinal: 'No. 08',
  caption: 'browser-only SQLite explorer',
  blurb:
    'Open a local SQLite file, inspect schema and declared relationships, run read-only SQL, and export displayed results. Your database stays in the browser.',
  tags: ['sqlite', 'browser-only', 'read-only', 'live'],
  domain: 'tinycrafts.ai/seeqlite',
} as const;

let server: Server;
let landingOrigin: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = resolveStaticFile(pathname);

      if (!file) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      try {
        await stat(file);
        const body = await readFile(file);
        response.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
        response.end(body);
      } catch {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
      }
    })();
  });

  await new Promise<void>((resolveReady) => {
    server.listen(0, '127.0.0.1', () => resolveReady());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Landing server did not expose a port');
  landingOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClosed, reject) => server.close((error) => (error ? reject(error) : resolveClosed())));
});

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.route('https://gc.zgo.at/**', (route) => route.abort());
  await page.addInitScript(() => window.localStorage.setItem('tinycrafts-theme', 'light'));
});

test('renders SeeQLite as the exact eighth specimen without changing No. 01–07', async ({ page }) => {
  await openLanding(page, { width: 1440, height: 900 });

  await expect(page.getByText('Specimens - 08 shipped', { exact: true })).toBeVisible();
  const cards = page.locator('a.specimen');
  await expect(cards).toHaveCount(8);

  for (const [index, expected] of existingSpecimens.entries()) {
    const card = cards.nth(index);
    await expect(card).toHaveAttribute('href', expected.href);
    await expect(card).toHaveAttribute('aria-label', expected.name);
    await expect(card.locator('.num')).toHaveText(expected.ordinal);
    await expect(card.locator('h2')).toHaveText(expected.title);
    await expect(card.locator('.caption')).toHaveText(expected.caption);
    await expect(card.locator('.blurb')).toHaveText(expected.blurb);
    await expect(card.locator('.tag')).toHaveText(expected.tags);
  }

  const card = cards.nth(7);
  await expect(card).toHaveAttribute('href', seeqlite.href);
  await expect(card).toHaveAttribute('aria-label', seeqlite.name);
  await expect(card.locator('.glyph')).toHaveText('Sq');
  await expect(card.locator('.num')).toHaveText(seeqlite.ordinal);
  await expect(card.locator('h2')).toHaveText(seeqlite.title);
  await expect(card.locator('h2')).toHaveAttribute('translate', 'no');
  await expect(card.locator('.caption')).toHaveText(seeqlite.caption);
  await expect(card.locator('.blurb')).toHaveText(seeqlite.blurb);
  await expect(card.locator('.tag')).toHaveText(seeqlite.tags);
  await expect(card.locator('.open-chip')).toContainText('open');
  await expect(card.locator('.domain')).toHaveText(seeqlite.domain);
  await expect(cards.nth(6).locator('.num')).toHaveText('No. 07');

  await card.focus();
  await expect(card).toBeFocused();
  const beforeHover = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
  await card.hover();
  const afterHover = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(afterHover).not.toBe(beforeHover);

  const themeToggle = page.getByRole('button', { name: 'Switch to dark theme' });
  await expect(themeToggle).toHaveAttribute('aria-pressed', 'false');
  await themeToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toBeVisible();
});

for (const viewport of viewports) {
  test(`keeps the complete catalogue usable at ${viewport.name} width`, async ({ page }) => {
    await openLanding(page, viewport);
    await expect(page.getByRole('link', { name: seeqlite.name })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('link', { name: seeqlite.name }).focus();
    await expect(page.getByRole('link', { name: seeqlite.name })).toBeFocused();
  });
}

test('keeps the landing catalogue usable at 200% zoom', async ({ page }) => {
  await openLanding(page, { width: 1024, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(page.getByRole('link', { name: seeqlite.name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('resolves the direct SeeQLite route as an app document', async ({ page }) => {
  const response = await page.goto(`${landingOrigin}/seeqlite/`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/SeeQLite/);
  await expect(page.locator('body')).not.toContainText('Not found');
});

test('captures full-page light and dark catalogue snapshots', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Visual baselines are maintained in Chromium only');

  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of viewports) {
      await openLanding(page, viewport);
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      await expect(page.getByRole('link', { name: seeqlite.name })).toBeVisible();
      await expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(`landing-${theme}-${viewport.name}.png`);
    }
  }
});

async function openLanding(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(`${landingOrigin}/`);
  await expect(page.locator('main#tools')).toBeVisible();
}

function resolveStaticFile(pathname: string): string | null {
  if (pathname === '/' || pathname === '/index.htm') return join(siteRoot, 'index.htm');

  const [base, relativePath] = pathname.startsWith('/seeqlite/')
    ? [seeqliteDist, pathname.slice('/seeqlite/'.length) || 'index.html']
    : [siteRoot, pathname.slice(1)];
  const candidate = resolve(base, relativePath);
  const relativeCandidate = relative(base, candidate);
  if (relativeCandidate.startsWith(`..${sep}`) || relativeCandidate === '..' || relativeCandidate.includes(`${sep}..${sep}`)) return null;
  return candidate;
}

function contentType(file: string): string {
  return {
    '.css': 'text/css; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
  }[extname(file)] ?? 'application/octet-stream';
}
