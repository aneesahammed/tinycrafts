// Real browser regression suite. Run: node tests/onboarding.browser.cjs
// Requires gstack /browse and Bun; set GSTACK_BROWSE_BIN for a custom install.
// Uses a private Chromium session and a random local origin, never existing app data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execute = promisify(execFile);
const root = path.resolve(__dirname, "..");
const bin = [process.env.GSTACK_BROWSE_BIN,
  ...[".agents/skills/gstack", ".codex/skills/gstack", ".claude/skills/gstack"].map(
    (base) => path.join(os.homedir(), base, "browse/dist/browse"),
  ),
].find((file) => file && fs.existsSync(file));
if (!bin) throw new Error("Install gstack /browse or set GSTACK_BROWSE_BIN to its executable.");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "markv-onboarding-"));
const stateFile = path.join(temp, "browse.json");
const env = { ...process.env, BROWSE_STATE_FILE: stateFile };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browserLog = "";
const browser = spawn(process.env.BUN_BIN || "bun", [
  path.resolve(path.dirname(bin), "../src/server.ts"),
], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
browser.stdout.on("data", (chunk) => { browserLog += chunk; });
browser.stderr.on("data", (chunk) => { browserLog += chunk; });
browser.on("error", (error) => { browserLog += error.message; });

const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".md": "text/markdown", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
let navigations = 0;
const site = http.createServer((req, res) => {
  if (req.headers["sec-fetch-mode"] === "navigate") navigations++;
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(content);
  });
});

