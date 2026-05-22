const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

function extractFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}()`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Could not find body for ${name}`);

  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, i);
    }
  }

  throw new Error(`Could not extract body for ${name}`);
}

test("document title avoids duplicating the MarkV app name", () => {
  const updateBrandDisplay = extractFunctionBody(html, "updateBrandDisplay");

  assert.match(updateBrandDisplay, /document\.title = rawName \|\| "Untitled";/);
  assert.match(updateBrandDisplay, /document\.title = stripped;/);
  assert.match(updateBrandDisplay, /document\.title = "Untitled";/);
  assert.match(updateBrandDisplay, /document\.title = "Markdown Viewer";/);
  assert.doesNotMatch(updateBrandDisplay, /document\.title = .*MarkV/);
});
