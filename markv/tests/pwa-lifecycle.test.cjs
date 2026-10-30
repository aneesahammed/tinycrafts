const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function events(object = {}) {
  const listeners = new Map();
  object.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  object.emit = (type) => (listeners.get(type) || []).forEach((fn) => fn());
  return object;
}

async function app({ controlled = false, flush = async () => {} } = {}) {
  let reloads = 0;
  const messages = [];
  const elements = new Map();
  for (const id of ["pwaUpdateToast", "pwaUpdateToastAction", "pwaUpdateToastDismiss", "pwaUpdateToastTitle"]) {
    elements.set(id, events({ hidden: true, dataset: {}, classList: { add() {}, remove() {} } }));
  }
  const registration = events({ waiting: { postMessage: (value) => messages.push(value.type) } });
  const serviceWorker = events({ controller: controlled ? {} : null, register: async () => registration });
  const window = events({
    location: { href: "http://localhost/", reload: () => reloads++ },
    sessionStorage: { getItem: () => null }, setTimeout: () => 1, clearTimeout() {},
    markvPWAHooks: { flushSessionDraft() {}, flushPendingWrites: flush },
  });
  const document = events({ readyState: "complete", getElementById: (id) => elements.get(id) });
  vm.runInNewContext(fs.readFileSync("assets/pwa.js", "utf8"), {
    window, document, navigator: { serviceWorker }, URL, console, requestAnimationFrame: (fn) => fn(),
  });
  await new Promise(setImmediate);
  return { window, serviceWorker, elements, messages, reloads: () => reloads };
}

test("first service-worker activation takes control without reloading the first visit", async () => {
  const ctx = await app();
  ctx.serviceWorker.controller = {};
  ctx.serviceWorker.emit("controllerchange");
  assert.equal(ctx.reloads(), 0);
});

test("an update activated by another tab does not interrupt this tab", async () => {
  const ctx = await app({ controlled: true });
  ctx.serviceWorker.controller = {};
  ctx.serviceWorker.emit("controllerchange");
  assert.equal(ctx.reloads(), 0);
});

test("Refresh flushes pending edits before activating the update and reloads only once", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const ctx = await app({ controlled: true, flush: () => pending });
  ctx.elements.get("pwaUpdateToastAction").onclick();
  assert.deepEqual(ctx.messages, [], "activation must wait for persistence");
  finish();
  await new Promise(setImmediate);
  assert.deepEqual(ctx.messages, ["SKIP_WAITING"]);
  ctx.serviceWorker.emit("controllerchange");
  ctx.serviceWorker.emit("controllerchange");
  assert.equal(ctx.reloads(), 1);
});
