const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { functionSource, runtime } = require("./helpers/inline-app.cjs");

test("saving provider or model settings never writes API keys to preferences", () => {
  const values = new Map();
  const settings = {
    provider: "groq", endpoint: "http://localhost:11434", ollamaModel: "local",
    groqModel: "model-a", groqApiKey: "placeholder-groq",
    openrouterModel: "model-b", openrouterApiKey: "placeholder-openrouter",
  };
  const ctx = runtime({
    getCurrentLlmSettings: () => settings, LLM_SETTINGS_KEY: "llm", LEGACY_OLLAMA_SETTINGS_KEY: "ollama",
    writeChatPreference: (key, value) => values.set(key, value), syncLlmSettingsUi() {},
  }, [functionSource("saveLlmSettings")]);
  ctx.saveLlmSettings();
  assert.equal(values.get("llm").includes("placeholder-groq"), false);
  assert.equal(values.get("llm").includes("placeholder-openrouter"), false);
  assert.equal(JSON.parse(values.get("llm")).groqModel, "model-a");
  assert.equal(settings.groqApiKey, "placeholder-groq", "in-memory credentials remain available");
});

test("concurrent first-time encryption uses one key so both providers can decrypt", async () => {
  const rows = new Map();
  const ctx = runtime({
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, KEY_ID: "aes-key",
    idbGet: async (id) => rows.get(id), idbPut: async (row) => rows.set(row.id, row),
    idbAdd: async (row) => { if (rows.has(row.id)) throw new Error("duplicate"); rows.set(row.id, row); },
  }, ["let aesKeyPromise = null;", functionSource("getOrCreateAesKey"),
    functionSource("encryptString"), functionSource("decryptPayload")]);
  const payloads = await Promise.all([ctx.encryptString("groq"), ctx.encryptString("openrouter")]);
  // Read the persisted key afresh, as a reload does.
  const reload = runtime({
    crypto: webcrypto, TextDecoder, KEY_ID: "aes-key", idbGet: async (id) => rows.get(id),
  }, ["let aesKeyPromise = null;", functionSource("getOrCreateAesKey"), functionSource("decryptPayload")]);
  assert.deepEqual(await Promise.all(payloads.map((payload) => reload.decryptPayload(payload))), ["groq", "openrouter"]);
});

test("two tabs creating the secret store concurrently cannot invalidate each other's encrypted keys", async () => {
  const rows = new Map();
  function tab() {
    return runtime({
      crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, KEY_ID: "aes-key",
      idbGet: async (id) => rows.get(id), idbPut: async (row) => rows.set(row.id, row),
      idbAdd: async (row) => { if (rows.has(row.id)) throw new Error("duplicate"); rows.set(row.id, row); },
    }, ["let aesKeyPromise = null;", functionSource("getOrCreateAesKey"),
      functionSource("encryptString"), functionSource("decryptPayload")]);
  }
  const first = tab(), second = tab();
  const payloads = await Promise.all([first.encryptString("first tab"), second.encryptString("second tab")]);
  const reloaded = tab();
  assert.deepEqual(await Promise.all(payloads.map((payload) => reloaded.decryptPayload(payload))), ["first tab", "second tab"]);
});
