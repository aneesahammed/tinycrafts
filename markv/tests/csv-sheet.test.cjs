const test = require("node:test");
const assert = require("node:assert/strict");

const csvSheet = require("../assets/csv-sheet.js");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}

test("parseCsv strips UTF-8 BOM", () => {
  const parsed = csvSheet.parseCsv("\ufeffname,country\nAlice,Ireland");

  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.rows[0], ["name", "country"]);
});

test("parseCsv supports quoted commas and escaped quotes", () => {
  const parsed = csvSheet.parseCsv('name,note\nAlice,"said ""hello, world"""');

  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.rows[1], ["Alice", 'said "hello, world"']);
});

test("parseCsv preserves multiline quoted cells", () => {
  const parsed = csvSheet.parseCsv('name,note\nAlice,"line one\nline two"');

  assert.equal(parsed.error, null);
  assert.equal(parsed.rows[1][1], "line one\nline two");
});

test("parseCsv keeps trailing empty fields", () => {
  const parsed = csvSheet.parseCsv("a,b,\n1,2,");

  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.rows[0], ["a", "b", ""]);
  assert.deepEqual(parsed.rows[1], ["1", "2", ""]);
});

test("parseCsv handles no trailing newline", () => {
  const parsed = csvSheet.parseCsv("a,b\n1,2");

  assert.equal(parsed.error, null);
  assert.equal(parsed.totalRows, 2);
  assert.deepEqual(parsed.rows[1], ["1", "2"]);
});

test("parseCsv pads stored ragged rows", () => {
  const parsed = csvSheet.parseCsv("a,b,c\n1,2");

  assert.equal(parsed.error, null);
  assert.equal(parsed.storedColumnCount, 3);
  assert.deepEqual(parsed.rows[1], ["1", "2", ""]);
});

test("parseCsv detects semicolons and accepts tab delimiter", () => {
  const semicolon = csvSheet.parseCsv("name;country\nAlice;Ireland");
  const tabInfo = csvSheet.parseCsvInfoString("csv delim=tab");
  const tab = csvSheet.parseCsv("name\tcountry\nAlice\tIreland", {
    delimiter: tabInfo.delimiter,
  });

  assert.equal(semicolon.delimiter, ";");
  assert.deepEqual(semicolon.rows[1], ["Alice", "Ireland"]);
  assert.equal(tabInfo.delimiter, "\t");
  assert.deepEqual(tab.rows[1], ["Alice", "Ireland"]);
});

test("renderCsvSheet supports noheader", () => {
  const html = csvSheet.renderCsvSheet("1,2,3\n4,5,6", "csv noheader", escapeHtml);

  assert.ok(html.includes('class="csv-sheet-wrap"'));
  assert.ok(!html.includes("<thead>"));
  assert.match(html, /<tbody><tr><th class="csv-sheet__row-number" scope="row">1<\/th>/);
});

test("renderCsvSheet falls back on unterminated quotes", () => {
  const html = csvSheet.renderCsvSheet('name,note\nAlice,"unterminated', "csv", escapeHtml);

  assert.equal(html, null);
});

test("renderCsvSheet cap message includes shown and total rows", () => {
  const html = csvSheet.renderCsvSheet(
    "name\nAlice\nBob\nCharlie\nDiana",
    "csv max=2",
    escapeHtml,
  );

  assert.match(html, /Showing 2 of 4 rows/);
});

test("renderCsvSheet escapes cells as text only", () => {
  const html = csvSheet.renderCsvSheet(
    "name,note\nAlice,<script>alert(1)</script> **bold**",
    "csv",
    escapeHtml,
  );

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; \*\*bold\*\*/);
  assert.doesNotMatch(html, /<script>alert/);
});
