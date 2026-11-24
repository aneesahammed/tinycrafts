const test = require("node:test");
const assert = require("node:assert/strict");
const { html, between, functionSource, runtime } = require("./helpers/inline-app.cjs");

const state = { libraryActiveFolderId: "", libraryActiveFilePath: "" };
const app = runtime(
  { state, libraryCore: require("../assets/library-core.js") },
  [
    functionSource("escapeHtml"),
    between("        function libraryIcon(", "        function renderLibraryDraftsSection("),
    between("        const FRONTMATTER_ROLES", "        function isFrontmatterUrl("),
    functionSource("getFrontmatterTitle"),
    functionSource("getFirstHeadingTitle"),
    functionSource("renderLibraryBranch"),
    functionSource("renderLibraryNode"),
    functionSource("splitLibraryNodes"),
    functionSource("renderLibraryTreeNodes"),
    functionSource("findLibraryNode"),
  ],
);

const file = (path) => ({ type: "file", name: path.split("/").pop(), path });
const tree = (expanded) => [
  { type: "directory", name: "guides", path: "guides", expanded, children: [file("guides/start.md")] },
];

test("collapsed directories stay empty and inert; open ones render children", () => {
  const closed = app.renderLibraryTreeNodes(tree(false), "f", 0);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /data-open="false" inert/);
  assert.match(closed, /lib-count">1</);
  assert.doesNotMatch(closed, /start\.md/);
  const open = app.renderLibraryTreeNodes(tree(true), "f", 0);
  assert.match(open, /libIconFolderOpen/);
  assert.match(open, /start\.md/);
  assert.equal(app.findLibraryNode(tree(true), "guides", "directory").name, "guides");
  assert.equal(app.findLibraryNode(tree(true), "guides", "file"), null);
});

test("rows take their title from frontmatter, then the first H1", () => {
  const read = (markdown) => ({ ...app.readLibraryFileMeta(markdown) });
  assert.deepEqual(read("---\nname: Garry Tan\nstatus: draft\n---\n# Other\n"), { title: "Garry Tan", status: "draft" });
  assert.deepEqual(read("---\ndraft: true\n---\n# Heading\n"), { title: "Heading", status: "Draft" });
  assert.deepEqual(read("no heading"), { title: "", status: "" });
});

test("long folders hide the tail, but never one or two files nor the open one", () => {
  const list = (n) => Array.from({ length: n }, (_, i) => file("f" + i + ".md"));
  assert.doesNotMatch(app.renderLibraryTreeNodes(list(10), "f", 0), /show-more/);
  assert.match(app.renderLibraryTreeNodes(list(14), "f", 0), /Show 6 more/);
  state.libraryActiveFolderId = "f";
  state.libraryActiveFilePath = "f13.md";
  const open = app.renderLibraryTreeNodes(list(14), "f", 0);
  assert.doesNotMatch(open, /show-more/);
  assert.match(open, /f13\.md/);
});

test("the docked sidebar never blurs, dims or modal-traps the document", () => {
  const css = between("/* ---------- Files sidebar", "/* ---------- Global Settings");
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.match(css, /@media \(min-width: 901px\) \{\s*\.lib-overlay,\s*\.lib-close \{\s*display: none/);
  const aside = between('id="libraryDrawer"', "</aside>");
  assert.doesNotMatch(aside, /aria-modal/);
  assert.match(functionSource("wireLibraryUi"), /if \(isLibraryDocked\(\)\) return;/);
  assert.ok(html.indexOf('id="libraryDrawer"') < html.indexOf('id="main"'));
});

test("reading stats are generated content, not toolbar chrome", () => {
  const toolbar = between('<header class="toolbar"', "</header>");
  assert.doesNotMatch(toolbar, /wordCount/);
  assert.match(html, /content: var\(--reading-stats, none\)/);
});
