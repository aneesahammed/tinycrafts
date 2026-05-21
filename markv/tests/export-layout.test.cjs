const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const commandHost = fs.readFileSync("assets/command-palette-host.js", "utf8");
const exportHost = fs.readFileSync("assets/export-host.js", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function extractStyleText(source) {
  const start = source.indexOf("<style>");
  const end = source.indexOf("</style>", start);
  assert.notEqual(start, -1, "Could not find inline stylesheet");
  assert.notEqual(end, -1, "Could not find inline stylesheet end");
  return source.slice(start + "<style>".length, end);
}

function extractBlock(source, needle) {
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `Could not find ${needle}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Could not find body for ${needle}`);

  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, i);
    }
  }

  throw new Error(`Could not extract body for ${needle}`);
}

test("export assets are loaded and precached", () => {
  assert.match(html, /assets\/export-core\.js\?v=2/);
  assert.match(html, /assets\/export-host\.js\?v=3/);
  assert.match(sw, /CACHE_VERSION = "v44"/);
  assert.match(sw, /\.\/assets\/export-core\.js\?v=2/);
  assert.match(sw, /\.\/assets\/export-host\.js\?v=3/);
});

test("toolbar exposes one export popover with direct pdf and markdown actions", () => {
  assert.match(html, /id="exportBtn"/);
  assert.match(html, /id="exportMenu"/);
  assert.match(html, /id="exportPdfBtn"/);
  assert.match(html, /id="exportMarkdownBtn"/);
  assert.match(html, /data-mv-overflow-section="File"/);
});

test("print export uses an allowlisted print root", () => {
  const css = extractStyleText(html);
  const allowlistRule = extractBlock(
    css,
    "body.export-pdf-active > *:not(#markvExportPrintRoot)",
  );
  const rootRule = extractBlock(
    css,
    "body.export-pdf-active #markvExportPrintRoot",
  );

  assert.match(allowlistRule, /display:\s*none !important;/);
  assert.match(rootRule, /display:\s*block !important;/);
  assert.match(exportHost, /markvExportPrintRoot/);
});

test("print stylesheet preserves reader tokens and prevents broken page breaks", () => {
  const css = extractStyleText(html);
  const pageRule = extractBlock(css, "@page");
  const printDocRule = extractBlock(
    css,
    ".export-print-document.markdown-body",
  );
  const headingRule = extractBlock(
    css,
    ".export-print-document.markdown-body h1",
  );
  const avoidRule = extractBlock(
    css,
    ".export-print-document.markdown-body pre",
  );
  const codeRule = extractBlock(
    css,
    ".export-print-document.markdown-body pre code.hljs",
  );

  assert.doesNotMatch(pageRule, /margin:\s*0\b/);
  assert.match(printDocRule, /color:\s*var\(--reader-fg-default\)/);
  assert.match(printDocRule, /orphans:\s*3;/);
  assert.match(printDocRule, /widows:\s*3;/);
  assert.match(headingRule, /break-after:\s*avoid;/);
  assert.match(headingRule, /page-break-after:\s*avoid;/);
  assert.match(avoidRule, /break-inside:\s*avoid;/);
  assert.match(avoidRule, /page-break-inside:\s*avoid;/);
  assert.match(codeRule, /var\(--reader-code-fg\)/);
});

test("export host is registered with command palette and disables busy commands", () => {
  assert.match(html, /window\.MarkVExportHost = window\.MarkVExportHostFactory/);
  assert.match(html, /exportHost: window\.MarkVExportHost/);
  assert.match(commandHost, /id: "command:export-pdf"/);
  assert.match(commandHost, /id: "command:export-markdown"/);
  assert.match(commandHost, /exportBusy/);
  assert.match(commandHost, /An export is already being prepared/);
});

test("mermaid svg export keeps readable internal styling", () => {
  assert.match(html, /function applyReadableMermaidPalette/);
  assert.match(html, /data-markv-mermaid-palette/);
  assert.match(html, /\.node rect, \.node circle, \.node ellipse/);
  assert.match(html, /\.edgePath \.path, \.flowchart-link/);
  assert.match(html, /\.label text, text, tspan/);
  assert.match(html, /applyReadableMermaidPalette\(svg\)/);
  assert.match(exportHost, /element\.closest\("svg"\)/);
});
