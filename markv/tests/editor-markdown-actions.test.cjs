const assert = require("node:assert/strict");
const test = require("node:test");

const actions = require("../assets/editor-markdown-actions.js");

function apply(value, edit) {
  assert.ok(edit, "expected an edit");
  const next = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
  return {
    value: next,
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  };
}

test("Enter continues unordered lists", () => {
  const value = "- one";
  const result = apply(value, actions.handleEnter(value, value.length, value.length));
  assert.equal(result.value, "- one\n- ");
  assert.equal(result.selectionStart, result.value.length);
});

test("Enter exits empty unordered list item", () => {
  const value = "- ";
  const result = apply(value, actions.handleEnter(value, value.length, value.length));
  assert.equal(result.value, "");
  assert.equal(result.selectionStart, 0);
});

test("Enter increments ordered list markers", () => {
  const value = "9. item";
  const result = apply(value, actions.handleEnter(value, value.length, value.length));
  assert.equal(result.value, "9. item\n10. ");
});

test("Enter continues task list as unchecked item", () => {
  const value = "- [x] done";
  const result = apply(value, actions.handleEnter(value, value.length, value.length));
  assert.equal(result.value, "- [x] done\n- [ ] ");
});

test("Tab and Shift+Tab indent and outdent list lines", () => {
  const value = "- one\n- two";
  const indented = apply(value, actions.handleTab(value, 0, value.length, false));
  assert.equal(indented.value, "  - one\n  - two");

  const outdented = apply(
    indented.value,
    actions.handleTab(indented.value, 0, indented.value.length, true),
  );
  assert.equal(outdented.value, value);
});

test("inline code toggles backtick wrapping", () => {
  const value = "markv";
  const wrapped = apply(value, actions.toggleInline(value, 0, value.length, "`", "`", "code"));
  assert.equal(wrapped.value, "`markv`");
  assert.equal(wrapped.selectionStart, 1);
  assert.equal(wrapped.selectionEnd, 6);

  const unwrapped = apply(
    wrapped.value,
    actions.toggleInline(wrapped.value, 0, wrapped.value.length, "`", "`", "code"),
  );
  assert.equal(unwrapped.value, value);
});

test("code block wraps and unwraps selected lines", () => {
  const value = "const x = 1;";
  const wrapped = apply(value, actions.toggleCodeBlock(value, 0, value.length));
  assert.equal(wrapped.value, "```\nconst x = 1;\n```");

  const unwrapped = apply(
    wrapped.value,
    actions.toggleCodeBlock(wrapped.value, 0, wrapped.value.length),
  );
  assert.equal(unwrapped.value, value);
});

test("bullet and numbered list toggles are reversible", () => {
  const value = "one\ntwo";
  const bullets = apply(value, actions.toggleLinePrefix(value, 0, value.length, "unordered-list"));
  assert.equal(bullets.value, "- one\n- two");

  const plain = apply(
    bullets.value,
    actions.toggleLinePrefix(bullets.value, 0, bullets.value.length, "unordered-list"),
  );
  assert.equal(plain.value, value);

  const numbered = apply(value, actions.toggleLinePrefix(value, 0, value.length, "ordered-list"));
  assert.equal(numbered.value, "1. one\n2. two");
});

test("image markdown inserts alt text and selects the URL", () => {
  const value = "diagram";
  const result = apply(value, actions.insertImage(value, 0, value.length));
  assert.equal(result.value, "![diagram](https://)");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "https://");
});
