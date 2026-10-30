const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("changelog/index.html", "utf8");
const app = fs.readFileSync("index.html", "utf8");
const build = fs.readFileSync("../scripts/build-pages.mjs", "utf8");

const releases = [...page.matchAll(
  /<li class="release" id="([^"]+)">[\s\S]*?class="ver[^"]*" href="#([^"]+)">v(\d+)\.(\d+)\.(\d+)<\/a>\s*<time datetime="(\d{4}-\d{2}-\d{2})">[\s\S]*?<h2>[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/g,
)].map((m) => ({ id: m[1], anchor: m[2], version: [+m[3], +m[4], +m[5]], date: m[6], text: m[7] }));

test("changelog releases are newest first, unique and linkable", () => {
  assert.ok(releases.length >= 13, "every release parses");
  assert.equal(new Set(releases.map((r) => r.id)).size, releases.length);
  releases.forEach((r, i) => {
    assert.equal(r.anchor, r.id, r.id + " pill links to itself");
    assert.equal(r.id, "v" + r.version.join("-"), r.id + " id matches its version");
    if (i === 0) return;
    const prev = releases[i - 1];
    const newer = prev.version[0] - r.version[0] || prev.version[1] - r.version[1] || prev.version[2] - r.version[2];
    assert.ok(newer > 0, prev.id + " is newer than " + r.id);
    assert.ok(prev.date >= r.date, prev.id + " is not dated before " + r.id);
  });
  assert.equal((page.match(/class="ver is-latest"/g) || []).length, 1, "only the newest is marked latest");
  assert.match(page, new RegExp('<a class="ver is-latest" href="#' + releases[0].id + '">'));
});

test("changelog copy follows the house rules and ships", () => {
  assert.doesNotMatch(page, /—/, "no em dashes");
  assert.doesNotMatch(page, /italic|<em>|<i>/, "no italics");
  assert.match(app, /id="changelogLink"[\s\S]*?href="changelog\/"/);
  assert.match(app, /data-proxy="changelogLink"/);
  assert.match(build, /'markv\/changelog\/index\.html'/);
});
