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
