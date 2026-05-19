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

    function getCommandIconSvg(command) {
      const id = command && command.id ? command.id : "";
      const category = command && command.category ? command.category : "";
      const commandIcons = {
        "diagram.flowchart":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3.5h7v4.5h-7z"></path><path d="M12 8v2"></path><path d="m12 10 4 3.6-4 3.6-4-3.6z"></path><path d="M8 13.6H5.5v4.8h4.2"></path><path d="M16 13.6h2.5v4.8h-4.2"></path></svg>',
        "diagram.sequence":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5v15"></path><path d="M18 4.5v15"></path><path d="M8 8h8"></path><path d="m14 6 2 2-2 2"></path><path d="M16 15.5H8"></path><path d="m10 13.5-2 2 2 2"></path></svg>',
        "diagram.class":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"></path><path d="M5 10h14"></path><path d="M8 14h5"></path><path d="M8 16.5h8"></path></svg>',
        "diagram.er":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h7v7H4z"></path><path d="M13 11h7v7h-7z"></path><path d="M4 9h7"></path><path d="M13 14h7"></path><path d="M11 10h2"></path><path d="m17 11-3.8-1"></path><path d="m17 11-3.8 1"></path></svg>',
        "diagram.state":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="7" r="3"></circle><circle cx="17" cy="17" r="3"></circle><path d="M9.4 8.9c2.6 1.1 4.6 3 5.8 5.6"></path><path d="m13.2 14.3 2.2.6.5-2.2"></path></svg>',
        "diagram.gantt":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14"></path><path d="M5 11h8"></path><path d="M9 16h10"></path><path d="M5 4v16"></path></svg>',
        "diagram.pie":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v7h7"></path><path d="M19 12a7 7 0 1 1-7-7"></path></svg>',
        "diagram.gitgraph":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6v12"></path><path d="M17 6v3a4 4 0 0 1-4 4H7"></path><circle cx="7" cy="6" r="1.6"></circle><circle cx="7" cy="18" r="1.6"></circle><circle cx="17" cy="6" r="1.6"></circle></svg>',
        "diagram.mindmap":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.4"></circle><path d="M10.1 10.7 6.5 7.5"></path><path d="m13.9 10.7 3.6-3.2"></path><path d="m10.1 13.3-3.6 3.2"></path><path d="m13.9 13.3 3.6 3.2"></path><circle cx="5" cy="6.2" r="1.8"></circle><circle cx="19" cy="6.2" r="1.8"></circle><circle cx="5" cy="17.8" r="1.8"></circle><circle cx="19" cy="17.8" r="1.8"></circle></svg>',
        "diagram.timeline":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"></path><circle cx="6" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="18" cy="12" r="1.8"></circle><path d="M6 8.5V5.5h4.5"></path><path d="M12 15.5v3h4.5"></path><path d="M18 8.5v-3h-4.5"></path></svg>',
        "diagram.quadrant":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5"></path><path d="M5 19h14"></path><path d="M12 6v12"></path><path d="M6 12h12"></path><circle cx="8.5" cy="8.5" r="1.2"></circle><circle cx="16" cy="9.5" r="1.2"></circle><circle cx="15" cy="16" r="1.2"></circle></svg>',
        "diagram.xy":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V5"></path><path d="M5 19h14"></path><path d="M8 15l3-4 3 2 4-6"></path></svg>',
        "diagram.architecture":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h4v4H6z"></path><path d="M14 6h4v4h-4z"></path><path d="M10 16h4v4h-4z"></path><path d="M8 10v2a4 4 0 0 0 4 4"></path><path d="M16 10v2a4 4 0 0 1-4 4"></path></svg>',
        "diagram.kanban":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"></path><path d="M9.7 5v14"></path><path d="M14.3 5v14"></path><path d="M7 8h1"></path><path d="M11.5 8h1"></path><path d="M16 8h1"></path></svg>',
        "diagram.sankey":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7c5 0 5 5 9 5h5"></path><path d="M5 17c5 0 5-5 9-5"></path><path d="M5 12h5"></path></svg>',
        "diagram.block":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h6v5H5z"></path><path d="M13 6h6v5h-6z"></path><path d="M5 13h14v5H5z"></path></svg>',
        "diagram.packet":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v10H5z"></path><path d="M9 7v10"></path><path d="M14 7v10"></path></svg>',
        "diagram.journey":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17c3-8 7 0 10-8"></path><path d="M15 9h4v4"></path><circle cx="5" cy="17" r="1.5"></circle><circle cx="11" cy="13" r="1.5"></circle><circle cx="19" cy="9" r="1.5"></circle></svg>',
        "diagram.requirement":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v14H6z"></path><path d="M9 9h6"></path><path d="M9 13h4"></path><path d="m8 16 1 1 2-2"></path></svg>',
        "diagram.radar":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 18 9v7l-6 3-6-3V9z"></path><path d="M12 5v14"></path><path d="M6 9l12 7"></path><path d="m18 9-12 7"></path></svg>',
        "table.basic":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"></path><path d="M5 10h14"></path><path d="M5 15h14"></path><path d="M10 5v14"></path><path d="M15 5v14"></path></svg>',
        "callout.note":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v10H9l-3 3z"></path><path d="M9 10h6"></path><path d="M9 13h4"></path></svg>',
        "code.generic":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v10H5z"></path><path d="m10 10-2 2 2 2"></path><path d="m14 10 2 2-2 2"></path></svg>',
        "checklist.basic":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 1.4 1.4L9.5 5"></path><path d="M12 7h7"></path><path d="m5 14 1.4 1.4L9.5 12"></path><path d="M12 14h7"></path></svg>',
        "divider.horizontal":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M7 8h10"></path><path d="M7 16h10"></path></svg>',
      };
      const categoryIcons = {
        Diagram:
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5h6v6h-6z"></path><path d="M13.5 13h6v6h-6z"></path><path d="M10.5 8h2c1.4 0 2.5 1.1 2.5 2.5V13"></path></svg>',
        Table:
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"></path><path d="M5 10h14"></path><path d="M5 15h14"></path><path d="M10 5v14"></path><path d="M15 5v14"></path></svg>',
        Callout:
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.5h4v7H6.5v-4.8c0-2.9 1.4-4.8 4.1-5.7"></path><path d="M15 8.5h4v7h-4.5v-4.8c0-2.9 1.4-4.8 4.1-5.7"></path></svg>',
        "Code Block":
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v10H5z"></path><path d="m10 10-2 2 2 2"></path><path d="m14 10 2 2-2 2"></path></svg>',
        Checklist:
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 1.4 1.4L9.5 5"></path><path d="M12 7h7"></path><path d="m5 14 1.4 1.4L9.5 12"></path><path d="M12 14h7"></path></svg>',
        Divider:
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M7 8h10"></path><path d="M7 16h10"></path></svg>',
      };
      return commandIcons[id] || categoryIcons[category] || categoryIcons.Diagram;
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
          const icon = document.createElement("span");
          const title = document.createElement("div");

          row.className = "visual-block-menu__item";
          row.setAttribute("role", "option");
          row.setAttribute(
            "aria-label",
            command.title + ". " + command.description,
          );
          row.setAttribute(
            "aria-selected",
            flatIndex === activeIndex ? "true" : "false",
          );
          row.dataset.index = String(flatIndex);
          row.dataset.commandId = command.id;
          if (flatIndex === activeIndex) {
            row.id = ACTIVE_OPTION_ID;
          }

          icon.className = "visual-block-menu__icon";
          icon.innerHTML = getCommandIconSvg(command);
          title.className = "visual-block-menu__title";
          title.textContent = command.title;

          row.title = command.description;
          row.appendChild(icon);
          row.appendChild(title);
          menu.appendChild(row);
          flatIndex += 1;
        });
      });
    }

    function positionMenu() {
      if (!context || menu.hidden) return;

      const caret = getCaretViewportRect(editor.selectionStart);
      const margin = 10;
      const gap = 8;
      menu.style.maxHeight = "";
      const cssMaxHeight = parseFloat(window.getComputedStyle(menu).maxHeight);
      const preferredMaxHeight = Number.isFinite(cssMaxHeight)
        ? cssMaxHeight
        : Math.min(440, window.innerHeight - margin * 2);
      const belowTop = caret.y + caret.lineHeight + gap;
      const availableBelow = Math.max(120, window.innerHeight - belowTop - margin);
      const availableAbove = Math.max(120, caret.y - gap - margin);
      const openBelow = availableBelow >= 260 || availableBelow >= availableAbove;
      const availableHeight = openBelow ? availableBelow : availableAbove;

      menu.style.maxHeight =
        Math.round(Math.min(preferredMaxHeight, availableHeight)) + "px";

      const rect = menu.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width - margin;
      let left = clamp(caret.x, margin, Math.max(margin, maxLeft));
      let top = openBelow ? belowTop : caret.y - rect.height - gap;

      if (openBelow && top + rect.height > window.innerHeight - margin) {
        top = caret.y - rect.height - gap;
      }
      top = clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin));

      menu.style.left = Math.round(left) + "px";
      menu.style.top = Math.round(top) + "px";
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
    document.addEventListener("markv:command-palette-open", function () {
      hideMenu({ suppress: true });
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
