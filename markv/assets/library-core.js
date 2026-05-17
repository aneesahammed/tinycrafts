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
  const SHARE_CODEC_COMPACT = "c";
  const SHARE_CODEC_COMPACT_GZIP = "h";
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

  function concatByteArrays(chunks) {
    const list = Array.isArray(chunks) ? chunks : [];
    let total = 0;
    for (let index = 0; index < list.length; index += 1) {
      total += list[index] ? list[index].length : 0;
    }

    const output = new Uint8Array(total);
    let offset = 0;
    for (let index = 0; index < list.length; index += 1) {
      const chunk = list[index];
      if (!chunk || !chunk.length) continue;
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  function encodeUnsignedVarint(value) {
    let remaining = Number(value);
    if (!Number.isFinite(remaining) || remaining < 0) {
      throw new Error("Invalid varint value");
    }

    const bytes = [];
    do {
      let next = remaining & 0x7f;
      remaining = Math.floor(remaining / 128);
      if (remaining > 0) {
        next |= 0x80;
      }
      bytes.push(next);
    } while (remaining > 0);

    return new Uint8Array(bytes);
  }

  function decodeUnsignedVarint(bytes, startIndex) {
    const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let offset = Number(startIndex) || 0;
    let shift = 0;
    let value = 0;

    for (; offset < list.length; offset += 1) {
      const byte = list[offset];
      value += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) {
        return {
          value: value,
          nextIndex: offset + 1,
        };
      }
      shift += 7;
      if (shift > 35) {
        throw new Error("Varint is too large");
      }
    }

    throw new Error("Truncated varint");
  }

  function encodeCompactShareSnapshotBytes(input) {
    const payload = normalizeShareSnapshotPayload(input);
    const nameBytes = getUtf8Bytes(payload.name);
    const textBytes = getUtf8Bytes(payload.text);
    const flags = payload.view === "edit" ? 1 : 0;

    return concatByteArrays([
      new Uint8Array([flags]),
      encodeUnsignedVarint(nameBytes.length),
      nameBytes,
      textBytes,
    ]);
  }

  function decodeCompactShareSnapshotBytes(bytes) {
    const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!list.length) {
      throw new Error("Empty compact snapshot payload");
    }

    const decoder = getTextDecoder();
    if (!decoder) {
      throw new Error("TextDecoder is unavailable in this browser.");
    }

    const flags = list[0];
    const nameLengthMeta = decodeUnsignedVarint(list, 1);
    const nameStart = nameLengthMeta.nextIndex;
    const nameEnd = nameStart + nameLengthMeta.value;
    if (nameEnd > list.length) {
      throw new Error("Compact snapshot payload is truncated");
    }

    return {
      name: decoder.decode(list.slice(nameStart, nameEnd)),
      text: decoder.decode(list.slice(nameEnd)),
      view: (flags & 1) === 1 ? "edit" : "preview",
    };
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
    if (codec === SHARE_CODEC_PLAIN || codec === SHARE_CODEC_COMPACT) {
      return bytes;
    }

    if (
      (codec !== SHARE_CODEC_GZIP && codec !== SHARE_CODEC_COMPACT_GZIP) ||
      typeof DecompressionStream !== "function"
    ) {
      throw new Error("Unsupported share snapshot codec");
    }
    const source = new Blob([bytes]);
    const stream = source.stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function createShareSnapshotFragment(input) {
    const compactBytes = encodeCompactShareSnapshotBytes(input);
    let codec = SHARE_CODEC_COMPACT;
    let finalBytes = compactBytes;

    try {
      const compressedBytes = await compressShareBytes(compactBytes);
      if (compressedBytes && compressedBytes.length < compactBytes.length) {
        codec = SHARE_CODEC_COMPACT_GZIP;
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
      estimatedPlainBytes = encodeCompactShareSnapshotBytes(payload).length;
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
      (
        codec !== SHARE_CODEC_GZIP &&
        codec !== SHARE_CODEC_PLAIN &&
        codec !== SHARE_CODEC_COMPACT &&
        codec !== SHARE_CODEC_COMPACT_GZIP
      ) ||
      !encoded
    ) {
      return null;
    }

    try {
      const bytes = decodeBase64Url(encoded);
      const restoredBytes = await decompressShareBytes(bytes, codec);
      if (codec === SHARE_CODEC_COMPACT || codec === SHARE_CODEC_COMPACT_GZIP) {
        return {
          version: 1,
          codec: codec,
          payload: decodeCompactShareSnapshotBytes(restoredBytes),
        };
      }

      const decoder = getTextDecoder();
      if (!decoder) return null;
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

  function normalizeLibraryFolderIdSet(value) {
    if (!Array.isArray(value)) return [];
    const seen = Object.create(null);
    const result = [];
    value.forEach(function (item) {
      if (typeof item !== "string" || !item) return;
      if (seen[item]) return;
      seen[item] = true;
      result.push(item);
    });
    return result;
  }

  function orderLibraryFolders(folders, folderOrder) {
    const order = cloneStringArray(folderOrder);
    return (Array.isArray(folders) ? folders.slice() : []).sort(function (a, b) {
      const aId = String((a && a.id) || "");
      const bId = String((b && b.id) || "");
      const aIndex = order.indexOf(aId);
      const bIndex = order.indexOf(bId);

      if (aIndex === -1 && bIndex === -1) {
        return (Number(b && b.addedAt) || 0) - (Number(a && a.addedAt) || 0);
      }
      if (aIndex === -1) return -1;
      if (bIndex === -1) return 1;
      return aIndex - bIndex;
    });
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
      collapsedFolderIds: normalizeLibraryFolderIdSet(
        source.collapsedFolderIds,
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

  function getLibraryDirectoryPaths(nodes) {
    const paths = [];

    function walk(list) {
      (Array.isArray(list) ? list : []).forEach(function (node) {
        if (!node || node.type !== "directory") return;
        if (typeof node.path === "string" && node.path) {
          paths.push(node.path);
        }
        walk(node.children);
      });
    }

    walk(nodes);
    return paths;
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
      libraryCollapsedFolderIds: [],
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

  function slugifyLibraryText(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s/-]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/^\/+|\/+$/g, "");
  }

  function slugifyLibraryAnchorText(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  function normalizeLibraryPath(path) {
    const parts = [];
    String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .forEach(function (part) {
        if (!part || part === ".") return;
        if (part === "..") {
          parts.pop();
          return;
        }
        parts.push(part);
      });
    return parts.join("/");
  }

  function getLibraryPathDir(path) {
    const normalized = normalizeLibraryPath(path);
    const index = normalized.lastIndexOf("/");
    return index === -1 ? "" : normalized.slice(0, index);
  }

  function getLibraryPathBase(path) {
    const normalized = normalizeLibraryPath(path);
    const index = normalized.lastIndexOf("/");
    return index === -1 ? normalized : normalized.slice(index + 1);
  }

  function stripLibraryExtension(name) {
    return String(name || "").replace(/\.(md|markdown|mdown|mkdn|txt)$/i, "");
  }

  function titleFromLibraryPath(path) {
    const base = stripLibraryExtension(getLibraryPathBase(path));
    return String(base || "Untitled")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
  }

  function cleanLibraryInlineMarkdown(text) {
    return String(text || "")
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, function (_match, target, alias) {
        return alias || target;
      })
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_~]/g, "")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitFrontmatter(markdown) {
    const text = String(markdown || "");
    if (!text.startsWith("---")) {
      return { frontmatter: "", body: text };
    }
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
    if (!match) return { frontmatter: "", body: text };
    return {
      frontmatter: match[1] || "",
      body: match[2] || "",
    };
  }

  function normalizeCategoryValue(value) {
    return String(value || "")
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .trim();
  }

  function parseLibraryFrontmatterCategories(frontmatter) {
    const categories = [];
    const seen = Object.create(null);
    let activeList = false;

    function add(value) {
      const normalized = normalizeCategoryValue(value);
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      categories.push(normalized);
    }

    String(frontmatter || "")
      .split(/\r?\n/)
      .forEach(function (line) {
        const match = line.match(/^\s*(tags?|topics?|categor(?:y|ies))\s*:\s*(.*?)\s*$/i);
        if (!match) {
          if (activeList) {
            const item = line.match(/^\s*-\s+(.+?)\s*$/);
            if (item) {
              add(item[1]);
              return;
            }
            if (!line.trim()) return;
            activeList = false;
          }
          return;
        }
        const raw = match[2].trim();
        activeList = !raw;
        if (!raw) return;
        if (raw[0] === "[" && raw[raw.length - 1] === "]") {
          raw
            .slice(1, -1)
            .split(",")
            .forEach(add);
          activeList = false;
          return;
        }
        raw.split(/\s*,\s*/).forEach(add);
        activeList = false;
      });

    return categories;
  }

  function resolveLibraryMarkdownTarget(currentPath, target) {
    const cleanTarget = String(target || "")
      .trim()
      .replace(/^<|>$/g, "")
      .split("#")[0]
      .split("?")[0]
      .trim();
    if (
      !cleanTarget ||
      /^[a-z][a-z0-9+.-]*:/i.test(cleanTarget) ||
      cleanTarget.startsWith("#")
    ) {
      return "";
    }
    const baseDir = getLibraryPathDir(currentPath);
    const resolved = normalizeLibraryPath(
      (baseDir ? baseDir + "/" : "") + cleanTarget,
    );
    return resolved;
  }

  function resolveLibraryWikiTarget(currentPath, target) {
    const raw = String(target || "")
      .trim()
      .split("#")[0]
      .trim();
    if (!raw) return "";
    const baseDir = getLibraryPathDir(currentPath);
    const parts = raw.split("/").map(slugifyLibraryText).filter(Boolean);
    const targetPath = parts.join("/");
    if (!targetPath) return "";
    const withExtension = /\.(md|markdown|mdown|mkdn|txt)$/i.test(targetPath)
      ? targetPath
      : targetPath + ".md";
    return normalizeLibraryPath((baseDir ? baseDir + "/" : "") + withExtension);
  }

  function clipLibrarySummary(text, maxChars) {
    const normalized = cleanLibraryInlineMarkdown(text);
    if (!normalized || normalized.length <= maxChars) return normalized;
    const clipped = normalized.slice(0, Math.max(0, maxChars - 1));
    const boundary = clipped.lastIndexOf(" ");
    return (boundary > 48 ? clipped.slice(0, boundary) : clipped).trim() + "...";
  }

  function extractLibrarySummary(body) {
    const lines = String(body || "").split(/\r?\n/);
    const paragraph = [];
    let inFence = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^(```|~~~)/.test(line.trim())) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (/^ {0,3}#{1,6}\s+/.test(line)) {
        if (paragraph.length) break;
        continue;
      }
      if (!line.trim()) {
        if (paragraph.length) break;
        continue;
      }
      if (/^ {0,3}[-*+]\s+/.test(line.trim())) {
        if (paragraph.length) break;
        continue;
      }
      paragraph.push(line.trim());
    }
    return clipLibrarySummary(paragraph.join(" "), 180);
  }

  function parseLibraryMarkdownContext(input) {
    const source = input && typeof input === "object" ? input : {};
    const path = normalizeLibraryPath(source.path);
    const split = splitFrontmatter(source.text);
    const categories = parseLibraryFrontmatterCategories(split.frontmatter);
    const lines = String(split.body || "").split(/\r?\n/);
    const headings = [];
    const links = [];
    let title = "";
    let inFence = false;
    let inRelatedSection = false;

    function addLink(link) {
      if (!link.normalizedPath) return;
      links.push(link);
    }

    lines.forEach(function (line) {
      if (/^(```|~~~)/.test(line.trim())) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      const headingMatch = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
      if (headingMatch) {
        const text = cleanLibraryInlineMarkdown(headingMatch[2]);
        const heading = {
          level: headingMatch[1].length,
          text: text,
          anchor: slugifyLibraryAnchorText(text),
        };
        headings.push(heading);
        if (!title && heading.level === 1) title = heading.text;
        inRelatedSection = /^related concepts?$/i.test(heading.text);
        return;
      }

      line.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, function (_match, target, alias) {
        const label = cleanLibraryInlineMarkdown(alias || target);
        addLink({
          label: label || cleanLibraryInlineMarkdown(target),
          rawTarget: String(target || "").trim(),
          normalizedPath: resolveLibraryWikiTarget(path, target),
          kind: "wikilink",
          inRelatedSection: inRelatedSection,
        });
        return _match;
      });

      line.replace(/(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g, function (_match, prefix, label, target) {
        addLink({
          label: cleanLibraryInlineMarkdown(label),
          rawTarget: String(target || "").trim(),
          normalizedPath: resolveLibraryMarkdownTarget(path, target),
          kind: "markdown",
          inRelatedSection: inRelatedSection,
        });
        return _match;
      });
    });

    return {
      path: path,
      title: title || titleFromLibraryPath(path),
      summary: extractLibrarySummary(split.body),
      categories: categories,
      headings: headings,
      links: links,
    };
  }

  function buildLibraryKnownPathMaps(docs) {
    const byPath = new Map();
    const byTitleSlug = new Map();
    const byBaseSlug = new Map();

    function setUnique(map, key, value) {
      if (!key || !value) return;
      if (!map.has(key)) {
        map.set(key, value);
        return;
      }
      if (map.get(key) !== value) {
        map.set(key, null);
      }
    }

    docs.forEach(function (doc) {
      byPath.set(doc.path, doc);
      setUnique(byTitleSlug, slugifyLibraryText(doc.title), doc.path);
      setUnique(
        byBaseSlug,
        slugifyLibraryText(stripLibraryExtension(getLibraryPathBase(doc.path))),
        doc.path,
      );
    });

    return {
      byPath: byPath,
      byTitleSlug: byTitleSlug,
      byBaseSlug: byBaseSlug,
    };
  }

  function resolveLibraryContextLink(link, maps) {
    const normalized = normalizeLibraryPath(link && link.normalizedPath);
    if (normalized && maps.byPath.has(normalized)) return normalized;
    if (link && link.kind === "wikilink") {
      const slug = slugifyLibraryText(link.rawTarget || link.label);
      return maps.byTitleSlug.get(slug) || maps.byBaseSlug.get(slug) || "";
    }
    return "";
  }

  function dedupeByPath(items) {
    const seen = new Set();
    const output = [];
    items.forEach(function (item) {
      if (!item || !item.path || seen.has(item.path)) return;
      seen.add(item.path);
      output.push(item);
    });
    return output;
  }

  function buildLibraryMindmapContext(input) {
    const source = input && typeof input === "object" ? input : {};
    const currentPath = normalizeLibraryPath(source.currentPath);
    const files = Array.isArray(source.files) ? source.files : [];
    const currentMarkdown = String(source.currentMarkdown || "");
    const parsedDocs = [];
    const seenPaths = new Set();

    function addDoc(file) {
      const filePath = normalizeLibraryPath(file && file.path);
      if (!filePath || seenPaths.has(filePath) || !isSupportedLibraryFile(filePath)) {
        return;
      }
      seenPaths.add(filePath);
      parsedDocs.push(
        parseLibraryMarkdownContext({
          path: filePath,
          text: String(file && file.text ? file.text : ""),
        }),
      );
    }

    files.forEach(addDoc);
    if (currentPath) {
      const existingIndex = parsedDocs.findIndex(function (doc) {
        return doc.path === currentPath;
      });
      const currentDoc = parseLibraryMarkdownContext({
        path: currentPath,
        text: currentMarkdown,
      });
      if (existingIndex === -1) {
        parsedDocs.unshift(currentDoc);
      } else {
        parsedDocs[existingIndex] = currentDoc;
      }
    }

    const maps = buildLibraryKnownPathMaps(parsedDocs);
    const current =
      maps.byPath.get(currentPath) ||
      parseLibraryMarkdownContext({ path: currentPath, text: currentMarkdown });

    const outboundLinks = dedupeByPath(
      current.links
        .map(function (link) {
          const resolvedPath = resolveLibraryContextLink(link, maps);
          const target = maps.byPath.get(resolvedPath);
          if (!target || resolvedPath === current.path) return null;
          return {
            path: resolvedPath,
            title: target.title,
            label: link.label,
            summary: target.summary,
            categories: target.categories.slice(),
            related: Boolean(link.inRelatedSection),
            kind: link.kind,
          };
        })
        .filter(Boolean),
    );

    const backlinkCounts = new Map();
    const backlinks = dedupeByPath(
      parsedDocs
        .filter(function (doc) {
          return doc.path !== current.path;
        })
        .map(function (doc) {
          let count = 0;
          doc.links.forEach(function (link) {
            if (resolveLibraryContextLink(link, maps) === current.path) {
              count += 1;
            }
          });
          if (!count) return null;
          backlinkCounts.set(doc.path, count);
          return {
            path: doc.path,
            title: doc.title,
            summary: doc.summary,
            categories: doc.categories.slice(),
            occurrenceCount: count,
          };
        })
        .filter(Boolean),
    );

    const outboundByPath = new Map();
    outboundLinks.forEach(function (item) {
      outboundByPath.set(item.path, item);
    });
    const backlinkByPath = new Map();
    backlinks.forEach(function (item) {
      backlinkByPath.set(item.path, item);
    });

    const neighborPaths = new Set(
      outboundLinks.concat(backlinks).map(function (item) {
        return item.path;
      }),
    );
    const neighbors = Array.from(neighborPaths)
      .map(function (path) {
        const doc = maps.byPath.get(path);
        const outbound = outboundByPath.get(path);
        const inbound = backlinkByPath.get(path);
        return {
          path: path,
          title: doc ? doc.title : titleFromLibraryPath(path),
          summary: doc ? doc.summary : "",
          categories: doc ? doc.categories.slice() : [],
          backlinkCount: backlinkCounts.get(path) || 0,
          direction: outbound && inbound ? "bidirectional" : outbound ? "outbound" : "inbound",
          related: Boolean(outbound && outbound.related),
        };
      })
      .sort(function (a, b) {
        if (a.related !== b.related) return a.related ? -1 : 1;
        return compareLibraryNames(a.title, b.title);
      });

    return {
      current: current,
      files: parsedDocs,
      outboundLinks: outboundLinks,
      backlinks: backlinks,
      neighbors: neighbors,
      stats: {
        fileCount: parsedDocs.length,
        neighborCount: neighbors.length,
      },
    };
  }

  function makeMindmapGraphId(prefix, text, usedIds) {
    const base = prefix + "-" + (slugifyLibraryText(text) || "item");
    let id = base;
    let index = 2;
    while (usedIds.has(id)) {
      id = base + "-" + index;
      index += 1;
    }
    usedIds.add(id);
    return id;
  }

  function createLibraryContextMindmapGraph(context) {
    const source = context && typeof context === "object" ? context : {};
    const current = source.current || {};
    const usedIds = new Set(["root"]);
    const nodes = [];
    const edges = [];
    const sectionIdByAnchor = new Map();
    const headings = Array.isArray(current.headings) ? current.headings : [];
    const sectionHeadings = headings.filter(function (heading) {
      return heading && heading.level > 1 && heading.text;
    });

    sectionHeadings.slice(0, 12).forEach(function (heading) {
      const id = makeMindmapGraphId("section", heading.anchor || heading.text, usedIds);
      sectionIdByAnchor.set(heading.anchor, id);
      nodes.push({
        id: id,
        label: heading.text,
        type: "feature",
        summary: "Section from the current document.",
        sourceAnchor: heading.anchor || null,
        parent: "root",
      });
    });

    const relatedParent =
      sectionIdByAnchor.get("related-concepts") ||
      (nodes[0] && nodes[0].id) ||
      "root";
    const neighbors = Array.isArray(source.neighbors) ? source.neighbors : [];
    neighbors.slice(0, Math.max(0, 24 - nodes.length)).forEach(function (neighbor) {
      const id = makeMindmapGraphId("related", neighbor.title || neighbor.path, usedIds);
      nodes.push({
        id: id,
        label: neighbor.title || titleFromLibraryPath(neighbor.path),
        type: neighbor.direction === "inbound" ? "dependency" : "feature",
        summary: neighbor.summary || "Linked page in the active library folder.",
        sourceAnchor: null,
        parent: relatedParent,
      });
      edges.push({
        from: id,
        to: relatedParent,
        kind: neighbor.direction === "inbound" ? "depends_on" : "supports",
      });
    });

    if (!nodes.length && current.summary) {
      nodes.push({
        id: makeMindmapGraphId("summary", current.title || "summary", usedIds),
        label: "Summary",
        type: "feature",
        summary: current.summary,
        sourceAnchor: null,
        parent: "root",
      });
    }

    return {
      root: {
        id: "root",
        label: current.title || "Library Document",
        summary: current.summary || "Deterministic map from the active library context.",
      },
      nodes: nodes,
      edges: edges,
    };
  }

  function formatLibraryMindmapContextForPrompt(context) {
    const source = context && typeof context === "object" ? context : {};
    const current = source.current || {};
    const headings = Array.isArray(current.headings) ? current.headings : [];
    const anchors = headings
      .map(function (heading) {
        return heading && heading.anchor;
      })
      .filter(Boolean);
    const lines = [
      "LIBRARY_CONTEXT",
      "This context is deterministic. Treat available_anchors and library links as authoritative.",
      "current: " +
        (current.title || "Untitled") +
        " (" +
        (current.path || "") +
        ")",
      "available_anchors: " + (anchors.length ? anchors.join(", ") : "none"),
    ];

    if (Array.isArray(current.categories) && current.categories.length) {
      lines.push("categories: " + current.categories.join(", "));
    }

    const outbound = Array.isArray(source.outboundLinks)
      ? source.outboundLinks
      : [];
    lines.push("outbound_links:");
    if (outbound.length) {
      outbound.slice(0, 16).forEach(function (item) {
        lines.push(
          "- " +
            (item.label || item.title || item.path) +
            " -> " +
            item.path +
            (item.related ? " related_section=true" : ""),
        );
      });
    } else {
      lines.push("- none");
    }

    const backlinks = Array.isArray(source.backlinks) ? source.backlinks : [];
    lines.push("backlinks:");
    if (backlinks.length) {
      backlinks.slice(0, 16).forEach(function (item) {
        lines.push(
          "- " +
            (item.title || item.path) +
            " -> current occurrence_count=" +
            (item.occurrenceCount || 1),
        );
      });
    } else {
      lines.push("- none");
    }

    const neighbors = Array.isArray(source.neighbors) ? source.neighbors : [];
    lines.push("neighbors:");
    if (neighbors.length) {
      neighbors.slice(0, 18).forEach(function (item) {
        lines.push(
          "- " +
            (item.title || item.path) +
            " (" +
            item.path +
            ") direction=" +
            (item.direction || "related") +
            (item.related ? " related=true" : "") +
            (item.summary ? " summary=\"" + item.summary.replace(/"/g, "'") + "\"" : ""),
        );
      });
    } else {
      lines.push("- none");
    }

    return lines.join("\n");
  }

  function groundMindmapGraphWithLibraryContext(graph, context) {
    const sourceGraph = graph && typeof graph === "object" ? graph : {};
    const sourceContext = context && typeof context === "object" ? context : {};
    const current = sourceContext.current || {};
    const allowedAnchors = new Set(
      (Array.isArray(current.headings) ? current.headings : [])
        .map(function (heading) {
          return heading && heading.anchor;
        })
        .filter(Boolean),
    );

    return {
      root: Object.assign({}, sourceGraph.root || {}),
      nodes: (Array.isArray(sourceGraph.nodes) ? sourceGraph.nodes : []).map(function (node) {
        const next = Object.assign({}, node);
        if (next.sourceAnchor && !allowedAnchors.has(next.sourceAnchor)) {
          next.sourceAnchor = null;
        }
        return next;
      }),
      edges: (Array.isArray(sourceGraph.edges) ? sourceGraph.edges : []).map(function (edge) {
        return Object.assign({}, edge);
      }),
    };
  }

  function normalizeMindmapGraphReferences(graph, options) {
    const source = graph && typeof graph === "object" ? graph : {};
    const settings = options && typeof options === "object" ? options : {};
    const allowedNodeTypes = new Set(
      Array.isArray(settings.allowedNodeTypes) ? settings.allowedNodeTypes : [],
    );
    const allowedEdgeKinds = new Set(
      Array.isArray(settings.allowedEdgeKinds) ? settings.allowedEdgeKinds : [],
    );
    const fallbackNodeType =
      typeof settings.fallbackNodeType === "string"
        ? settings.fallbackNodeType
        : "feature";
    const fallbackEdgeKind =
      typeof settings.fallbackEdgeKind === "string"
        ? settings.fallbackEdgeKind
        : "supports";
    const root = Object.assign(
      {
        id: "root",
        label: "Document",
        summary: "",
      },
      source.root && typeof source.root === "object" ? source.root : {},
    );
    root.id = "root";
    if (typeof root.label !== "string" || !root.label.trim()) {
      root.label = "Document";
    }
    if (typeof root.summary !== "string") {
      root.summary = "";
    }

    const usedIds = new Set(["root"]);
    const remap = new Map([["root", "root"]]);
    const nodes = [];

    function makeNodeId(node, index) {
      const raw = node && typeof node.id === "string" ? node.id.trim() : "";
      const fallback =
        node && typeof node.label === "string" && node.label.trim()
          ? slugifyLibraryAnchorText(node.label)
          : "node-" + (index + 1);
      const base = slugifyLibraryAnchorText(raw || fallback) || "node-" + (index + 1);
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = base + "-" + suffix;
        suffix += 1;
      }
      usedIds.add(id);
      if (raw && !remap.has(raw)) {
        remap.set(raw, id);
      }
      return id;
    }

    (Array.isArray(source.nodes) ? source.nodes : []).forEach(function (node, index) {
      if (!node || typeof node !== "object") return;
      const next = Object.assign({}, node);
      next.id = makeNodeId(next, index);
      if (typeof next.label !== "string" || !next.label.trim()) {
        next.label = next.id;
      }
      if (typeof settings.normalizeNodeType === "function") {
        next.type = settings.normalizeNodeType(next.type);
      }
      if (allowedNodeTypes.size && !allowedNodeTypes.has(next.type)) {
        next.type = allowedNodeTypes.has(fallbackNodeType)
          ? fallbackNodeType
          : Array.from(allowedNodeTypes)[0];
      }
      if (typeof next.summary !== "string") {
        next.summary = "";
      }
      if (typeof next.sourceAnchor !== "string") {
        next.sourceAnchor = null;
      }
      nodes.push(next);
    });

    const aliasToId = new Map();
    function addAlias(value, id) {
      const raw = String(value || "").trim();
      if (!raw || !id) return;
      const aliases = [raw, slugifyLibraryAnchorText(raw), slugifyLibraryText(raw)];
      aliases.forEach(function (alias) {
        if (!alias) return;
        if (!aliasToId.has(alias)) {
          aliasToId.set(alias, id);
        } else if (aliasToId.get(alias) !== id) {
          aliasToId.set(alias, null);
        }
      });
    }

    addAlias("root", "root");
    addAlias(root.label, "root");
    (Array.isArray(settings.rootAliases) ? settings.rootAliases : []).forEach(function (alias) {
      addAlias(alias, "root");
    });
    nodes.forEach(function (node) {
      addAlias(node.id, node.id);
      addAlias(node.label, node.id);
      addAlias(node.sourceAnchor, node.id);
    });

    function resolveReference(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (remap.has(raw)) return remap.get(raw);
      if (usedIds.has(raw)) return raw;
      const direct = aliasToId.get(raw);
      if (direct) return direct;
      const anchorSlug = slugifyLibraryAnchorText(raw);
      const anchorMatch = aliasToId.get(anchorSlug);
      if (anchorMatch) return anchorMatch;
      const pathSlug = slugifyLibraryText(raw);
      const pathMatch = aliasToId.get(pathSlug);
      return pathMatch || "";
    }

    nodes.forEach(function (node) {
      const parent = resolveReference(node.parent);
      node.parent = parent && usedIds.has(parent) && parent !== node.id ? parent : "root";
    });

    const maxDepth = Number.isFinite(Number(settings.maxDepth))
      ? Math.max(1, Number(settings.maxDepth))
      : 3;
    const byId = new Map();
    nodes.forEach(function (node) {
      byId.set(node.id, node);
    });

    function repairDepth(id, stack) {
      if (id === "root") return 0;
      const node = byId.get(id);
      if (!node) return 0;
      if (stack.indexOf(id) !== -1) {
        node.parent = "root";
        return 1;
      }
      const parentDepth = repairDepth(node.parent, stack.concat(id));
      if (parentDepth + 1 > maxDepth) {
        node.parent = "root";
        return 1;
      }
      return parentDepth + 1;
    }

    nodes.forEach(function (node) {
      repairDepth(node.id, []);
    });

    const edgeSeen = new Set();
    const edges = [];
    (Array.isArray(source.edges) ? source.edges : []).forEach(function (edge) {
      if (!edge || typeof edge !== "object") return;
      const from = resolveReference(edge.from);
      const to = resolveReference(edge.to);
      if (!from || !to || !usedIds.has(from) || !usedIds.has(to)) return;
      if (from === to) return;
      const kind =
        typeof settings.normalizeEdgeKind === "function"
          ? settings.normalizeEdgeKind(edge.kind)
          : edge.kind;
      if (allowedEdgeKinds.size && !allowedEdgeKinds.has(kind)) {
        if (!allowedEdgeKinds.has(fallbackEdgeKind)) return;
      }
      const safeKind =
        allowedEdgeKinds.size && !allowedEdgeKinds.has(kind)
          ? fallbackEdgeKind
          : kind;
      const key = from + "->" + to + "->" + String(safeKind || "");
      if (edgeSeen.has(key)) return;
      edgeSeen.add(key);
      edges.push(Object.assign({}, edge, {
        from: from,
        to: to,
        kind: safeKind,
      }));
    });

    return {
      root: root,
      nodes: nodes,
      edges: edges,
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
    buildLibraryMindmapContext,
    createLibraryContextMindmapGraph,
    createShareSnapshotFragment,
    createDirectoryNode,
    createFileNode,
    getShareSnapshotState,
    getClearedLibraryCollectionState,
    getFolderConflict,
    getLibraryDirectoryPaths,
    getReaderAuthoringState,
    getReaderRefreshState,
    getReaderSaveState,
    groundMindmapGraphWithLibraryContext,
    isSupportedLibraryFile,
    formatLibraryMindmapContextForPrompt,
    normalizeLibraryFolderIdSet,
    normalizeLibraryMeta,
    normalizeMindmapGraphReferences,
    normalizePathKey,
    orderLibraryFolders,
    parseLibraryMarkdownContext,
    parseShareSnapshotFragment,
    prepareImportedLibraryEntries,
    shapeLibraryTree,
    shouldAutoRestoreLastFile,
    sortLibraryEntries,
  };
});
