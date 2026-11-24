const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { functionSource, between, runtime } = require("./helpers/inline-app.cjs");

const vendor = new Function(
  fs.readFileSync("vendor/beautiful-mermaid.min.js", "utf8") + ";return BeautifulMermaid;",
)();
const app = runtime({}, [
  between("        const BEAUTIFUL_FLOWCHART_ARROW", "        function getBeautifulMermaidRenderOptions("),
]);
const prepare = (source) => app.prepareBeautifulMermaidSource(source, vendor);
const edges = (line) =>
  vendor
    .parseMermaid(prepare("graph TD\n  " + line))
    .edges.map((e) => e.source + ">" + e.target + (e.label ? "[" + e.label + "]" : ""))
    .join(" ");

test("flowchart arrows mean the same with and without spaces", () => {
  const cases = {
    "A-->B": "A>B",
    "A-->B-->C": "A>B B>C",
    "A---B": "A>B",
    "A-.->B": "A>B",
    "A==>B": "A>B",
    "A<-->B": "A>B",
    "A---->B": "A>B",
    "A-->|yes|B": "A>B[yes]",
    "A --> |yes| B": "A>B[yes]",
    "A--text-->B": "A>B[text]",
    "A-- two words -->B": "A>B[two words]",
    "A-.text.->B": "A>B[text]",
    "A==text==>B": "A>B[text]",
    "a-b-->c-d": "a-b>c-d",
    "my_node-->other": "my_node>other",
    "A & B-->C": "A>C B>C",
    "A-->B:::cls": "A>B",
    "A-->B;": "A>B",
    "A-->B; B-->C": "A>B B>C",
    "A[One]-->B[Two]": "A>B",
  };
  for (const [line, expected] of Object.entries(cases)) {
    assert.equal(edges(line), expected, line);
  }
});

test("already-spaced diagrams keep their meaning", () => {
  for (const line of ["A --> B", "A -->|yes| B", "A -- text --> B", "A -. t .-> B", "A == t ==> B"]) {
    const raw = vendor.parseMermaid("graph TD\n  " + line).edges;
    const fixed = vendor.parseMermaid(prepare("graph TD\n  " + line)).edges;
    assert.deepEqual(JSON.parse(JSON.stringify(fixed)), JSON.parse(JSON.stringify(raw)), line);
  }
});

test("labels, quotes, comments and style lines are left alone", () => {
  const source = [
    "graph TD",
    "  %% A-->B in a comment",
    "  A[a-->b] --> B[\"x-->y\"]",
    "  B --> C{1--2}",
    "  style A stroke-dasharray: 5 5",
    "  linkStyle 0 stroke:#f00,stroke-width:2px",
    "  classDef big font-size:20px",
    '  click A "https://example.com/a--b-->c"',
    "  subgraph one--two [One]",
    "    C --> D",
    "  end",
  ].join("\n");
  const out = prepare(source);
  for (const kept of ["%% A-->B in a comment", "A[a-->b]", '"x-->y"', "{1--2}", "stroke-dasharray: 5 5", "a--b-->c", "one--two"]) {
    assert.ok(out.includes(kept), kept);
  }
  assert.equal(vendor.parseMermaid(out).edges.length, 3);
});

test("arrows this renderer cannot draw go to full Mermaid instead of vanishing", () => {
  for (const line of ["A--oB", "A --o B", "A--xB", "A~~~B", "A e1@--> B"]) {
    assert.throws(() => prepare("graph TD\n  " + line), /./, line);
  }
});

test("class and ER relations work without spaces", () => {
  const texts = (source) =>
    [...vendor.renderMermaidSVG(prepare(source), {}).matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, ""));
  for (const line of ["A<|--B", "A-->B", "A*--B", "A..>B", "A--B", "A-->B : uses"]) {
    const found = texts("classDiagram\n  " + line);
    assert.ok(found.includes("A") && found.includes("B"), line);
  }
  const er = texts("erDiagram\n  CUSTOMER||--o{ORDER:places");
  for (const name of ["CUSTOMER", "ORDER", "places"]) assert.ok(er.includes(name), name);
});

test("other diagrams pass through untouched", () => {
  for (const source of ["stateDiagram-v2\n  S1-->S2:go", "sequenceDiagram\n  A->>B:hi", "xychart-beta\n  bar [1, 2]"]) {
    assert.equal(prepare(source), source);
  }
  assert.match(functionSource("renderBeautifulMermaidSource"), /prepareBeautifulMermaidSource\(/);
});
