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

function extractRuleBodies(source, selector) {
  const bodies = [];
  let offset = 0;
  while (offset < source.length) {
    const start = source.indexOf(selector, offset);
    if (start === -1) break;
    const body = extractBlock(source.slice(start), selector);
    bodies.push(body);
    offset = start + selector.length + body.length;
  }
  return bodies;
}

test("narrow reading panel scrolls internally instead of clipping", () => {
  const css = extractStyleText(html);
  const narrowBlock = extractBlock(css, "@media (max-width: 820px)");
  const sharedPanelRule = extractBlock(
    narrowBlock,
    ".reading-settings .reading-panel,\n        .ont-settings .ont-panel",
  );
  const readingRules = extractRuleBodies(
    narrowBlock,
    ".reading-settings .reading-panel",
  );

  assert.match(sharedPanelRule, /position:\s*fixed;/);
  assert.match(sharedPanelRule, /top:\s*12px;/);
  assert.match(sharedPanelRule, /bottom:\s*auto;/);
  assert.match(sharedPanelRule, /margin:\s*0 auto;/);
  assert.match(
    sharedPanelRule,
    /max-height:\s*min\(720px,\s*calc\(100dvh - 24px\)\);/,
  );
  assert.ok(
    readingRules.some((rule) => /overflow-y:\s*auto;/.test(rule)),
    "Expected narrow reading panel to use internal scrolling when constrained",
  );
  assert.ok(
    !readingRules.some((rule) => /overflow-y:\s*visible;/.test(rule)),
    "Narrow reading panel must not visibly overflow outside the viewport",
  );
});

test("desktop reader outline scrolls without requiring connections widget", () => {
  const css = extractStyleText(html);
  const railRule = extractBlock(css, ".reader-rail {\n        --reader-rail-top");
  const outlineRule = extractBlock(css, ".reader-outline {\n        display: grid");
  const connectionsOutlineRule = extractBlock(
    css,
    ".reader-rail.has-reader-connections .reader-outline",
  );

  assert.match(
    railRule,
    /max-height:\s*calc\(100dvh - var\(--reader-rail-top\) - 28px\);/,
  );
  assert.match(railRule, /overflow:\s*hidden;/);
  assert.match(outlineRule, /max-height:\s*min\(/);
  assert.match(outlineRule, /overflow-y:\s*auto;/);
  assert.match(outlineRule, /scrollbar-gutter:\s*stable;/);
  assert.doesNotMatch(
    connectionsOutlineRule,
    /overflow-y:\s*auto;/,
    "Connections state should not be the only path that makes the outline scrollable",
  );
});

test("stacked reader rail resets outline scrolling below desktop breakpoint", () => {
  const css = extractStyleText(html);
  const stackedBlock = extractBlock(css, "@media (max-width: 900px)");
  const stackedOutlineRule = extractBlock(stackedBlock, ".reader-outline");

  assert.match(stackedOutlineRule, /max-height:\s*none;/);
  assert.match(stackedOutlineRule, /overflow:\s*visible;/);
  assert.match(stackedOutlineRule, /scrollbar-gutter:\s*auto;/);
});

test("reader outline renders all headings even when connections are present", () => {
  assert.doesNotMatch(html, /READER_OUTLINE_MAX_ITEMS/);
  assert.doesNotMatch(html, /outline\.slice\(/);
  assert.match(
    html,
    /const html =\s*renderReaderOutlineSection\(outline\) \+\s*connectionsHtml;/,
  );
});

test("breadcrumb and reader rail share active heading calculation", () => {
  assert.match(html, /function getReaderActiveHeading\(headings\)/);
  assert.match(html, /window\.innerHeight \* 0\.42/);
  assert.match(
    html,
    /const active = getReaderActiveHeading\(readerOutlineHeadings\);/,
  );
  assert.match(html, /const active = getReaderActiveHeading\(headings\);/);
  assert.doesNotMatch(
    html,
    /const threshold = 120;/,
    "Breadcrumb must not keep a separate hard-coded threshold",
  );
});

test("reader palette themes all document workspace surfaces", () => {
  const css = extractStyleText(html);
  const bridgeRule = extractBlock(
    css,
    "body:is(.preview-mode, .edit-mode-active, .mindmap-open) .toolbar,\n      .preview-pane,\n      .editor-pane,\n      .mindmap-viewer,\n      .mermaid-viewer",
  );
  const bodyRule = extractBlock(
    css,
    "body:is(.preview-mode, .edit-mode-active, .mindmap-open),\n      body:is(.preview-mode, .edit-mode-active, .mindmap-open) .app,\n      body:is(.preview-mode, .edit-mode-active, .mindmap-open) .main",
  );
  const editorRule = extractBlock(css, ".editor-pane {\n        flex: 1");
  const mermaidShellRule = extractBlock(css, ".mermaid-viewer-shell");
  const mindmapRule = extractBlock(css, ".mindmap-viewer {\n        position: fixed");

  assert.match(bridgeRule, /--bg-canvas:\s*var\(--reader-bg-canvas/);
  assert.match(bridgeRule, /--fg-default:\s*var\(--reader-fg-default/);
  assert.match(bridgeRule, /--mm-canvas-bg:\s*var\(--reader-bg-canvas/);
  assert.match(bodyRule, /background:\s*var\(--reader-bg-canvas/);
  assert.match(editorRule, /background:\s*var\(--bg-canvas\);/);
  assert.match(mermaidShellRule, /background:\s*var\(--bg-canvas\);/);
  assert.match(mindmapRule, /background:\s*color-mix\(in srgb, var\(--bg-canvas\)/);
});
