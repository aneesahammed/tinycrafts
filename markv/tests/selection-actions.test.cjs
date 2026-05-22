const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

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

function extractEventListenerBody(source, target, eventName) {
  const needle = `${target}.addEventListener("${eventName}", function`;
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

test("selection bubble exposes copy as a first-class text action", () => {
  assert.match(html, /id="selectionCopyBtn"/);
  assert.match(html, /title="Copy selection"/);
  assert.match(html, />\s*Copy\s*<\/button>/);
});

test("highlight action is emphasized without looking selected", () => {
  const css = extractStyleText(html);
  const primaryRule = extractBlock(css, ".selection-action-primary");
  const primaryHoverRule = extractBlock(css, ".selection-action-primary:hover");

  assert.match(primaryRule, /var\(--accent-fg\)/);
  assert.match(primaryRule, /border-color:/);
  assert.doesNotMatch(primaryRule, /background:\s*var\(--fg-default\)/);
  assert.doesNotMatch(primaryRule, /color:\s*var\(--bg-canvas\)/);
  assert.doesNotMatch(primaryHoverRule, /background:\s*var\(--fg-default\)/);
  assert.doesNotMatch(primaryHoverRule, /color:\s*var\(--bg-canvas\)/);
});

test("right-click on selected preview text keeps the native browser context menu", () => {
  const contextMenuHandler = extractEventListenerBody(
    html,
    "document",
    "contextmenu",
  );

  assert.doesNotMatch(contextMenuHandler, /event\.preventDefault\(\)/);
  assert.doesNotMatch(contextMenuHandler, /showContextMenu\(/);
});
