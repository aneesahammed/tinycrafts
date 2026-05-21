const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

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

test("export split inherits toolbar theme colors like other toolbar buttons", () => {
  const split = extractBlock(html, ".export-split {");
  const splitHover = extractBlock(
    html,
    '.export-split:hover:not(.is-disabled):not([aria-disabled="true"])',
  );
  const main = extractBlock(html, ".export-split__main {");
  const icon = extractBlock(html, ".export-split__main .icon");

  assert.match(split, /color:\s*var\(--fg-muted\);/);
  assert.match(split, /background:\s*transparent;/);
  assert.match(splitHover, /color:\s*var\(--fg-default\);/);
  assert.match(splitHover, /background:\s*var\(--bg-subtle\);/);
  assert.match(main, /color:\s*inherit;/);
  assert.match(icon, /color:\s*currentColor;/);
});
