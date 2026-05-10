const test = require("node:test");
const assert = require("node:assert/strict");

let core;
try {
  core = require("../assets/library-core.js");
} catch (_error) {
  core = {};
}

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
    collapsedFolderIds: ["a", "", "a", 7, "b"],
    lastActiveFile: { folderId: "a", path: "guides/intro.md" },
  });
  assert.deepEqual(normalized, {
    folderOrder: ["b", "a"],
    expandedPathsByFolder: { a: ["guides"] },
    collapsedFolderIds: ["a", "b"],
    lastActiveFile: { folderId: "a", path: "guides/intro.md" },
  });
});

test("normalizes missing collapsedFolderIds to an empty array", () => {
  const normalized = core.normalizeLibraryMeta?.({
    folderOrder: ["a"],
    expandedPathsByFolder: {},
  });
  assert.deepEqual(normalized.collapsedFolderIds, []);
});

test("dedupes and filters folder id sets", () => {
  assert.deepEqual(
    core.normalizeLibraryFolderIdSet?.(["a", "a", "", "b", null, "b", "c"]),
    ["a", "b", "c"],
  );
  assert.deepEqual(core.normalizeLibraryFolderIdSet?.(null), []);
});

test("orders newly added library folders before persisted folders", () => {
  const folders = [
    { id: "old-a", name: "old-a", addedAt: 100 },
    { id: "newer", name: "newer", addedAt: 300 },
    { id: "old-b", name: "old-b", addedAt: 200 },
    { id: "newest", name: "newest", addedAt: 400 },
  ];

  assert.deepEqual(
    core.orderLibraryFolders?.(folders, ["old-b", "old-a"]).map(
      (folder) => folder.id,
    ),
    ["newest", "newer", "old-b", "old-a"],
  );
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

test("collects directory paths from a shaped library tree", () => {
  const tree = core.shapeLibraryTree?.(
    [
      { kind: "file", path: "guides/start.md" },
      { kind: "file", path: "guides/deep/reference.md" },
      { kind: "file", path: "drafts/plan.md" },
    ],
    { expandedPaths: [] },
  );

  assert.deepEqual(core.getLibraryDirectoryPaths?.(tree), [
    "drafts",
    "guides",
    "guides/deep",
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
      libraryCollapsedFolderIds: ["docs"],
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
      libraryCollapsedFolderIds: [],
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

test("describes save capabilities for live and export-only sources", () => {
  assert.deepEqual(
    core.getReaderSaveState?.({
      sourceMode: "editor",
      hasFileHandle: true,
      hasLibraryFileHandle: false,
      librarySourceType: "",
      hasContent: true,
      currentName: "draft.md",
    }),
    {
      canSave: true,
      saveAction: "overwrite-handle",
      saveLabel: "Save",
    },
  );

  assert.deepEqual(
    core.getReaderSaveState?.({
      sourceMode: "editor",
      hasFileHandle: false,
      hasLibraryFileHandle: true,
      librarySourceType: "persistent",
      hasContent: true,
      currentName: "doc.md",
    }),
    {
      canSave: true,
      saveAction: "overwrite-library-handle",
      saveLabel: "Save",
    },
  );

  assert.deepEqual(
    core.getReaderSaveState?.({
      sourceMode: "library",
      hasFileHandle: false,
      hasLibraryFileHandle: true,
      librarySourceType: "snapshot",
      hasContent: true,
      currentName: "doc.md",
    }),
    {
      canSave: true,
      saveAction: "pick-save-target",
      saveLabel: "Save",
    },
  );

  assert.deepEqual(
    core.getReaderSaveState?.({
      sourceMode: "editor",
      hasFileHandle: false,
      hasLibraryFileHandle: false,
      librarySourceType: "",
      hasContent: false,
      currentName: "",
    }),
    {
      canSave: false,
      saveAction: "none",
      saveLabel: "Save",
    },
  );
});

test("describes authoring chrome for preview and edit states", () => {
  assert.deepEqual(
    core.getReaderAuthoringState?.({
      editMode: false,
      dirty: false,
      hasSessionDraft: true,
      hasFileHandle: false,
      hasLibraryFileHandle: false,
      librarySourceType: "",
      hasContent: true,
      currentName: "",
    }),
    {
      showSaveButton: false,
      showDirtyCue: true,
      saveAction: "pick-save-target",
      saveLabel: "Save",
    },
  );

  assert.deepEqual(
    core.getReaderAuthoringState?.({
      editMode: true,
      dirty: true,
      hasFileHandle: true,
      hasLibraryFileHandle: false,
      librarySourceType: "",
      hasContent: true,
      currentName: "notes.md",
    }),
    {
      showSaveButton: true,
      showDirtyCue: false,
      saveAction: "overwrite-handle",
      saveLabel: "Save",
    },
  );

  assert.deepEqual(
    core.getReaderAuthoringState?.({
      editMode: false,
      dirty: false,
      hasFileHandle: false,
      hasLibraryFileHandle: false,
      librarySourceType: "",
      hasContent: false,
      currentName: "",
    }),
    {
      showSaveButton: false,
      showDirtyCue: false,
      saveAction: "none",
      saveLabel: "Save",
    },
  );
});

test("creates a versioned share fragment and parses it back", async () => {
  const fragment = await core.createShareSnapshotFragment?.({
    text: "# Shared snapshot\n\nHello world.\n\n- Café\n- Emoji: 😀",
    name: "notes.md",
    view: "preview",
  });

  assert.match(fragment, /^#mkv=v1\.[cgph]\.[A-Za-z0-9_-]+$/);

  const parsed = await core.parseShareSnapshotFragment?.(fragment);
  assert.deepEqual(parsed, {
    version: 1,
    codec: parsed.codec,
    payload: {
      name: "notes.md",
      text: "# Shared snapshot\n\nHello world.\n\n- Café\n- Emoji: 😀",
      view: "preview",
    },
  });
});

test("parses legacy plain-json share fragments", async () => {
  const legacyBytes = Buffer.from(
    JSON.stringify({
      v: 1,
      n: "legacy.md",
      t: "# Legacy snapshot\n\nStill works.",
      w: "preview",
    }),
    "utf8",
  );
  const fragment = "#mkv=v1.p." + encodeBase64Url(legacyBytes);

  const parsed = await core.parseShareSnapshotFragment?.(fragment);
  assert.deepEqual(parsed, {
    version: 1,
    codec: "p",
    payload: {
      name: "legacy.md",
      text: "# Legacy snapshot\n\nStill works.",
      view: "preview",
    },
  });
});

test("ignores malformed or unrelated share fragments", async () => {
  assert.equal(await core.parseShareSnapshotFragment?.(""), null);
  assert.equal(await core.parseShareSnapshotFragment?.("#section-1"), null);
  assert.equal(await core.parseShareSnapshotFragment?.("#mkv=v1"), null);
  assert.equal(await core.parseShareSnapshotFragment?.("#mkv=v2.g.abc"), null);
});

test("describes share request state for empty, small, and large docs", () => {
  assert.deepEqual(
    core.getShareSnapshotState?.({
      text: "",
      currentName: "",
    }),
    {
      canShare: false,
      reason: "empty",
      estimatedPlainBytes: 0,
      mayTakeTime: false,
    },
  );

  assert.deepEqual(
    core.getShareSnapshotState?.({
      text: "# Hello\n\nSmall doc.",
      currentName: "small.md",
    }),
    {
      canShare: true,
      reason: "ok",
      estimatedPlainBytes: 29,
      mayTakeTime: false,
    },
  );

  const hugeText = "A".repeat(12000);
  assert.deepEqual(
    core.getShareSnapshotState?.({
      text: hugeText,
      currentName: "huge.md",
    }),
    {
      canShare: true,
      reason: "ok",
      estimatedPlainBytes: 12009,
      mayTakeTime: true,
    },
  );
});
