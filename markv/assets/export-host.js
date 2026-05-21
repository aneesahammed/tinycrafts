(function () {
  "use strict";

  function getCore() {
    return window.MarkVExportCore || null;
  }

  // Split-button last-used-format memory. Persisted across sessions so
  // the main button's default action matches the user's habit.
  const FORMAT_STORAGE_KEY = "markv-export-last-format";
  function getLastFormat() {
    try {
      const v =
        window.localStorage &&
        window.localStorage.getItem(FORMAT_STORAGE_KEY);
      return v === "md" ? "md" : "pdf";
    } catch (_error) {
      return "pdf";
    }
  }
  function setLastFormat(format) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(FORMAT_STORAGE_KEY, format);
      }
    } catch (_error) {
      /* storage unavailable — non-fatal */
    }
  }

  function focusSafely(element, options) {
    if (!element || typeof element.focus !== "function") return;
    try {
      element.focus(options || { preventScroll: true });
    } catch (_error) {
      element.focus();
    }
  }

  function raf() {
    return new Promise(function (resolve) {
      if (typeof window.requestAnimationFrame !== "function") {
        window.setTimeout(resolve, 0);
        return;
      }
      window.requestAnimationFrame(resolve);
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  async function waitForNextPaint() {
    await raf();
    await raf();
  }

  function setStatus(env, message, options) {
    if (env && typeof env.setStatus === "function") {
      env.setStatus(message, options || {});
    }
  }

  function getMarkdown(env) {
    return env.els && env.els.editor ? env.els.editor.value || "" : "";
  }

  function hasMarkdown(env) {
    const core = getCore();
    const markdown = getMarkdown(env);
    return core ? !core.isBlankMarkdown(markdown) : Boolean(markdown.trim());
  }

  function getBaseName(env) {
    const core = getCore();
    if (!core) return "untitled";
    return core.deriveExportBaseName({
      currentName: env.state && env.state.currentName,
      markdown: getMarkdown(env),
    });
  }

  function setElementDisabled(element, disabled) {
    if (!element) return;
    element.disabled = Boolean(disabled);
    element.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function setPanelHidden(host, hidden) {
    // aria-expanded lives on the caret now (it's the menu trigger),
    // not the main button (which directly executes the last format).
    const panel = host.elements.panel;
    const caret = host.elements.caret;
    if (!panel) return;
    panel.hidden = hidden;
    if (caret) caret.setAttribute("aria-expanded", hidden ? "false" : "true");
  }

  function queryElements() {
    return {
      button: document.getElementById("exportBtn"),
      label: document.getElementById("exportLabel"),
      caret: document.getElementById("exportCaretBtn"),
      panel: document.getElementById("exportMenu"),
      pdfButton: document.getElementById("exportPdfBtn"),
      markdownButton: document.getElementById("exportMarkdownBtn"),
    };
  }

  function captureRestoreState(env) {
    const editor = env.els && env.els.editor;
    const previewPane = env.els && env.els.previewPane;
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return {
      wasEditMode:
        typeof env.isEditModeActive === "function" && env.isEditModeActive(),
      focused,
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
      previewScrollTop: previewPane ? previewPane.scrollTop : 0,
      previewScrollLeft: previewPane ? previewPane.scrollLeft : 0,
      editorSelectionStart: editor ? editor.selectionStart : 0,
      editorSelectionEnd: editor ? editor.selectionEnd : 0,
      editorScrollTop: editor ? editor.scrollTop : 0,
      title: document.title,
    };
  }

  async function restoreState(env, snapshot) {
    if (!snapshot) return;
    if (
      snapshot.wasEditMode &&
      typeof env.setMode === "function" &&
      !(typeof env.isEditModeActive === "function" && env.isEditModeActive())
    ) {
      env.setMode("edit");
      await waitForNextPaint();
    }

    const editor = env.els && env.els.editor;
    if (snapshot.wasEditMode && editor) {
      try {
        editor.setSelectionRange(
          snapshot.editorSelectionStart,
          snapshot.editorSelectionEnd,
        );
      } catch (_error) {}
      editor.scrollTop = snapshot.editorScrollTop;
    }

    const previewPane = env.els && env.els.previewPane;
    if (previewPane) {
      previewPane.scrollTop = snapshot.previewScrollTop;
      previewPane.scrollLeft = snapshot.previewScrollLeft;
    }
    window.scrollTo(snapshot.scrollX, snapshot.scrollY);
    focusSafely(snapshot.focused);
  }

  async function waitForMermaid(env) {
    const core = getCore();
    const root = env.els && env.els.preview;
    if (!core || !root) return;
    const timeoutAt = Date.now() + core.MERMAID_READY_TIMEOUT_MS;
    let lastMessage = "";

    while (Date.now() < timeoutAt) {
      const state = core.getMermaidReadiness(root);
      if (!state.pending) return;
      const message =
        "Preparing diagrams... " + state.ready + " of " + state.total;
      if (message !== lastMessage) {
        setStatus(env, message, { announce: false });
        lastMessage = message;
      }
      await wait(120);
    }
  }

  async function waitForImages(env) {
    const core = getCore();
    const root = env.els && env.els.preview;
    if (!core || !root) return;
    const timeoutAt = Date.now() + core.IMAGE_READY_TIMEOUT_MS;
    while (Date.now() < timeoutAt) {
      const state = core.getImageReadiness(root);
      if (!state.pending) return;
      await wait(100);
    }
  }

  async function preparePreview(env) {
    if (
      typeof env.isEditModeActive === "function" &&
      env.isEditModeActive() &&
      typeof env.setMode === "function"
    ) {
      env.setMode("preview");
    }
    if (typeof env.renderCurrentPreview === "function") {
      env.renderCurrentPreview();
    }
    await waitForNextPaint();
    if (typeof env.renderMermaidForExport === "function") {
      await env.renderMermaidForExport();
    }
    await waitForMermaid(env);
    await waitForImages(env);
    await waitForNextPaint();
  }

  function replaceBrokenImages(sourceRoot, cloneRoot) {
    if (!sourceRoot || !cloneRoot) return;
    const sourceImages = Array.from(sourceRoot.querySelectorAll("img"));
    const cloneImages = Array.from(cloneRoot.querySelectorAll("img"));
    sourceImages.forEach(function (image, index) {
      if (!image.complete || image.naturalWidth !== 0) return;
      const clone = cloneImages[index];
      if (!clone || !clone.parentNode) return;
      const fallback = document.createElement("figure");
      fallback.className = "export-image-fallback";
      const caption = document.createElement("figcaption");
      caption.textContent =
        (image.getAttribute("alt") || "Image") +
        " could not be loaded for export.";
      fallback.appendChild(caption);
      const src = image.getAttribute("src");
      if (src) {
        const code = document.createElement("code");
        code.textContent = src;
        fallback.appendChild(code);
      }
      clone.parentNode.replaceChild(fallback, clone);
    });
  }

  function createPrintRoot(env, baseName) {
    const core = getCore();
    const existing = document.getElementById("markvExportPrintRoot");
    if (existing) existing.remove();

    const source = env.els && env.els.preview;
    const root = document.createElement("section");
    root.id = "markvExportPrintRoot";
    root.className = "export-print-root";
    root.setAttribute("aria-label", "Exported document");
    root.dataset.exportFileName = baseName;

    const article = document.createElement("article");
    article.className = "markdown-body export-print-document";
    article.innerHTML = source ? source.innerHTML : "";
    article.querySelectorAll("[id]").forEach(function (element) {
      if (element.closest("svg")) return;
      element.removeAttribute("id");
    });
    article.querySelectorAll(".mermaid-inline-action").forEach(function (button) {
      button.remove();
    });
    root.appendChild(article);

    replaceBrokenImages(source, article);
    if (core) core.markTimedOutMermaidBlocks(article);

    document.body.appendChild(root);
    return root;
  }

  function removePrintRoot() {
    const root = document.getElementById("markvExportPrintRoot");
    if (root) root.remove();
  }

  function createDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  window.MarkVExportHostFactory = function createExportHost(env) {
    const source = env || {};
    const host = {
      elements: queryElements(),
      busy: false,
      cleanupTimer: 0,
      fallbackTimer: 0,
      hardTimer: 0,
    };

    function setBusy(value) {
      host.busy = Boolean(value);
      if (source.state) source.state.exportInFlight = host.busy;
      syncUi();
    }

    function syncUi() {
      host.elements = queryElements();
      const disabled = host.busy || !hasMarkdown(source);
      setElementDisabled(host.elements.button, disabled);
      setElementDisabled(host.elements.caret, disabled);
      setElementDisabled(host.elements.pdfButton, disabled);
      setElementDisabled(host.elements.markdownButton, disabled);
      [
        host.elements.button,
        host.elements.caret,
        host.elements.pdfButton,
        host.elements.markdownButton,
      ]
        .filter(Boolean)
        .forEach(function (element) {
          element.classList.toggle("is-busy", host.busy);
          element.setAttribute("aria-busy", host.busy ? "true" : "false");
        });

      // Reflect the last-used format in the main label, mark the active
      // row inside the menu, and update the tooltip accordingly.
      const fmt = getLastFormat();
      const isMd = fmt === "md";
      if (host.elements.label) {
        host.elements.label.textContent = isMd ? "Export MD" : "Export PDF";
      }
      if (host.elements.pdfButton) {
        host.elements.pdfButton.classList.toggle("is-active", !isMd);
      }
      if (host.elements.markdownButton) {
        host.elements.markdownButton.classList.toggle("is-active", isMd);
      }
      if (host.elements.button) {
        host.elements.button.title = host.busy
          ? "An export is already being prepared"
          : hasMarkdown(source)
            ? isMd
              ? "Export as Markdown"
              : "Export as PDF"
            : "Add markdown content before exporting";
      }
    }

    function showPanel() {
      syncUi();
      const trigger = host.elements.caret || host.elements.button;
      if (!host.elements.panel || !trigger || trigger.disabled) return;
      setPanelHidden(host, false);
      window.requestAnimationFrame(function () {
        focusSafely(host.elements.pdfButton);
      });
    }

    function hidePanel(options) {
      options = options || {};
      const panel = host.elements.panel;
      if (
        panel &&
        panel.contains(document.activeElement) &&
        document.activeElement &&
        typeof document.activeElement.blur === "function"
      ) {
        document.activeElement.blur();
      }
      setPanelHidden(host, true);
      if (options.restoreFocus !== false) {
        // Caret is the menu trigger — focus returns there.
        focusSafely(host.elements.caret || host.elements.button);
      }
    }

    function togglePanel() {
      const trigger = host.elements.caret || host.elements.button;
      if (!host.elements.panel || !trigger || trigger.disabled) return;
      if (host.elements.panel.hidden) showPanel();
      else hidePanel({ restoreFocus: true });
    }

    async function exportMarkdown() {
      const core = getCore();
      if (!core) return false;
      if (host.busy) {
        setStatus(source, "Export is already in progress.", { announce: true });
        return false;
      }
      const markdown = getMarkdown(source);
      if (core.isBlankMarkdown(markdown)) {
        setStatus(source, "Add markdown content before exporting.", {
          announce: true,
        });
        return false;
      }
      const filename = core.withExtension(getBaseName(source), ".md");
      createDownload(
        filename,
        new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      );
      hidePanel({ restoreFocus: true });
      setStatus(source, "Markdown export downloaded.", { announce: true });
      return true;
    }

    async function exportPdf() {
      const core = getCore();
      if (!core) return false;
      if (host.busy) {
        setStatus(source, "Export is already in progress.", { announce: true });
        return false;
      }
      const markdown = getMarkdown(source);
      if (core.isBlankMarkdown(markdown)) {
        setStatus(source, "Add markdown content before exporting.", {
          announce: true,
        });
        return false;
      }

      const restore = captureRestoreState(source);
      const baseName = getBaseName(source);
      let cleaned = false;

      function cleanup(options) {
        options = options || {};
        if (cleaned) return;
        cleaned = true;
        window.clearTimeout(host.cleanupTimer);
        window.clearTimeout(host.fallbackTimer);
        window.clearTimeout(host.hardTimer);
        window.removeEventListener("afterprint", cleanup);
        window.removeEventListener("focus", scheduleFallbackCleanup);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        document.body.classList.remove("export-pdf-active");
        removePrintRoot();
        document.title = restore.title;
        restoreState(source, restore).finally(function () {
          setBusy(false);
          if (options.status !== false) {
            setStatus(source, "Export finished.", { announce: false });
          }
        });
      }

      function scheduleFallbackCleanup() {
        window.clearTimeout(host.fallbackTimer);
        host.fallbackTimer = window.setTimeout(
          cleanup,
          core.PRINT_DIALOG_FALLBACK_MS,
        );
      }

      function onVisibilityChange() {
        if (document.visibilityState === "visible") scheduleFallbackCleanup();
      }

      try {
        hidePanel({ restoreFocus: true });
        setBusy(true);
        setStatus(source, "Preparing PDF export...", { announce: true });
        await preparePreview(source);
        createPrintRoot(source, baseName);
        document.title = baseName;
        document.body.classList.add("export-pdf-active");
        await waitForNextPaint();

        window.addEventListener("afterprint", cleanup, { once: true });
        window.addEventListener("focus", scheduleFallbackCleanup);
        document.addEventListener("visibilitychange", onVisibilityChange);
        host.hardTimer = window.setTimeout(cleanup, core.PRINT_HARD_WATCHDOG_MS);
        setStatus(source, core.getPlatformPrintMessage(window.navigator), {
          announce: true,
        });

        if (typeof window.print !== "function") {
          throw new Error("This browser does not expose window.print().");
        }
        window.print();
        scheduleFallbackCleanup();
        return true;
      } catch (error) {
        cleanup({ status: false });
        setStatus(
          source,
          "PDF export failed: " +
            (error && error.message ? error.message : String(error)),
          { announce: true, kind: "error" },
        );
        return false;
      }
    }

    function wireEvents() {
      syncUi();

      // Main button → directly run the last-used format (no menu).
      if (host.elements.button) {
        host.elements.button.addEventListener("click", function () {
          if (getLastFormat() === "md") exportMarkdown();
          else exportPdf();
        });
      }

      // Caret → toggles the format picker menu.
      if (host.elements.caret) {
        host.elements.caret.addEventListener("click", togglePanel);
      }

      // Menu items → run AND remember as the new default for next time.
      if (host.elements.pdfButton) {
        host.elements.pdfButton.addEventListener("click", function () {
          setLastFormat("pdf");
          syncUi();
          exportPdf();
        });
      }
      if (host.elements.markdownButton) {
        host.elements.markdownButton.addEventListener("click", function () {
          setLastFormat("md");
          syncUi();
          exportMarkdown();
        });
      }

      // Click outside (not on main, not on caret, not in panel) → close.
      document.addEventListener("click", function (event) {
        const panel = host.elements.panel;
        const button = host.elements.button;
        const caret = host.elements.caret;
        if (!panel || panel.hidden) return;
        if (panel.contains(event.target)) return;
        if (button && button.contains(event.target)) return;
        if (caret && caret.contains(event.target)) return;
        hidePanel({ restoreFocus: false });
      });

      document.addEventListener("keydown", function (event) {
        const panel = host.elements.panel;
        if (!panel || panel.hidden || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        hidePanel({ restoreFocus: true });
      });
    }

    wireEvents();

    return {
      exportMarkdown,
      exportPdf,
      hidePanel,
      isBusy: function () {
        return host.busy;
      },
      syncUi,
      togglePanel,
    };
  };
})();
