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

  function normalizeKnowledgePath(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "")
      .replace(/\/+/g, "/")
      .replace(/^\/+|\/+$/g, "");
  }

  function getKnowledgeKey(folderId, path) {
    return String(folderId || "") + "::" + normalizeKnowledgePath(path);
  }

  function normalizeKnowledgeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanKnowledgeInlineMarkdown(value) {
    return normalizeKnowledgeText(
      String(value || "")
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/[*_~]/g, "")
        .replace(/<\/?[^>]+>/g, ""),
    );
  }

  function slugifyKnowledgeText(value) {
    return cleanKnowledgeInlineMarkdown(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  function stripKnowledgeMarkdownNoise(markdown) {
    return String(markdown || "")
      .replace(/```[\s\S]*?```/g, "\n")
      .replace(/~~~[\s\S]*?~~~/g, "\n")
      .replace(/`[^`\n]*`/g, " ");
  }

  function basenameWithoutExtension(path) {
    const cleanPath = normalizeKnowledgePath(path);
    const name = cleanPath.split("/").pop() || cleanPath || "Untitled";
    return name.replace(/\.(md|markdown|mdown|mkdn|txt)$/i, "");
  }

  function normalizeKnowledgeAlias(value) {
    return cleanKnowledgeInlineMarkdown(value)
      .toLowerCase()
      .replace(/\.(md|markdown|mdown|mkdn|txt)$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/[^\p{L}\p{N}\s/]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function addUniqueString(list, value) {
    const normalized = String(value || "").trim();
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function createContentFingerprint(text) {
    const value = String(text || "");
    let h1 = 0x811c9dc5 ^ value.length;
    let h2 = 0x1000193 ^ value.length;
    let h3 = 0x9e3779b9 ^ value.length;
    let h4 = 0x85ebca6b ^ value.length;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ code, 0x85ebca6b);
      h3 = Math.imul(h3 ^ code, 0xc2b2ae35);
      h4 = Math.imul(h4 ^ code, 0x27d4eb2f);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b);
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35);
    h3 = Math.imul(h3 ^ (h3 >>> 16), 0x27d4eb2f);
    h4 = Math.imul(h4 ^ (h4 >>> 15), 0x165667b1);
    return [h1, h2, h3, h4]
      .map(function (part) {
        return (part >>> 0).toString(16).padStart(8, "0");
      })
      .join("");
  }

  function extractKnowledgeHeadings(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const headings = [];
    let inFence = false;

    lines.forEach(function (line) {
      const trimmed = line.trim();
      if (/^(```|~~~)/.test(trimmed)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      const match = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
      if (!match) return;
      const text = cleanKnowledgeInlineMarkdown(match[2]);
      if (!text) return;
      headings.push({
        level: match[1].length,
        text: text,
        anchor: slugifyKnowledgeText(text),
      });
    });

    return headings;
  }

  function extractKnowledgeTags(markdown) {
    const text = stripKnowledgeMarkdownNoise(markdown)
      .replace(/\[\[[^\]]+\]\]/g, " ")
      .replace(/^ {0,3}#{1,6}[ \t]+.+$/gm, " ");
    const tags = [];
    const seen = Object.create(null);
    const pattern = /(^|[\s([{>])#([\p{L}][\p{L}\p{N}_/-]{1,48})(?=$|[\s.,;:!?()[\]{}<>])/gu;
    let match;
    while ((match = pattern.exec(text))) {
      const tag = match[2].replace(/\/+$/g, "");
      const normalized = tag.toLowerCase();
      if (!normalized || seen[normalized]) continue;
      seen[normalized] = true;
      tags.push(tag);
    }
    return tags.sort(compareLibraryNames);
  }

  function splitKnowledgeTarget(rawTarget) {
    const raw = String(rawTarget || "").trim();
    const hashIndex = raw.indexOf("#");
    const target = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
    const anchor = hashIndex === -1 ? "" : raw.slice(hashIndex + 1);
    return {
      target: target.trim(),
      anchor: anchor.trim(),
    };
  }

  function isExternalKnowledgeHref(href) {
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(String(href || "").trim());
  }

  function normalizeKnowledgeTargetRef(target, sourcePath) {
    const rawTarget = String(target || "").trim();
    if (!rawTarget) return "";
    if (isExternalKnowledgeHref(rawTarget)) return "";

    let cleanTarget = rawTarget.replace(/\\/g, "/").replace(/^\.?\//, "");
    try {
      cleanTarget = decodeURIComponent(cleanTarget);
    } catch (_error) {}

    if (/\.(md|markdown|mdown|mkdn|txt)$/i.test(cleanTarget)) {
      const sourceParts = normalizeKnowledgePath(sourcePath).split("/");
      sourceParts.pop();
      const baseParts = cleanTarget.startsWith("/")
        ? []
        : sourceParts.filter(Boolean);
      cleanTarget.split("/").forEach(function (part) {
        if (!part || part === ".") return;
        if (part === "..") {
          baseParts.pop();
        } else {
          baseParts.push(part);
        }
      });
      return normalizeKnowledgePath(baseParts.join("/"));
    }

    return normalizeKnowledgeAlias(cleanTarget);
  }

  function extractKnowledgeOutgoingLinks(markdown, sourcePath) {
    const text = stripKnowledgeMarkdownNoise(markdown);
    const links = [];
    const seen = Object.create(null);

    function addLink(kind, rawTarget, label) {
      const split = splitKnowledgeTarget(rawTarget);
      const targetRef = normalizeKnowledgeTargetRef(split.target, sourcePath);
      const anchor = split.anchor ? slugifyKnowledgeText(split.anchor) : "";
      if (!targetRef && !anchor) return;
      const id = kind + "::" + targetRef + "::" + anchor + "::" + label;
      if (seen[id]) return;
      seen[id] = true;
      links.push({
        kind: kind,
        targetRef: targetRef,
        targetAnchor: anchor,
        rawTarget: String(rawTarget || "").trim(),
        label: cleanKnowledgeInlineMarkdown(label || split.target || split.anchor),
      });
    }

    text.replace(/!?\[\[([^\]|]*(?:#[^\]|]+)?)(?:\|([^\]]+))?\]\]/g, function (
      _match,
      target,
      alias,
    ) {
      addLink("wikilink", target, alias || "");
      return _match;
    });

    text.replace(/(!)?\[([^\]\n]+)\]\(\s*(<[^>]+>|[^)\n]+?)(?:\s+["'][^"']*["'])?\s*\)/g, function (
      _match,
      isImage,
      label,
      href,
    ) {
      if (isImage) return _match;
      href = String(href || "").trim();
      if (href.charAt(0) === "<" && href.charAt(href.length - 1) === ">") {
        href = href.slice(1, -1).trim();
      }
      if (!href || href.charAt(0) === "#" || isExternalKnowledgeHref(href)) {
        return _match;
      }
      addLink("markdown", href, label);
      return _match;
    });

    return links;
  }

  function extractKnowledgePage(input) {
    const source = input && typeof input === "object" ? input : {};
    const folderId = String(source.folderId || "");
    const path = normalizeKnowledgePath(source.path);
    const markdown = String(source.markdown || "");
    const headings = extractKnowledgeHeadings(markdown);
    const aliases = [];
    const baseTitle = basenameWithoutExtension(path);
    const h1 = headings.find(function (heading) {
      return heading.level === 1;
    });
    const title = (h1 && h1.text) || baseTitle || "Untitled";

    [title, baseTitle, path.replace(/\.(md|markdown|mdown|mkdn|txt)$/i, "")].forEach(
      function (alias) {
        addUniqueString(aliases, normalizeKnowledgeAlias(alias));
      },
    );

    headings.slice(0, 8).forEach(function (heading) {
      addUniqueString(aliases, normalizeKnowledgeAlias(heading.text));
    });

    return {
      key: getKnowledgeKey(folderId, path),
      folderId: folderId,
      path: path,
      title: title,
      aliases: aliases,
      headings: headings,
      tags: extractKnowledgeTags(markdown),
      outgoingLinks: extractKnowledgeOutgoingLinks(markdown, path),
      markdownHash: createContentFingerprint(markdown),
      lastModified: Number(source.lastModified) || 0,
      indexedAt: Number(source.indexedAt) || Date.now(),
    };
  }

  function buildKnowledgeAliasIndex(pages) {
    const index = new Map();
    (Array.isArray(pages) ? pages : []).forEach(function (page) {
      if (!page || !page.key) return;
      const refs = [normalizeKnowledgePath(page.path)];
      (Array.isArray(page.aliases) ? page.aliases : []).forEach(function (alias) {
        refs.push(alias);
      });
      refs.forEach(function (ref) {
        const normalized = normalizeKnowledgeTargetRef(ref, page.path);
        if (!normalized) return;
        if (index.has(normalized) && index.get(normalized) !== page) {
          index.set(normalized, null);
          return;
        }
        if (index.has(normalized)) return;
        index.set(normalized, page);
      });
    });
    return index;
  }

  function createKnowledgeLinkRecords(pages) {
    const pageList = Array.isArray(pages) ? pages : [];
    const aliasIndex = buildKnowledgeAliasIndex(pageList);
    const records = [];

    pageList.forEach(function (page) {
      (Array.isArray(page.outgoingLinks) ? page.outgoingLinks : []).forEach(
        function (link, index) {
          const targetPage = link.targetRef ? aliasIndex.get(link.targetRef) : null;
          records.push({
            id: page.key + "->" + (link.targetRef || link.targetAnchor || "target") + "#" + index,
            folderId: page.folderId,
            sourceKey: page.key,
            sourcePath: page.path,
            targetKey: targetPage ? targetPage.key : "",
            targetPath: targetPage ? targetPage.path : "",
            targetRef: link.targetRef || "",
            targetAnchor: link.targetAnchor || "",
            label: link.label || link.rawTarget || link.targetRef || "Link",
            kind: link.kind || "link",
          });
        },
      );
    });

    return records;
  }

  function buildKnowledgeConnections(pages, links, activeKey) {
    const pageList = Array.isArray(pages) ? pages : [];
    const linkList = Array.isArray(links) ? links : [];
    const byKey = new Map();
    pageList.forEach(function (page) {
      if (page && page.key) byKey.set(page.key, page);
    });
    const active = byKey.get(activeKey) || null;
    const outgoing = linkList.filter(function (link) {
      return link && link.sourceKey === activeKey;
    });
    const inbound = linkList.filter(function (link) {
      return link && link.targetKey === activeKey;
    });
    const activeTags = new Set(
      (active && Array.isArray(active.tags) ? active.tags : []).map(function (tag) {
        return String(tag).toLowerCase();
      }),
    );
    const activeHeadings = new Set(
      (active && Array.isArray(active.headings) ? active.headings : []).map(
        function (heading) {
          return normalizeKnowledgeAlias(heading && heading.text);
        },
      ),
    );
    const related = pageList
      .filter(function (page) {
        return page && page.key !== activeKey;
      })
      .map(function (page) {
        let score = 0;
        (Array.isArray(page.tags) ? page.tags : []).forEach(function (tag) {
          if (activeTags.has(String(tag).toLowerCase())) score += 4;
        });
        (Array.isArray(page.headings) ? page.headings : []).forEach(function (heading) {
          if (activeHeadings.has(normalizeKnowledgeAlias(heading && heading.text))) {
            score += 1;
          }
        });
        return { page: page, score: score };
      })
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return compareLibraryNames(a.page.title, b.page.title);
      })
      .slice(0, 8)
      .map(function (item) {
        return item.page;
      });

    return {
      active: active,
      outgoing: outgoing,
      inbound: inbound,
      related: related,
    };
  }

  function selectKnowledgeGraphNodes(pages, links, options) {
    const source = options && typeof options === "object" ? options : {};
    const threshold = Number(source.threshold) || 300;
    const topN = Number(source.topN) || 50;
    const activeKey = String(source.activeKey || "");
    const pageList = Array.isArray(pages) ? pages : [];
    const linkList = Array.isArray(links) ? links : [];
    if (pageList.length <= threshold) {
      return {
        keys: pageList.map(function (page) {
          return page.key;
        }),
        filtered: false,
      };
    }

    const degree = new Map();
    const neighbors = new Map();
    function touch(key) {
      if (!key) return;
      degree.set(key, (degree.get(key) || 0) + 1);
      if (!neighbors.has(key)) neighbors.set(key, new Set());
    }
    linkList.forEach(function (link) {
      if (!link || !link.sourceKey || !link.targetKey) return;
      touch(link.sourceKey);
      touch(link.targetKey);
      neighbors.get(link.sourceKey).add(link.targetKey);
      neighbors.get(link.targetKey).add(link.sourceKey);
    });

    const selected = new Set();
    if (activeKey) {
      selected.add(activeKey);
      const firstHop = neighbors.get(activeKey) || new Set();
      firstHop.forEach(function (key) {
        selected.add(key);
        const secondHop = neighbors.get(key) || new Set();
        secondHop.forEach(function (secondKey) {
          selected.add(secondKey);
        });
      });
    }

    pageList
      .slice()
      .sort(function (a, b) {
        const degreeDelta = (degree.get(b.key) || 0) - (degree.get(a.key) || 0);
        if (degreeDelta) return degreeDelta;
        return (Number(b.lastModified) || 0) - (Number(a.lastModified) || 0);
      })
      .slice(0, topN)
      .forEach(function (page) {
        selected.add(page.key);
      });

    return {
      keys: pageList
        .map(function (page) {
          return page.key;
        })
        .filter(function (key) {
          return selected.has(key);
        }),
      filtered: true,
    };
  }

  const KNOWLEDGE_CONCEPT_TYPE_ALIASES = {
    goal: "goal",
    goals: "goal",
    non_goal: "non_goal",
    nongoal: "non_goal",
    feature: "feature",
    tool: "concept",
    concept: "concept",
    term: "concept",
    constraint: "constraint",
    dependency: "dependency",
    actor: "actor",
    assumption: "assumption",
    open_question: "open_question",
    question: "open_question",
    success_metric: "success_metric",
    metric: "success_metric",
  };

  function normalizeKnowledgeConceptType(type) {
    const canonical = String(type || "concept")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return KNOWLEDGE_CONCEPT_TYPE_ALIASES[canonical] || "concept";
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
    getLibraryDirectoryPaths,
    buildKnowledgeConnections,
    createKnowledgeLinkRecords,
    extractKnowledgePage,
    getReaderAuthoringState,
    getReaderRefreshState,
    getReaderSaveState,
    getKnowledgeKey,
    isSupportedLibraryFile,
    normalizeKnowledgeConceptType,
    normalizeKnowledgePath,
    normalizeKnowledgeTargetRef,
    normalizeLibraryFolderIdSet,
    normalizeLibraryMeta,
    normalizePathKey,
    orderLibraryFolders,
    parseShareSnapshotFragment,
    prepareImportedLibraryEntries,
    selectKnowledgeGraphNodes,
    slugifyKnowledgeText,
    shapeLibraryTree,
    shouldAutoRestoreLastFile,
    sortLibraryEntries,
  };
});
