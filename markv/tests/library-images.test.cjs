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
      },
      libraryKey: (folderId, path) => folderId + "::" + path,
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
  assert.equal(image.replacedWith.className, "blocked-resource");
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
});
