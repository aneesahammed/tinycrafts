(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVLibraryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".mdown", ".mkdn", ".txt"];

  function toLower(value) {
    return String(value || "").toLowerCase();
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
    compareLibraryNames,
    createDirectoryNode,
    createFileNode,
    getClearedLibraryCollectionState,
    getFolderConflict,
    getReaderAuthoringState,
    getReaderRefreshState,
    getReaderSaveState,
    isSupportedLibraryFile,
    normalizeLibraryMeta,
    normalizePathKey,
    prepareImportedLibraryEntries,
    shapeLibraryTree,
    shouldAutoRestoreLastFile,
    sortLibraryEntries,
  };
});
