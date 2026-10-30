const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../assets/library-core.js");
const { functionSource, between, runtime } = require("./helpers/inline-app.cjs");

function library() {
  let reads = 0;
  const texts = new Map([
    ["a.md", "# Alpha\n\n[Beta](b.md)"],
    ["b.md", "# Beta\n\nOriginal summary.\n\n[Alpha](a.md)"],
    ["c.md", "# Gamma\n\nAnother document."],
  ]);
  const handles = new Map([...texts.keys()].map((path) => [path, {
    getFile: async () => ({ text: async () => { reads++; return texts.get(path); } }),
  }]));
  const folder = { id: "folder", status: "ready", fileHandlesByPath: handles };
  const ctx = runtime({
    state: { sourceMode: "library", libraryActiveFolderId: "folder", libraryActiveFilePath: "a.md" },
    libraryCore: core, libraryContextIndexes: new WeakMap(),
    getLibraryFolderById: () => folder, yieldToUi: async () => {},
  }, [functionSource("getMindmapFallbackPath"),
    between("        function getOrderedLibraryMindmapPaths(", "        function getMindmapLibraryContextCacheKey(")]);
  return { ctx, folder, texts, reads: () => reads };
}

test("reopening a document reuses other files' parsed connection metadata", async () => {
  const { ctx, texts, reads } = library();
  const first = await ctx.buildActiveLibraryMindmapContext(texts.get("a.md"));
  assert.equal(first.outboundLinks[0].path, "b.md");
  assert.equal(first.backlinks[0].path, "b.md");
  assert.equal(reads(), 2);
  const second = await ctx.buildActiveLibraryMindmapContext(texts.get("a.md"));
  assert.equal(second.outboundLinks[0].path, "b.md");
  assert.equal(reads(), 2, "unchanged files are not reread");
});

test("refreshing the folder invalidates cached connection metadata", async () => {
  const { ctx, folder, texts, reads } = library();
  await ctx.buildActiveLibraryMindmapContext(texts.get("a.md"));
  texts.set("b.md", "# Renamed Beta\n\nUpdated summary.");
  folder.fileHandlesByPath = new Map(folder.fileHandlesByPath);
  const refreshed = await ctx.buildActiveLibraryMindmapContext(texts.get("a.md"));
  assert.equal(refreshed.outboundLinks[0].title, "Renamed Beta");
  assert.equal(refreshed.backlinks.length, 0);
  assert.equal(reads(), 4);
});

test("a changed current document replaces its cached metadata without rereading neighbors", async () => {
  const { ctx, texts, reads } = library();
  await ctx.buildActiveLibraryMindmapContext(texts.get("a.md"));
  const updated = await ctx.buildActiveLibraryMindmapContext("# Changed Alpha\n\n[Gamma](c.md)");
  assert.equal(updated.current.title, "Changed Alpha");
  assert.equal(updated.outboundLinks[0].path, "c.md");
  assert.equal(reads(), 2);
});

test("connection building accepts parsed metadata without retaining source text", () => {
  const context = core.buildLibraryMindmapContext({
    currentPath: "a.md", currentMarkdown: "# Alpha\n\n[Beta](b.md)",
    documents: [{ path: "b.md", title: "Beta", summary: "A cached summary", categories: [], headings: [], links: [] }],
  });
  assert.equal(context.outboundLinks.length, 1);
  assert.equal(context.outboundLinks[0].title, "Beta");
});
