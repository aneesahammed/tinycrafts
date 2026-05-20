const test = require("node:test");
const assert = require("node:assert/strict");

const visualBlocks = require("../assets/visual-blocks.js");

test("slash menu opens on / in editor context", () => {
  const state = visualBlocks.getVisualBlockMenuState({
    value: "/",
    selectionStart: 1,
    selectionEnd: 1,
    isEditMode: true,
  });

  assert.equal(state.open, true);
  assert.deepEqual(state.context, { start: 0, end: 1, query: "" });
  assert.ok(state.commands.length > 0);
  assert.equal(state.commands[0].id, "diagram.flowchart");
});

test("search filters commands by aliases, description, and category", () => {
  const apiFlow = visualBlocks.filterVisualBlockCommands("api flow");
  assert.equal(apiFlow[0].id, "diagram.sequence");
  assert.ok(apiFlow.every((command) => command.id !== "diagram.flowchart"));

  const database = visualBlocks.filterVisualBlockCommands("database");
  assert.equal(database[0].id, "diagram.er");

  const diagram = visualBlocks.filterVisualBlockCommands("diagram");
  assert.ok(diagram.some((command) => command.id === "diagram.architecture"));
  assert.ok(diagram.every((command) => command.category === "Diagram"));
});

test("advanced diagrams are searchable without cluttering the default list", () => {
  const defaults = visualBlocks.filterVisualBlockCommands("");
  assert.ok(defaults.some((command) => command.id === "diagram.flowchart"));
  assert.ok(defaults.some((command) => command.id === "diagram.gantt"));
  assert.ok(!defaults.some((command) => command.id === "diagram.architecture"));

  const advanced = visualBlocks.filterVisualBlockCommands("architecture");
  assert.deepEqual(
    advanced.map((command) => command.id),
    ["diagram.architecture"],
  );
});

test("display order matches grouped slash menu rows for advanced diagram search", () => {
  const commands = visualBlocks.filterVisualBlockCommands("x");
  const sections = visualBlocks.getVisualBlockCommandSections(commands, "x");
  const display = visualBlocks.getVisualBlockDisplayCommands(commands, "x");
  const sectionOrder = sections.flatMap((section) => section.commands);

  assert.deepEqual(
    display.map((command) => command.id),
    sectionOrder.map((command) => command.id),
  );
  assert.equal(display[0].id, "diagram.xy");
  assert.equal(display[1].id, "diagram.quadrant");

  const insertion = visualBlocks.createVisualBlockInsertion(
    "/x",
    0,
    2,
    display[0],
  );
  assert.match(insertion.replacement, /^```mermaid\nxychart-beta/);
});

test("expanded default sections keep advanced diagrams discoverable but separated", () => {
  const commands = visualBlocks.filterVisualBlockCommands("", {
    includeAdvanced: true,
  });
  const sections = visualBlocks.getVisualBlockCommandSections(commands, "", {
    groupAdvancedDiagrams: true,
  });
  const diagram = sections.find((section) => section.title === "Diagram");
  const moreDiagrams = sections.find(
    (section) => section.title === "More diagrams",
  );

  assert.ok(diagram);
  assert.ok(moreDiagrams);
  assert.ok(
    diagram.commands.every(
      (command) => command.category !== "Diagram" || !command.advanced,
    ),
  );
  assert.ok(
    moreDiagrams.commands.some((command) => command.id === "diagram.xy"),
  );
  assert.ok(
    moreDiagrams.commands.every(
      (command) => command.category === "Diagram" && command.advanced,
    ),
  );
});

test("Enter inserts the selected template and places cursor at editable text", () => {
  const value = "/flow";
  const context = visualBlocks.getSlashQueryContext(value, value.length, value.length);
  const menuState = {
    open: true,
    activeIndex: 0,
  };
  const nextKeyState = visualBlocks.reduceVisualBlockMenuKey(
    menuState,
    "Enter",
    1,
  );
  const command = visualBlocks.getVisualBlockCommandById("diagram.flowchart");
  const insertion = visualBlocks.createVisualBlockInsertion(
    value,
    context.start,
    context.end,
    command,
  );

  assert.equal(nextKeyState.action, "insert");
  assert.match(insertion.value, /^```mermaid\nflowchart TD/);
  assert.equal(
    insertion.value.slice(insertion.selectionStart, insertion.selectionEnd),
    "Begin",
  );
});

test("Escape closes the slash menu", () => {
  const next = visualBlocks.reduceVisualBlockMenuKey(
    { open: true, activeIndex: 2 },
    "Escape",
    5,
  );

  assert.equal(next.open, false);
  assert.equal(next.action, "close");
  assert.equal(next.activeIndex, 2);
});

test("Mermaid templates are inserted with complete Markdown fences", () => {
  const command = visualBlocks.getVisualBlockCommandById("diagram.kanban");
  const insertion = visualBlocks.createVisualBlockInsertion("", 0, 0, command);

  assert.match(insertion.value, /^```mermaid\nkanban\n/);
  assert.match(insertion.value, /Backlog/);
  assert.match(insertion.value, /\n```$/);
  assert.equal(
    insertion.value.slice(insertion.selectionStart, insertion.selectionEnd),
    "Backlog",
  );
});
