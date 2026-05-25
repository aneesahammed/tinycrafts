const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Could not find body for ${name}`);

  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`Could not extract ${name}`);
}

function loadRendererSelector() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    [
      'const MERMAID_RENDERER_NAME = "mermaid";',
      'const BEAUTIFUL_MERMAID_RENDERER_NAME = "beautiful-mermaid";',
      extractFunctionSource(html, "getMermaidFirstMeaningfulLine"),
      extractFunctionSource(html, "getMermaidRendererType"),
      "globalThis.selectRenderer = getMermaidRendererType;",
    ].join("\n"),
    context,
  );
  return context.selectRenderer;
}

test("beautiful mermaid is loaded locally and precached", () => {
  assert.match(
    html,
    /const BEAUTIFUL_MERMAID_SCRIPT_URL =\s*"\.\/vendor\/beautiful-mermaid\.min\.js"/,
  );
  assert.match(sw, /\.\/vendor\/beautiful-mermaid\.min\.js/);
  assert.ok(fs.existsSync("vendor/beautiful-mermaid.min.js"));
  assert.ok(fs.existsSync("vendor/beautiful-mermaid.LICENSE.txt"));
  assert.ok(fs.existsSync("vendor/beautiful-mermaid.elkjs.EPL-2.0.txt"));
  assert.ok(
    fs.existsSync("vendor/beautiful-mermaid.entities.BSD-2-Clause.txt"),
  );
});

test("supported diagram headers prefer beautiful mermaid", () => {
  const selectRenderer = loadRendererSelector();
  const supported = [
    "flowchart TD\nA --> B",
    "graph LR\nA --> B",
    "stateDiagram-v2\n[*] --> Ready",
    "sequenceDiagram\nAlice->>Bob: Hello",
    "classDiagram\nclass Animal",
    "erDiagram\nCUSTOMER ||--o{ ORDER : places",
    "xychart-beta\nx-axis [a, b]\ny-axis Value 0 --> 10\nline [1, 2]",
    "%% comment\n\nflowchart TB\nA --> B",
  ];

  for (const source of supported) {
    assert.equal(selectRenderer(source), "beautiful-mermaid", source);
  }
});

test("unsupported or ambiguous diagrams keep original mermaid", () => {
  const selectRenderer = loadRendererSelector();
  const fallback = [
    "gantt\ntitle Roadmap",
    "pie title Pets\n\"Cats\" : 4",
    "mindmap\nroot((Topic))",
    "timeline\ntitle History",
    "kanban\nTodo",
    "flowchart TD; A --> B",
    "classDiagram-v2\nclass Animal",
  ];

  for (const source of fallback) {
    assert.equal(selectRenderer(source), "mermaid", source);
  }
});

test("beautiful mermaid output is validated before insertion", () => {
  const renderBlock = extractFunctionSource(html, "renderBeautifulMermaidSource");
  const validateBlock = extractFunctionSource(html, "validateBeautifulMermaidSvg");
  const applyBlock = extractFunctionSource(html, "applyRenderedMermaidSvg");
  const collectionStart = html.indexOf("async function renderMermaidBlockCollection");
  assert.notEqual(collectionStart, -1, "Could not find render collection");
  const collection = html.slice(collectionStart, collectionStart + 2500);

  assert.match(renderBlock, /validateBeautifulMermaidSvg\(svg\)/);
  assert.match(validateBlock, /@import\\b/);
  assert.match(applyBlock, /dataset\.mermaidRenderer = rendererName/);
  assert.match(
    collection,
    /renderBeautifulMermaidSource[\s\S]*catch \(_beautifulError\)[\s\S]*renderWithOriginalMermaid/,
  );
});

test("vendored beautiful mermaid bundle renders supported svg types", () => {
  const code = fs.readFileSync("vendor/beautiful-mermaid.min.js", "utf8");
  const context = {
    console,
    setTimeout,
    clearTimeout,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    Buffer,
  };
  context.globalThis = context;
  context.window = context;
  context.self = context;

  vm.createContext(context);
  vm.runInContext(code, context, { timeout: 10000 });

  assert.equal(typeof context.BeautifulMermaid.renderMermaidSVG, "function");
  const samples = [
    "flowchart TD\nA[Start] --> B[End]",
    "graph LR\nA[Start] --> B[End]",
    "stateDiagram-v2\n[*] --> Ready",
    "sequenceDiagram\nAlice->>Bob: Hello",
    "classDiagram\nclass Animal",
    "erDiagram\nCUSTOMER ||--o{ ORDER : places",
    "xychart-beta\nx-axis [a, b]\ny-axis Value 0 --> 10\nline [1, 2]",
  ];

  for (const source of samples) {
    const svg = context.BeautifulMermaid.renderMermaidSVG(source, {
      transparent: true,
    });
    assert.match(svg, /^<svg\b/, source);
    assert.doesNotMatch(svg, /<script/i, source);
    assert.doesNotMatch(svg, /\son[a-z]+=/i, source);
  }
});
