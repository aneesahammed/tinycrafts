(function () {
  "use strict";

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function basename(path) {
    const parts = String(path || "").split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : String(path || "");
  }

  function stripExtension(name) {
    return String(name || "").replace(/\.(md|markdown|mdown|mkdn|txt)$/i, "");
  }

  function buttonDisabled(id) {
    const button = document.getElementById(id);
    return Boolean(button && button.disabled);
  }

  function clickElement(id) {
    const element = document.getElementById(id);
    if (element && typeof element.click === "function") {
      element.click();
      return true;
    }
    return false;
  }

  function shortcutLabel(id) {
    const shortcuts = window.MarkVShortcuts;
    return shortcuts && typeof shortcuts.describe === "function"
      ? shortcuts.describe(id)
      : "";
  }

  function announce(env, message) {
    if (env && typeof env.setStatus === "function") {
      env.setStatus(message, { announce: true });
      return;
    }
    document.dispatchEvent(
      new CustomEvent("markv:announce", {
        detail: { message: String(message || "") },
      }),
    );
  }

  function createCommand(env, input) {
    const command = Object.assign(
      {
        type: "command",
        groupLabel: "Commands",
        defaultVisible: true,
        searchFields: [],
      },
      input || {},
    );
    if (command.shortcutId && !command.shortcut) {
      command.shortcut = shortcutLabel(command.shortcutId);
    }
    const fields = [
      { value: command.title, weight: 86 },
      { value: command.subtitle, weight: 44 },
      { value: command.shortcut, weight: 24 },
      { value: asList(command.keywords).join(" "), weight: 52 },
    ];
    command.searchFields = fields;
    command.run = command.run || function () {};
    if (!command.disabledReason && command.disabled) {
      command.disabledReason = "This command is unavailable right now.";
    }
    return command;
  }

  function runEditorCommand(env, action) {
    return new Promise(function (resolve) {
      if (
        typeof env.isEditModeActive === "function" &&
        !env.isEditModeActive() &&
        typeof env.setMode === "function"
      ) {
        env.setMode("edit");
      }

      window.requestAnimationFrame(function () {
        const commands = window.MarkVEditorCommands;
        let ok = false;
        if (commands && typeof commands.run === "function") {
          ok = commands.run(action) !== false;
        }
        if (!ok) {
          announce(
            env,
            action === "bold" || action === "italic" || action === "link"
              ? "Select text in the editor first."
              : "Editor formatting is unavailable right now.",
          );
        }
        resolve(ok);
      });
    });
  }

  function walkLibraryTree(nodes, callback) {
    asList(nodes).forEach(function (node) {
      if (!node) return;
      if (node.type === "file") {
        callback(node);
        return;
      }
      if (node.type === "directory") {
        walkLibraryTree(node.children, callback);
      }
    });
  }

  function collectLibraryItems(env) {
    const items = [];
    asList(env.state && env.state.libraryFolders).forEach(function (folder) {
      if (!folder || !folder.id) return;
      const canOpen = folder.status === "ready";
      const knownButLocked = folder.status === "needs-permission";
      if (!canOpen && !knownButLocked) return;
      const folderLabel = folder.displayLabel || folder.name || "Folder";

      walkLibraryTree(folder.tree, function (node) {
        const path = String(node.path || "");
        const name = node.name || basename(path);
        const subtitle = folderLabel + " / " + path;
        const disabled = !canOpen || !node.handle;
        items.push({
          id: "file:" + folder.id + ":" + path,
          type: "file",
          groupLabel: "Files",
          title: name,
          subtitle: subtitle,
          keywords: [path, folderLabel, stripExtension(name)],
          defaultVisible: false,
          defaultRank: 220,
          disabled: disabled,
          disabledReason: knownButLocked
            ? "Reauthorize this folder from Files first."
            : "That file is not available right now.",
          searchFields: [
            { value: name, weight: 110 },
            { value: stripExtension(name), weight: 96 },
            { value: path, weight: 70 },
            { value: subtitle, weight: 48 },
          ],
          run: function () {
            return env.loadFromLibrarySelection(folder.id, path, {
              userInitiated: true,
              closeDrawerOnMobile: false,
            });
          },
        });
      });
    });
    return items;
  }

  function collectDraftItems(env) {
    const sortDrafts =
      typeof env.sortUntitledDrafts === "function"
        ? env.sortUntitledDrafts
        : function (list) { return asList(list); };
    return sortDrafts(env.state && env.state.untitledDrafts).map(function (draft) {
      const title = draft.title || "Untitled";
      const dirty = draft.dirty ? "Unsaved draft" : "Draft";
      return {
        id: "draft:" + draft.id,
        type: "draft",
        groupLabel: "Drafts",
        title: title,
        subtitle: dirty,
        keywords: [title, "draft", dirty],
        defaultVisible: false,
        defaultRank: 260,
        searchFields: [
          { value: title, weight: 104 },
          { value: dirty, weight: 42 },
          { value: "draft untitled note", weight: 34 },
        ],
        run: function () {
          return env.loadUntitledDraft(draft.id, {
            userInitiated: true,
            closeDrawerOnMobile: false,
          });
        },
      };
    });
  }

  function hasContent(env) {
    return Boolean(
      env.els &&
        env.els.editor &&
        String(env.els.editor.value || "").trim(),
    );
  }

  function canShare(env) {
    const text = env.els && env.els.editor ? env.els.editor.value || "" : "";
    if (!env.libraryCore || typeof env.libraryCore.getShareSnapshotState !== "function") {
      return Boolean(text.trim());
    }
    return Boolean(
      env.libraryCore.getShareSnapshotState({
        text: text,
        currentName: env.state && env.state.currentName,
        view:
          typeof env.isEditModeActive === "function" && env.isEditModeActive()
            ? "edit"
            : "preview",
      }).canShare,
    );
  }

  function createCommands(env) {
    const saveState = env.getReaderSaveState();
    const refreshState = env.getReaderRefreshState();
    const autoRefreshToggle = env.els && env.els.autoRefreshToggle;
    const editMode =
      typeof env.isEditModeActive === "function" && env.isEditModeActive();
    const shareBusy = Boolean(env.state && env.state.shareInFlight);
    const exportHost = env.exportHost || window.MarkVExportHost || null;
    const canExportPdf =
      exportHost && typeof exportHost.exportPdf === "function";
    const canExportMarkdown =
      exportHost && typeof exportHost.exportMarkdown === "function";
    const exportBusy = Boolean(
      exportHost && typeof exportHost.isBusy === "function" && exportHost.isBusy(),
    );
    const exportDisabled = exportBusy || !hasContent(env);

    return [
      createCommand(env, {
        id: "command:new",
        title: "New entry",
        subtitle: "Create a blank draft",
        keywords: ["new", "draft", "entry", "document"],
        defaultRank: 10,
        run: env.createUntitledDocument,
      }),
      createCommand(env, {
        id: "command:open-file",
        title: "Open file",
        subtitle: "Choose one markdown file",
        keywords: ["open", "file", "markdown", "picker"],
        defaultRank: 20,
        run: env.openFile,
      }),
      createCommand(env, {
        id: "command:open-folder",
        title: "Open folder",
        subtitle: "Add a markdown folder to Files",
        keywords: ["open", "folder", "library", "files"],
        defaultRank: 30,
        disabled: buttonDisabled("libraryAddBtn"),
        disabledReason: "This browser cannot add another folder right now.",
        run: env.addLibraryFolder,
      }),
      createCommand(env, {
        id: "command:files",
        title: "Open files",
        subtitle: "Show the Files drawer",
        keywords: ["files", "library", "drawer"],
        defaultRank: 40,
        run: env.showLibraryDrawer,
      }),
      createCommand(env, {
        id: "command:save",
        title: "Save",
        subtitle: "Save the current document",
        keywords: ["save", "write", "download"],
        shortcutId: "global.save",
        defaultRank: 50,
        disabled: !saveState.canSave,
        disabledReason: "There is nothing to save yet.",
        run: env.saveCurrentDocument,
      }),
      createCommand(env, {
        id: "command:reload",
        title: "Reload",
        subtitle: "Reload the current file",
        keywords: ["reload", "refresh", "file"],
        defaultRank: 60,
        disabled: !refreshState.canReload,
        disabledReason: "No reloadable file is active.",
        run: env.reloadCurrent,
      }),
      createCommand(env, {
        id: "command:mode",
        title: editMode ? "Show preview" : "Edit markdown",
        subtitle: "Toggle edit and preview mode",
        keywords: ["edit", "preview", "mode"],
        shortcutId: "global.mode",
        defaultRank: 70,
        run: function () {
          env.setMode(editMode ? "preview" : "edit");
        },
      }),
      createCommand(env, {
        id: "command:auto-refresh",
        title: autoRefreshToggle && autoRefreshToggle.checked
          ? "Disable auto refresh"
          : "Enable auto refresh",
        subtitle: "Toggle live file refresh",
        keywords: ["auto", "refresh", "live"],
        defaultRank: 80,
        disabled: !refreshState.canAutoRefresh,
        disabledReason: "Auto refresh needs a live file handle.",
        run: function () {
          if (!autoRefreshToggle) return;
          autoRefreshToggle.checked = !autoRefreshToggle.checked;
          env.startAutoRefresh();
        },
      }),
      createCommand(env, {
        id: "command:reading",
        title: "Reading settings",
        subtitle: "Adjust text size, spacing, and width",
        keywords: ["reading", "settings", "font", "width", "spacing"],
        defaultRank: 90,
        run: env.showReadingPanel,
      }),
      createCommand(env, {
        id: "command:format-bold",
        title: "Bold",
        subtitle: "Format the selection",
        keywords: ["format", "markdown", "strong"],
        shortcutId: "editor.bold",
        defaultVisible: false,
        defaultRank: 300,
        run: function () { return runEditorCommand(env, "bold"); },
      }),
      createCommand(env, {
        id: "command:format-italic",
        title: "Italic",
        subtitle: "Format the selection",
        keywords: ["format", "markdown", "emphasis"],
        shortcutId: "editor.italic",
        defaultVisible: false,
        defaultRank: 310,
        run: function () { return runEditorCommand(env, "italic"); },
      }),
      createCommand(env, {
        id: "command:format-inline-code",
        title: "Inline code",
        subtitle: "Wrap the selection in backticks",
        keywords: ["format", "markdown", "code", "backtick"],
        defaultVisible: false,
        defaultRank: 320,
        run: function () { return runEditorCommand(env, "inline-code"); },
      }),
      createCommand(env, {
        id: "command:format-link",
        title: "Link",
        subtitle: "Add a markdown link to the selection",
        keywords: ["format", "markdown", "link", "url"],
        shortcutId: "editor.link",
        defaultVisible: false,
        defaultRank: 325,
        run: function () { return runEditorCommand(env, "link"); },
      }),
      createCommand(env, {
        id: "command:format-code-block",
        title: "Code block",
        subtitle: "Wrap lines in a fenced code block",
        keywords: ["format", "markdown", "fence", "code"],
        defaultVisible: false,
        defaultRank: 330,
        run: function () { return runEditorCommand(env, "code-block"); },
      }),
      createCommand(env, {
        id: "command:format-bullet-list",
        title: "Bullet list",
        subtitle: "Toggle unordered list markdown",
        keywords: ["format", "markdown", "list", "unordered", "bullet"],
        shortcutId: "editor.bullet-list",
        defaultVisible: false,
        defaultRank: 340,
        run: function () { return runEditorCommand(env, "bullet-list"); },
      }),
      createCommand(env, {
        id: "command:format-numbered-list",
        title: "Numbered list",
        subtitle: "Toggle ordered list markdown",
        keywords: ["format", "markdown", "list", "ordered", "numbered"],
        shortcutId: "editor.numbered-list",
        defaultVisible: false,
        defaultRank: 350,
        run: function () { return runEditorCommand(env, "numbered-list"); },
      }),
      createCommand(env, {
        id: "command:format-image",
        title: "Image markdown",
        subtitle: "Insert an image link",
        keywords: ["format", "markdown", "image", "photo"],
        defaultVisible: false,
        defaultRank: 360,
        run: function () { return runEditorCommand(env, "image"); },
      }),
      createCommand(env, {
        id: "command:theme",
        title: "Toggle theme",
        subtitle: "Switch light and dark theme",
        keywords: ["theme", "dark", "light", "contrast"],
        defaultRank: 100,
        run: function () { clickElement("themeToggleBtn"); },
      }),
      createCommand(env, {
        id: "command:insights",
        title: "Document insights",
        subtitle: "Open the local document insights panel",
        keywords: ["document", "insights", "terms", "analysis"],
        defaultRank: 110,
        run: function () { clickElement("ontologyToggleBtn"); },
      }),
      createCommand(env, {
        id: "command:mindmap",
        title: "Concept mindmap",
        subtitle: "Map the current document",
        keywords: ["mindmap", "concept", "map", "graph"],
        defaultRank: 120,
        disabled: !hasContent(env),
        disabledReason: "Load a markdown document first.",
        run: function () { return env.runMindmapPipeline({ force: false }); },
      }),
      createCommand(env, {
        id: "command:share",
        title: "Share snapshot",
        subtitle: "Copy or share a snapshot link",
        keywords: ["share", "snapshot", "link", "copy"],
        defaultRank: 130,
        disabled: shareBusy || !canShare(env),
        disabledReason: shareBusy
          ? "A snapshot link is already being prepared."
          : "There is no markdown to share yet.",
        run: env.shareCurrentSnapshot,
      }),
      createCommand(env, {
        id: "command:export-pdf",
        title: "Export PDF",
        subtitle: "Save a themed PDF with the browser print dialog",
        keywords: ["export", "pdf", "print", "download"],
        defaultRank: 132,
        disabled: exportDisabled || !canExportPdf,
        disabledReason: exportBusy
          ? "An export is already being prepared."
          : !hasContent(env)
            ? "There is no markdown to export yet."
            : "Export is unavailable in this build.",
        run: function () {
          return exportHost.exportPdf();
        },
      }),
      createCommand(env, {
        id: "command:export-markdown",
        title: "Export Markdown",
        subtitle: "Download the current source as a .md file",
        keywords: ["export", "markdown", "md", "download"],
        defaultRank: 134,
        disabled: exportDisabled || !canExportMarkdown,
        disabledReason: exportBusy
          ? "An export is already being prepared."
          : !hasContent(env)
            ? "There is no markdown to export yet."
            : "Export is unavailable in this build.",
        run: function () {
          return exportHost.exportMarkdown();
        },
      }),
      createCommand(env, {
        id: "command:ai-settings",
        title: "AI settings",
        subtitle: "Configure Ollama or Groq",
        keywords: ["ai", "settings", "ollama", "groq", "provider"],
        defaultRank: 140,
        run: function () {
          if (typeof window.__openGlobalSettings === "function") {
            window.__openGlobalSettings();
          } else {
            clickElement("globalSettingsBtn");
          }
        },
      }),
      createCommand(env, {
        id: "command:ask",
        title: "Ask document",
        subtitle: "Open Document Q&A",
        keywords: ["ask", "chat", "question", "qa"],
        defaultRank: 150,
        run: function () {
          const panel = document.getElementById("chatPanel");
          const input = document.getElementById("chatInput");
          if (panel && panel.hidden) {
            clickElement("chatFab");
          }
          if (input && typeof input.focus === "function") input.focus();
        },
      }),
      createCommand(env, {
        id: "command:scroll-top",
        title: "Scroll to top",
        subtitle: "Return to the start of the document",
        keywords: ["scroll", "top", "start"],
        defaultRank: 160,
        run: function () {
          if (!clickElement("scrollTopBtn")) {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        },
      }),
      createCommand(env, {
        id: "command:clear",
        title: "Clear all",
        subtitle: "Clear the current document and library",
        keywords: ["clear", "delete", "reset"],
        defaultRank: 900,
        run: env.clearAll,
      }),
    ];
  }

  window.MarkVCommandPaletteHostFactory = function createHost(env) {
    const source = env || {};

    return {
      announce: function (message) {
        announce(source, message);
      },
      getItems: function () {
        return []
          .concat(createCommands(source))
          .concat(collectLibraryItems(source))
          .concat(collectDraftItems(source));
      },
    };
  };
})();
