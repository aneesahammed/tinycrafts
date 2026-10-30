const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

test("OpenRouter is a first-class hosted provider", () => {
  const csp = html.match(/connect-src ([^;]*);/);
  assert.ok(csp, "Expected a connect-src directive");
  assert.match(
    csp[1],
    /https:\/\/openrouter\.ai(\s|$)/,
    "The CSP must allow OpenRouter or every request is blocked",
  );

  assert.match(html, /<option value="openrouter">OpenRouter<\/option>/);
  assert.match(
    html,
    /return value === "groq" \|\| value === "openrouter" \? value : "ollama";/,
  );
  assert.match(
    html,
    /url: "https:\/\/openrouter\.ai\/api\/v1\/chat\/completions"/,
  );
  // The key is stored encrypted like Groq's.
  assert.match(html, /field: "openrouterApiKey",[\s\S]*?id: "openrouter-api-key"/);
});
