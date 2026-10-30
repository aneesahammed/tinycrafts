const test = require("node:test");
const assert = require("node:assert/strict");
const { functionSource, between, runtime } = require("./helpers/inline-app.cjs");

function app(put) {
  const persisted = new Map(), backups = [];
  const pending = new Map();
  const ctx = runtime({
    state: { untitledDrafts: [{ id: "other", title: "Other", content: "A large unrelated draft" }] },
    els: { editor: { value: "" } },
    window: { localStorage: {}, setTimeout: () => 1, clearTimeout() {}, addEventListener() {} },
    __pendingUntitledDraftWrites: pending, __pendingUntitledDraftFlush: null,
    __untitledDraftFlushPromise: null,
    UNTITLED_DRAFT_BACKUP_KEY: "backup",
    writeStorage: (_storage, _key, value) => { backups.push(JSON.parse(value)); return true; },
    removeStorage() {}, canUseUntitledDraftStorage: () => true,
    untitledDraftPutInDb: put || (async (record) => persisted.set(record.id, record)),
    isUntitledDraftMode: () => false,
    createUntitledDraftId: () => "new", getActiveUntitledDraft: () => null,
  }, [functionSource("normalizeUntitledDraftRecord"), functionSource("writeUntitledDraftBackup"),
    between("        function scheduleUntitledDraftWrite(", "        function canUsePersistentLibrary(")]);
  return { ctx, persisted, backups, pending };
}

test("typing queues only the changed draft without synchronously serializing the collection", async () => {
  const { ctx, persisted, backups } = app();
  ctx.scheduleUntitledDraftWrite({ id: "a", title: "A", content: "First" });
  ctx.scheduleUntitledDraftWrite({ id: "a", title: "A", content: "Latest" });
  assert.equal(backups.length, 0);
  await ctx.flushUntitledDraftWrites();
  assert.equal(persisted.size, 1);
  assert.equal(persisted.get("a").content, "Latest");
  assert.equal(backups.length, 0);
});

test("a failed database write remains pending and can be retried", async () => {
  let fail = true;
  const persisted = new Map();
  const { ctx } = app(async (record) => {
    if (fail) throw new Error("temporary database failure");
    persisted.set(record.id, record);
  });
  ctx.scheduleUntitledDraftWrite({ id: "a", content: "Keep this text" });
  await ctx.flushUntitledDraftWrites().catch(() => {});
  fail = false;
  await ctx.flushUntitledDraftWrites();
  assert.equal(persisted.get("a")?.content, "Keep this text");
});

test("the close-time recovery journal contains pending drafts instead of the whole collection", () => {
  const { ctx, backups } = app();
  ctx.scheduleUntitledDraftWrite({ id: "a", content: "Recover me" });
  ctx.writeUntitledDraftBackup();
  assert.deepEqual(backups.at(-1).drafts.map((record) => record.id), ["a"]);
  assert.equal(backups.at(-1).drafts[0].content, "Recover me");
});

test("overlapping flushes cannot replace a newer draft with an older snapshot", async () => {
  let finishFirst;
  const gate = new Promise((resolve) => { finishFirst = resolve; });
  let stored;
  const { ctx } = app(async (record) => {
    if (record.content === "First") await gate;
    stored = record.content;
  });
  ctx.scheduleUntitledDraftWrite({ id: "a", content: "First" });
  const first = ctx.flushUntitledDraftWrites();
  ctx.scheduleUntitledDraftWrite({ id: "a", content: "Latest" });
  const second = ctx.flushUntitledDraftWrites();
  await new Promise(setImmediate);
  finishFirst();
  await Promise.all([first, second]);
  assert.equal(stored, "Latest");
});

test("a partial batch failure does not finish a flush while another write is still pending", async () => {
  let finishWrite;
  const gate = new Promise((resolve) => { finishWrite = resolve; });
  const { ctx } = app(async (record) => {
    if (record.id === "failure") throw new Error("storage failure");
    await gate;
  });
  ctx.scheduleUntitledDraftWrite({ id: "failure", content: "Retry later" });
  ctx.scheduleUntitledDraftWrite({ id: "slow", content: "Still saving" });
  let settled = false;
  const pending = ctx.flushUntitledDraftWrites().catch(() => {}).finally(() => { settled = true; });
  await new Promise(setImmediate);
  const settledBeforeLastWrite = settled;
  finishWrite();
  await pending;
  assert.equal(settledBeforeLastWrite, false);
});
