const test = require("node:test");
const assert = require("node:assert/strict");

const readerPalettes = require("../assets/reader-palettes.js");

const REQUIRED_TOKENS = [
  "canvas",
  "surface",
  "surfaceMuted",
  "surfaceRaised",
  "ink",
  "heading",
  "muted",
  "subtle",
  "borderSoft",
  "border",
  "borderStrong",
  "accent",
  "accentHover",
  "link",
  "selection",
  "codeBg",
  "codeInlineBg",
  "codeFg",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxString",
  "syntaxNumber",
  "syntaxTitle",
  "syntaxMeta",
  "blockquoteBg",
  "blockquoteBorder",
  "highlightBg",
  "highlightHoverBg",
  "highlightShadow",
  "highlightHoverShadow",
  "shadowSm",
  "alertNote",
  "alertTip",
  "alertImportant",
  "alertWarning",
  "alertCaution",
];

function parseHex(hex) {
  const text = String(hex || "").trim();
  const match = text.match(/^#([0-9a-f]{6})$/i);
  assert.ok(match, `${text} must be a 6-digit hex color`);
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function channelToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(color) {
  const rgb = parseHex(color);
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

test("normalizes unknown reader palette keys to original", () => {
  assert.equal(readerPalettes.normalizeKey("slate"), "slate");
  assert.equal(readerPalettes.normalizeKey("book-cloth"), "garden");
  assert.equal(readerPalettes.normalizeKey("unknown"), "original");
  assert.equal(readerPalettes.normalizeKey(""), "original");
});

test("saved legacy book cloth palette migrates to garden", () => {
  const storage = {
    value: "book-cloth",
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };

  assert.equal(readerPalettes.readSavedPalette(storage), "garden");
  assert.equal(storage.value, "garden");
});

test("all palettes expose the complete reader token contract", () => {
  for (const palette of readerPalettes.listPalettes()) {
    for (const token of REQUIRED_TOKENS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(palette.tokens, token),
        `${palette.key} is missing ${token}`,
      );
      assert.notEqual(String(palette.tokens[token] || "").trim(), "");
    }
  }
});

test("fixed palettes meet AA contrast for primary reader text", () => {
  for (const palette of readerPalettes.listPalettes()) {
    if (palette.key === "original") continue;

    const backgrounds = [palette.tokens.canvas, palette.tokens.surface];
    for (const background of backgrounds) {
      assert.ok(
        contrastRatio(palette.tokens.ink, background) >= 4.5,
        `${palette.key} body text fails on ${background}`,
      );
      assert.ok(
        contrastRatio(palette.tokens.heading, background) >= 4.5,
        `${palette.key} heading text fails on ${background}`,
      );
      assert.ok(
        contrastRatio(palette.tokens.muted, background) >= 4.5,
        `${palette.key} muted text fails on ${background}`,
      );
      assert.ok(
        contrastRatio(palette.tokens.link, background) >= 4.5,
        `${palette.key} link text fails on ${background}`,
      );
    }
  }
});

test("fixed palettes keep code and syntax highlighting readable", () => {
  const syntaxTokens = [
    "codeFg",
    "syntaxComment",
    "syntaxKeyword",
    "syntaxString",
    "syntaxNumber",
    "syntaxTitle",
    "syntaxMeta",
  ];

  for (const palette of readerPalettes.listPalettes()) {
    if (palette.key === "original") continue;

    for (const token of syntaxTokens) {
      assert.ok(
        contrastRatio(palette.tokens[token], palette.tokens.codeBg) >= 4.5,
        `${palette.key} ${token} fails on code background`,
      );
    }
  }
});

test("effective scheme follows global theme only for original", () => {
  assert.equal(readerPalettes.getEffectiveScheme("original", "dark"), "dark");
  assert.equal(readerPalettes.getEffectiveScheme("original", "light"), "light");
  assert.equal(readerPalettes.getEffectiveScheme("slate", "light"), "dark");
  assert.equal(readerPalettes.getEffectiveScheme("ivory", "dark"), "light");
});

test("palette coercion keeps global theme and reader scheme aligned", () => {
  assert.equal(
    readerPalettes.coercePaletteForTheme("manilla", "dark", "manilla"),
    "slate",
  );
  assert.equal(
    readerPalettes.coercePaletteForTheme("slate", "light", "manilla"),
    "manilla",
  );
  assert.equal(
    readerPalettes.coercePaletteForTheme("original", "dark", "manilla"),
    "original",
  );
});

test("applyToRoot writes palette attributes and css variables", () => {
  const root = {
    attrs: {},
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };

  const scheme = readerPalettes.applyToRoot(root, "slate", {
    globalTheme: "light",
  });

  assert.equal(scheme, "dark");
  assert.equal(root.attrs["data-reader-palette"], "slate");
  assert.equal(root.attrs["data-reader-scheme"], "dark");
  assert.equal(root.style.values["--reader-bg-canvas"], "#191919");
  assert.equal(root.style.values["--reader-link"], "#9BC9FF");
});
