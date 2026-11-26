const test = require("node:test");
const assert = require("node:assert/strict");

const find = require("../assets/editor-find.js");

test("literal search is case-insensitive by default and escapes regex chars", () => {
  assert.deepEqual(find.findMatches("A a.b ab", "a.b").matches, [{ start: 2, end: 5 }]);
  assert.equal(find.findMatches("A a", "a").matches.length, 2);
  assert.equal(find.findMatches("A a", "a", { caseSensitive: true }).matches.length, 1);
});

test("invalid regex reports an error instead of throwing", () => {
  const r = find.findMatches("x", "(", { regex: true });
  assert.deepEqual(r.matches, []);
  assert.ok(r.error);
});

test("zero-length regex matches do not loop", () => {
  assert.deepEqual(find.findMatches("ab\ncd", "^", { regex: true }).matches, []);
  assert.equal(find.findMatches("aaa", "a*", { regex: true }).matches.length, 1);
});

test("empty query finds nothing", () => {
  assert.deepEqual(find.findMatches("abc", "").matches, []);
});

test("nextMatchIndex wraps both ways", () => {
  const m = [{ start: 2, end: 3 }, { start: 8, end: 9 }];
  assert.equal(find.nextMatchIndex(m, 9, 1), 0);
  assert.equal(find.nextMatchIndex(m, 2, -1), 1);
  assert.equal(find.nextMatchIndex(m, 3, 1), 1);
  assert.equal(find.nextMatchIndex([], 0, 1), -1);
});

test("replaceAll returns one minimal edit; literal $ stays literal; regex groups work", () => {
  const lit = find.replaceAllMatches("x cat y cat z", "cat", "$1");
  assert.deepEqual([lit.start, lit.end, lit.text, lit.count], [2, 11, "$1 y $1", 2]);
  const rx = find.replaceAllMatches("a-1 b-2", "(\\w)-(\\d)", "$2$1", { regex: true });
  assert.deepEqual([rx.start, rx.end, rx.text, rx.count], [0, 7, "1a 2b", 2]);
});

test("replaceAll with no matches reports zero and no edit span", () => {
  const r = find.replaceAllMatches("abc", "zzz", "y");
  assert.equal(r.count, 0);
  assert.equal(r.error, null);
});

test("replaceMatch expands regex groups for a single match", () => {
  const text = "a-1 b-2";
  const m = find.findMatches(text, "(\\w)-(\\d)", { regex: true }).matches[1];
  assert.equal(find.replacementFor(text, m, "(\\w)-(\\d)", "$2$1", { regex: true }), "2b");
  assert.equal(find.replacementFor(text, m, "b-2", "$1", {}), "$1");
});
