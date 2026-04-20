(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVLibraryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".mdown", ".mkdn", ".txt"];
  const SHARE_FRAGMENT_PREFIX = "#mkv=";
  const SHARE_FORMAT_VERSION = "v1";
  const SHARE_CODEC_GZIP = "g";
  const SHARE_CODEC_PLAIN = "p";
  const SHARE_PROGRESS_THRESHOLD_BYTES = 12000;

  function toLower(value) {
    return String(value || "").toLowerCase();
  }

  function getTextEncoder() {
    return typeof TextEncoder === "function" ? new TextEncoder() : null;
  }

  function getTextDecoder() {
    return typeof TextDecoder === "function" ? new TextDecoder() : null;
  }

  function getUtf8Bytes(value) {
    const text = String(value || "");
    const encoder = getTextEncoder();
    if (encoder) {
      return encoder.encode(text);
    }

    if (
      typeof Buffer !== "undefined" &&
      typeof Buffer.from === "function"
    ) {
      return new Uint8Array(Buffer.from(text, "utf8"));
    }

    throw new Error("TextEncoder is unavailable in this browser.");
  }

  function normalizeShareSnapshotPayload(input) {
    const source = input && typeof input === "object" ? input : {};
    const rawName =
      typeof source.name === "string"
        ? source.name
        : typeof source.currentName === "string"
          ? source.currentName
          : "";
    const view = source.view === "edit" ? "edit" : "preview";

    return {
      name: rawName.trim(),
      text: String(source.text || ""),
      view: view,
    };
  }

  function createShareSnapshotEnvelope(input) {
    const payload = normalizeShareSnapshotPayload(input);
    return {
      v: 1,
      n: payload.name,
      t: payload.text,
      w: payload.view,
    };
  }

  function encodeShareSnapshotPayloadBytes(input) {
    return getUtf8Bytes(JSON.stringify(createShareSnapshotEnvelope(input)));
  }

  function encodeBase64Url(bytes) {
    if (
      typeof Buffer !== "undefined" &&
      typeof Buffer.from === "function"
    ) {
      return Buffer.from(bytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    }

    let binary = "";
    const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    for (let index = 0; index < list.length; index += 1) {
      binary += String.fromCharCode(list[index]);
    }

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function decodeBase64Url(value) {
    const normalized = String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded =
      normalized + "===".slice((normalized.length + 3) % 4);

    if (
      typeof Buffer !== "undefined" &&
      typeof Buffer.from === "function"
    ) {
      return new Uint8Array(Buffer.from(padded, "base64"));
    }

    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function compressShareBytes(bytes) {
    if (typeof CompressionStream !== "function") return null;
    const source = new Blob([bytes]);
    const stream = source.stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function decompressShareBytes(bytes, codec) {
    if (codec === SHARE_CODEC_PLAIN) {
      return bytes;
    }

    if (codec !== SHARE_CODEC_GZIP || typeof DecompressionStream !== "function") {
      throw new Error("Unsupported share snapshot codec");
    }
    const source = new Blob([bytes]);
    const stream = source.stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function createShareSnapshotFragment(input) {
    const plainBytes = encodeShareSnapshotPayloadBytes(input);

    let codec = SHARE_CODEC_PLAIN;
    let finalBytes = plainBytes;

    try {
      const compressedBytes = await compressShareBytes(plainBytes);
      if (compressedBytes && compressedBytes.length < plainBytes.length) {
        codec = SHARE_CODEC_GZIP;
        finalBytes = compressedBytes;
      }
    } catch (_error) {}

    return (
      SHARE_FRAGMENT_PREFIX +
      SHARE_FORMAT_VERSION +
      "." +
      codec +
      "." +
      encodeBase64Url(finalBytes)
    );
  }

  function getShareSnapshotState(input) {
    const payload = normalizeShareSnapshotPayload(input);
    if (!payload.text.trim()) {
      return {
        canShare: false,
        reason: "empty",
        estimatedPlainBytes: 0,
        mayTakeTime: false,
      };
    }

    let estimatedPlainBytes = 0;
    try {
      estimatedPlainBytes = encodeShareSnapshotPayloadBytes(payload).length;
    } catch (_error) {
      return {
        canShare: false,
        reason: "unsupported",
        estimatedPlainBytes: 0,
        mayTakeTime: false,
      };
    }

    return {
      canShare: true,
      reason: "ok",
      estimatedPlainBytes: estimatedPlainBytes,
      mayTakeTime: estimatedPlainBytes >= SHARE_PROGRESS_THRESHOLD_BYTES,
    };
  }

  async function parseShareSnapshotFragment(fragment) {
    const raw = String(fragment || "").trim();
    const hashIndex = raw.indexOf("#");
    const normalized = hashIndex >= 0 ? raw.slice(hashIndex) : raw;
    if (!normalized.startsWith(SHARE_FRAGMENT_PREFIX)) return null;

    const body = normalized.slice(SHARE_FRAGMENT_PREFIX.length);
    const parts = body.split(".");
    if (parts.length !== 3) return null;

    const version = parts[0];
    const codec = parts[1];
    const encoded = parts[2];

    if (
      version !== SHARE_FORMAT_VERSION ||
      (codec !== SHARE_CODEC_GZIP && codec !== SHARE_CODEC_PLAIN) ||
      !encoded
    ) {
      return null;
    }

    try {
      const decoder = getTextDecoder();
      if (!decoder) return null;

      const bytes = decodeBase64Url(encoded);
      const restoredBytes = await decompressShareBytes(bytes, codec);
      const parsed = JSON.parse(decoder.decode(restoredBytes));

      if (!parsed || Number(parsed.v) !== 1 || typeof parsed.t !== "string") {
        return null;
      }

      return {
        version: 1,
        codec: codec,
        payload: {
          name: typeof parsed.n === "string" ? parsed.n : "",
          text: parsed.t,
          view: parsed.w === "edit" ? "edit" : "preview",
        },
      };
    } catch (_error) {
      return null;
    }
  }

  function isSupportedLibraryFile(name) {
    const lower = toLower(name);
    return SUPPORTED_EXTENSIONS.some(function (extension) {
      return lower.endsWith(extension);
    });
  }

  function compareLibraryNames(a, b) {
    return String(a || "").localeCompare(String(b || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function sortLibraryEntries(entries) {
    return (Array.isArray(entries) ? entries.slice() : []).sort(function (a, b) {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return compareLibraryNames(a.name, b.name);
    });
  }

  function normalizePathKey(pathKey) {
    return String(pathKey || "").replace(/\/+$/, "");
  }

  function getFolderConflict(existingFolders, pathKey) {
    const target = normalizePathKey(pathKey);
    if (!target) return null;

    for (const folder of Array.isArray(existingFolders) ? existingFolders : []) {
      const current = normalizePathKey(folder && folder.pathKey);
      if (!current) continue;
      if (current === target) return "duplicate";
      if (current.startsWith(target + "/") || target.startsWith(current + "/")) {
        return "overlap";
      }
    }

    return null;
  }

  function cloneStringArray(value) {
    return Array.isArray(value)
      ? value.filter(function (item) {
          return typeof item === "string" && item.length > 0;
        })
      : [];
  }

  function normalizeExpandedPathsByFolder(value) {
    if (!value || typeof value !== "object") return {};

    const result = {};
    Object.keys(value).forEach(function (key) {
      result[key] = cloneStringArray(value[key]);
    });
    return result;
  }

  function normalizeLibraryMeta(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const lastActiveFile =
      source.lastActiveFile &&
      typeof source.lastActiveFile === "object" &&
      typeof source.lastActiveFile.folderId === "string" &&
      typeof source.lastActiveFile.path === "string"
        ? {
            folderId: source.lastActiveFile.folderId,
            path: source.lastActiveFile.path,
          }
        : null;

    return {
      folderOrder: cloneStringArray(source.folderOrder),
      expandedPathsByFolder: normalizeExpandedPathsByFolder(
        source.expandedPathsByFolder,
      ),
      lastActiveFile: lastActiveFile,
    };
  }

  function createDirectoryNode(name, path, expanded) {
    return {
      type: "directory",
      name: name,
      path: path,
      expanded: Boolean(expanded),
      children: [],
    };
  }

  function createFileNode(name, path) {
    return {
      type: "file",
      name: name,
      path: path,
    };
  }

  function shapeLibraryTree(entries, options) {
    const expandedPaths = new Set(
      cloneStringArray(options && options.expandedPaths),
    );
    const root = createDirectoryNode("", "", true);

    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      if (!entry || entry.kind !== "file") return;
      const rawPath = String(entry.path || "").replace(/^\/+|\/+$/g, "");
      if (!rawPath || !isSupportedLibraryFile(rawPath)) return;

      const parts = rawPath.split("/").filter(Boolean);
      if (!parts.length) return;

      let parent = root;
      let currentPath = "";

      parts.forEach(function (part, index) {
        currentPath = currentPath ? currentPath + "/" + part : part;
        const isLast = index === parts.length - 1;

        if (isLast) {
          parent.children.push(createFileNode(part, currentPath));
          return;
        }

        let next = parent.children.find(function (child) {
          return child.type === "directory" && child.name === part;
        });
        if (!next) {
          next = createDirectoryNode(
            part,
            currentPath,
            expandedPaths.has(currentPath),
          );
          parent.children.push(next);
        }
        parent = next;
      });
    });

    function pruneAndSort(nodes) {
      const output = [];
      nodes.forEach(function (node) {
        if (node.type === "directory") {
          node.children = pruneAndSort(node.children);
          if (!node.children.length) return;
        }
        output.push(node);
      });
      return sortLibraryEntries(output);
    }

    return pruneAndSort(root.children);
  }

  function shouldAutoRestoreLastFile(input) {
    const source = input && typeof input === "object" ? input : {};
    return Boolean(
      !source.hasSessionDraft &&
        source.lastActiveFile &&
        typeof source.lastActiveFile.folderId === "string" &&
        typeof source.lastActiveFile.path === "string",
    );
  }

  function getClearedLibraryCollectionState(input) {
    const source = input && typeof input === "object" ? input : {};
    const currentRevision = Number(source.libraryNextScanRevision);

    return {
      libraryFolders: [],
      libraryFolderOrder: [],
      libraryExpandedPathsByFolder: {},
      libraryActiveFolderId: "",
      libraryActiveFilePath: "",
      libraryCurrentFileHandle: null,
      libraryCurrentFolderHandle: null,
      libraryNextScanRevision: Number.isFinite(currentRevision)
        ? currentRevision + 1
        : 1,
    };
  }

  function prepareImportedLibraryEntries(files) {
    const list = Array.isArray(files) ? files : [];
    let rootName = "";
    const entries = [];

    list.forEach(function (file) {
      if (!file) return;
      const rawPath =
        typeof file.webkitRelativePath === "string" && file.webkitRelativePath
          ? file.webkitRelativePath
          : String(file.name || "");
      const parts = rawPath.split("/").filter(Boolean);
      if (!parts.length) return;

      if (!rootName) {
        rootName = parts[0];
      }

      const relativePath =
        parts.length > 1 ? parts.slice(1).join("/") : parts[0];
      if (!relativePath || !isSupportedLibraryFile(relativePath)) return;

      entries.push({
        path: relativePath,
        name: parts[parts.length - 1],
      });
    });

    return {
      rootName: rootName,
      entries: entries,
    };
  }

  function getReaderRefreshState(input) {
    const source = input && typeof input === "object" ? input : {};
    const sourceMode = String(source.sourceMode || "editor");
    const hasFileHandle = Boolean(source.hasFileHandle);
    const hasLibraryFileHandle = Boolean(source.hasLibraryFileHandle);
    const librarySourceType =
      source.librarySourceType === "persistent" ||
      source.librarySourceType === "snapshot"
        ? source.librarySourceType
        : "";

    let reloadAction = "none";
    if (hasFileHandle) {
      reloadAction = "file-handle";
    } else if (
      sourceMode === "library" &&
      hasLibraryFileHandle &&
      librarySourceType === "persistent"
    ) {
      reloadAction = "library-persistent";
    } else if (
      sourceMode === "library" &&
      hasLibraryFileHandle &&
      librarySourceType === "snapshot"
    ) {
      reloadAction = "library-snapshot";
    } else if (sourceMode === "file") {
      reloadAction = "file-picker";
    }

    return {
      canReload: reloadAction !== "none",
      canAutoRefresh:
        hasFileHandle ||
        (sourceMode === "library" &&
          hasLibraryFileHandle &&
          librarySourceType === "persistent"),
      reloadAction: reloadAction,
    };
  }

  function getReaderSaveState(input) {
    const source = input && typeof input === "object" ? input : {};
    const hasFileHandle = Boolean(source.hasFileHandle);
    const hasLibraryFileHandle = Boolean(source.hasLibraryFileHandle);
    const librarySourceType =
      source.librarySourceType === "persistent" ||
      source.librarySourceType === "snapshot"
        ? source.librarySourceType
        : "";
    const hasContent = Boolean(source.hasContent);
    const currentName = String(source.currentName || "");

    if (hasFileHandle) {
      return {
        canSave: true,
        saveAction: "overwrite-handle",
        saveLabel: "Save",
      };
    }

    if (hasLibraryFileHandle && librarySourceType === "persistent") {
      return {
        canSave: true,
        saveAction: "overwrite-library-handle",
        saveLabel: "Save",
      };
    }

    if (hasContent || currentName) {
      return {
        canSave: true,
        saveAction: "pick-save-target",
        saveLabel: "Save",
      };
    }

    return {
      canSave: false,
      saveAction: "none",
      saveLabel: "Save",
    };
  }

  function getReaderAuthoringState(input) {
    const source = input && typeof input === "object" ? input : {};
    const saveState = getReaderSaveState(source);
    const editMode = Boolean(source.editMode);
    const dirty = Boolean(source.dirty);
    const hasSessionDraft = Boolean(source.hasSessionDraft);

    return {
      showSaveButton: editMode && saveState.canSave,
      showDirtyCue:
        !editMode && saveState.canSave && (dirty || hasSessionDraft),
      saveAction: saveState.saveAction,
      saveLabel: saveState.saveLabel,
    };
  }

  return {
    SUPPORTED_EXTENSIONS: SUPPORTED_EXTENSIONS.slice(),
    SHARE_FRAGMENT_PREFIX,
    compareLibraryNames,
    createShareSnapshotFragment,
    createDirectoryNode,
    createFileNode,
    getShareSnapshotState,
    getClearedLibraryCollectionState,
    getFolderConflict,
    getReaderAuthoringState,
    getReaderRefreshState,
    getReaderSaveState,
    isSupportedLibraryFile,
    normalizeLibraryMeta,
    normalizePathKey,
    parseShareSnapshotFragment,
    prepareImportedLibraryEntries,
    shapeLibraryTree,
    shouldAutoRestoreLastFile,
    sortLibraryEntries,
  };
});
