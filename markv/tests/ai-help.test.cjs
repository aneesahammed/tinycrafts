const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const help = require("../assets/ai-help.js");

const SITE = "https://tinycrafts.ai";

// allowed: Ollama accepts this site. listening: something is on the port.
function browser({ listening, allowed, access, origin = SITE, platform = "mac" }) {
  return {
    origin,
    platform,
    endpoint: "http://localhost:11434",
    permissions: access
      ? { query: async () => ({ state: access }) }
      : { query: async () => { throw new TypeError("unknown permission"); } },
    fetch: async (_url, init) => {
      if (!listening || (init.mode === "cors" && !allowed)) throw new TypeError("Failed to fetch");
      return {};
    },
  };
}

test("a closed Ollama is not reported as blocked, and the reverse", async () => {
  const diagnose = (env) => help.diagnoseOllama(browser(env));
  assert.equal(await diagnose({ listening: false, access: "granted" }), "ollama-closed");
  assert.equal(await diagnose({ listening: true, allowed: false, access: "granted" }), "ollama-not-allowed");
  assert.equal(await diagnose({ listening: true, allowed: true, access: "granted" }), "interrupted");
  assert.equal(await diagnose({ listening: true, allowed: false, access: "denied" }), "ollama-browser-blocked");
  assert.equal(await diagnose({ listening: true, platform: "mobile" }), "ollama-mobile");
  for (const endpoint of ["http://example.com:11434", "localhost:11434", "nonsense"]) {
    assert.equal(await help.diagnoseOllama({ ...browser({ listening: true }), endpoint }), "ollama-address");
  }
});

test("a browser that cannot say why gets both fixes, not a guess", async () => {
  const code = await help.diagnoseOllama(browser({ listening: false }));
  assert.equal(code, "ollama-unreachable");
  const text = JSON.stringify(help.describe(code, { provider: "ollama", origin: SITE, platform: "mac" }));
  assert.match(text, /Open the Ollama app/);
  assert.match(text, /OLLAMA_ORIGINS/);
  // A page on this computer has no such limit.
  assert.equal(
    await help.diagnoseOllama(browser({ listening: false, origin: "http://localhost:3000" })),
    "ollama-closed",
  );
});

test("commands allow this site only, on every system", () => {
  for (const platform of ["mac", "windows", "linux"]) {
    const { steps } = help.describe("ollama-not-allowed", { provider: "ollama", origin: SITE, platform });
    assert.match(steps[0].command, /OLLAMA_ORIGINS.*https:\/\/tinycrafts\.ai/);
    assert.doesNotMatch(steps[0].command, /\*/);
  }
  assert.match(help.describe("ollama-not-allowed", { origin: SITE, platform: "windows" }).steps[0].command, /^setx /);
});

test("nothing unexpected reaches a command people paste", () => {
  for (const origin of ["null", "", 'https://a.example";rm -rf ~', "file://"]) {
    assert.deepEqual(help.describe("ollama-not-allowed", { origin, platform: "mac" }).steps, []);
  }
  assert.deepEqual(help.describe("ollama-model-missing", { model: "x; rm -rf ~", platform: "mac" }).steps, []);
  assert.equal(
    help.describe("ollama-model-missing", { model: "qwen3.5:9b", platform: "mac" }).steps[0].command,
    "ollama pull qwen3.5:9b",
  );
});

test("provider failures map to the right message", () => {
  const is = (error, provider, code, online = true) =>
    assert.equal(help.classify(error, provider, online), code);
  is({ status: 401 }, "groq", "key-rejected");
  is({ status: 402 }, "openrouter", "credits");
  is({ status: 429, message: "Rate limit" }, "groq", "rate-limited");
  is({ status: 429, message: "Request too large for model" }, "groq", "too-large");
  is({ status: 413 }, "groq", "too-large");
  is({ status: 404 }, "groq", "model-unavailable");
  is({ status: 503 }, "groq", "provider-down");
  is({ status: 404 }, "ollama", "ollama-model-missing");
  is({ code: "network" }, "groq", "provider-unreachable");
  is({ code: "network" }, "groq", "offline", false);
  is({ code: "ollama-closed" }, "ollama", "ollama-closed");
  is(new TypeError("network error"), "ollama", "interrupted");
  is(new Error("weird"), "groq", "unknown");
});

test("the words stay plain and every problem offers a way on", () => {
  const codes = [...fs.readFileSync("assets/ai-help.js", "utf8").matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]);
  assert.ok(codes.length > 14);
  for (const code of [...codes, "unknown"]) {
    const problem = help.describe(code, { provider: "groq", origin: SITE, platform: "mac", model: "m", suggestedModel: "gemma3" });
    const words = [problem.title, problem.body, problem.note, ...(problem.steps || []).map((s) => s.text)].join(" ");
    assert.doesNotMatch(words, /CORS|endpoint|\borigin\b|loopback|HTTP \d|undefined/i, code);
    assert.ok(problem.title.length <= 40, code + ": " + problem.title);
    assert.ok(problem.actions.length >= 1, code);
  }
});

test("platform detection", () => {
  const p = (userAgent, maxTouchPoints = 0) => help.detectPlatform({ userAgent, maxTouchPoints });
  assert.equal(p("Macintosh; Intel Mac OS X"), "mac");
  assert.equal(p("Macintosh; Intel Mac OS X", 5), "mobile");
  assert.equal(p("Windows NT 10.0"), "windows");
  assert.equal(p("X11; Linux x86_64"), "linux");
  assert.equal(p("Linux; Android 15"), "mobile");
});

test("the app no longer tells anyone to open Ollama to every website", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.doesNotMatch(html, /OLLAMA_ORIGINS=\*|CORS_BLOCKED|blocked by CORS/);
  assert.match(html, /assets\/ai-help\.js\?v=1/);
  assert.match(fs.readFileSync("sw.js", "utf8"), /assets\/ai-help\.js\?v=1/);
});
