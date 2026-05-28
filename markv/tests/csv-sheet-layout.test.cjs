const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const exportHost = fs.readFileSync("assets/export-host.js", "utf8");
const csvSheet = require("../assets/csv-sheet.js");

function extractStyleText(source) {
  const start = source.indexOf("<style>");
  const end = source.indexOf("</style>", start);
  assert.notEqual(start, -1, "Could not find inline stylesheet");
  assert.notEqual(end, -1, "Could not find inline stylesheet end");
  return source.slice(start + "<style>".length, end);
}

function cspContent() {
  const match = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  );
  assert.ok(match, "Could not find CSP meta tag");
  return match[1];
}

test("csv sheet asset is loaded and precached", () => {
  assert.match(html, /assets\/csv-sheet\.js\?v=1/);
  assert.match(sw, /CACHE_VERSION = "v50"/);
  assert.match(sw, /\.\/assets\/csv-sheet\.js\?v=1/);
});

test("csv renderer bridge preserves source attr injection", () => {
  const rendered = csvSheet.renderCsvSheet("a,b\n1,2", "csv", (value) =>
    String(value),
  );

  assert.ok(rendered.startsWith('<div class="csv-sheet-wrap"'));
  assert.match(html, /window\.MarkVCsvSheet/);
  assert.match(html, /csvSheet\.renderCsvSheet/);
  assert.match(
    html,
    /function renderAnchoredCodeToken[\s\S]*injectSourceAttrs\([\s\S]*this\.parser\.renderer\.code/,
  );
});

test("csv sheet styles use reader palette tokens", () => {
  const css = extractStyleText(html);

  assert.match(css, /\.markdown-body \.csv-sheet-wrap/);
  assert.match(css, /--reader-bg-surface/);
  assert.match(css, /--reader-bg-subtle/);
  assert.match(css, /--reader-fg-default/);
  assert.match(css, /--reader-fg-muted/);
  assert.match(css, /--reader-border-default/);
  assert.match(css, /--reader-border-soft/);
  assert.match(css, /\.markdown-body \.csv-sheet thead th[\s\S]*position:\s*sticky/);
  assert.match(css, /\.markdown-body \.csv-sheet td:empty::after[\s\S]*"\\00a0"/);
});

test("csv print rules disable sticky headers and scroll clipping", () => {
  const css = extractStyleText(html);

  assert.match(
    css,
    /\.export-print-document\.markdown-body \.csv-sheet-wrap[\s\S]*overflow:\s*visible/,
  );
  assert.match(
    css,
    /\.export-print-document\.markdown-body \.csv-sheet[\s\S]*table-layout:\s*fixed/,
  );
  assert.match(
    css,
    /\.export-print-document\.markdown-body \.csv-sheet thead th[\s\S]*position:\s*static/,
  );
  assert.match(
    css,
    /\.export-print-document\.markdown-body \.csv-sheet tr[\s\S]*break-inside:\s*avoid/,
  );
});

test("pdf export print root clones rendered csv sheets", () => {
  assert.match(exportHost, /root\.id = "markvExportPrintRoot"/);
  assert.match(exportHost, /article\.className = "markdown-body export-print-document"/);
  assert.match(exportHost, /article\.innerHTML = source \? source\.innerHTML : ""/);
});

test("CSP script hashes match current inline scripts", () => {
  const csp = cspContent();
  const cspHashes = new Set(
    [...csp.matchAll(/'sha256-([^']+)'/g)].map((match) => "sha256-" + match[1]),
  );
  const inlineHashes = [
    ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((match) => {
    return (
      "sha256-" +
      crypto.createHash("sha256").update(match[1]).digest("base64")
    );
  });

  assert.equal(cspHashes.size, inlineHashes.length);
  for (const hash of inlineHashes) {
    assert.ok(cspHashes.has(hash), `Missing CSP hash ${hash}`);
  }
});
