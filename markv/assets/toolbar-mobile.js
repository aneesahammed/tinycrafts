/*
 * toolbar-mobile.js — Responsive overflow for the MarkV toolbar.
 *
 * Why this exists:
 *   At ≤640px the toolbar shrinks to a primary row of brand +
 *   Library + Edit/Preview + a "⋯ More" button. The remaining
 *   controls — File ops (Open, Save), View prefs (Reading, Theme,
 *   Insights), Refresh (Reload, Auto), Mindmap/Share/Settings, Clear
 *   — are physically TELEPORTED into a bottom sheet that slides up
 *   from the More button.
 *
 *   We move the actual DOM nodes (rather than rendering proxy
 *   buttons) so there is exactly ONE source of truth: existing
 *   click handlers, IDs, ARIA, disabled states, and toggle state-
 *   syncs all keep working unchanged. toolbar-sync.js queries by
 *   ID, not by parent, so it is unaffected.
 *
 * Responsibilities:
 *   1. On a matchMedia('(max-width: 640px)') match, move every
 *      [data-mv-overflow-section] element from the toolbar into
 *      the sheet, grouped by section name and ordered by
 *      SECTION_ORDER.
 *   2. On widen, return each tracked element to its original
 *      parent + nextSibling.
 *   3. Sheet open/close: button click, Esc, backdrop tap.
 *   4. Body scroll lock + lightweight focus trap while open.
 *   5. Return focus to the More button on close.
 */
