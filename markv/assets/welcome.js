// Welcome page: the in-document UI (facts, drop zone, closing actions) and
// the hand-drawn guides that point at real controls while each section is
// read. Active only while the bundled assets/welcome.md is open, unedited.
// Talks to the app through events: listens for `markv:render-complete`,
// dispatches `markv:welcome-action` for the buttons it adds.
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVWelcome = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  "use strict";

  const WELCOME_URL = "assets/welcome.md?v=3";
  const TITLE_LINE = "# Welcome to MarkV";
  const GUIDES_KEY = "md-viewer-welcome-guides";

  // Section heading in welcome.md -> guides shown while it is being read.
  // tests/welcome.test.cjs keeps these headings in sync with the file.
  const SECTION_GUIDES = {
    "Open something of yours": ["files"],
    "Make it yours": ["aa"],
    "Find your way": ["outline", "search"],
    "See the shape of things": [],
    "Ask, if you want to": ["chat"],
    "Ready when you are": [],
  };
  const SECTIONS = Object.keys(SECTION_GUIDES);
  const LAST_SECTION = SECTIONS[SECTIONS.length - 1];

  const api = { WELCOME_URL, TITLE_LINE, SECTION_GUIDES };
  const doc = root.document;
  if (!doc) return api;

  const icon = (body, size) =>
    '<svg width="' + (size || 15) + '" height="' + (size || 15) +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
    (size ? 1.6 : 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    body + "</svg>";
  const FACTS =
    "<li>" + icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>') +
    "Files read locally</li>" +
    "<li>" + icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>') + "No account</li>" +
    "<li>" + icon('<path d="M20 15.5A4.5 4.5 0 0 0 17.5 7a6 6 0 0 0-11.3 2A4 4 0 0 0 7 17h10"/><path d="m8 13 3 3 5-5"/>') +
    "Works offline</li>";
  const FILE_ICON = icon(
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3"/>',
    30,
  );

  // Each guide's arrow tip sits at a known point in its own box; place()
  // moves the box so the tip lands on the control. Halos (canvas-coloured,
  // wider) go under the ink so a guide stays legible where it crosses text.
  function guide(id, w, h, paths, label) {
    const stroke = (cls) =>
      paths.map((d, i) =>
        '<path class="' + cls + " wg-draw" + (i ? " wg-head" : "") + '" pathLength="1" d="' + d + '"/>',
      ).join("");
    return '<div class="welcome-guide" data-guide="' + id + '"><svg width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + " " + h + '">' + stroke("wg-halo") + stroke("wg-ink") +
      '</svg><span class="wg-label">' + label + "</span></div>";
  }
  const GUIDES =
    guide("files", 130, 150, [
      "M60 130C74 114 92 94 78 80 64 66 44 82 56 94 68 106 96 78 78 52 64 32 38 28 22 8",
      "M22 8 23 22", "M22 8 35 12",
    ], "your files<br>live here") +
    guide("aa", 120, 80, [
      "M6 52C20 30 48 18 58 32 68 46 40 56 46 40 52 24 84 26 110 45",
      "M110 45 106 33", "M110 45 97 45",
    ], "make the text yours") +
    guide("outline", 130, 100, [
      "M118 86C104 70 120 48 104 40 88 32 76 52 90 58 104 64 96 30 70 26 50 23 28 28 8 30",
      "M8 30 19 36", "M8 30 18 22",
    ], "follows you<br>as you read") +
    guide("chat", 130, 90, [
      "M8 22C30 10 62 12 70 30 76 44 56 50 54 38 52 26 80 30 96 46 106 56 114 64 122 70",
      "M122 70 118 58", "M122 70 109 70",
    ], "optional · your own key") +
    '<div class="welcome-guide" data-guide="search"><svg>' +
    '<path class="wg-halo wg-draw" pathLength="1"/><path class="wg-ink wg-draw" pathLength="1"/>' +
    '</svg><span class="wg-label">search anything</span></div>';
  const UNDERLINE =
    '<svg class="welcome-underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">' +
    '<path class="wg-ink wg-draw" pathLength="1" d="M2 7C54 1 90 12 144 6S240 2 298 5"/></svg>';
  const SQUIGGLE =
    '<svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M1 8c3-6 5 4 8-1s4-3 8-2"/></svg>';

  // A loose, overshooting loop, like a pen circling a word.
  function loopPath(w, h) {
    const p = (x, y) => (x * w) / 100 + " " + (y * h) / 40;
    return "M" + p(8, 22) + "C" + p(6, 8) + " " + p(40, 3) + " " + p(62, 4) +
      "C" + p(84, 5) + " " + p(98, 12) + " " + p(96, 22) +
      "C" + p(94, 33) + " " + p(64, 38) + " " + p(44, 37) +
      "C" + p(22, 36) + " " + p(4, 31) + " " + p(6, 20) +
      "C" + p(7, 13) + " " + p(18, 8) + " " + p(30, 7);
  }

  // The toolbar slides away and the dock fades while scrolling; a guide
  // only points at a control that is on screen and visible.
  function rect(id) {
    const el = doc.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= 0 || r.left >= root.innerWidth ||
        r.bottom <= 0 || r.top >= root.innerHeight) return null;
    for (let n = el; n && n !== doc.body; n = n.parentElement) {
      const style = root.getComputedStyle(n);
      if (style.visibility === "hidden" || Number(style.opacity) < 0.1) return null;
    }
    return r;
  }

  function guideScale() {
    return root.innerWidth <= 640 ? 0.6 : root.innerWidth <= 1200 ? 0.7 : 1;
  }

  function guideLabel(g, text) {
    const label = g.querySelector(".wg-label");
    if (label.textContent !== text) label.textContent = text;
  }

  // Where each guide's box goes; null hides it (no room or no target).
  const place = {
    files() {
      const r = rect("libraryToggleBtn");
      return r && { x: r.left + r.width / 2 - 22 * guideScale(), y: r.bottom - 4 };
    },
    aa(g) {
      const native = rect("readingToggleBtn");
      const r = native || rect("mvMoreBtn");
      g.dataset.target = native ? "readingToggleBtn" : "mvMoreBtn";
      guideLabel(g, native ? "make the text yours" : "Aa is under More");
      const scale = guideScale();
      return r && {
        x: native ? r.left - 116 * scale : r.left + r.width / 2 - 110 * scale,
        y: (native ? r.top + r.height / 2 : r.bottom + 6) - 45 * scale,
      };
    },
    outline() {
      const r = rect("readerOutlineList");
      if (!r || root.innerWidth - r.right < 160) return null;
      return { x: r.right + 2, y: r.top + 10 };
    },
    search(g) {
      const native = rect("paletteShortcutHint");
      const r = native || rect("mvMoreBtn");
      if (!r) return null;
      g.dataset.target = native ? "paletteShortcutHint" : "mvMoreBtn";
      g.dataset.labelSide = root.innerWidth <= 1200 ? "below" : "right";
      guideLabel(g, native ? "search anything" : "search under More");
      const w = r.width + 28;
      const h = r.height + 22;
      const svg = g.querySelector("svg");
      svg.setAttribute("width", w);
      svg.setAttribute("height", h);
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      svg.querySelectorAll("path").forEach((p) => p.setAttribute("d", loopPath(w, h)));
      return { x: r.left - 14, y: r.top - 11 };
    },
    chat() {
      const r = rect("chatFab");
      return r && { x: r.left - 128 * guideScale(), y: r.top + r.height / 2 - 70 * guideScale() };
    },
  };

  let active = false;
  let welcomeText = null;
  let fetching = null;
  let layer = null;
  let toggle = null;
  let headings = new Map();
  let current = null;
  let underlineDrawn = false;
  let ticking = false;
  let hiddenPref = false;

  function readHiddenPref() {
    try {
      return root.localStorage.getItem(GUIDES_KEY) === "hidden";
    } catch (_) {
      return false;
    }
  }

  function headingText(h) {
    let text = "";
    h.childNodes.forEach((n) => {
      if (!(n.nodeType === 1 && n.classList.contains("heading-anchor"))) text += n.textContent;
    });
    return text.replace(/\s+/g, " ").trim();
  }

  function nextParagraph(node) {
    for (let n = node.nextElementSibling; n; n = n.nextElementSibling) {
      if (n.tagName === "P") return n;
      if (/^H[1-6]$/.test(n.tagName)) return null;
    }
    return null;
  }

  function ui(tag, className, html) {
    const el = doc.createElement(tag);
    el.className = className;
    el.dataset.welcomeUi = "";
    el.innerHTML = html;
    return el;
  }

  function shortcutLabel() {
    const s = root.MarkVShortcuts;
    return (s && typeof s.describe === "function" && s.describe("global.search")) || "⌘K";
  }

  // The preview is rebuilt on every render, so this runs each time.
  function decorate(preview) {
    headings = new Map();
    preview.querySelectorAll("h2").forEach((h) => {
      const text = headingText(h);
      if (Object.prototype.hasOwnProperty.call(SECTION_GUIDES, text)) headings.set(text, h);
    });
    if (preview.querySelector("[data-welcome-ui]")) return;

    const h1 = preview.querySelector("h1");
    const lead = h1 && nextParagraph(h1);
    if (lead) lead.after(ui("ul", "welcome-facts", FACTS));

    const open = headings.get(SECTIONS[0]);
    const openText = open && nextParagraph(open);
    if (openText) {
      const folderBtn = doc.getElementById("libraryAddBtn");
      openText.after(
        ui("div", "welcome-drop",
          FILE_ICON +
          '<p class="welcome-drop__title">Drop a markdown file to start reading</p>' +
          '<p class="welcome-drop__sub">.md, .markdown or .txt. Read locally in your browser.</p>' +
          '<div class="welcome-actions">' +
          '<button type="button" class="btn btn-primary" data-welcome-action="open-file">Open a file</button>' +
          (folderBtn && folderBtn.disabled ? "" :
            '<button type="button" class="btn" data-welcome-action="open-folder">Open a folder</button>') +
          "</div>"),
      );
    }

    const end = headings.get(LAST_SECTION);
    const endText = end && nextParagraph(end);
    if (endText) {
      endText.after(
        ui("div", "welcome-actions welcome-actions--end",
          '<button type="button" class="btn btn-primary" data-welcome-action="open-file">Open your first file</button>' +
          '<button type="button" class="welcome-link" data-welcome-action="open-showcase">Explore the Markdown showcase →</button>'),
        ui("p", "welcome-note",
          "This page steps aside once you open a file. Find it again any time in <kbd>" +
          shortcutLabel() + "</kbd>."),
      );
    }
    const endLabel = end && [...end.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (endLabel) {
      const host = doc.createElement("span");
      host.className = "welcome-underline-host";
      endLabel.replaceWith(host);
      host.append(endLabel);
      host.insertAdjacentHTML("beforeend", UNDERLINE);
      if (underlineDrawn) host.lastChild.classList.add("is-on", "seen");
    }

    preview.querySelectorAll("kbd").forEach((k) => {
      if (k.textContent === "⌘K") k.textContent = shortcutLabel();
    });
  }

  // A section is "being read" once its heading passes a line at mid-screen.
  // Over the last half-screen of scroll the line slides to the bottom edge,
  // so short closing sections still get their turn before the page ends.
  function currentSection() {
    const se = doc.scrollingElement || doc.documentElement;
    const half = root.innerHeight / 2;
    const max = se.scrollHeight - root.innerHeight;
    const ramp = Math.min(1, Math.max(0, (root.scrollY - (max - half)) / half));
    const line = half + half * ramp;
    let id = SECTIONS[0];
    headings.forEach((h, text) => {
      if (h.getBoundingClientRect().top < line) id = text;
    });
    return id;
  }

  function layoutGuide(g) {
    const scale = guideScale();
    g.style.setProperty("--wg-scale", scale);
    if (g.dataset.guide !== "search") {
      const svg = g.querySelector("svg");
      svg.style.width = Number(svg.getAttribute("width")) * scale + "px";
      svg.style.height = Number(svg.getAttribute("height")) * scale + "px";
    }
    const pos = place[g.dataset.guide](g);
    if (!pos) return false;
    g.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";
    // Keep labels inside the viewport without moving the arrow off its target.
    const label = g.querySelector(".wg-label");
    label.style.translate = "none";
    const bounds = label.getBoundingClientRect();
    const shift = bounds.left < 8 ? 8 - bounds.left :
      bounds.right > root.innerWidth - 8 ? root.innerWidth - 8 - bounds.right : 0;
    label.style.translate = shift + "px 0";
    return true;
  }

  function showGuides(ids) {
    if (!layer) return;
    layer.querySelectorAll(".welcome-guide").forEach((g) => {
      const want = !hiddenPref && ids.includes(g.dataset.guide) && layoutGuide(g);
      if (want) g.classList.add("is-on");
      else if (g.classList.contains("is-on")) {
        g.classList.remove("is-on");
        g.classList.add("seen"); // later appearances skip the drawing
      }
    });
  }

  function update() {
    ticking = false;
    if (!active) return;
    const id = currentSection();
    // Every frame: targets come and go as the chrome tucks away.
    showGuides(SECTION_GUIDES[id]);
    if (id !== current) {
      current = id;
      const underline = doc.querySelector("#preview .welcome-underline");
      if (id === LAST_SECTION && underline && !hiddenPref) {
        underline.classList.add("is-on");
        underlineDrawn = true;
      }
    }
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    root.requestAnimationFrame(update);
  }

  function syncToggle() {
    toggle.setAttribute("aria-pressed", String(!hiddenPref));
    toggle.lastChild.textContent = hiddenPref ? "Show guides" : "Hide guides";
    doc.documentElement.classList.toggle("welcome-guides-off", hiddenPref);
  }

  function ensureLayer() {
    if (layer) return;
    layer = doc.createElement("div");
    layer.className = "welcome-guides";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = GUIDES;
    toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "welcome-guide-toggle";
    toggle.innerHTML = SQUIGGLE + "<span></span>";
    toggle.addEventListener("click", () => {
      hiddenPref = !hiddenPref;
      try {
        root.localStorage.setItem(GUIDES_KEY, hiddenPref ? "hidden" : "shown");
      } catch (_) {}
      // Reset so showing them again replays the drawing.
      layer.querySelectorAll(".welcome-guide").forEach((g) => g.classList.remove("is-on", "seen"));
      doc.querySelectorAll("#preview .welcome-underline").forEach((u) => u.classList.remove("is-on", "seen"));
      underlineDrawn = false;
      current = null;
      syncToggle();
      root.requestAnimationFrame(schedule);
    });
    doc.body.append(layer, toggle);
    hiddenPref = readHiddenPref();
    syncToggle();
    root.addEventListener("scroll", schedule, { passive: true });
    root.addEventListener("resize", () => {
      current = null;
      schedule();
    });
    // Drawers and panels shift the chrome with a short transition, so
    // re-place guides right away and again once it has settled.
    new MutationObserver(() => {
      schedule();
      root.setTimeout(schedule, 350);
    }).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  }

  function setActive(on) {
    if (on === active && !on) return;
    active = on;
    doc.documentElement.classList.toggle("is-welcome", on);
    if (!on) {
      showGuides([]);
      current = null;
      return;
    }
    decorate(doc.getElementById("preview"));
    const firstTime = !layer;
    ensureLayer();
    current = null;
    // Let the page settle before the first guide draws in.
    root.setTimeout(schedule, firstTime ? 450 : 0);
  }

  function check() {
    const editor = doc.getElementById("editor");
    if (!editor || !doc.getElementById("preview")) return;
    const value = editor.value;
    if (!value.startsWith(TITLE_LINE)) return setActive(false);
    if (welcomeText === null) {
      fetching =
        fetching ||
        root.fetch(WELCOME_URL)
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => "")
          .then((text) => {
            welcomeText = text;
            check();
          });
      return;
    }
    setActive(value === welcomeText);
  }

  doc.addEventListener("markv:render-complete", check);
  doc.addEventListener("click", (event) => {
    const button = event.target.closest && event.target.closest("[data-welcome-action]");
    if (!button) return;
    doc.dispatchEvent(
      new CustomEvent("markv:welcome-action", { detail: { action: button.dataset.welcomeAction } }),
    );
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", check);
  else check();

  return api;
});
