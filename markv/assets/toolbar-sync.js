/*
 * toolbar-sync.js — Keeps the Read/Split/Edit segment and Mindmap button in sync
 * with app state.
 *
 * Why this exists:
 *   The toolbar shows a segmented control [ Read · Split · Edit ]. The
 *   clicks live with the mode code in index.html; Split is edit mode with
 *   the preview kept visible (body.split-mode-active).
 *
 *   Responsibilities of this file:
 *     1. Drive `aria-pressed` on all three from body classes, so the
 *        segment reflects edit mode unless Mindmap is overriding the main
 *        view.
 *     2. Drive `aria-pressed` on the Mindmap button from
 *        `body.mindmap-open`, so it lights up whenever the mindmap overlay
 *        is active (regardless of the underlying edit/preview state, which
 *        is restored when mindmap closes).
 */
(function () {
  "use strict";

  function init() {
    var modeBtn = document.getElementById("modeToggleBtn");
    var readBtn = document.getElementById("readModeBtn");
    var splitBtn = document.getElementById("splitModeBtn");
    var mindBtn = document.getElementById("mindmapBtn");
    if (!modeBtn || !mindBtn) return;

    function setPressed(btn, on) {
      if (!btn) return;
      var value = on ? "true" : "false";
      if (btn.getAttribute("aria-pressed") !== value) {
        btn.setAttribute("aria-pressed", value);
      }
    }

    function sync() {
      var cls = document.body.classList;
      var mindOn = cls.contains("mindmap-open");
      // Edit segment highlights only when the app is in edit mode AND
      // mindmap is not visually taking over the main view.
      var editOn = cls.contains("edit-mode-active") && !mindOn;
      var splitOn = editOn && cls.contains("split-mode-active");
      setPressed(modeBtn, editOn && !splitOn);
      setPressed(splitBtn, splitOn);
      setPressed(readBtn, !editOn && !mindOn);
      setPressed(mindBtn, mindOn);
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
