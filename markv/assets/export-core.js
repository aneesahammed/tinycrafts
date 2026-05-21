(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVExportCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const DEFAULT_BASE_NAME = "untitled";
  const MAX_BASE_NAME_LENGTH = 96;
  const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g;
  const BIDI_CONTROL_CHARS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
  const MARKDOWN_EXTENSION = /\.(md|markdown|mdown|mkdn|txt)$/i;

  const PRINT_DIALOG_FALLBACK_MS = 3000;
  const PRINT_HARD_WATCHDOG_MS = 120000;
  const MERMAID_READY_TIMEOUT_MS = 8000;
  const IMAGE_READY_TIMEOUT_MS = 3000;

  function stripMarkdownExtension(name) {
    return String(name || "").replace(MARKDOWN_EXTENSION, "");
  }

  function extractFirstHeading(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
      if (match && match[1]) return match[1];
    }
    return "";
  }

  function sanitizeFileBaseName(value, fallback) {
    const fallbackName =
      arguments.length > 1 ? String(fallback || "") : DEFAULT_BASE_NAME;
    let name = stripMarkdownExtension(
      String(value || "")
        .trim()
        .replace(BIDI_CONTROL_CHARS, "")
        .replace(UNSAFE_FILENAME_CHARS, "-"),
    )
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      .replace(/\s*-\s*/g, "-")
      .trim()
      .replace(/^[.\s-]+/, "")
      .replace(/[.\s-]+$/, "");

    if (!name) return fallbackName;
    if (WINDOWS_RESERVED_NAMES.test(name)) name = "markv-" + name;
    if (name.length > MAX_BASE_NAME_LENGTH) {
      name = name.slice(0, MAX_BASE_NAME_LENGTH).replace(/[.\s-]+$/, "");
    }
    return name || fallbackName || DEFAULT_BASE_NAME;
  }

  function deriveExportBaseName(input) {
    const source = input || {};
    const currentName = sanitizeFileBaseName(source.currentName || "", "");
    if (currentName) return currentName;

    const firstHeading = sanitizeFileBaseName(
      extractFirstHeading(source.markdown || ""),
      "",
    );
    if (firstHeading) return firstHeading;

    return DEFAULT_BASE_NAME;
  }

  function withExtension(baseName, extension) {
    const safeBase = sanitizeFileBaseName(baseName, DEFAULT_BASE_NAME);
    const suffix = String(extension || "").startsWith(".")
      ? String(extension)
      : "." + String(extension || "");
    return safeBase + suffix;
  }

  function isBlankMarkdown(markdown) {
    return !String(markdown || "").trim();
  }

  function getPlatformPrintMessage(nav) {
    const userAgent = String((nav && nav.userAgent) || "");
    const platform = String((nav && nav.platform) || "");
    const touchPoints = Number((nav && nav.maxTouchPoints) || 0);
    const isiOS =
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (/Mac/i.test(platform) && touchPoints > 1);
    if (isiOS) return "Use the share sheet to save or send the PDF.";
    if (/Android|Mobile/i.test(userAgent)) {
      return "Use your browser print or share sheet to save the PDF.";
    }
    return "Choose Save as PDF in the print dialog.";
  }

  function getMermaidReadiness(rootElement) {
    const rootNode = rootElement || {};
    const all =
      typeof rootNode.querySelectorAll === "function"
        ? Array.from(rootNode.querySelectorAll(".mermaid-block"))
        : [];
    const pending = all.filter(function (block) {
      return block.classList && block.classList.contains("is-loading");
    });
    return {
      total: all.length,
      ready: all.length - pending.length,
      pending: pending.length,
    };
  }

  function getImageReadiness(rootElement) {
    const rootNode = rootElement || {};
    const all =
      typeof rootNode.querySelectorAll === "function"
        ? Array.from(rootNode.querySelectorAll("img"))
        : [];
    const pending = all.filter(function (image) {
      return image && image.complete === false;
    });
    const broken = all.filter(function (image) {
      return image && image.complete && image.naturalWidth === 0;
    });
    return {
      total: all.length,
      ready: all.length - pending.length,
      pending: pending.length,
      broken: broken.length,
    };
  }

  function createMermaidTimeoutHtml(source) {
    const escaped = String(source || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return (
      '<div class="export-timeout-fallback">' +
      '<strong>Diagram was not ready before export.</strong>' +
      "<pre><code>" +
      escaped +
      "</code></pre>" +
      "</div>"
    );
  }

  function markTimedOutMermaidBlocks(rootElement) {
    if (!rootElement || typeof rootElement.querySelectorAll !== "function") {
      return 0;
    }
    const pending = Array.from(
      rootElement.querySelectorAll(".mermaid-block.is-loading"),
    );
    pending.forEach(function (block) {
      block.classList.remove("is-loading");
      block.classList.add("is-error", "export-mermaid-timeout");
      block.innerHTML = createMermaidTimeoutHtml(block.dataset.mermaidSource);
    });
    return pending.length;
  }

  return {
    DEFAULT_BASE_NAME,
    IMAGE_READY_TIMEOUT_MS,
    MERMAID_READY_TIMEOUT_MS,
    PRINT_DIALOG_FALLBACK_MS,
    PRINT_HARD_WATCHDOG_MS,
    deriveExportBaseName,
    extractFirstHeading,
    getImageReadiness,
    getMermaidReadiness,
    getPlatformPrintMessage,
    isBlankMarkdown,
    markTimedOutMermaidBlocks,
    sanitizeFileBaseName,
    stripMarkdownExtension,
    withExtension,
  };
});
