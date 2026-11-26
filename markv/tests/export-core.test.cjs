const test = require("node:test");
const assert = require("node:assert/strict");

const exportCore = require("../assets/export-core.js");

test("filename sanitizer removes unsafe and control characters", () => {
  assert.equal(
    exportCore.sanitizeFileBaseName('  ../Bad:Name*?\u202e.md  '),
    "Bad-Name",
  );
  assert.equal(exportCore.sanitizeFileBaseName("CON"), "markv-CON");
  assert.equal(exportCore.sanitizeFileBaseName("lpt9.txt"), "markv-lpt9");
});

test("filename sanitizer falls back and limits length", () => {
  assert.equal(exportCore.sanitizeFileBaseName("...   "), "untitled");
  const longName = "a".repeat(140);
  assert.equal(exportCore.sanitizeFileBaseName(longName).length, 96);
});

test("export basename prefers current file, then first h1, then untitled", () => {
  assert.equal(
    exportCore.deriveExportBaseName({
      currentName: "go-advanced.md",
      markdown: "# Ignored",
    }),
    "go-advanced",
  );
  assert.equal(
    exportCore.deriveExportBaseName({
      currentName: "",
      markdown: "---\ntitle: x\n---\n\n# Project / Plan: V1",
    }),
    "Project-Plan-V1",
  );
  assert.equal(
    exportCore.deriveExportBaseName({
      currentName: "",
      markdown: "plain text",
    }),
    "untitled",
  );
});

test("markdown blank detection treats headings and frontmatter as content", () => {
  assert.equal(exportCore.isBlankMarkdown("  \n\t"), true);
  assert.equal(exportCore.isBlankMarkdown("# Heading"), false);
  assert.equal(exportCore.isBlankMarkdown("---\ntitle: Draft\n---"), false);
});

test("platform print message is deterministic", () => {
  assert.equal(
    exportCore.getPlatformPrintMessage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
    "Choose Save as PDF in the print dialog.",
  );
  assert.equal(
    exportCore.getPlatformPrintMessage({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS)",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
    "Use the share sheet to save or send the PDF.",
  );
  assert.equal(
    exportCore.getPlatformPrintMessage({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel)",
      platform: "Linux armv8",
      maxTouchPoints: 5,
    }),
    "Use your browser print or share sheet to save the PDF.",
  );
});

test("readiness helpers count pending mermaid and images", () => {
  const loading = {
    classList: {
      contains(value) {
        return value === "is-loading";
      },
    },
  };
  const ready = {
    classList: {
      contains() {
        return false;
      },
    },
  };
  const root = {
    querySelectorAll(selector) {
      if (selector === ".mermaid-block") return [loading, ready];
      if (selector === "img") {
        return [
          { complete: true, naturalWidth: 100 },
          { complete: false, naturalWidth: 0 },
          { complete: true, naturalWidth: 0 },
        ];
      }
      return [];
    },
  };

  assert.deepEqual(exportCore.getMermaidReadiness(root), {
    total: 2,
    ready: 1,
    pending: 1,
  });
  assert.deepEqual(exportCore.getImageReadiness(root), {
    total: 3,
    ready: 2,
    pending: 1,
    broken: 1,
  });
});

test("isExportableSelector keeps document and theme rules only", () => {
  const ok = exportCore.isExportableSelector;
  for (const s of [":root", "[data-theme=\"dark\"]", ".markdown-body h2", ".hljs-keyword", ".katex .mfrac", "html", "body"])
    assert.equal(ok(s), true, s);
  for (const s of [".toolbar", "#libraryDrawer .row", ".command-palette"]) assert.equal(ok(s), false, s);
});

test("buildStandaloneHtml neutralises closing tags", () => {
  const html = exportCore.buildStandaloneHtml({ title: "A </title><script>x</script>", theme: "dark",
    css: "p{content:'</style><script>'}", links: [], bodyHtml: "<p>hi</p>" });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.equal((html.match(/<\/style>/g) || []).length, 1);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /<main class="markdown-body export-html-document"><p>hi<\/p><\/main>/);
});

test("buildStandaloneHtml links external stylesheets with escaped hrefs", () => {
  const html = exportCore.buildStandaloneHtml({ title: "T", theme: "light", css: "",
    links: ["https://cdn.test/k.css?a=1&b=\"2\""], bodyHtml: "" });
  assert.match(html, /<link rel="stylesheet" href="https:\/\/cdn\.test\/k\.css\?a=1&amp;b=&quot;2&quot;">/);
});

test("inlineBlobImages embeds known folder images and leaves unknown ones", async () => {
  const make = (src) => ({ attrs: { src }, getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; } });
  const known = make("blob:http://x/known");
  const unknown = make("blob:http://x/unknown");
  const root = { querySelectorAll: (sel) => (sel === 'img[src^="blob:"]' ? [known, unknown] : []) };
  const files = new Map([["blob:http://x/known", { name: "a.png" }]]);
  const count = await exportCore.inlineBlobImages(
    root,
    (url) => files.get(url) || null,
    async (file) => "data:image/png;base64," + file.name,
  );
  assert.equal(count, 1);
  assert.equal(known.getAttribute("src"), "data:image/png;base64,a.png");
  assert.equal(unknown.getAttribute("src"), "blob:http://x/unknown");
});
