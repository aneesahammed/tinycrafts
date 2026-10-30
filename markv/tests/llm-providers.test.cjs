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

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Could not find ${name}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test("mindmap reads Groq's limit message instead of guessing", () => {
  const helpers = new Function(
    [
      "parseMindmapRetryDelayMs",
      "getMindmapRetryDelayMs",
      "parseMindmapTokenLimit",
      "isMindmapRequestTooLarge",
    ]
      .map((name) => extractFunction(html, name))
      .join("\n") +
      "\nreturn { getMindmapRetryDelayMs, parseMindmapTokenLimit, isMindmapRequestTooLarge };",
  )();

  // Captured from a real Groq 429 (retry headers are not CORS-readable).
  const busy = {
    status: 429,
    retryAfter: "",
    message:
      "Groq error 429: Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 4813, Requested 4983. Please try again in 13.47s.",
  };
  assert.equal(helpers.getMindmapRetryDelayMs(busy), 13470);
  assert.deepEqual(helpers.parseMindmapTokenLimit(busy), {
    limit: 8000,
    used: 4813,
    requested: 4983,
  });
  assert.equal(helpers.isMindmapRequestTooLarge(busy), false);

  const tooLarge = Object.assign({}, busy, {
    message: busy.message.replace("Requested 4983", "Requested 9100"),
  });
  assert.equal(helpers.isMindmapRequestTooLarge(tooLarge), true);
  assert.equal(helpers.getMindmapRetryDelayMs({ message: "nope" }), 0);
});
