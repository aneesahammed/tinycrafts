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

test("expand/collapse all covers subfolders, and roots only when there are several", () => {
  const core = require("../assets/library-core.js");
  const run = (folders, expanded, collapsed) => {
    const ctx = runtime(
      {
        state: { libraryFolders: folders, libraryExpandedPathsByFolder: expanded },
        getLibraryDirectoryPaths: core.getLibraryDirectoryPaths,
        getLibraryExpandedPaths: (id) => expanded[id] || [],
        isLibraryFolderCollapsed: (id) => collapsed.includes(id),
      },
      [functionSource("getLibraryCollapseSummary"), functionSource("renderLibraryToggleAll")],
    );
    return { ...ctx.getLibraryCollapseSummary(), html: ctx.renderLibraryToggleAll() };
  };
  const kb = { id: "kb", tree: tree(false) };
  const flat = { id: "flat", tree: [file("a.md")] };

  assert.equal(run([flat], {}, []).available, false, "a lone flat folder has its own arrow");
  assert.match(run([flat], {}, []).html, / hidden>/);
  assert.equal(run([flat, kb], {}, []).available, true);

  const closed = run([kb], {}, []);
  assert.deepEqual([closed.available, closed.anyOpen], [true, false], "an open root alone is not 'open'");
  assert.match(closed.html, /data-mode="expand" aria-label="Expand all folders"/);
  assert.equal(run([kb], { kb: ["guides"] }, []).anyOpen, true);
  assert.equal(run([kb], { kb: ["guides"] }, ["kb"]).anyOpen, false, "hidden inside a closed root");
  assert.equal(run([kb, flat], {}, ["kb"]).anyOpen, true);
  assert.equal(run([kb, flat], {}, ["kb", "flat"]).anyOpen, false);
});

test("the toggle lives on the Library row, not in the panel header", () => {
  assert.doesNotMatch(between('<header class="lib-header"', "</header>"), /toggle-all/);
  assert.match(functionSource("buildLibraryBodyHtml"), /lib-section-head/);
});
