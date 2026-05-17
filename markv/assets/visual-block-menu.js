(function () {
  "use strict";

  const core = window.MarkVVisualBlocks;
  if (!core) return;

  const MENU_ID = "visualBlockMenu";
  const ACTIVE_OPTION_ID = "visualBlockMenuActiveOption";
  const MIRROR_PROPS = [
    "direction",
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
    "MozTabSize",
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function initVisualBlockMenu() {
    const editor = document.getElementById("editor");
    const mainEl = document.getElementById("main");
    if (!editor || !mainEl) return;

    const menu = document.createElement("div");
    const mirror = document.createElement("div");
    let context = null;
    let commands = [];
    let activeIndex = 0;
    let suppressedSlashStart = null;
    let repositionRaf = 0;

    menu.id = MENU_ID;
    menu.className = "visual-block-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Visual Blocks");
    menu.hidden = true;

    mirror.setAttribute("aria-hidden", "true");
    mirror.className = "visual-block-caret-mirror";
    document.body.appendChild(mirror);
    document.body.appendChild(menu);

    function isEditMode() {
      return mainEl.classList.contains("edit-mode");
    }

    function isOpen() {
      return !menu.hidden;
    }

    function syncMirrorStyles() {
      const cs = window.getComputedStyle(editor);
      for (let i = 0; i < MIRROR_PROPS.length; i += 1) {
        const prop = MIRROR_PROPS[i];
        mirror.style[prop] = cs[prop];
      }
      mirror.style.width = editor.offsetWidth + "px";
      mirror.style.height = "auto";
    }

    function getCaretViewportRect(position) {
      const clampedPosition = clamp(position, 0, editor.value.length);
      syncMirrorStyles();
      mirror.textContent = editor.value.substring(0, clampedPosition);

      const marker = document.createElement("span");
      marker.textContent = "\u200b";
      mirror.appendChild(marker);

      const cs = window.getComputedStyle(editor);
      const borderTop = parseFloat(cs.borderTopWidth) || 0;
      const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
      const lineHeight =
        parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 || 20;
      const rect = editor.getBoundingClientRect();

      return {
        x: rect.left + borderLeft + marker.offsetLeft - editor.scrollLeft,
        y: rect.top + borderTop + marker.offsetTop - editor.scrollTop,
        lineHeight: lineHeight,
      };
    }

    function clearEditorMenuAria() {
      editor.removeAttribute("aria-controls");
      editor.removeAttribute("aria-expanded");
      editor.removeAttribute("aria-activedescendant");
    }

    function hideMenu(options) {
      const opts = options || {};
      if (repositionRaf) {
        cancelAnimationFrame(repositionRaf);
        repositionRaf = 0;
      }
      if (opts.suppress && context) {
        suppressedSlashStart = context.start;
      }
      menu.classList.remove("is-open");
      menu.hidden = true;
      context = null;
      commands = [];
      activeIndex = 0;
      clearEditorMenuAria();
    }

    function getCurrentMenuState() {
      return core.getVisualBlockMenuState({
        value: editor.value,
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd,
        isEditMode: isEditMode(),
      });
    }

    function shouldSuppress(nextContext) {
      return (
        typeof suppressedSlashStart === "number" &&
        nextContext &&
        nextContext.start === suppressedSlashStart
      );
    }

    function clearSuppressionIfContextChanged(nextContext) {
      if (typeof suppressedSlashStart !== "number") return;
      if (!nextContext || nextContext.start !== suppressedSlashStart) {
        suppressedSlashStart = null;
      }
    }

    function getActiveCommandId() {
      return commands[activeIndex] ? commands[activeIndex].id : "";
    }

    function renderMenu() {
      menu.textContent = "";

      if (!commands.length) {
        const empty = document.createElement("div");
        empty.className = "visual-block-menu__empty";
        empty.textContent = "No matching blocks";
        menu.appendChild(empty);
        return;
      }

      const sections = core.getVisualBlockCommandSections(
        commands,
        context ? context.query : "",
      );
      let flatIndex = 0;
      sections.forEach(function (section) {
        const heading = document.createElement("div");
        heading.className = "visual-block-menu__section";
        heading.textContent = section.title;
        menu.appendChild(heading);

        section.commands.forEach(function (command) {
          const row = document.createElement("div");
          const title = document.createElement("div");
          const desc = document.createElement("div");

          row.className = "visual-block-menu__item";
          row.setAttribute("role", "option");
          row.setAttribute(
            "aria-selected",
            flatIndex === activeIndex ? "true" : "false",
          );
          row.dataset.index = String(flatIndex);
          row.dataset.commandId = command.id;
          if (flatIndex === activeIndex) {
            row.id = ACTIVE_OPTION_ID;
          }

          title.className = "visual-block-menu__title";
          title.textContent = command.title;
          desc.className = "visual-block-menu__description";
          desc.textContent = command.description;

          row.appendChild(title);
          row.appendChild(desc);
          menu.appendChild(row);
          flatIndex += 1;
        });
      });
    }

    function positionMenu() {
      if (!context || menu.hidden) return;

      const caret = getCaretViewportRect(editor.selectionStart);
      const rect = menu.getBoundingClientRect();
      const margin = 10;
      const gap = 8;
      const maxLeft = window.innerWidth - rect.width - margin;
      let left = clamp(caret.x, margin, Math.max(margin, maxLeft));
      let top = caret.y + caret.lineHeight + gap;

      if (top + rect.height > window.innerHeight - margin) {
        top = caret.y - rect.height - gap;
      }
      top = clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin));

      menu.style.left = Math.round(left + window.scrollX) + "px";
      menu.style.top = Math.round(top + window.scrollY) + "px";
    }

    function schedulePosition() {
      if (repositionRaf) cancelAnimationFrame(repositionRaf);
      repositionRaf = requestAnimationFrame(function () {
        repositionRaf = 0;
        positionMenu();
      });
    }

    function showOrUpdateMenu() {
      const previousCommandId = getActiveCommandId();
      const nextState = getCurrentMenuState();
      clearSuppressionIfContextChanged(nextState.context);

      if (!nextState.open || !nextState.context || shouldSuppress(nextState.context)) {
        hideMenu();
        return;
      }

      context = nextState.context;
      commands = nextState.commands;
      activeIndex = Math.max(
        0,
        commands.findIndex(function (command) {
          return command.id === previousCommandId;
        }),
      );
      if (activeIndex >= commands.length) activeIndex = 0;

      renderMenu();
      menu.hidden = false;
      menu.classList.add("is-open");
      editor.setAttribute("aria-controls", MENU_ID);
      editor.setAttribute("aria-expanded", "true");
      if (commands.length) {
        editor.setAttribute("aria-activedescendant", ACTIVE_OPTION_ID);
      } else {
        editor.removeAttribute("aria-activedescendant");
      }
      schedulePosition();
    }

    function setActiveIndex(nextIndex) {
      if (!commands.length) return;
      activeIndex = clamp(nextIndex, 0, commands.length - 1);
      renderMenu();
      schedulePosition();

      const activeEl = menu.querySelector('[aria-selected="true"]');
      if (activeEl && typeof activeEl.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }

    function replaceEditorRange(start, end, replacement, selectionStart, selectionEnd) {
      const expected =
        editor.value.slice(0, start) + replacement + editor.value.slice(end);
      let ok = false;

      editor.focus();
      editor.setSelectionRange(start, end);
      try {
        ok = document.execCommand("insertText", false, replacement);
      } catch (_error) {
        ok = false;
      }

      if (!ok || editor.value !== expected) {
        editor.setRangeText(replacement, start, end, "end");
      }

      editor.setSelectionRange(selectionStart, selectionEnd);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("select", { bubbles: true }));
    }

    function insertCommand(command) {
      if (!command || !context) return;
      const insertion = core.createVisualBlockInsertion(
        editor.value,
        context.start,
        context.end,
        command,
      );

      const start = context.start;
      const end = context.end;
      hideMenu();
      replaceEditorRange(
        start,
        end,
        insertion.replacement,
        insertion.selectionStart,
        insertion.selectionEnd,
      );
    }

    editor.addEventListener("input", showOrUpdateMenu);
    editor.addEventListener("click", showOrUpdateMenu);
    editor.addEventListener("select", showOrUpdateMenu);
    editor.addEventListener("keyup", function (event) {
      if (event.key === "Escape") return;
      showOrUpdateMenu();
    });

    editor.addEventListener("keydown", function (event) {
      if (!isOpen()) return;
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Enter" &&
        event.key !== "Escape"
      ) {
        return;
      }

      const next = core.reduceVisualBlockMenuKey(
        { open: true, activeIndex: activeIndex },
        event.key,
        commands.length,
      );

      event.preventDefault();
      event.stopPropagation();

      if (next.action === "close") {
        hideMenu({ suppress: true });
        return;
      }

      if (next.action === "navigate") {
        setActiveIndex(next.activeIndex);
        return;
      }

      if (next.action === "insert") {
        insertCommand(commands[activeIndex]);
      }
    });

    menu.addEventListener("mousedown", function (event) {
      const item = event.target.closest(".visual-block-menu__item");
      if (!item) return;
      event.preventDefault();
      const index = Number(item.dataset.index);
      if (!Number.isFinite(index) || !commands[index]) return;
      activeIndex = index;
      insertCommand(commands[index]);
    });

    menu.addEventListener("mouseover", function (event) {
      const item = event.target.closest(".visual-block-menu__item");
      if (!item) return;
      const index = Number(item.dataset.index);
      if (!Number.isFinite(index) || index === activeIndex) return;
      setActiveIndex(index);
    });

    document.addEventListener("selectionchange", function () {
      if (document.activeElement === editor) {
        showOrUpdateMenu();
      }
    });

    document.addEventListener("mousedown", function (event) {
      if (event.target === editor || menu.contains(event.target)) return;
      hideMenu();
    });

    editor.addEventListener("blur", function () {
      window.setTimeout(function () {
        if (menu.contains(document.activeElement)) return;
        hideMenu();
      }, 80);
    });

    window.addEventListener(
      "scroll",
      function () {
        if (isOpen()) schedulePosition();
      },
      { passive: true },
    );
    window.addEventListener("resize", function () {
      if (isOpen()) schedulePosition();
    });

    new MutationObserver(function () {
      if (!isEditMode()) hideMenu();
    }).observe(mainEl, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initVisualBlockMenu, {
      once: true,
    });
  } else {
    initVisualBlockMenu();
  }
})();
