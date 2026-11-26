const assert = require("node:assert/strict");
const test = require("node:test");

const shortcuts = require("../assets/shortcut-registry.js");

test("shortcut registry exposes stable command definitions", () => {
  assert.equal(shortcuts.get("global.search").key, "k");
  assert.equal(shortcuts.get("editor.link").shift, true);
  assert.ok(shortcuts.all().some((item) => item.id === "editor.bullet-list"));
});

test("shortcut labels are formatted consistently", () => {
  assert.match(shortcuts.describe("global.search"), /K$/);
  assert.match(shortcuts.describe("editor.link"), /Shift\+K$/);
  assert.equal(shortcuts.describe("editor.image"), "");
});

test("matches command-or-control shortcuts", () => {
  assert.equal(
    shortcuts.matches(
      { key: "k", code: "KeyK", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
      "global.search",
    ),
    true,
  );
  assert.equal(
    shortcuts.matches(
      { key: "k", code: "KeyK", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
      "editor.link",
    ),
    false,
  );
  assert.equal(
    shortcuts.matches(
      { key: "K", code: "KeyK", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
      "editor.link",
    ),
    true,
  );
});

test("matches shifted digit shortcuts by code", () => {
  assert.equal(
    shortcuts.matches(
      { key: "&", code: "Digit7", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
      "editor.numbered-list",
    ),
    true,
  );
  assert.equal(
    shortcuts.matches(
      { key: "*", code: "Digit8", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
      "editor.bullet-list",
    ),
    true,
  );
});

test("image markdown is toolbar and palette only, with no browser-conflicting key binding", () => {
  assert.equal(
    shortcuts.matches(
      { key: "i", code: "KeyI", ctrlKey: true, metaKey: false, shiftKey: false, altKey: true },
      "editor.image",
    ),
    false,
  );
  assert.equal(
    shortcuts.matches(
      { key: "i", code: "KeyI", ctrlKey: false, metaKey: true, shiftKey: false, altKey: true },
      "editor.image",
    ),
    false,
  );
});

test("find and replace uses Mod+F", () => {
  const registry = require("../assets/shortcut-registry.js");
  assert.equal(registry.matches({ key: "f", metaKey: true }, "editor.find"), true);
  assert.equal(registry.matches({ key: "f", metaKey: true, shiftKey: true }, "editor.find"), false);
});

test("no two shortcuts share the same key combination", () => {
  const registry = require("../assets/shortcut-registry.js");
  const seen = new Map();
  for (const s of registry.all()) {
    if (!s.key) continue;
    const combo = [s.mod, s.shift, s.alt, String(s.key).toLowerCase()].join("|");
    assert.ok(!seen.has(combo), `${s.id} clashes with ${seen.get(combo)}`);
    seen.set(combo, s.id);
  }
});
