const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

function extractFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Could not find body for ${name}`);

  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, i);
    }
  }

  throw new Error(`Could not extract body for ${name}`);
}

test("share failures reuse the app toast instead of long toolbar status text", () => {
  const shareCurrentSnapshot = extractFunctionBody(
    html,
    "shareCurrentSnapshot",
  );
  const showShareFailureToast = extractFunctionBody(
    html,
    "showShareFailureToast",
  );

  assert.match(html, /id="appToast"/);
  assert.match(html, /class="pwa-update-toast app-toast"/);
  assert.match(html, /\.app-toast\[data-kind="error"\]/);

  const toastCalls =
    shareCurrentSnapshot.match(/showShareFailureToast\(/g) || [];
  assert.equal(toastCalls.length, 2);
  assert.doesNotMatch(
    shareCurrentSnapshot,
    /Share failed •/,
    "The full share error should not be written into the toolbar status",
  );

  assert.match(
    showShareFailureToast,
    /setStatus\("Share failed", \{ kind: "error" \}\);/,
  );
  assert.match(showShareFailureToast, /showAppToast\(\{/);
  assert.match(showShareFailureToast, /title:\s*"Share failed"/);
  assert.match(showShareFailureToast, /kind:\s*"error"/);
});

test("large document share limit remains the toast detail message", () => {
  const buildSnapshotShareUrl = extractFunctionBody(
    html,
    "buildSnapshotShareUrl",
  );
  const showShareFailureToast = extractFunctionBody(
    html,
    "showShareFailureToast",
  );

  assert.match(
    buildSnapshotShareUrl,
    /This document is too large for link sharing\. Use Save or Download instead\./,
  );
  assert.match(
    showShareFailureToast,
    /const detail = String\(message \|\| "Snapshot sharing failed\."\)\.trim\(\);/,
  );
  assert.match(showShareFailureToast, /message:\s*detail/);
});