async function browse(...args) {
  const { stdout } = await execute(bin, args, { cwd: root, env, timeout: 45000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
async function js(body) {
  return JSON.parse(await browse("js", "return await (async()=>{ " + body + " })()"));
}
async function waitFor(expression, label) {
  const deadline = Date.now() + 45000;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await js("return Boolean(" + expression + ");")) return; }
    catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error("Timed out: " + label + (lastError ? "\n" + lastError.message : ""));
}
function ok(label) { console.log("ok - " + label); }

async function main() {
  const deadline = Date.now() + 20000;
  while (!fs.existsSync(stateFile)) {
    if (Date.now() > deadline || browser.exitCode !== null) throw new Error("Browser did not start:\n" + browserLog);
    await delay(100);
  }
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + site.address().port + "/";
  await browse("goto", url);
  await waitFor("document.documentElement.classList.contains('is-welcome') && document.querySelectorAll('#preview [data-welcome-action]').length === 4 && navigator.serviceWorker.controller", "fresh welcome and initial worker activation");
  await delay(500);
  assert.equal(navigations, 1, "first install must not cause a second navigation");
  ok("fresh browser renders welcome once and adopts its worker without reloading");

  for (const width of [900, 768, 375, 1024, 1440]) {
    await browse("viewport", width + "x1000");
    await delay(600);
    const guide = await js(`
      const g=document.querySelector('.welcome-guide[data-guide="files"]');
      const label=g.querySelector('.wg-label').getBoundingClientRect();
      const svg=g.querySelector('svg').getBoundingClientRect();
      const heading=document.querySelector('#preview h1').getBoundingClientRect();
      return {display:getComputedStyle(document.querySelector('.welcome-guides')).display,
        active:g.classList.contains('is-on'),left:Math.min(label.left,svg.left),right:Math.max(label.right,svg.right),
        top:Math.min(label.top,svg.top),bottom:Math.max(label.bottom,svg.bottom),
        coversHeading:Math.max(label.left,heading.left)<Math.min(label.right,heading.right)&&
          Math.max(label.top,heading.top)<Math.min(label.bottom,heading.bottom),
        toggle:getComputedStyle(document.querySelector('.welcome-guide-toggle')).display};
    `);
    assert.notEqual(guide.display, "none", "guides visible at " + width);
    assert.notEqual(guide.toggle, "none", "guide toggle visible at " + width);
    assert.equal(guide.active, true);
    assert.ok(guide.left >= 0 && guide.right <= width && guide.top >= 0 && guide.bottom <= 1000, JSON.stringify({width,...guide}));
    assert.equal(guide.coversHeading, false, "guide label must not cover the heading at " + width);
    if (process.env.MARKV_SCREENSHOT_DIR && [900,375].includes(width)) {
      fs.mkdirSync(process.env.MARKV_SCREENSHOT_DIR,{recursive:true});
      await browse("screenshot",path.join(process.env.MARKV_SCREENSHOT_DIR,"welcome-"+width+".png"));
    }
  }
  ok("hand-drawn guides remain visible and inside narrow and wide windows");

  await browse("viewport", "375x812");
  const mobile = await js("return {copy:document.getElementById('preview').textContent, overflow:document.documentElement.scrollWidth>innerWidth};");
  assert.ok(mobile.copy.includes("More → Aa"));
  assert.equal(mobile.overflow, false);
  await browse("click", "#mvMoreBtn");
  await browse("click", "#readingToggleBtn");
  await waitFor("!document.getElementById('readingPanel').hidden && document.getElementById('readingPanel').getBoundingClientRect().width > 0", "mobile Reading settings");
  await browse("click", "#readingCloseBtn");
  ok("mobile instructions lead to accessible Reading settings without overflow");

  await browse("viewport", "1440x1000");
  for (const theme of ["light", "dark"]) {
    await js("if(document.documentElement.dataset.theme!==" + JSON.stringify(theme) + ")document.getElementById('themeToggleBtn').click(); return true;");
    await waitFor("document.documentElement.dataset.theme === " + JSON.stringify(theme), theme + " theme");
    const content = await js("return {welcome:document.documentElement.classList.contains('is-welcome'),buttons:document.querySelectorAll('#preview [data-welcome-action]').length,text:document.getElementById('preview').textContent};");
    assert.equal(content.welcome, true);
    assert.equal(content.buttons, 4);
    assert.ok(content.text.includes("Using hosted AI sends relevant document excerpts"));
    assert.equal(content.text.includes("Nothing leaves your device"), false);
  }
  ok("welcome controls and qualified privacy information work in both themes");

  const fileAction = await js(`
    let calls=0; window.showOpenFilePicker=async()=>{calls++;throw new DOMException('Cancelled','AbortError');};
    document.querySelector('#preview [data-welcome-action="open-file"]').click();
    await new Promise(r=>setTimeout(r,50));
    return {calls,welcome:document.documentElement.classList.contains('is-welcome')};
  `);
  assert.equal(fileAction.calls, 1);
  assert.equal(fileAction.welcome, true);
  ok("Open a file reaches the file picker and cancelling keeps onboarding intact");

  const folderAction = await js(`
    let calls=0; window.showDirectoryPicker=async()=>{calls++;throw new DOMException('Cancelled','AbortError');};
    document.querySelector('#preview [data-welcome-action="open-folder"]').click();
    await new Promise(r=>setTimeout(r,50));
    return {calls,welcome:document.documentElement.classList.contains('is-welcome')};
  `);
  assert.equal(folderAction.calls, 1);
  assert.equal(folderAction.welcome, true);
  ok("Open a folder reaches the folder picker and cancelling keeps onboarding intact");

  await browse("click", ".welcome-guide-toggle");
  await browse("reload");
  await waitFor("document.querySelector('.welcome-guide-toggle')?.getAttribute('aria-pressed') === 'false'", "remembered hidden guides");
  await browse("click", ".welcome-guide-toggle");
  await browse("click", "#modeToggleBtn");
  assert.equal(await js("return getComputedStyle(document.querySelector('.welcome-guides')).display === 'none';"), true);
  await browse("click", "#readModeBtn");
  await waitFor("document.querySelector('.welcome-guide-toggle')?.getAttribute('aria-pressed') === 'true' && getComputedStyle(document.querySelector('.welcome-guides')).display !== 'none'", "guides restored in Read");
  ok("guide preferences survive reload and guides stay hidden in Edit mode");

  await waitFor("document.querySelector('#preview .mermaid-block svg')", "welcome diagram");
  const printed = await js(`
    let printed; window.print=()=>{const article=document.querySelector('#markvExportPrintRoot article');
      printed={ui:article.querySelectorAll('[data-welcome-ui],.welcome-underline').length,
        title:article.querySelector('h1').textContent,diagram:!!article.querySelector('.mermaid-block svg')};};
    await window.MarkVExportHost.exportPdf();window.dispatchEvent(new Event('afterprint'));
    return {...printed,sourceButtons:document.querySelectorAll('#preview [data-welcome-action]').length};
  `);
  assert.equal(printed.ui, 0);
  assert.ok(printed.title.includes("Welcome to MarkV"));
  assert.equal(printed.diagram, true);
  assert.equal(printed.sourceButtons, 4);
  ok("PDF preparation removes onboarding UI while preserving the document and diagram");

  const race = await js(`
    const fetchOriginal=window.fetch.bind(window);let finish;
    window.fetch=(url,...args)=>String(url).includes('sample-developer.md')?
      new Promise(resolve=>finish=()=>fetchOriginal(url,...args).then(resolve)):fetchOriginal(url,...args);
    const pending=window.MarkVCommandPaletteHost.getItems().find(c=>c.id==='command:showcase').run();
    document.getElementById('modeToggleBtn').click();const editor=document.getElementById('editor');
    editor.value='# My newer unsaved note';editor.dispatchEvent(new Event('input',{bubbles:true}));
    finish();await pending;window.fetch=fetchOriginal;window.markvPWAHooks.flushSessionDraft();
    return {editor:editor.value,recovery:sessionStorage.getItem('fast-md-viewer-session-content')};
  `);
  assert.equal(race.editor, "# My newer unsaved note");
  assert.equal(race.recovery, "# My newer unsaved note");
  ok("a delayed showcase response preserves newer edits and session recovery");

  await js("document.getElementById('newDocumentBtn').click(); return true;");
  await waitFor("document.body.classList.contains('edit-mode-active') && document.getElementById('editor').value === ''", "blank New entry");
  await js("const editor=document.getElementById('editor');editor.value='# Recover my draft';editor.dispatchEvent(new Event('input',{bubbles:true}));await window.markvPWAHooks.flushPendingWrites(); return true;");
  await browse("reload");
  await waitFor("document.getElementById('editor').value === '# Recover my draft' && !document.documentElement.classList.contains('is-welcome')", "returning draft");
  ok("New entry starts blank and a returning draft takes precedence over welcome");

  await js("await window.MarkVCommandPaletteHost.getItems().find(c=>c.id==='command:welcome').run();await window.markvPWAHooks.flushPendingWrites(); return true;");
  await waitFor("document.documentElement.classList.contains('is-welcome')", "reopened welcome");
  await new Promise((resolve) => { site.close(resolve); site.closeAllConnections(); });
  await browse("reload");
  await waitFor("document.documentElement.classList.contains('is-welcome') && document.querySelectorAll('#preview [data-welcome-action]').length === 4", "cached offline welcome");
  ok("cached welcome and controls survive a reload with the origin offline");
}

let cleanupPromise;
function cleanup() {
  return cleanupPromise || (cleanupPromise = (async () => {
    if (site.listening) { site.close(); site.closeAllConnections(); }
    // The server closes its private Chromium before dropping this request.
    if (fs.existsSync(stateFile) && browser.exitCode === null) await browse("stop").catch(() => {});
    if (browser.exitCode === null) browser.kill("SIGTERM");
    fs.rmSync(temp, { recursive: true, force: true });
  })());
}
process.once("SIGINT", () => { cleanup().finally(() => process.exit(130)); });
process.once("SIGTERM", () => { cleanup().finally(() => process.exit(143)); });
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(cleanup);
