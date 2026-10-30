const test = require("node:test");
const assert = require("node:assert/strict");
const { functionSource, runtime } = require("./helpers/inline-app.cjs");

const { getFirstHeadingTitle } = runtime({}, [functionSource("getFirstHeadingTitle")]);

test("placeholder documents take their title from the first H1 outside code", () => {
  assert.equal(getFirstHeadingTitle("Intro\n\n# Project **Overview** #\n\n# Later"), "Project Overview");
  assert.equal(
    getFirstHeadingTitle("```bash\n# not a title\n```\n\n# Real `Title`"),
    "Real Title",
    "fences with an info string must hide their # lines",
  );
  assert.equal(getFirstHeadingTitle("~~~\n# hidden\n~~~\n## Only an H2"), "");
  assert.equal(getFirstHeadingTitle("#hashtag, not a heading"), "");
});
