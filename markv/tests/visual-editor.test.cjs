const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const bundle = fs.readFileSync(
  require.resolve("../assets/visual-editor.js"),
  "utf8",
);
async function setup(t) {
  const dom = new JSDOM(
    '<section><textarea id="editor"></textarea></section>',
    { runScripts: "outside-only", pretendToBeVisual: true },
  );
  t.after(() => dom.window.close());
  dom.window.eval(bundle);
  await new Promise((resolve) =>
    dom.window.addEventListener("DOMContentLoaded", resolve),
  );
  return {
    window: dom.window,
    editor: dom.window.MarkVVisualEditor.editor,
    source: dom.window.document.querySelector("#editor"),
  };
}
test("loads core Markdown visually without rewriting source; changes serialize", async (t) => {
  const { editor, source } = await setup(t);
  const markdown =
    "# Heading\n\n**bold** and *italic* and ~~strike~~ and `code`\n\n- first\n- second\n\n1. ordered\n\n- [x] done\n\n> quote\n\n[Link](https://example.com)\n\n![Alt](https://example.com/image.png)\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```js\nconst a = 1;\n```\n\n---";
  source.value = markdown;
  assert.equal(source.value, markdown);
  for (const tag of [
    "h1",
    "strong",
    "em",
    "s",
    "code",
    "ul",
    "ol",
    "blockquote",
    "a",
    "img",
    "table",
    "pre",
    "hr",
  ])
    assert.match(editor.getHTML(), new RegExp("<" + tag + "[ >]"));
  editor.commands.insertContentAt(
    editor.state.doc.content.size,
    "<p>Added visually</p>",
  );
  assert.match(source.value, /Added visually/);
  assert.match(source.value, /\| Name \| Value \|/);
  assert.match(source.value, /\[x\]/);
  editor.commands.undo();
  assert.doesNotMatch(source.value, /Added visually/);
});
test("document changes reset history and preserve extended syntax", async (t) => {
  const { editor, source } = await setup(t);
  source.value = "First document";
  editor.commands.insertContent("changed");
  const extended =
    "<details><summary>Details</summary>Keep HTML</details>\n\n[^note]: Footnote";
  source.value = extended;
  assert.equal(source.value, extended);
  assert.equal(source.classList.contains("visual-source-hidden"), false);
  source.value = "Second document";
  assert.equal(source.classList.contains("visual-source-hidden"), true);
  editor.commands.undo();
  assert.equal(source.value, "Second document");
});
test("toolbar commands format selected text and table operations serialize", async (t) => {
  const { window, editor, source } = await setup(t);
  source.value = "Format me";
  editor.commands.setTextSelection({ from: 1, to: 10 });
  const bold = [...window.document.querySelectorAll("button")].find(
    (button) => button.textContent === "Bold",
  );
  bold.click();
  assert.match(source.value, /\*\*Format me\*\*/);
  editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
  assert.match(source.value, /\|/);
  editor.commands.addRowAfter();
  assert.equal(
    editor.getJSON().content.find((node) => node.type === "table").content
      .length,
    3,
  );
});
