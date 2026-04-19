const test = require("node:test");
const assert = require("node:assert/strict");

let core;
try {
  core = require("../assets/library-core.js");
} catch (_error) {
  core = {};
}

test("matches supported markdown extensions case-insensitively", () => {
  assert.equal(core.isSupportedLibraryFile?.("README.MD"), true);
  assert.equal(core.isSupportedLibraryFile?.("notes.mdx"), false);
});

test("sorts directories before files with natural labels", () => {
  const entries = [
    { type: "file", name: "10.md" },
    { type: "directory", name: "zeta" },
    { type: "file", name: "2.md" },
    { type: "directory", name: "alpha" },
  ];
  assert.deepEqual(
    core.sortLibraryEntries?.(entries).map((entry) => entry.name),
    ["alpha", "zeta", "2.md", "10.md"],
  );
});

test("rejects duplicate and overlapping roots", () => {
  const folders = [
    { id: "a", pathKey: "/Users/me/notes" },
    { id: "b", pathKey: "/Users/me/wiki" },
  ];
  assert.equal(
    core.getFolderConflict?.(folders, "/Users/me/notes"),
    "duplicate",
  );
  assert.equal(
    core.getFolderConflict?.(folders, "/Users/me/notes/work"),
    "overlap",
  );
  assert.equal(core.getFolderConflict?.(folders, "/Users/me/new"), null);
});

test("normalizes persisted library metadata", () => {
  const normalized = core.normalizeLibraryMeta?.({
    folderOrder: ["b", "a"],
    expandedPathsByFolder: { a: ["guides"] },
    lastActiveFile: { folderId: "a", path: "guides/intro.md" },
  });
  assert.deepEqual(normalized, {
    folderOrder: ["b", "a"],
    expandedPathsByFolder: { a: ["guides"] },
    lastActiveFile: { folderId: "a", path: "guides/intro.md" },
  });
});

test("builds a markdown-only tree and prunes empty directories", () => {
  const tree = core.shapeLibraryTree?.(
    [
      { kind: "file", path: "README.md" },
      { kind: "file", path: "drafts/plan.txt" },
      { kind: "file", path: "drafts/raw.json" },
      { kind: "file", path: "assets/logo.svg" },
    ],
    { expandedPaths: ["drafts"] },
  );

  assert.deepEqual(tree, [
    {
      type: "directory",
      path: "drafts",
      name: "drafts",
      expanded: true,
      children: [{ type: "file", path: "drafts/plan.txt", name: "plan.txt" }],
    },
    { type: "file", path: "README.md", name: "README.md" },
  ]);
});

test("skips auto-restore when session draft content exists", () => {
  assert.equal(
    core.shouldAutoRestoreLastFile?.({
      hasSessionDraft: true,
      lastActiveFile: { folderId: "a", path: "README.md" },
    }),
    false,
  );
  assert.equal(
    core.shouldAutoRestoreLastFile?.({
      hasSessionDraft: false,
      lastActiveFile: { folderId: "a", path: "README.md" },
    }),
    true,
  );
});

test("clears library collection state for a full reset", () => {
  assert.deepEqual(
    core.getClearedLibraryCollectionState?.({
      libraryFolders: [{ id: "docs" }],
      libraryFolderOrder: ["docs"],
      libraryExpandedPathsByFolder: { docs: ["guides"] },
      libraryActiveFolderId: "docs",
      libraryActiveFilePath: "guides/intro.md",
      libraryCurrentFileHandle: { kind: "file" },
      libraryCurrentFolderHandle: { kind: "directory" },
      libraryNextScanRevision: 4,
    }),
    {
      libraryFolders: [],
      libraryFolderOrder: [],
      libraryExpandedPathsByFolder: {},
      libraryActiveFolderId: "",
      libraryActiveFilePath: "",
      libraryCurrentFileHandle: null,
      libraryCurrentFolderHandle: null,
      libraryNextScanRevision: 5,
    },
  );
});

test("normalizes imported folder files into library entries", () => {
  assert.deepEqual(
    core.prepareImportedLibraryEntries?.([
      {
        name: "README.md",
        webkitRelativePath: "docs/README.md",
      },
      {
        name: "intro.MD",
        webkitRelativePath: "docs/guides/intro.MD",
      },
      {
        name: "logo.png",
        webkitRelativePath: "docs/assets/logo.png",
      },
      {
        name: "notes.txt",
        webkitRelativePath: "docs/notes.txt",
      },
    ]),
    {
      rootName: "docs",
      entries: [
        { path: "README.md", name: "README.md" },
        { path: "guides/intro.MD", name: "intro.MD" },
        { path: "notes.txt", name: "notes.txt" },
      ],
    },
  );
});

test("describes refresh capabilities for each source mode", () => {
  assert.deepEqual(
    core.getReaderRefreshState?.({
      sourceMode: "handle",
      hasFileHandle: true,
      hasLibraryFileHandle: false,
      librarySourceType: "",
    }),
    {
      canReload: true,
      canAutoRefresh: true,
      reloadAction: "file-handle",
    },
  );

  assert.deepEqual(
    core.getReaderRefreshState?.({
      sourceMode: "library",
      hasFileHandle: false,
      hasLibraryFileHandle: true,
      librarySourceType: "persistent",
    }),
    {
      canReload: true,
      canAutoRefresh: true,
      reloadAction: "library-persistent",
    },
  );

  assert.deepEqual(
    core.getReaderRefreshState?.({
      sourceMode: "library",
      hasFileHandle: false,
      hasLibraryFileHandle: true,
      librarySourceType: "snapshot",
    }),
    {
      canReload: true,
      canAutoRefresh: false,
      reloadAction: "library-snapshot",
    },
  );

  assert.deepEqual(
    core.getReaderRefreshState?.({
      sourceMode: "file",
      hasFileHandle: false,
      hasLibraryFileHandle: false,
      librarySourceType: "",
    }),
    {
      canReload: true,
      canAutoRefresh: false,
      reloadAction: "file-picker",
    },
  );
});
