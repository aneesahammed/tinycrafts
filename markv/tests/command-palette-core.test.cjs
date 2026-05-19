const test = require("node:test");
const assert = require("node:assert/strict");

const palette = require("../assets/command-palette-core.js");

function item(input) {
  return Object.assign(
    {
      id: "item",
      type: "command",
      groupLabel: "Commands",
      title: "",
      subtitle: "",
      defaultVisible: true,
      defaultRank: 100,
    },
    input,
  );
}

test("exact basename beats path substring", () => {
  const results = palette.filterPaletteItems(
    [
      item({
        id: "a",
        type: "file",
        title: "phase-12-spec.md",
        subtitle: "docs/phases/phase-12-spec.md",
        defaultVisible: false,
        searchFields: [
          { value: "phase-12-spec.md", weight: 110 },
          { value: "docs/phases/phase-12-spec.md", weight: 70 },
        ],
      }),
      item({
        id: "b",
        type: "file",
        title: "overview.md",
        subtitle: "docs/phases/phase-12-spec/overview.md",
        defaultVisible: false,
        searchFields: [
          { value: "overview.md", weight: 110 },
          { value: "docs/phases/phase-12-spec/overview.md", weight: 70 },
        ],
      }),
    ],
    "phase 12 spec",
  );

  assert.equal(results[0].item.id, "a");
});

test("multi-token path queries match path segments", () => {
  const results = palette.filterPaletteItems(
    [
      item({
        id: "target",
        type: "file",
        title: "phase-12-spec.md",
        subtitle: "docs/phases/phase-12-spec.md",
        defaultVisible: false,
      }),
    ],
    "phase 12",
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].item.id, "target");
});

test("regex metacharacters are treated as text-like separators", () => {
  const results = palette.filterPaletteItems(
    [
      item({
        id: "target",
        type: "file",
        title: "phase-12-spec.md",
        subtitle: "docs/phases/phase-12-spec.md",
        defaultVisible: false,
      }),
    ],
    "phase.*12",
  );

  assert.equal(results[0].item.id, "target");
  assert.deepEqual(palette.getLiteralMatchRanges("phase.*12", ".*+?()"), []);
});

test("whitespace-only query returns default command set", () => {
  const results = palette.filterPaletteItems(
    [
      item({ id: "default", title: "Open file", defaultVisible: true }),
      item({ id: "hidden", title: "phase-12-spec.md", defaultVisible: false }),
    ],
    "   ",
  );

  assert.deepEqual(
    results.map((result) => result.item.id),
    ["default"],
  );
});

test("disabled results return disabled action state and reason", () => {
  const disabled = item({
    disabled: true,
    disabledReason: "Reauthorize this folder from Files first.",
  });

  assert.deepEqual(palette.getPaletteActionState(disabled), {
    action: "disabled",
    reason: "Reauthorize this folder from Files first.",
  });
});

test("keyboard reducer covers arrows, home, end, enter, and escape", () => {
  assert.deepEqual(
    palette.reducePaletteKeyboard({ activeIndex: 0, query: "phase" }, "Escape", 3),
    { action: "clear", activeIndex: 0, query: "" },
  );
  assert.deepEqual(
    palette.reducePaletteKeyboard({ activeIndex: 0, query: "" }, "Escape", 3),
    { action: "close", activeIndex: 0, query: "" },
  );
  assert.equal(
    palette.reducePaletteKeyboard({ activeIndex: 2 }, "ArrowDown", 3).activeIndex,
    0,
  );
  assert.equal(
    palette.reducePaletteKeyboard({ activeIndex: 0 }, "ArrowUp", 3).activeIndex,
    2,
  );
  assert.equal(
    palette.reducePaletteKeyboard({ activeIndex: 1 }, "Home", 3).activeIndex,
    0,
  );
  assert.equal(
    palette.reducePaletteKeyboard({ activeIndex: 1 }, "End", 3).activeIndex,
    2,
  );
  assert.equal(
    palette.reducePaletteKeyboard({ activeIndex: 1 }, "Enter", 3).action,
    "execute",
  );
});

test("result limiting and grouping are deterministic", () => {
  const results = palette.filterPaletteItems(
    [
      item({ id: "cmd", type: "command", title: "Open file", defaultRank: 20 }),
      item({ id: "file", type: "file", title: "open-notes.md", defaultVisible: false }),
      item({ id: "draft", type: "draft", title: "Open draft", defaultVisible: false }),
    ],
    "open",
    { limit: 2 },
  );
  const groups = palette.groupPaletteResults(results);

  assert.equal(results.length, 2);
  assert.deepEqual(
    groups.map((group) => group.type),
    ["command", "file"],
  );
});
