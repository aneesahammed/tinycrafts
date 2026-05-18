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
      sourceMode: "untitled",
      hasFileHandle: false,
      hasLibraryFileHandle: false,
      librarySourceType: "",
      hasContent: false,
      currentName: "Untitled 1",
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

  assert.match(fragment, /^#m:[ch][A-Za-z0-9_-]+$/);

  const parsed = await core.parseShareSnapshotFragment?.(fragment);
  assert.deepEqual(parsed, {
    version: 2,
    codec: parsed.codec,
    payload: {
      name: "notes.md",
      text: "# Shared snapshot\n\nHello world.\n\n- Café\n- Emoji: 😀",
      view: "preview",
    },
  });
});

test("uses a shorter share fragment for unnamed drafts", async () => {
  const text = "# Quick note\n\nSmall payload.";
  const fragment = await core.createShareSnapshotFragment?.({
    text,
    currentName: "",
    view: "preview",
  });
  const legacyBytes = Buffer.concat([
    Buffer.from([0, 0]),
    Buffer.from(text, "utf8"),
  ]);
  const legacyFragment = "#mkv=v1.c." + encodeBase64Url(legacyBytes);

  assert.ok(fragment.length < legacyFragment.length);
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
  assert.equal(await core.parseShareSnapshotFragment?.("#m:xabc"), null);
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

test("extracts wiki links, related concepts, frontmatter categories, and heading anchors", () => {
  const parsed = core.parseLibraryMarkdownContext?.({
    path: "concepts/algorithm.md",
    text: [
      "---",
      "tags: [framework, operations]",
      "category: decision-making",
      "---",
      "# The Algorithm",
      "",
      "A 5-step decision framework for [[Requirement Hygiene]].",
      "",
      "## The Steps (in order)",
      "",
      "Use [Delete Harder](delete-harder.md) before acceleration.",
      "",
      "## Business / Team",
      "",
      "Works for internal wikis too.",
      "",
      "## Related Concepts",
      "",
      "- [Operational Cadence](../ops/cadence.md)",
      "- [[Automation Trap]]",
    ].join("\n"),
  });

  assert.deepEqual(
    {
      path: parsed.path,
      title: parsed.title,
      categories: parsed.categories,
      headings: parsed.headings,
      links: parsed.links.map((link) => ({
        label: link.label,
        rawTarget: link.rawTarget,
        normalizedPath: link.normalizedPath,
        kind: link.kind,
        inRelatedSection: link.inRelatedSection,
      })),
    },
    {
      path: "concepts/algorithm.md",
      title: "The Algorithm",
      categories: ["framework", "operations", "decision-making"],
      headings: [
        { level: 1, text: "The Algorithm", anchor: "the-algorithm" },
        {
          level: 2,
          text: "The Steps (in order)",
          anchor: "the-steps-in-order",
        },
        {
          level: 2,
          text: "Business / Team",
          anchor: "business-team",
        },
        {
          level: 2,
          text: "Related Concepts",
          anchor: "related-concepts",
        },
      ],
      links: [
        {
          label: "Requirement Hygiene",
          rawTarget: "Requirement Hygiene",
          normalizedPath: "concepts/requirement-hygiene.md",
          kind: "wikilink",
          inRelatedSection: false,
        },
        {
          label: "Delete Harder",
          rawTarget: "delete-harder.md",
          normalizedPath: "concepts/delete-harder.md",
          kind: "markdown",
          inRelatedSection: false,
        },
        {
          label: "Operational Cadence",
          rawTarget: "../ops/cadence.md",
          normalizedPath: "ops/cadence.md",
          kind: "markdown",
          inRelatedSection: true,
        },
        {
          label: "Automation Trap",
          rawTarget: "Automation Trap",
          normalizedPath: "concepts/automation-trap.md",
          kind: "wikilink",
          inRelatedSection: true,
        },
      ],
    },
  );
});

test("parses YAML list frontmatter categories", () => {
  const parsed = core.parseLibraryMarkdownContext?.({
    path: "concepts/wiki.md",
    text: [
      "---",
      "tags:",
      "  - knowledge-base",
      "  - llm",
      "topics:",
      "  - synthesis",
      "category: systems",
      "---",
      "# LLM Wiki",
    ].join("\n"),
  });

  assert.deepEqual(parsed.categories, [
    "knowledge-base",
    "llm",
    "synthesis",
    "systems",
  ]);
});

test("builds library mindmap context with outbound links, backlinks, and neighbors", () => {
  const context = core.buildLibraryMindmapContext?.({
    currentPath: "concepts/algorithm.md",
    currentMarkdown: [
      "# The Algorithm",
      "",
      "See [[Requirement Hygiene]] and [Delete Harder](delete-harder.md).",
      "",
      "## Related Concepts",
      "",
      "- [[Automation Trap]]",
    ].join("\n"),
    files: [
      {
        path: "concepts/requirement-hygiene.md",
        text: "# Requirement Hygiene\n\nEvery requirement needs an owner.",
      },
      {
        path: "concepts/delete-harder.md",
        text: "# Delete Harder\n\nRemove before simplifying.",
      },
      {
        path: "concepts/automation-trap.md",
        text: "# Automation Trap\n\nNever automate a broken process.",
      },
      {
        path: "ops/cadence.md",
        text: "# Operational Cadence\n\nRelated to [[The Algorithm]].",
      },
    ],
  });

  assert.deepEqual(
    {
      currentTitle: context.current.title,
      outbound: context.outboundLinks.map((item) => item.path),
      backlinks: context.backlinks.map((item) => item.path),
      neighbors: context.neighbors.map((item) => ({
        path: item.path,
        title: item.title,
        direction: item.direction,
        related: item.related,
      })),
    },
    {
      currentTitle: "The Algorithm",
      outbound: [
        "concepts/requirement-hygiene.md",
        "concepts/delete-harder.md",
        "concepts/automation-trap.md",
      ],
      backlinks: ["ops/cadence.md"],
      neighbors: [
        {
          path: "concepts/automation-trap.md",
          title: "Automation Trap",
          direction: "outbound",
          related: true,
        },
        {
          path: "concepts/delete-harder.md",
          title: "Delete Harder",
          direction: "outbound",
          related: false,
        },
        {
          path: "ops/cadence.md",
          title: "Operational Cadence",
          direction: "inbound",
          related: false,
        },
        {
          path: "concepts/requirement-hygiene.md",
          title: "Requirement Hygiene",
          direction: "outbound",
          related: false,
        },
      ],
    },
  );
});

test("does not resolve ambiguous wiki titles to an arbitrary duplicate page", () => {
  const context = core.buildLibraryMindmapContext?.({
    currentPath: "current.md",
    currentMarkdown: "# Current\n\nSee [[Overview]].",
    files: [
      {
        path: "product/index.md",
        text: "# Overview\n\nProduct overview.",
      },
      {
        path: "engineering/index.md",
        text: "# Overview\n\nEngineering overview.",
      },
    ],
  });

  assert.deepEqual(context.outboundLinks, []);
  assert.deepEqual(context.neighbors, []);
});

test("repairs graph edges that point at the root label slug", () => {
  const graph = core.normalizeMindmapGraphReferences?.({
    root: {
      id: "root",
      label: "Project Architecture Overview",
      summary: "A developer reference.",
    },
    nodes: [
      {
        id: "http-status-codes",
        label: "Status Code Reference",
        type: "feature",
        summary: "",
        sourceAnchor: "http-status-codes",
        parent: "root",
      },
      {
        id: "text-formatting",
        label: "Text Formatting",
        type: "feature",
        summary: "",
        sourceAnchor: "text-formatting",
        parent: "root",
      },
    ],
    edges: [
      {
        from: "http-status-codes",
        to: "project-architecture-overview",
        kind: "supports",
      },
      {
        from: "text-formatting",
        to: "http-status-codes",
        kind: "part_of",
      },
    ],
  });

  assert.deepEqual(graph.edges, [
    {
      from: "http-status-codes",
      to: "root",
      kind: "supports",
    },
    {
      from: "text-formatting",
      to: "http-status-codes",
      kind: "part_of",
    },
  ]);
});

test("drops unresolved graph edges instead of failing a usable graph", () => {
  const graph = core.normalizeMindmapGraphReferences?.({
    root: { id: "root", label: "Usable Graph", summary: "" },
    nodes: [
      {
        id: "known",
        label: "Known",
        type: "feature",
        summary: "",
        sourceAnchor: null,
        parent: "missing-parent",
      },
      {
        id: "child",
        label: "Child",
        type: "feature",
        summary: "",
        sourceAnchor: null,
        parent: "known",
      },
    ],
    edges: [
      { from: "known", to: "missing-node", kind: "supports" },
      { from: "known", to: "child", kind: "supports" },
    ],
  });

  assert.equal(graph.nodes[0].parent, "root");
  assert.deepEqual(graph.edges, [
    { from: "known", to: "child", kind: "supports" },
  ]);
});

test("uses caller fallbacks for invalid node types and edge kinds", () => {
  const graph = core.normalizeMindmapGraphReferences?.(
    {
      root: { id: "root", label: "Resilient Graph", summary: "" },
      nodes: [
        {
          id: "concept-a",
          label: "Concept A",
          type: "concept",
          summary: "",
          sourceAnchor: null,
          parent: "root",
        },
        {
          id: "concept-b",
          label: "Concept B",
          type: "feature",
          summary: "",
          sourceAnchor: null,
          parent: "root",
        },
      ],
      edges: [{ from: "concept-a", to: "concept-b", kind: "relates_to" }],
    },
    {
      allowedNodeTypes: ["feature", "goal"],
      fallbackNodeType: "feature",
      allowedEdgeKinds: ["supports", "depends_on"],
      fallbackEdgeKind: "supports",
    },
  );

  assert.equal(graph.nodes[0].type, "feature");
  assert.deepEqual(graph.edges, [
    { from: "concept-a", to: "concept-b", kind: "supports" },
  ]);
});

test("creates a lean reader connections model from deterministic context", () => {
  const context = core.buildLibraryMindmapContext?.({
    currentPath: "docs/current.md",
    currentMarkdown: [
      "---",
      "tags: [platform, docs]",
      "---",
      "# Current Doc",
      "",
      "See [[Runbook]] and [[Architecture]].",
      "",
      "## Related Concepts",
      "- [[Glossary]]",
    ].join("\n"),
    files: [
      { path: "docs/runbook.md", text: "# Runbook\n\nOperational steps." },
      { path: "docs/architecture.md", text: "# Architecture\n\nSystem shape." },
      { path: "docs/glossary.md", text: "# Glossary\n\nShared terms." },
      { path: "docs/retro.md", text: "# Retro\n\nLinks to [[Current Doc]]." },
    ],
  });

  const model = core.createReaderConnectionsModel?.(context, {
    maxNeighbors: 3,
  });

  assert.deepEqual(
    {
      title: model.current.title,
      categories: model.current.categories,
      stats: model.stats,
      neighbors: model.neighbors.map((item) => ({
        path: item.path,
        title: item.title,
        direction: item.direction,
        related: item.related,
      })),
    },
    {
      title: "Current Doc",
      categories: ["platform", "docs"],
      stats: {
        neighborCount: 4,
        visibleCount: 3,
        hiddenCount: 1,
        outboundCount: 3,
        backlinkCount: 1,
        relatedCount: 1,
      },
      neighbors: [
        {
          path: "docs/glossary.md",
          title: "Glossary",
          direction: "outbound",
          related: true,
        },
        {
          path: "docs/architecture.md",
          title: "Architecture",
          direction: "outbound",
          related: false,
        },
        {
          path: "docs/retro.md",
          title: "Retro",
          direction: "inbound",
          related: false,
        },
      ],
    },
  );
});

test("omits reader connections model when a document has no neighbors", () => {
  const context = core.buildLibraryMindmapContext?.({
    currentPath: "docs/current.md",
    currentMarkdown: "# Current Doc\n\nNo links.",
    files: [],
  });

  assert.equal(core.createReaderConnectionsModel?.(context), null);
});

test("creates a deterministic concept graph from library context when no LLM is available", () => {
  const context = core.buildLibraryMindmapContext?.({
    currentPath: "concepts/algorithm.md",
    currentMarkdown: [
      "# The Algorithm",
      "",
      "A 5-step decision framework.",
      "",
      "## Summary",
      "Question requirements before acting.",
      "",
      "## Key Points",
      "Delete, simplify, accelerate, then automate.",
      "",
      "## Related Concepts",
      "- [[Requirement Hygiene]]",
    ].join("\n"),
    files: [
      {
        path: "concepts/requirement-hygiene.md",
        text: "# Requirement Hygiene\n\nEvery requirement needs an owner.",
      },
    ],
  });
  const graph = core.createLibraryContextMindmapGraph?.(context);

  assert.deepEqual(
    {
      root: graph.root,
      labels: graph.nodes.map((node) => node.label),
      anchors: graph.nodes.map((node) => node.sourceAnchor),
      edges: graph.edges,
    },
    {
      root: {
        id: "root",
        label: "The Algorithm",
        summary: "A 5-step decision framework.",
      },
      labels: ["Summary", "Key Points", "Related Concepts", "Requirement Hygiene"],
      anchors: ["summary", "key-points", "related-concepts", null],
      edges: [
        {
          from: "related-requirement-hygiene",
          to: "section-related-concepts",
          kind: "supports",
        },
      ],
    },
  );
});

test("formats library mindmap context as authoritative prompt context", () => {
  const context = core.buildLibraryMindmapContext?.({
    currentPath: "concepts/algorithm.md",
    currentMarkdown: [
      "# The Algorithm",
      "",
      "See [[Requirement Hygiene]].",
      "",
      "## Summary",
      "A decision framework.",
    ].join("\n"),
    files: [
      {
        path: "concepts/requirement-hygiene.md",
        text: "# Requirement Hygiene\n\nEvery requirement needs an owner.",
      },
    ],
  });

  const formatted = core.formatLibraryMindmapContextForPrompt?.(context);

  assert.match(formatted, /LIBRARY_CONTEXT/);
  assert.match(formatted, /current: The Algorithm \(concepts\/algorithm\.md\)/);
  assert.match(formatted, /available_anchors: the-algorithm, summary/);
  assert.match(
    formatted,
    /outbound_links:\n- Requirement Hygiene -> concepts\/requirement-hygiene\.md/,
  );
  assert.match(
    formatted,
    /neighbors:\n- Requirement Hygiene \(concepts\/requirement-hygiene\.md\) direction=outbound/,
  );
});

test("grounds generated graph anchors to headings from library context", () => {
  const context = core.buildLibraryMindmapContext?.({
    currentPath: "concepts/algorithm.md",
    currentMarkdown: "# The Algorithm\n\n## Summary\n\n## Key Points",
    files: [],
  });
  const grounded = core.groundMindmapGraphWithLibraryContext?.(
    {
      root: { id: "root", label: "The Algorithm", summary: "" },
      nodes: [
        {
          id: "a",
          label: "Summary",
          type: "feature",
          summary: "",
          sourceAnchor: "summary",
          parent: "root",
        },
        {
          id: "b",
          label: "Invented",
          type: "feature",
          summary: "",
          sourceAnchor: "not-real",
          parent: "root",
        },
      ],
      edges: [],
    },
    context,
  );

  assert.deepEqual(
    grounded.nodes.map((node) => node.sourceAnchor),
    ["summary", null],
  );
});
