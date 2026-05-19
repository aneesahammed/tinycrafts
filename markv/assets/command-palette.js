(function () {
  "use strict";

  const core = window.MarkVCommandPaletteCore;
  if (!core) return;
  const shortcuts = window.MarkVShortcuts || null;

  const DIALOG_ID = "commandPaletteDialog";
  const INPUT_ID = "commandPaletteInput";
  const LIST_ID = "commandPaletteList";
  const ACTIVE_ID = "commandPaletteActive";
  const RESULT_LIMIT = 80;

  let dialog = null;
  let input = null;
  let list = null;
  let meta = null;
  let empty = null;
  let openButton = null;
  let initialized = false;
  let isOpen = false;
  let isExecuting = false;
  let pendingOpen = false;
  let previousFocus = null;
  let allItems = [];
  let results = [];
  let activeIndex = -1;

  function getHost() {
    return window.MarkVCommandPaletteHost || null;
  }

  function isCompositionEvent(event) {
    return Boolean(event && (event.isComposing || event.keyCode === 229));
  }

  function createIconSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "11");
    circle.setAttribute("cy", "11");
    circle.setAttribute("r", "6.5");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m16 16 4 4");
    svg.append(circle, path);
    return svg;
  }

  function ensureButtonIcon() {
    openButton = document.getElementById("commandPaletteBtn");
    if (!openButton || openButton.dataset.paletteReady === "true") return;
    const existingIcon = openButton.querySelector(".command-palette-btn-icon");
    if (!existingIcon) {
      const icon = document.createElement("span");
      icon.className = "command-palette-btn-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.appendChild(createIconSvg());
      openButton.insertBefore(icon, openButton.firstChild);
    }
    openButton.dataset.paletteReady = "true";
  }

  function ensureShortcutHintTrigger() {
    const hint = document.getElementById("paletteShortcutHint");
    if (!hint || hint.dataset.paletteReady === "true") return;
    const label =
      shortcuts && typeof shortcuts.describe === "function"
        ? shortcuts.describe("global.search", {
            symbols: true,
            separator:
              shortcuts.isApplePlatform && shortcuts.isApplePlatform() ? "" : " ",
          })
        : "Ctrl K";
    hint.textContent = label;
    hint.setAttribute(
      "aria-label",
      "Open command palette (" +
        (shortcuts && typeof shortcuts.describe === "function"
          ? shortcuts.describe("global.search")
          : "Ctrl+K") +
        ")",
    );
    hint.addEventListener("click", function () {
      openPalette("hint");
    });
    hint.dataset.paletteReady = "true";
  }

  function buildDialog() {
    const overlay = document.createElement("div");
    overlay.id = DIALOG_ID;
    overlay.className = "command-palette";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "commandPaletteTitle");

    const panel = document.createElement("div");
    panel.className = "command-palette__panel";

    const title = document.createElement("h2");
    title.id = "commandPaletteTitle";
    title.className = "visually-hidden";
    title.textContent = "Search files and commands";

    const search = document.createElement("div");
    search.className = "command-palette__search";
    const searchIcon = document.createElement("span");
    searchIcon.className = "command-palette__search-icon";
    searchIcon.appendChild(createIconSvg());
    input = document.createElement("input");
    input.id = INPUT_ID;
    input.className = "command-palette__input";
    input.type = "search";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "Search files and commands";
    input.setAttribute("aria-label", "Search files and commands");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-controls", LIST_ID);
    input.setAttribute("aria-expanded", "true");
    search.append(searchIcon, input);

    meta = document.createElement("div");
    meta.className = "command-palette__meta";

    list = document.createElement("div");
    list.id = LIST_ID;
    list.className = "command-palette__list";
    list.setAttribute("role", "listbox");

    empty = document.createElement("div");
    empty.className = "command-palette__empty";
    empty.hidden = true;

    panel.append(title, search, meta, list, empty);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    dialog = overlay;
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    buildDialog();
    ensureButtonIcon();
    ensureShortcutHintTrigger();
    if (shortcuts && typeof shortcuts.applyTitles === "function") {
      shortcuts.applyTitles(document);
    }

    if (openButton) {
      openButton.addEventListener("click", function () {
        openPalette("button");
      });
    }

    input.addEventListener("input", function () {
      activeIndex = 0;
      renderResults();
    });

    dialog.addEventListener("keydown", onDialogKeydown, true);
    dialog.addEventListener("mousedown", function (event) {
      if (event.target === dialog) {
        event.preventDefault();
        closePalette({ restoreFocus: true });
      }
    });

    list.addEventListener("mousedown", function (event) {
      const row = event.target.closest(".command-palette__row");
      if (!row) return;
      event.preventDefault();
    });
    list.addEventListener("click", function (event) {
      const row = event.target.closest(".command-palette__row");
      if (!row) return;
      const index = Number(row.dataset.index);
      if (!Number.isFinite(index)) return;
      activeIndex = index;
      renderActiveState();
      executeActive();
    });
    list.addEventListener("mouseover", function (event) {
      const row = event.target.closest(".command-palette__row");
      if (!row) return;
      const index = Number(row.dataset.index);
      if (!Number.isFinite(index) || index === activeIndex) return;
      activeIndex = index;
      renderActiveState();
    });

    if (pendingOpen) {
      pendingOpen = false;
      openPalette("pending");
    }
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function appendHighlighted(parent, text, ranges) {
    const source = String(text || "");
    const list = Array.isArray(ranges) ? ranges : [];
    let offset = 0;
    list.forEach(function (range) {
      if (range.start > offset) {
        parent.appendChild(document.createTextNode(source.slice(offset, range.start)));
      }
      const mark = document.createElement("mark");
      mark.textContent = source.slice(range.start, range.end);
      parent.appendChild(mark);
      offset = range.end;
    });
    if (offset < source.length) {
      parent.appendChild(document.createTextNode(source.slice(offset)));
    }
  }

  function getResultLabel(type) {
    if (type === "file") return "File";
    if (type === "draft") return "Draft";
    return "Command";
  }

  function renderResultRow(result, index) {
    const item = result.item;
    const row = document.createElement("div");
    row.className = "command-palette__row";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(index === activeIndex));
    row.dataset.index = String(index);
    row.dataset.type = item.type || "command";
    if (item.disabled) row.dataset.disabled = "true";
    if (index === activeIndex) row.id = ACTIVE_ID;

    const badge = document.createElement("span");
    badge.className = "command-palette__badge";
    badge.textContent = getResultLabel(item.type);

    const text = document.createElement("span");
    text.className = "command-palette__text";
    const title = document.createElement("span");
    title.className = "command-palette__title";
    appendHighlighted(title, item.title, result.matches && result.matches.title);
    const subtitle = document.createElement("span");
    subtitle.className = "command-palette__subtitle";
    appendHighlighted(subtitle, item.subtitle || "", result.matches && result.matches.subtitle);
    text.append(title, subtitle);

    row.append(badge, text);
    if (item.shortcut) {
      const shortcut = document.createElement("span");
      shortcut.className = "command-palette__shortcut";
      shortcut.textContent = item.shortcut;
      row.appendChild(shortcut);
    }
    if (item.disabled) {
      const reason = document.createElement("span");
      reason.className = "command-palette__disabled";
      reason.textContent = item.disabledReason || "Unavailable";
      row.appendChild(reason);
    }
    return row;
  }

  function renderActiveState() {
    const rows = list.querySelectorAll(".command-palette__row");
    rows.forEach(function (row) {
      const selected = Number(row.dataset.index) === activeIndex;
      row.setAttribute("aria-selected", String(selected));
      if (selected) {
        row.id = ACTIVE_ID;
        row.scrollIntoView({ block: "nearest" });
      } else {
        row.removeAttribute("id");
      }
    });
    if (activeIndex >= 0 && results[activeIndex]) {
      input.setAttribute("aria-activedescendant", ACTIVE_ID);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function renderResults() {
    const query = input ? input.value : "";
    results = core.filterPaletteItems(allItems, query, { limit: RESULT_LIMIT });
    activeIndex = core.clampActiveIndex(activeIndex, results.length);
    clearChildren(list);

    if (!results.length) {
      list.hidden = true;
      empty.hidden = false;
      empty.textContent = query.trim()
        ? "No files or commands found"
        : "No commands available";
      meta.textContent = query.trim()
        ? "Try a filename, folder, or command"
        : "Type to search files and drafts";
      input.removeAttribute("aria-activedescendant");
      return;
    }

    list.hidden = false;
    empty.hidden = true;
    meta.textContent = query.trim()
      ? results.length + " result" + (results.length === 1 ? "" : "s")
      : "Top commands";

    let flatIndex = 0;
    core.groupPaletteResults(results).forEach(function (group) {
      const heading = document.createElement("div");
      heading.className = "command-palette__group";
      heading.textContent = group.title;
      list.appendChild(heading);
      group.results.forEach(function (result) {
        list.appendChild(renderResultRow(result, flatIndex));
        flatIndex += 1;
      });
    });
    renderActiveState();
  }

  function openPalette(source) {
    if (!initialized) {
      pendingOpen = true;
      return;
    }
    const host = getHost();
    if (!host || typeof host.getItems !== "function") {
      pendingOpen = true;
      return;
    }
    if (isOpen) {
      input.focus();
      input.select();
      return;
    }

    document.dispatchEvent(
      new CustomEvent("markv:command-palette-open", {
        detail: { source: source || "unknown" },
      }),
    );
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    allItems = host.getItems();
    input.value = "";
    activeIndex = 0;
    isOpen = true;
    dialog.hidden = false;
    dialog.classList.add("is-open");
    document.body.classList.add("command-palette-open");
    if (openButton) openButton.setAttribute("aria-expanded", "true");
    renderResults();
    requestAnimationFrame(function () {
      input.focus();
    });
  }

  function closePalette(options) {
    const opts = options || {};
    if (!isOpen) return;
    isOpen = false;
    dialog.classList.remove("is-open");
    dialog.hidden = true;
    document.body.classList.remove("command-palette-open");
    if (openButton) openButton.setAttribute("aria-expanded", "false");
    input.value = "";
    results = [];
    allItems = [];
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    clearChildren(list);
    if (opts.restoreFocus !== false) {
      const target =
        previousFocus && document.contains(previousFocus)
          ? previousFocus
          : openButton;
      if (target && typeof target.focus === "function") target.focus();
    }
    previousFocus = null;
  }

  function announceDisabled(reason) {
    const host = getHost();
    if (host && typeof host.announce === "function") {
      host.announce(reason || "This action is unavailable right now.");
    }
  }

  async function executeActive() {
    if (isExecuting) return;
    const result = results[activeIndex];
    const item = result && result.item;
    const action = core.getPaletteActionState(item);
    if (action.action === "disabled") {
      announceDisabled(action.reason);
      return;
    }
    if (action.action !== "execute" || typeof item.run !== "function") return;

    isExecuting = true;
    closePalette({ restoreFocus: false });
    try {
      await item.run();
    } catch (error) {
      console.warn("[command-palette] command failed", error);
      announceDisabled("Command failed. Try again.");
    } finally {
      isExecuting = false;
    }
  }

  function onDialogKeydown(event) {
    if (isCompositionEvent(event)) return;
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End" &&
      event.key !== "Enter" &&
      event.key !== "Escape" &&
      event.key !== "Tab"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.key === "Tab") {
      input.focus();
      return;
    }

    const next = core.reducePaletteKeyboard(
      { activeIndex: activeIndex, query: input.value },
      event.key,
      results.length,
    );

    if (next.action === "clear") {
      input.value = "";
      activeIndex = 0;
      renderResults();
      return;
    }
    if (next.action === "close") {
      closePalette({ restoreFocus: true });
      return;
    }
    if (next.action === "navigate") {
      activeIndex = next.activeIndex;
      renderActiveState();
      return;
    }
    if (next.action === "execute") {
      activeIndex = next.activeIndex;
      executeActive();
    }
  }

  document.addEventListener(
    "keydown",
    function (event) {
      if (isCompositionEvent(event)) return;
      const matchesSearch =
        shortcuts && typeof shortcuts.matches === "function"
          ? shortcuts.matches(event, "global.search")
          : (event.metaKey || event.ctrlKey) &&
            !event.shiftKey &&
            !event.altKey &&
            String(event.key || "").toLowerCase() === "k";
      if (matchesSearch) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (event.repeat && isOpen) return;
        openPalette("shortcut");
      }
    },
    true,
  );

  document.addEventListener("markv:command-palette-host-ready", function () {
    if (pendingOpen) {
      pendingOpen = false;
      openPalette("host-ready");
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
