const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const commandPalette = fs.readFileSync("assets/command-palette.js", "utf8");

test("command palette rows execute the displayed result order", () => {
  assert.match(
    commandPalette,
    /const filteredResults = core\.filterPaletteItems\(allItems, query/,
  );
  assert.match(
    commandPalette,
    /core\.groupPaletteResultsForDisplay\(filteredResults, query\)/,
  );
  assert.match(
    commandPalette,
    /const displayIndex = results\.length;[\s\S]*results\.push\(result\);[\s\S]*renderResultRow\(result, displayIndex\)/,
  );
  assert.doesNotMatch(commandPalette, /let flatIndex = 0/);
});
