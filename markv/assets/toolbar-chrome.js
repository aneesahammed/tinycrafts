/*
 * toolbar-chrome.js — The ⋯ actions menu and the calm, scroll-aware chrome.
 *
 * 1. ⋯ menu (desktop). Each item proxies a click to a real control in
 *    the toolbar's hidden .tb-stash (New, Save, Reload, Auto refresh,
 *    Export, Settings, Clear). The stash stays the single source of
 *    truth: handlers, disabled states and IDs are untouched, and at
 *    ≤640px toolbar-mobile.js teleports the same nodes into the More
 *    sheet. Items mirror their target's hidden/disabled/checked state
 *    each time the menu opens.
 *
 * 2. Scroll-aware chrome. While reading, scrolling down tucks the top
 *    bar and the reader dock away; scrolling up, reaching the end, or
 *    moving the pointer to the top/bottom edge brings them back. Never
 *    hides while something in the chrome is open or focused.
 */
(function () {
  "use strict";

  function initMenu() {
    var btn = document.getElementById("toolbarMenuBtn");
    var menu = document.getElementById("toolbarMenu");
    if (!btn || !menu) return;
    var items = Array.prototype.slice.call(menu.querySelectorAll("[data-proxy]"));
    var refreshGroup = menu.querySelector('[data-menu-group="refresh"]');
    var shortcuts = window.MarkVShortcuts;

    menu.querySelectorAll("[data-shortcut-for]").forEach(function (kbd) {
      if (!shortcuts || typeof shortcuts.describe !== "function") return;
      var mac = shortcuts.isApplePlatform && shortcuts.isApplePlatform();
      kbd.textContent = shortcuts.describe(kbd.getAttribute("data-shortcut-for"), {
        symbols: true,
        separator: mac ? "" : " ",
      });
    });

    function target(item) {
      return document.getElementById(item.getAttribute("data-proxy"));
    }

    function sync() {
      items.forEach(function (item) {
        var el = target(item);
        item.hidden = !el || el.hidden || el.style.display === "none";
        item.disabled = !el || Boolean(el.disabled);
        if (el && item.getAttribute("role") === "menuitemcheckbox") {
          item.setAttribute("aria-checked", el.checked ? "true" : "false");
        }
      });
      if (refreshGroup) {
        // Reload/Auto only matter for live files; otherwise the group
        // would be two dead rows.
        refreshGroup.hidden = !refreshGroup.querySelector("[data-proxy]:not(:disabled)");
      }
    }

    function focusable() {
      return items.filter(function (item) {
        return !item.disabled && item.offsetParent !== null;
      });
    }

    function isOpen() {
      return !menu.hidden;
    }

    function open(focusLast) {
      sync();
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onOutside, true);
      var list = focusable();
      var first = focusLast ? list[list.length - 1] : list[0];
      if (first) first.focus();
    }

    function close(restoreFocus) {
      if (!isOpen()) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onOutside, true);
      if (restoreFocus) btn.focus();
    }

    function onOutside(event) {
      if (!menu.contains(event.target) && !btn.contains(event.target)) close(false);
    }

    btn.addEventListener("click", function () {
      if (isOpen()) close(true);
      else open(false);
    });
    btn.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open(event.key === "ArrowUp");
      }
    });

    menu.addEventListener("keydown", function (event) {
      var list = focusable();
      var index = list.indexOf(document.activeElement);
      var next = null;
      if (event.key === "ArrowDown") next = list[(index + 1) % list.length];
      else if (event.key === "ArrowUp") next = list[(index - 1 + list.length) % list.length];
      else if (event.key === "Home") next = list[0];
      else if (event.key === "End") next = list[list.length - 1];
      else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      } else if (event.key === "Tab") {
        close(false);
        return;
      }
      if (next) {
        event.preventDefault();
        next.focus();
      }
    });

    menu.addEventListener("click", function (event) {
      var item = event.target.closest("[data-proxy]");
      if (!item || item.disabled) return;
      var el = target(item);
      if (!el) return;
      if (item.getAttribute("role") === "menuitemcheckbox") {
        // Toggles stay open so the new state is visible.
        el.click();
        sync();
        return;
      }
      close(true);
      el.click();
    });
  }

  function initScrollChrome() {
    var body = document.body;
    var toolbar = document.querySelector(".toolbar");
    var dock = document.getElementById("readerDock");
    if (!toolbar) return;

    var HIDE_AFTER = 160; // px scrolled before the chrome may tuck away
    var lastY = window.scrollY;
    var ticking = false;

    function chromeBusy() {
      // Keyboard focus in the chrome pins it; a mouse click that merely
      // left focus on a button does not.
      var active = document.activeElement;
      if (
        active &&
        (toolbar.contains(active) || (dock && dock.contains(active))) &&
        active.matches(":focus-visible")
      ) {
        return true;
      }
      var menu = document.getElementById("toolbarMenu");
      var reading = document.getElementById("readingPanel");
      return Boolean(
        (menu && !menu.hidden) ||
          (reading && !reading.hidden) ||
          !body.classList.contains("preview-mode") ||
          body.classList.contains("library-open") ||
          body.classList.contains("command-palette-open") ||
          body.classList.contains("mindmap-open")
      );
    }

    function setTucked(tucked) {
      if (tucked && chromeBusy()) tucked = false;
      body.classList.toggle("chrome-tucked", tucked);
    }

    function update() {
      ticking = false;
      var y = window.scrollY;
      var dy = y - lastY;
      if (Math.abs(dy) < 6) return;
      var atEnd = y >= document.documentElement.scrollHeight - window.innerHeight - 40;
      setTucked(dy > 0 && y > HIDE_AFTER && !atEnd);
      lastY = y;
    }

    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true }
    );

    // Reaching for the chrome brings it back without scrolling.
    window.addEventListener(
      "pointermove",
      function (event) {
        if (!body.classList.contains("chrome-tucked")) return;
        if (event.clientY < 64 || event.clientY > window.innerHeight - 96) {
          setTucked(false);
        }
      },
      { passive: true }
    );
    document.addEventListener("focusin", function () {
      if (body.classList.contains("chrome-tucked") && chromeBusy()) setTucked(false);
    });
    new MutationObserver(function () {
      if (body.classList.contains("chrome-tucked") && chromeBusy()) setTucked(false);
    }).observe(body, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    initMenu();
    initScrollChrome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
