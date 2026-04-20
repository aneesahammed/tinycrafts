/*
 * toolbar-sync.js — Keeps the segmented View-mode pill in sync with app state.
 *
 * Why this exists:
 *   The toolbar was redesigned into a two-segment pill [ Edit · Mindmap ].
 *   With only two segments and no dedicated "Preview" segment, users need
 *   an affordance to escape Edit mode back to Preview. The legacy code
 *   gives us that for free: when you enter Edit mode it swaps the button
 *   label "Edit" → "Preview" and the pencil icon → eye icon, telling you
 *   "click me to return to preview." We intentionally preserve that
 *   action-affordance behavior — we only own the *highlight* state.
 *
 *   Responsibilities of this file:
 *     1. Drive `aria-pressed` on the Edit segment from body classes,
 *        so it looks pressed iff you are in Edit mode AND Mindmap is
 *        not currently overriding the main view.
 *     2. Drive `aria-pressed` on the Mindmap segment from
 *        `body.mindmap-open`, so it lights up whenever the mindmap
 *        overlay is active (regardless of the underlying edit/preview
 *        state, which is restored when mindmap closes).
 *
 *   We do NOT touch `modeToggleLabel` or the Edit/Preview icon swap —
 *   the legacy mode-switch code in index.html owns those and it matters
 *   for user orientation (action-semantics label on an action-semantics
 *   escape button).
 */
(function () {
  "use strict";

  function init() {
    var modeBtn = document.getElementById("modeToggleBtn");
    var mindBtn = document.getElementById("mindmapBtn");
    if (!modeBtn || !mindBtn) return;

    function sync() {
      var cls = document.body.classList;
      var mindOn = cls.contains("mindmap-open");
      // Edit segment highlights only when the app is in edit mode AND
      // mindmap is not visually taking over the main view.
      var editOn = cls.contains("edit-mode-active") && !mindOn;

      var editPressed = editOn ? "true" : "false";
      if (modeBtn.getAttribute("aria-pressed") !== editPressed) {
        modeBtn.setAttribute("aria-pressed", editPressed);
      }
      var mindPressed = mindOn ? "true" : "false";
      if (mindBtn.getAttribute("aria-pressed") !== mindPressed) {
        mindBtn.setAttribute("aria-pressed", mindPressed);
      }
    }

    // Initial assertion + observe body class changes. The legacy
    // mode-switch code writes body.edit-mode-active / preview-mode,
    // and the mindmap code writes body.mindmap-open — both flow
    // through this single observer.
    sync();
    new MutationObserver(sync).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
