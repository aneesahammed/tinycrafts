(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVReaderPalettes = api;

  if (root.document) {
    try {
      const theme = api.getGlobalTheme(root);
      const key = api.readSavedPalette(root.localStorage);
      api.applyToRoot(root.document.documentElement, key, {
        globalTheme: theme,
      });
    } catch (_error) {}
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  "use strict";

  const STORAGE_KEY = "md-viewer-reader-palette";
  const DEFAULT_KEY = "original";

  const PALETTES = Object.freeze({
    original: {
      label: "Original",
      scheme: "auto",
      swatches: ["#fafaf9", "#ffffff", "#5f8f80"],
      tokens: {
        canvas: "var(--bg-canvas)",
        surface: "var(--bg-raised)",
        surfaceMuted: "var(--bg-subtle)",
        surfaceRaised: "var(--bg-raised)",
        ink: "var(--fg-default)",
        heading: "var(--fg-default)",
        muted: "var(--fg-muted)",
        subtle: "var(--fg-subtle)",
        borderSoft: "var(--border-soft)",
        border: "var(--border-default)",
        borderStrong: "var(--border-strong)",
        accent: "var(--accent-fg)",
        accentHover: "var(--accent-hover)",
        link: "var(--accent-fg)",
        selection: "var(--selection)",
        codeBg: "var(--code-block-bg)",
        codeInlineBg: "var(--code-inline-bg)",
        codeFg: "var(--fg-default)",
        syntaxComment: "#3D433D",
        syntaxKeyword: "#7A1F2E",
        syntaxString: "#164A42",
        syntaxNumber: "#5A3B0C",
        syntaxTitle: "#4F2E74",
        syntaxMeta: "#6B2D12",
        blockquoteBg: "var(--blockquote-bg)",
        blockquoteBorder: "var(--blockquote-border)",
        highlightBg: "color-mix(in srgb, var(--accent-fg) 18%, transparent)",
        highlightHoverBg: "color-mix(in srgb, var(--accent-fg) 28%, transparent)",
        highlightShadow: "inset 0 -1px 0 color-mix(in srgb, var(--accent-fg) 22%, transparent)",
        highlightHoverShadow: "inset 0 -1px 0 color-mix(in srgb, var(--accent-fg) 34%, transparent)",
        shadowSm: "var(--shadow-sm)",
        alertNote: "var(--alert-note)",
        alertTip: "var(--alert-tip)",
        alertImportant: "var(--alert-important)",
        alertWarning: "var(--alert-warning)",
        alertCaution: "var(--alert-caution)",
      },
    },
    ivory: {
      label: "Ivory",
      scheme: "light",
      swatches: ["#F3EBDD", "#E6D8BE", "#416F62"],
      tokens: {
        canvas: "#F3EBDD",
        surface: "#FFF8EA",
        surfaceMuted: "#E8DDC8",
        surfaceRaised: "#FFFDF4",
        ink: "#1F1A13",
        heading: "#14100B",
        muted: "#514431",
        subtle: "#715F45",
        borderSoft: "rgba(25, 25, 25, 0.07)",
        border: "rgba(25, 25, 25, 0.11)",
        borderStrong: "rgba(25, 25, 25, 0.18)",
        accent: "#416F62",
        accentHover: "#2F5F52",
        link: "#2F5F52",
        selection: "rgba(65, 111, 98, 0.18)",
        codeBg: "#E9DEC8",
        codeInlineBg: "rgba(31, 26, 19, 0.06)",
        codeFg: "#1F1A13",
        syntaxComment: "#3D433D",
        syntaxKeyword: "#7A1F2E",
        syntaxString: "#164A42",
        syntaxNumber: "#5A3B0C",
        syntaxTitle: "#4F2E74",
        syntaxMeta: "#6B2D12",
        blockquoteBg: "rgba(230, 216, 190, 0.48)",
        blockquoteBorder: "#B9A889",
        highlightBg: "rgba(184, 128, 42, 0.20)",
        highlightHoverBg: "rgba(184, 128, 42, 0.32)",
        highlightShadow: "inset 0 -1px 0 rgba(126, 87, 24, 0.22)",
        highlightHoverShadow: "inset 0 -1px 0 rgba(126, 87, 24, 0.36)",
        shadowSm: "0 1px 3px rgba(25, 25, 25, 0.045)",
        alertNote: "#346C9B",
        alertTip: "#416F62",
        alertImportant: "#6D5FB8",
        alertWarning: "#956515",
        alertCaution: "#A24F4A",
      },
    },
    manilla: {
      label: "Manilla",
      scheme: "light",
      swatches: ["#EBDBBC", "#D4A27F", "#7B3E2D"],
      tokens: {
        canvas: "#EBDBBC",
        surface: "#F5E8CA",
        surfaceMuted: "#E1C59B",
        surfaceRaised: "#FFF4DC",
        ink: "#221A14",
        heading: "#17100B",
        muted: "#5F4834",
        subtle: "#7A624B",
        borderSoft: "rgba(34, 26, 20, 0.10)",
        border: "rgba(34, 26, 20, 0.16)",
        borderStrong: "rgba(34, 26, 20, 0.24)",
        accent: "#9A563D",
        accentHover: "#7B3E2D",
        link: "#70402F",
        selection: "rgba(154, 86, 61, 0.20)",
        codeBg: "#E4CAA3",
        codeInlineBg: "rgba(34, 26, 20, 0.08)",
        codeFg: "#221A14",
        syntaxComment: "#3D433D",
        syntaxKeyword: "#7A1F2E",
        syntaxString: "#164A42",
        syntaxNumber: "#5A3B0C",
        syntaxTitle: "#4F2E74",
        syntaxMeta: "#6B2D12",
        blockquoteBg: "rgba(212, 162, 127, 0.22)",
        blockquoteBorder: "#A06C4E",
        highlightBg: "rgba(190, 116, 55, 0.22)",
        highlightHoverBg: "rgba(190, 116, 55, 0.34)",
        highlightShadow: "inset 0 -1px 0 rgba(123, 62, 45, 0.25)",
        highlightHoverShadow: "inset 0 -1px 0 rgba(123, 62, 45, 0.4)",
        shadowSm: "0 1px 3px rgba(34, 26, 20, 0.06)",
        alertNote: "#426E94",
        alertTip: "#5B7551",
        alertImportant: "#675A9E",
        alertWarning: "#8F5C18",
        alertCaution: "#93493C",
      },
    },
    cloud: {
      label: "Cloud",
      scheme: "light",
      swatches: ["#BFBFBA", "#91918D", "#191919"],
      tokens: {
        canvas: "#BFBFBA",
        surface: "#D8D8D3",
        surfaceMuted: "#AFAFAB",
        surfaceRaised: "#E5E4DF",
        ink: "#191919",
        heading: "#111111",
        muted: "#40403E",
        subtle: "#666663",
        borderSoft: "rgba(25, 25, 25, 0.12)",
        border: "rgba(25, 25, 25, 0.18)",
        borderStrong: "rgba(25, 25, 25, 0.28)",
        accent: "#376A71",
        accentHover: "#154F73",
        link: "#154F73",
        selection: "rgba(55, 106, 113, 0.22)",
        codeBg: "#D8D8D3",
        codeInlineBg: "rgba(25, 25, 25, 0.08)",
        codeFg: "#191919",
        syntaxComment: "#3D433D",
        syntaxKeyword: "#7A1F2E",
        syntaxString: "#164A42",
        syntaxNumber: "#5A3B0C",
        syntaxTitle: "#4F2E74",
        syntaxMeta: "#6B2D12",
        blockquoteBg: "rgba(229, 228, 223, 0.32)",
        blockquoteBorder: "#77736C",
        highlightBg: "rgba(55, 106, 113, 0.22)",
        highlightHoverBg: "rgba(55, 106, 113, 0.34)",
        highlightShadow: "inset 0 -1px 0 rgba(21, 79, 115, 0.28)",
        highlightHoverShadow: "inset 0 -1px 0 rgba(21, 79, 115, 0.42)",
        shadowSm: "0 1px 3px rgba(25, 25, 25, 0.07)",
        alertNote: "#154F73",
        alertTip: "#376A71",
        alertImportant: "#584E90",
        alertWarning: "#755313",
        alertCaution: "#803F38",
      },
    },
    slate: {
      label: "Slate",
      scheme: "dark",
      swatches: ["#191919", "#262625", "#61AAF2"],
      tokens: {
        canvas: "#191919",
        surface: "#222221",
        surfaceMuted: "#262625",
        surfaceRaised: "#2F2F2D",
        ink: "#F2F0EA",
        heading: "#FFFFFF",
        muted: "#BFBFBA",
        subtle: "#91918D",
        borderSoft: "rgba(255, 255, 255, 0.08)",
        border: "rgba(255, 255, 255, 0.13)",
        borderStrong: "rgba(255, 255, 255, 0.22)",
        accent: "#61AAF2",
        accentHover: "#9BC9FF",
        link: "#9BC9FF",
        selection: "rgba(97, 170, 242, 0.24)",
        codeBg: "#111111",
        codeInlineBg: "rgba(255, 255, 255, 0.08)",
        codeFg: "#F2F0EA",
        syntaxComment: "#BFC6C1",
        syntaxKeyword: "#F08FA0",
        syntaxString: "#8FD6BC",
        syntaxNumber: "#E1BE70",
        syntaxTitle: "#B7B0FF",
        syntaxMeta: "#9BC9FF",
        blockquoteBg: "rgba(255, 255, 255, 0.035)",
        blockquoteBorder: "#666663",
        highlightBg: "rgba(97, 170, 242, 0.18)",
        highlightHoverBg: "rgba(97, 170, 242, 0.28)",
        highlightShadow: "inset 0 -1px 0 rgba(155, 201, 255, 0.24)",
        highlightHoverShadow: "inset 0 -1px 0 rgba(155, 201, 255, 0.38)",
        shadowSm: "0 1px 3px rgba(0, 0, 0, 0.32)",
        alertNote: "#9BC9FF",
        alertTip: "#8FD6BC",
        alertImportant: "#B7B0FF",
        alertWarning: "#E1BE70",
        alertCaution: "#E5968E",
      },
    },
    garden: {
      label: "Garden",
      scheme: "light",
      swatches: ["#E8F3DE", "#001002", "#9A344A"],
      tokens: {
        canvas: "#E8F3DE",
        surface: "#F4FAEF",
        surfaceMuted: "#DDEAD2",
        surfaceRaised: "#FCFFF8",
        ink: "#001002",
        heading: "#001002",
        muted: "#2B4B34",
        subtle: "#4D6C55",
        borderSoft: "rgba(0, 16, 2, 0.08)",
        border: "rgba(0, 16, 2, 0.13)",
        borderStrong: "rgba(0, 16, 2, 0.22)",
        accent: "#B6485E",
        accentHover: "#9A344A",
        link: "#8A3345",
        selection: "rgba(182, 72, 94, 0.20)",
        codeBg: "#DDEAD2",
        codeInlineBg: "rgba(0, 16, 2, 0.07)",
        codeFg: "#001002",
        syntaxComment: "#3D433D",
        syntaxKeyword: "#7A1F2E",
        syntaxString: "#164A42",
        syntaxNumber: "#5A3B0C",
        syntaxTitle: "#4F2E74",
        syntaxMeta: "#6B2D12",
        blockquoteBg: "rgba(244, 250, 239, 0.66)",
        blockquoteBorder: "#9EA993",
        highlightBg: "rgba(182, 72, 94, 0.18)",
        highlightHoverBg: "rgba(182, 72, 94, 0.30)",
        highlightShadow: "inset 0 -1px 0 rgba(154, 52, 74, 0.24)",
        highlightHoverShadow: "inset 0 -1px 0 rgba(154, 52, 74, 0.38)",
        shadowSm: "0 1px 3px rgba(0, 16, 2, 0.045)",
        alertNote: "#2B628B",
        alertTip: "#2B6740",
        alertImportant: "#675A9E",
        alertWarning: "#805B14",
        alertCaution: "#8A3345",
      },
    },
  });

  const PALETTE_ALIASES = Object.freeze({
    "book-cloth": "garden",
  });

  const ORIGINAL_THEME_TOKENS = Object.freeze({
    light: {
      canvas: "#fafaf9",
      surface: "#ffffff",
      surfaceMuted: "#f4f3f1",
      surfaceRaised: "#ffffff",
      ink: "#222221",
      heading: "#222221",
      muted: "#71706e",
      subtle: "#a3a09c",
      borderSoft: "rgba(0, 0, 0, 0.04)",
      border: "rgba(0, 0, 0, 0.07)",
      borderStrong: "rgba(0, 0, 0, 0.11)",
      accent: "#5f8f80",
      accentHover: "#4d7d6e",
      link: "#5f8f80",
      selection: "rgba(95, 143, 128, 0.14)",
      codeBg: "#f5f4f2",
      codeInlineBg: "rgba(0, 0, 0, 0.035)",
      codeFg: "#222221",
      syntaxComment: "#3D433D",
      syntaxKeyword: "#7A1F2E",
      syntaxString: "#164A42",
      syntaxNumber: "#5A3B0C",
      syntaxTitle: "#4F2E74",
      syntaxMeta: "#6B2D12",
      blockquoteBg: "rgba(0, 0, 0, 0.018)",
      blockquoteBorder: "#c7c4be",
      highlightBg: "rgba(180, 200, 140, 0.22)",
      highlightHoverBg: "rgba(180, 200, 140, 0.36)",
      highlightShadow: "inset 0 -1px 0 rgba(140, 170, 100, 0.22)",
      highlightHoverShadow: "inset 0 -1px 0 rgba(140, 170, 100, 0.32)",
      shadowSm: "0 1px 3px rgba(0, 0, 0, 0.025)",
      alertNote: "#4f7fa8",
      alertTip: "#4f8c74",
      alertImportant: "#6f73c4",
      alertWarning: "#b6801f",
      alertCaution: "#b35d5d",
    },
    dark: {
      canvas: "#161616",
      surface: "#1f1f1f",
      surfaceMuted: "#1d1d1d",
      surfaceRaised: "#1f1f1f",
      ink: "#e4e3e0",
      heading: "#e4e3e0",
      muted: "#9a9895",
      subtle: "#636261",
      borderSoft: "rgba(255, 255, 255, 0.05)",
      border: "rgba(255, 255, 255, 0.08)",
      borderStrong: "rgba(255, 255, 255, 0.13)",
      accent: "#88bead",
      accentHover: "#a0cfbf",
      link: "#88bead",
      selection: "rgba(136, 190, 173, 0.18)",
      codeBg: "#131313",
      codeInlineBg: "rgba(255, 255, 255, 0.06)",
      codeFg: "#e4e3e0",
      syntaxComment: "#BFC6C1",
      syntaxKeyword: "#F08FA0",
      syntaxString: "#8FD6BC",
      syntaxNumber: "#E1BE70",
      syntaxTitle: "#B7B0FF",
      syntaxMeta: "#9BC9FF",
      blockquoteBg: "rgba(255, 255, 255, 0.02)",
      blockquoteBorder: "#5a5850",
      highlightBg: "rgba(180, 200, 140, 0.16)",
      highlightHoverBg: "rgba(180, 200, 140, 0.28)",
      highlightShadow: "inset 0 -1px 0 rgba(180, 200, 140, 0.16)",
      highlightHoverShadow: "inset 0 -1px 0 rgba(180, 200, 140, 0.24)",
      shadowSm: "0 1px 3px rgba(0, 0, 0, 0.25)",
      alertNote: "#83acd6",
      alertTip: "#83c1a7",
      alertImportant: "#9da6ef",
      alertWarning: "#d6af62",
      alertCaution: "#d98d8d",
    },
  });

  const TOKEN_TO_CSS_VAR = Object.freeze({
    canvas: "--reader-bg-canvas",
    surface: "--reader-bg-surface",
    surfaceMuted: "--reader-bg-subtle",
    surfaceRaised: "--reader-bg-raised",
    ink: "--reader-fg-default",
    heading: "--reader-fg-heading",
    muted: "--reader-fg-muted",
    subtle: "--reader-fg-subtle",
    borderSoft: "--reader-border-soft",
    border: "--reader-border-default",
    borderStrong: "--reader-border-strong",
    accent: "--reader-accent",
    accentHover: "--reader-accent-hover",
    link: "--reader-link",
    selection: "--reader-selection",
    codeBg: "--reader-code-bg",
    codeInlineBg: "--reader-code-inline-bg",
    codeFg: "--reader-code-fg",
    syntaxComment: "--reader-syntax-comment",
    syntaxKeyword: "--reader-syntax-keyword",
    syntaxString: "--reader-syntax-string",
    syntaxNumber: "--reader-syntax-number",
    syntaxTitle: "--reader-syntax-title",
    syntaxMeta: "--reader-syntax-meta",
    blockquoteBg: "--reader-blockquote-bg",
    blockquoteBorder: "--reader-blockquote-border",
    highlightBg: "--reader-highlight-bg",
    highlightHoverBg: "--reader-highlight-hover-bg",
    highlightShadow: "--reader-highlight-shadow",
    highlightHoverShadow: "--reader-highlight-hover-shadow",
    shadowSm: "--reader-shadow-sm",
    alertNote: "--reader-alert-note",
    alertTip: "--reader-alert-tip",
    alertImportant: "--reader-alert-important",
    alertWarning: "--reader-alert-warning",
    alertCaution: "--reader-alert-caution",
  });

  function normalizeKey(value) {
    const key = String(value || "").trim().toLowerCase();
    const normalized = PALETTE_ALIASES[key] || key;
    return Object.prototype.hasOwnProperty.call(PALETTES, normalized)
      ? normalized
      : DEFAULT_KEY;
  }

  function listPalettes() {
    return Object.keys(PALETTES).map(function (key) {
      return Object.assign({ key: key }, PALETTES[key]);
    });
  }

  function getPalette(key) {
    return PALETTES[normalizeKey(key)];
  }

  function getGlobalTheme(env) {
    const target = env || root || {};
    const doc = target.document;
    const attr =
      doc && doc.documentElement
        ? doc.documentElement.getAttribute("data-theme")
        : "";
    if (attr === "dark" || attr === "light") return attr;

    try {
      const saved = target.localStorage && target.localStorage.getItem("md-viewer-theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch (_error) {}

    const matchMedia = target.matchMedia;
    if (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }

  function getEffectiveScheme(key, globalTheme) {
    const palette = getPalette(key);
    if (palette.scheme === "dark" || palette.scheme === "light") {
      return palette.scheme;
    }
    return globalTheme === "dark" ? "dark" : "light";
  }

  function coercePaletteForTheme(key, globalTheme, preferredLightKey) {
    const normalized = normalizeKey(key);
    const targetTheme = globalTheme === "dark" ? "dark" : "light";
    if (getEffectiveScheme(normalized, targetTheme) === targetTheme) {
      return normalized;
    }

    if (targetTheme === "dark") {
      return "slate";
    }

    const preferred = normalizeKey(preferredLightKey);
    return getEffectiveScheme(preferred, "light") === "light"
      ? preferred
      : DEFAULT_KEY;
  }

  function readSavedPalette(storage) {
    try {
      const saved = storage.getItem(STORAGE_KEY);
      const normalized = normalizeKey(saved);
      if (saved && saved !== normalized) {
        storage.setItem(STORAGE_KEY, normalized);
      }
      return normalized;
    } catch (_error) {
      return DEFAULT_KEY;
    }
  }

  function writeSavedPalette(storage, key) {
    try {
      storage.setItem(STORAGE_KEY, normalizeKey(key));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function resolveTokenValue(rootElement, value) {
    const text = String(value || "");
    const match = text.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (!match || !rootElement || !rootElement.ownerDocument) return text;

    const view = rootElement.ownerDocument.defaultView;
    if (!view || typeof view.getComputedStyle !== "function") return text;

    const resolved = view.getComputedStyle(rootElement).getPropertyValue(match[1]).trim();
    return resolved || text;
  }

  function applyToRoot(rootElement, key, options) {
    const normalized = normalizeKey(key);
    const palette = getPalette(normalized);
    const globalTheme = options && options.globalTheme;
    const scheme = getEffectiveScheme(normalized, globalTheme);
    const tokens =
      normalized === DEFAULT_KEY
        ? ORIGINAL_THEME_TOKENS[scheme]
        : palette.tokens;

    if (!rootElement || !rootElement.style) return scheme;
    rootElement.setAttribute("data-reader-palette", normalized);
    rootElement.setAttribute("data-reader-scheme", scheme);

    Object.keys(TOKEN_TO_CSS_VAR).forEach(function (tokenKey) {
      rootElement.style.setProperty(
        TOKEN_TO_CSS_VAR[tokenKey],
        resolveTokenValue(rootElement, tokens[tokenKey]),
      );
    });

    return scheme;
  }

  return {
    DEFAULT_KEY: DEFAULT_KEY,
    PALETTES: PALETTES,
    STORAGE_KEY: STORAGE_KEY,
    TOKEN_TO_CSS_VAR: TOKEN_TO_CSS_VAR,
    applyToRoot: applyToRoot,
    coercePaletteForTheme: coercePaletteForTheme,
    getEffectiveScheme: getEffectiveScheme,
    getGlobalTheme: getGlobalTheme,
    getPalette: getPalette,
    listPalettes: listPalettes,
    normalizeKey: normalizeKey,
    readSavedPalette: readSavedPalette,
    writeSavedPalette: writeSavedPalette,
  };
});
