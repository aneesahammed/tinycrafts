const test = require("node:test");
const assert = require("node:assert/strict");
const { html, between, functionSource, runtime } = require("./helpers/inline-app.cjs");
const shortcuts = require("../assets/shortcut-registry.js");

const app = runtime({ copySourceAttributes() {} }, [
  functionSource("buildSplitScrollMap"),
  functionSource("mapSplitScroll"),
  functionSource("reuseMermaidDiagrams"),
]);

test("scroll map pairs blocks, drops anchors that go backwards, and joins both ends", () => {
  const map = app.buildSplitScrollMap(
    [
      { editor: 600, preview: 100 }, // long frontmatter, short header
      { editor: 500, preview: 150 }, // out of order: ignored
      { editor: 800, preview: 500 },
      { editor: 5000, preview: 900 }, // past the editor's end: ignored
    ],
    1000,
    2000,
  );
  assert.equal(map.length, 4);
  const go = (from, to, y) => app.mapSplitScroll(map, from, to, y);
  assert.equal(go("editor", "preview", 600), 100);
  assert.equal(go("preview", "editor", 100), 600);
  assert.equal(go("editor", "preview", 700), 300);
  assert.equal(go("editor", "preview", 0), 0);
  assert.equal(go("editor", "preview", Infinity), 2000);
  assert.equal(go("preview", "editor", Infinity), 1000);
});

test("a document that fits on screen maps without dividing by zero", () => {
  const map = app.buildSplitScrollMap([], 0, 0);
  assert.equal(app.mapSplitScroll(map, "editor", "preview", Infinity), 0);
});

test("unchanged diagrams are moved across; an edited one keeps its last drawing", () => {
  const host = (source, stale) => ({
    dataset: { mermaidSource: source, ...(stale ? { mermaidStale: "true" } : {}) },
    innerHTML: "<svg>" + source + "</svg>",
    classList: { remove() {} },
    replaceWith(next) { this.replacedBy = next; },
  });
  const blocks = [
    { source: "same", index: 0, host: host("same") },
    { source: "edited", index: 1, host: host("edited") },
  ];
  const old = [host("same"), host("before")];
  const pending = app.reuseMermaidDiagrams(blocks, old);
  assert.equal(blocks[0].host.replacedBy, old[0]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].source, "edited");
  assert.equal(pending[0].host.innerHTML, "<svg>before</svg>");
  assert.equal(pending[0].host.dataset.mermaidStale, "true");

  const again = [{ source: "edited", index: 0, host: host("edited") }];
  assert.equal(
    app.reuseMermaidDiagrams(again, [host("edited", true)]).length, 1,
    "a drawing that is still out of date must be rendered, not reused",
  );
});

test("split is edit mode with a live preview, and the editor has no focus box", () => {
  assert.match(functionSource("render"), /isEditModeActive\(\) && !splitActive/);
  assert.doesNotMatch(html, /#editor:focus-visible \{\s*outline: 2px/);
  assert.match(between("#splitModeBtn {", "}"), /display: none/);
  const event = { key: "E", code: "KeyE", metaKey: true, shiftKey: true, altKey: false };
  assert.equal(shortcuts.matches(event, "global.split"), true);
  assert.equal(shortcuts.matches(event, "global.mode"), false);
});

test("a live edit replaces only the blocks between the common start and end", () => {
  const { findChangedBlocks } = runtime({}, [functionSource("findChangedBlocks")]);
  const diff = (a, b) => ({ ...findChangedBlocks([...a], [...b]) });
  assert.deepEqual(diff("abcde", "abXde"), { start: 2, tail: 2 });
  assert.deepEqual(diff("abc", "abc"), { start: 3, tail: 0 });
  assert.deepEqual(diff("abc", "abbc"), { start: 2, tail: 1 });
  assert.deepEqual(diff("aaa", "aa"), { start: 2, tail: 0 });
  assert.deepEqual(diff("", "ab"), { start: 0, tail: 0 });
  assert.deepEqual(diff("ab", ""), { start: 0, tail: 0 });
});
