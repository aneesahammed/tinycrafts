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
