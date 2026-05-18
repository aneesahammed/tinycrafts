const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("index.html", "utf8");

function extractFunctionSource(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Could not find function ${name}`);
  const bodyStart = html.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Could not find body for ${name}`);

  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = bodyStart; i < html.length; i += 1) {
    const ch = html[i];
    const next = html[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = "";
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }

  throw new Error(`Could not extract function ${name}`);
}

function createPreview(headings) {
  const elements = headings.map((heading) => ({
    id: heading.id,
    textContent: heading.text,
  }));

  return {
    querySelector(selector) {
      const match = /^#(.+)$/.exec(selector);
      if (!match) return null;
      return elements.find((heading) => heading.id === match[1]) || null;
    },
    querySelectorAll(selector) {
      if (selector === "h1, h2, h3, h4, h5, h6") return elements;
      return [];
    },
  };
}

function createResolver(nodes) {
  const context = {
    CSS: { escape: (value) => String(value) },
    getMindmapNodeById: (id) => nodes.find((node) => node.id === id) || null,
  };
  vm.createContext(context);

  [
    "slugifyMindmapText",
    "normalizeMindmapToken",
    "findMindmapTargetByAnchor",
    "resolveMindmapTarget",
  ].forEach((name) => {
    vm.runInContext(
      `${extractFunctionSource(name)}\nthis.${name} = ${name};`,
      context,
    );
  });

  return context.resolveMindmapTarget;
}

test("mindmap target resolution prefers a concept heading over a broad parent anchor", () => {
  const nodes = [
    {
      id: "glimpses-app",
      label: "Glimpses App",
      sourceAnchor: "assumptions-made-while-writing-this",
      parent: "root",
    },
    {
      id: "license-worker",
      label: "License Worker",
      summary: "A Cloudflare Worker that governs user access.",
      sourceAnchor: null,
      parent: "glimpses-app",
    },
  ];
  const preview = createPreview([
    {
      id: "assumptions-made-while-writing-this",
      text: "Assumptions made while writing this",
    },
    {
      id: "the-license-worker-as-the-door",
      text: "The license worker as the door",
    },
  ]);

  const resolveMindmapTarget = createResolver(nodes);

  assert.equal(
    resolveMindmapTarget(nodes[1], preview).id,
    "the-license-worker-as-the-door",
  );
});

test("mindmap target resolution does not expose parent anchors for unmapped concepts", () => {
  const nodes = [
    {
      id: "glimpses-app",
      label: "Glimpses App",
      sourceAnchor: "assumptions-made-while-writing-this",
      parent: "root",
    },
    {
      id: "marketing-site",
      label: "Marketing Site",
      summary: "A separate concept not represented by a current heading.",
      sourceAnchor: null,
      parent: "glimpses-app",
    },
  ];
  const preview = createPreview([
    {
      id: "assumptions-made-while-writing-this",
      text: "Assumptions made while writing this",
    },
  ]);

  const resolveMindmapTarget = createResolver(nodes);

  assert.equal(resolveMindmapTarget(nodes[1], preview), null);
});