(function () {
  "use strict";

  var NARROW_QUERY = "(max-width: 640px)";
  var SECTION_ATTR = "data-mv-overflow-section";
  // Order in which sections appear inside the sheet. Sections with
  // zero matching elements at runtime are skipped. The order
  // mirrors the desktop toolbar grouping so users carry one mental
  // model across viewports.
  var SECTION_ORDER = ["File", "View", "Live", "Explore", "Manage"];
  var FOCUSABLE =
    'button:not([disabled]),[href],input:not([disabled]),' +
    'select:not([disabled]),textarea:not([disabled]),' +
    '[tabindex]:not([tabindex="-1"])';

  // origins maps each tracked element to {parent, nextSibling, section}
  // so we can put it back exactly where it came from on widen.
  var origins = new WeakMap();

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function init() {
    var toolbar = document.querySelector(".toolbar");
    var moreBtn = document.getElementById("mvMoreBtn");
    var sheet = document.getElementById("mvMoreSheet");
    var backdrop = document.getElementById("mvMoreBackdrop");
    var sheetBody = document.getElementById("mvMoreSheetBody");
    var closeBtn = document.getElementById("mvMoreCloseBtn");
    if (
      !toolbar ||
      !moreBtn ||
      !sheet ||
      !backdrop ||
      !sheetBody ||
      !closeBtn
    ) {
      return;
    }

    var mq = window.matchMedia(NARROW_QUERY);
    var movables = Array.prototype.slice.call(
      toolbar.querySelectorAll("[" + SECTION_ATTR + "]")
    );

    // Snapshot each movable's origin in document order so restore
    // is deterministic regardless of how/when teleport ran.
    movables.forEach(function (el) {
      origins.set(el, {
        parent: el.parentNode,
        nextSibling: el.nextSibling,
        section: el.getAttribute(SECTION_ATTR),
      });
    });

    function teleport() {
      // Build a fresh sheet body so section order is guaranteed
      // even if the function is called more than once.
      clearChildren(sheetBody);
      var byName = Object.create(null);

      movables.forEach(function (el) {
        var name = origins.get(el).section;
        var slot = byName[name];
        if (!slot) {
          var sec = document.createElement("section");
          sec.className = "mv-more-section";
          sec.setAttribute("data-mv-section", name);
          var label = document.createElement("span");
          label.className = "mv-more-section__label";
          label.textContent = name;
          var row = document.createElement("div");
          row.className = "mv-more-section__row";
          sec.appendChild(label);
          sec.appendChild(row);
          slot = { node: sec, row: row };
          byName[name] = slot;
        }
        slot.row.appendChild(el);
      });

      SECTION_ORDER.forEach(function (name) {
        if (byName[name]) sheetBody.appendChild(byName[name].node);
      });
    }

    function restore() {
      movables.forEach(function (el) {
        var origin = origins.get(el);
        if (!origin) return;
        var ns = origin.nextSibling;
        if (ns && ns.parentNode === origin.parent) {
          origin.parent.insertBefore(el, ns);
        } else {
          origin.parent.appendChild(el);
        }
      });
      clearChildren(sheetBody);
    }

    function applyLayout() {
      var firstMovable = movables[0];
      if (!firstMovable) return;
      if (mq.matches) {
        // Idempotent: only teleport if the first movable is still
        // sitting in the toolbar.
        if (toolbar.contains(firstMovable)) teleport();
      } else {
        if (sheetBody.contains(firstMovable)) restore();
        if (sheet.classList.contains("is-open"))
          closeSheet({ noFocus: true });
      }
    }

    // ── Sheet open/close ────────────────────────────────────────
    var lastFocus = null;
    var transitionTimer = null;

    function openSheet() {
      if (sheet.classList.contains("is-open")) return;
      lastFocus = document.activeElement;
      sheet.hidden = false;
      backdrop.hidden = false;
      // Force a reflow so the transition runs from translateY(100%)
      // to 0 instead of jumping to the final state.
      void sheet.offsetWidth;
      sheet.classList.add("is-open");
      backdrop.classList.add("is-open");
      sheet.setAttribute("aria-hidden", "false");
      backdrop.setAttribute("aria-hidden", "false");
      moreBtn.setAttribute("aria-expanded", "true");
      document.body.classList.add("mv-more-open");
      document.addEventListener("keydown", onKeyDown);
      // Focus the close button — least-destructive entry point.
      requestAnimationFrame(function () {
        try { closeBtn.focus(); } catch (_) {}
      });
    }

    function closeSheet(opts) {
      if (!sheet.classList.contains("is-open")) return;
      opts = opts || {};
      var focusTarget =
        !opts.noFocus
          ? lastFocus && typeof lastFocus.focus === "function"
            ? lastFocus
            : moreBtn
          : null;
      if (focusTarget && sheet.contains(focusTarget)) {
        focusTarget = moreBtn;
      }
      if (sheet.contains(document.activeElement)) {
        if (focusTarget) {
          try { focusTarget.focus(); } catch (_) {}
        } else if (document.activeElement && document.activeElement.blur) {
          try { document.activeElement.blur(); } catch (_) {}
        }
      }
      sheet.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      moreBtn.setAttribute("aria-expanded", "false");
      backdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("mv-more-open");
      document.removeEventListener("keydown", onKeyDown);

      // Hide via [hidden] only after the slide-down completes so
      // the animation is visible. Fallback timeout covers
      // reduced-motion (no transitionend fires).
      var done = function () {
        if (sheet.classList.contains("is-open")) return; // re-opened
        if (sheet.contains(document.activeElement)) {
          try { document.activeElement.blur(); } catch (_) {}
        }
        sheet.setAttribute("aria-hidden", "true");
        sheet.hidden = true;
        backdrop.hidden = true;
        sheet.removeEventListener("transitionend", done);
        if (transitionTimer) {
          clearTimeout(transitionTimer);
          transitionTimer = null;
        }
      };
      sheet.addEventListener("transitionend", done);
      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = setTimeout(done, 360);
    }

    function onKeyDown(e) {
      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key === "Tab" || e.keyCode === 9) {
        var nodes = sheet.querySelectorAll(FOCUSABLE);
        if (!nodes.length) return;
        var first = nodes[0];
        var last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // ── Wire events ─────────────────────────────────────────────
    moreBtn.addEventListener("click", openSheet);
    closeBtn.addEventListener("click", function () { closeSheet(); });
    backdrop.addEventListener("click", function () { closeSheet(); });

    // Most actions inside the sheet imply "I'm done with the menu"
    // (Open, Save, Reload, Mindmap, Share, Settings, Clear, Reading,
    // Theme, Insights). Auto-refresh is a checkbox label — we let
    // the user toggle without dismissing. The reading preset radios
    // are only visible inside the Reading panel which opens on top
    // of the sheet, so they aren't reachable here.
    sheetBody.addEventListener("click", function (e) {
      var target = e.target;
      if (!target || !target.closest) return;
      if (target.closest(".auto-refresh")) return;
      var btn = target.closest(".btn");
      if (!btn) return;
      // Defer one tick so the button's own handler fires first
      // (e.g. ontologyToggleBtn opens its panel before we close).
      setTimeout(function () { closeSheet(); }, 0);
    });

    // Apply current layout, then react to width changes.
    applyLayout();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", applyLayout);
    } else if (typeof mq.addListener === "function") {
      // Older Safari fallback.
      mq.addListener(applyLayout);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
