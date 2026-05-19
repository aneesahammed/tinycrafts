(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVShortcuts = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  "use strict";

  const SHORTCUTS = {
    "global.search": {
      label: "Search files and commands",
      key: "k",
      mod: true,
      defaultVisible: true,
    },
    "global.save": {
      label: "Save current document",
      key: "s",
      mod: true,
    },
    "global.mode": {
      label: "Toggle edit mode",
      key: "e",
      mod: true,
    },
    "editor.bold": {
      label: "Bold",
      key: "b",
      mod: true,
    },
    "editor.italic": {
      label: "Italic",
      key: "i",
      mod: true,
    },
    "editor.link": {
      label: "Link",
      key: "k",
      mod: true,
      shift: true,
    },
    "editor.inline-code": {
      label: "Inline code",
    },
    "editor.code-block": {
      label: "Code block",
    },
    "editor.bullet-list": {
      label: "Bullet list",
      key: "8",
      code: "Digit8",
      mod: true,
      shift: true,
    },
    "editor.numbered-list": {
      label: "Numbered list",
      key: "7",
      code: "Digit7",
      mod: true,
      shift: true,
    },
    "editor.image": {
      label: "Image markdown",
      key: "i",
      mod: true,
      alt: true,
    },
  };

  function platformText() {
    const nav = root && root.navigator;
    return nav ? String(nav.platform || nav.userAgent || "") : "";
  }

  function isApplePlatform() {
    return /Mac|iPhone|iPad|iPod/i.test(platformText());
  }

  function normalizeKey(key) {
    const value = String(key || "").toLowerCase();
    if (value === " ") return "space";
    if (value === "esc") return "escape";
    return value;
  }

  function get(id) {
    const shortcut = SHORTCUTS[id];
    return shortcut ? Object.assign({ id: id }, shortcut) : null;
  }

  function all() {
    return Object.keys(SHORTCUTS).map(get);
  }

  function keyLabel(shortcut) {
    const key = String(shortcut && shortcut.key ? shortcut.key : "");
    if (!key) return "";
    if (key === " ") return "Space";
    if (key.length === 1) return key.toUpperCase();
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function format(id, options) {
    const shortcut = typeof id === "string" ? get(id) : id;
    if (!shortcut) return "";
    const opts = options || {};
    const symbols = opts.symbols === true;
    const separator =
      typeof opts.separator === "string"
        ? opts.separator
        : symbols
          ? ""
          : "+";
    const mac = isApplePlatform();
    const parts = [];

    if (shortcut.mod) parts.push(symbols ? (mac ? "\u2318" : "Ctrl") : mac ? "Cmd" : "Ctrl");
    if (shortcut.shift) parts.push(symbols ? "\u21e7" : "Shift");
    if (shortcut.alt) parts.push(symbols ? (mac ? "\u2325" : "Alt") : mac ? "Option" : "Alt");
    parts.push(keyLabel(shortcut));
    return parts.filter(Boolean).join(separator);
  }

  function matches(event, id) {
    const shortcut = typeof id === "string" ? get(id) : id;
    if (!event || !shortcut) return false;
    if (shortcut.mod && !(event.metaKey || event.ctrlKey)) return false;
    if (!shortcut.mod && (event.metaKey || event.ctrlKey)) return false;
    if (Boolean(event.shiftKey) !== Boolean(shortcut.shift)) return false;
    if (Boolean(event.altKey) !== Boolean(shortcut.alt)) return false;

    const eventKey = normalizeKey(event.key);
    const shortcutKey = normalizeKey(shortcut.key);
    if (eventKey === shortcutKey) return true;
    return Boolean(shortcut.code && event.code === shortcut.code);
  }

  function applyTitles(rootNode) {
    const container = rootNode || (root && root.document);
    if (!container || typeof container.querySelectorAll !== "function") return;
    container.querySelectorAll("[data-shortcut-id]").forEach(function (element) {
      const id = element.getAttribute("data-shortcut-id");
      const label = format(id);
      if (!label) return;
      const base =
        element.getAttribute("data-title-base") ||
        element.getAttribute("aria-label") ||
        String(element.getAttribute("title") || "").replace(/\s*\([^)]*\)\s*$/, "") ||
        "";
      if (base) element.setAttribute("title", base + " (" + label + ")");
      element.setAttribute("data-shortcut-label", label);
    });
  }

  return {
    all: all,
    applyTitles: applyTitles,
    describe: format,
    format: format,
    get: get,
    isApplePlatform: isApplePlatform,
    matches: matches,
  };
});
