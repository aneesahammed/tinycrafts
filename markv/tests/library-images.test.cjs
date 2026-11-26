const test = require("node:test");
const assert = require("node:assert/strict");
const { functionSource, runtime } = require("./helpers/inline-app.cjs");

function fakeImage(attrs) {
  const image = {
    attrs: { ...attrs },
    replacedWith: null,
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    hasAttribute(name) {
      return name in this.attrs;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    replaceWith(node) {
      this.replacedWith = node;
    },
  };
  return image;
}

function setup(options) {
  const calls = [];
  const revoked = [];
  const app = runtime(
    {
      state: {
        libraryActiveFolderId: "f1",
        libraryImageFolderId: "f1",
        libraryImageUrls: new Map(options.cache || []),
        libraryImageFiles: new Map((options.cache || []).map(([, url]) => [url, { name: "f" }])),
      },
      libraryKey: (folderId, path) => folderId + "::" + path,
      getLibraryFolderById: (id) =>
        id === "f1" ? { id: "f1", name: "Notes", status: options.folderStatus || "ready" } : null,
      getLibraryImageUrl: async (folderId, path) => {
        calls.push(path);
        return options.resolve ? options.resolve(path) : null;
      },
      URL: { revokeObjectURL: (url) => revoked.push(url) },
      document: {
        createElement: (tag) => ({ tagName: tag, className: "", textContent: "" }),
      },
    },
    [functionSource("hydrateLibraryImages"), functionSource("revokeLibraryImageUrls")],
  );
  return { app, calls, revoked };
}

function fakeRoot(images) {
  return { querySelectorAll: () => images };
}

test("hydrate reuses cached url synchronously", () => {
  const { app, calls } = setup({ cache: [["f1::a.png", "blob:cached"]] });
  const image = fakeImage({ "data-library-src": "a.png" });
  app.hydrateLibraryImages(fakeRoot([image]));
  assert.equal(image.getAttribute("src"), "blob:cached");
  assert.deepEqual(calls, []);
});

test("hydrate loads uncached images from the folder", async () => {
  const { app } = setup({ resolve: () => "blob:fresh" });
  const image = fakeImage({ "data-library-src": "a.png" });
  app.hydrateLibraryImages(fakeRoot([image]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(image.getAttribute("src"), "blob:fresh");
});

test("hydrate replaces missing images with a note", async () => {
  const { app } = setup({ resolve: () => null });
  const image = fakeImage({ "data-library-src": "a.png" });
  app.hydrateLibraryImages(fakeRoot([image]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(image.replacedWith, "expected a replacement note");
  assert.equal(image.replacedWith.className, "blocked-resource library-image-missing");
  assert.equal(image.replacedWith.textContent, "Image not found: a.png");
});

test("hydrate skips images that already have src", () => {
  const { app, calls } = setup({ resolve: () => "blob:fresh" });
  const image = fakeImage({ "data-library-src": "a.png", src: "blob:old" });
  app.hydrateLibraryImages(fakeRoot([image]));
  assert.equal(image.getAttribute("src"), "blob:old");
  assert.deepEqual(calls, []);
});

test("hydrate ignores results that arrive after the folder changed", async () => {
  const { app } = setup({ resolve: () => "blob:late" });
  const image = fakeImage({ "data-library-src": "a.png" });
  app.hydrateLibraryImages(fakeRoot([image]));
  app.state.libraryActiveFolderId = "f2";
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(image.hasAttribute("src"), false);
  assert.equal(image.replacedWith, null);
});

test("hydrate drops cached urls when the folder changes", () => {
  const { app, revoked } = setup({ cache: [["f1::a.png", "blob:old"]] });
  app.state.libraryActiveFolderId = "";
  app.hydrateLibraryImages(fakeRoot([]));
  assert.deepEqual(revoked, ["blob:old"]);
  assert.equal(app.state.libraryImageUrls.size, 0);
  assert.equal(app.state.libraryImageFiles.size, 0);
});

test("render hydrates folder images before reusing loaded ones", () => {
  const { html } = require("./helpers/inline-app.cjs");
  const hydrate = html.indexOf("hydrateLibraryImages(els.preview);");
  const restore = html.indexOf("if (keptMedia) restorePreviewImages(keptMedia.images, fresh);");
  assert.ok(hydrate > 0 && restore > 0, "both calls exist");
  assert.ok(hydrate < restore, "src must be set before restorePreviewImages matches by src");
});

function insertRuntime(switchDuringSave) {
  const applied = [];
  const statuses = [];
  const app = runtime(
    {
      state: { documentEpoch: 1, libraryActiveFilePath: "notes/a.md" },
      els: { editor: { value: "text", selectionStart: 4, selectionEnd: 4, setSelectionRange() {} } },
      window: {
        MarkVEditorMarkdownActions: require("../assets/editor-markdown-actions.js"),
      },
      saveImageIntoLibrary: async () => {
        if (switchDuringSave) {
          app.state.documentEpoch = 2;
          app.state.libraryActiveFilePath = "notes/b.md";
        }
        return "assets/x.png";
      },
      applyEditorMarkdownEdit: (edit) => applied.push(edit),
      setStatus: (message) => statuses.push(message),
    },
    [functionSource("insertImageFromFile")],
  );
  return { app, applied, statuses };
}

test("insertImageFromFile links the image into the document it was saved for", async () => {
  const { app, applied } = insertRuntime(false);
  assert.equal(await app.insertImageFromFile({ name: "x.png" }), true);
  assert.equal(applied.length, 1);
});

test("insertImageFromFile does not link into a document opened during the save", async () => {
  const { app, applied, statuses } = insertRuntime(true);
  assert.equal(await app.insertImageFromFile({ name: "x.png" }), false);
  assert.equal(applied.length, 0);
  assert.match(statuses[0], /assets\/x\.png/);
});

function saveRuntime(requestPermission) {
  const statuses = [];
  const app = runtime(
    {
      state: {
        libraryActiveFilePath: "a.md",
        libraryCurrentFolderHandle: {
          queryPermission: async () => "prompt",
          requestPermission,
        },
      },
      setStatus: (message) => statuses.push(message),
      console: { warn() {} },
    },
    [functionSource("getFolderWriteAccess"), functionSource("saveImageIntoLibrary")],
  );
  return { app, statuses };
}


test("a refused folder prompt says permission is needed", async () => {
  const { app, statuses } = saveRuntime(async () => "denied");
  assert.equal(await app.saveImageIntoLibrary({ name: "x.png", type: "image/png" }), null);
  assert.match(statuses[0], /needs permission/);
});

test("hydrate asks for folder access instead of saying not found", async () => {
  const { app } = setup({ resolve: () => null, folderStatus: "needs-permission" });
  const image = fakeImage({ "data-library-src": "a.png" });
  app.hydrateLibraryImages(fakeRoot([image]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(image.replacedWith.textContent, "Allow access to Notes in Files to show a.png.");
});

test("getFolderWriteAccess reports when the browser needs a click to ask", async () => {
  const app = runtime({}, [functionSource("getFolderWriteAccess")]);
  const handle = (query, request) => ({ queryPermission: query, requestPermission: request });
  assert.equal(await app.getFolderWriteAccess(handle(async () => "granted")), "granted");
  assert.equal(
    await app.getFolderWriteAccess(handle(async () => "prompt", async () => "denied")),
    "denied",
  );
  assert.equal(
    await app.getFolderWriteAccess(
      handle(async () => "prompt", async () => {
        throw new Error("SecurityError: user activation is required");
      }),
    ),
    "needs-gesture",
  );
});

function dropRuntime(access) {
  const offered = [];
  const inserted = [];
  const statuses = [];
  const app = runtime(
    {
      state: { libraryCurrentFolderHandle: {}, libraryActiveFilePath: "a.md" },
      getFolderWriteAccess: async () => access,
      offerImageDropPermission: (files) => offered.push(files.length),
      insertImageFromFile: async (file) => {
        inserted.push(file.name);
        return true;
      },
      setStatus: (message) => statuses.push(message),
    },
    [functionSource("dropImagesIntoDocument")],
  );
  return { app, offered, inserted, statuses };
}

test("a drop without folder access offers an Allow button instead of failing", async () => {
  const { app, offered, inserted } = dropRuntime("needs-gesture");
  await app.dropImagesIntoDocument([{ name: "a.png" }, { name: "b.png" }]);
  assert.deepEqual(offered, [2]);
  assert.deepEqual(inserted, []);
});

test("a drop with folder access saves every image in order", async () => {
  const { app, offered, inserted } = dropRuntime("granted");
  await app.dropImagesIntoDocument([{ name: "a.png" }, { name: "b.png" }]);
  assert.deepEqual(offered, []);
  assert.deepEqual(inserted, ["a.png", "b.png"]);
});
