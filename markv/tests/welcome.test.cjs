const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const welcome = require("../assets/welcome.js");

const markdown = fs.readFileSync("assets/welcome.md", "utf8");

test("every guided section heading exists in welcome.md", () => {
  assert.ok(markdown.startsWith(welcome.TITLE_LINE + "\n"), "title line drives welcome detection");
  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(headings, Object.keys(welcome.SECTION_GUIDES));
});

