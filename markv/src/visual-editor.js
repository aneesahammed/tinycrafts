import { EditorState } from "@tiptap/pm/state";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";

// Keep extended documents intact rather than normalizing syntax we cannot represent.
export function needsSource(markdown) {
  const prose = markdown.replace(
    /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1\s*$/gm,
    "",
  );
  return /<\/?[a-z!][^>]*>|^\s*\[[^\]]+\]:|\$\$|\$[^\n$]+\$|\\[([]|^:::/im.test(
    prose,
  );
}
export function safeUrl(value, image = false) {
  const url = value.trim();
  if (!url || /[\u0000-\u0020]/.test(url)) return null;
  if (
    /^(https?:\/\/)/i.test(url) ||
    (!image && /^(mailto:|tel:|#)/i.test(url)) ||
    /^(\.?\.?\/)(?!\/)/.test(url)
  )
    return url;
  return null;
}

function mount() {
  const source = document.getElementById("editor");
  if (!source) return;
  const pane = source.parentElement;
  const shell = document.createElement("div");
  shell.className = "visual-editor-shell";
  shell.innerHTML = `<div class="visual-editor-top"><span>Write naturally. Format as you go.</span><button type="button" class="btn" data-mode>Markdown source</button></div>
    <p class="visual-editor-notice" role="status" hidden></p>
    <div class="visual-editor-toolbar" role="group" aria-label="Text formatting"></div>
    <div class="visual-editor-surface"></div>`;
  pane.insertBefore(shell, source);
  const toolbar = shell.querySelector(".visual-editor-toolbar");
  const surface = shell.querySelector(".visual-editor-surface");
  const notice = shell.querySelector(".visual-editor-notice");
  const mode = shell.querySelector("[data-mode]");
  let syncing = false;
  let sourceMode = false;
  let protectiveMode = false;
  let lastValue = source.value;
  const editor = new Editor({
    element: surface,
    extensions: [
      StarterKit.configure({ underline: false, link: { openOnClick: false } }),
      Markdown,
      Image.configure({ inline: true }),
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "markdown-body visual-editor-document",
        role: "textbox",
        "aria-label": "Document editor",
        "aria-multiline": "true",
        spellcheck: "true",
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === "k"
          ) {
            event.preventDefault();
            event.stopPropagation();
            openDialog("link");
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: () => {
      if (syncing) return;
      syncing = true;
      source.value = editor.getMarkdown();
      lastValue = source.value;
      source.dispatchEvent(new Event("input", { bubbles: true }));
      syncing = false;
    },
    onSelectionUpdate: () => updateButtons(),
    onTransaction: () => updateButtons(),
  });
  const buttons = [];
  function updateButtons() {
    for (const { button, active } of buttons) {
      if (active) button.setAttribute("aria-pressed", String(active()));
    }
  }
  function button(label, action, active) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.title = label;
    el.addEventListener("mousedown", (event) => event.preventDefault());
    el.addEventListener("click", action);
    toolbar.append(el);
    buttons.push({ button: el, active });
  }
  const blocks = document.createElement("select");
  blocks.setAttribute("aria-label", "Paragraph style");
  blocks.innerHTML =
    '<option value="0">Paragraph</option>' +
    [1, 2, 3, 4, 5, 6]
      .map((level) => `<option value="${level}">Heading ${level}</option>`)
      .join("");
  blocks.addEventListener("change", () => {
    const level = Number(blocks.value);
    level
      ? editor.chain().focus().setHeading({ level }).run()
      : editor.chain().focus().setParagraph().run();
  });
  toolbar.append(blocks);
  editor.on("selectionUpdate", () => {
    blocks.value = String(editor.getAttributes("heading").level || 0);
  });
  for (const [label, command, node] of [
    ["Bold", "toggleBold", "bold"],
    ["Italic", "toggleItalic", "italic"],
    ["Strike", "toggleStrike", "strike"],
    ["Code", "toggleCode", "code"],
    ["Bullets", "toggleBulletList", "bulletList"],
    ["Numbered", "toggleOrderedList", "orderedList"],
    ["Checklist", "toggleTaskList", "taskList"],
    ["Quote", "toggleBlockquote", "blockquote"],
    ["Code block", "toggleCodeBlock", "codeBlock"],
  ]) {
    button(
      label,
      () => editor.chain().focus()[command]().run(),
      () => editor.isActive(node),
    );
  }
  button(
    "Link",
    () => openDialog("link"),
    () => editor.isActive("link"),
  );
  button("Image", () => openDialog("image"));
  button("Table", () =>
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run(),
  );
  const tableActions = document.createElement("select");
  tableActions.setAttribute("aria-label", "Table actions");
  tableActions.innerHTML =
    '<option value="">Table actions</option>' +
    Object.entries({
      addRowAfter: "Add row",
      addColumnAfter: "Add column",
      deleteRow: "Delete row",
      deleteColumn: "Delete column",
      deleteTable: "Delete table",
    })
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join("");
  tableActions.onchange = () => {
    if (tableActions.value) editor.chain().focus()[tableActions.value]().run();
    tableActions.value = "";
  };
  toolbar.append(tableActions);
  editor.on("transaction", () => {
    tableActions.disabled = !editor.isActive("table");
  });
  button("Divider", () => editor.chain().focus().setHorizontalRule().run());
  button("Undo", () => editor.chain().focus().undo().run());
  button("Redo", () => editor.chain().focus().redo().run());

  const dialog = document.createElement("dialog");
  dialog.className = "visual-editor-dialog";
  dialog.innerHTML = `<form><h2></h2><label>URL<input name="url" required placeholder="https://…" autocomplete="off"></label><label data-description>Image description<input name="description"></label><p role="alert"></p><div><button type="button" data-cancel>Cancel</button><button type="button" data-remove>Remove link</button><button type="submit">Apply</button></div></form>`;
  document.body.append(dialog);
  let dialogKind;
  function openDialog(kind) {
    dialogKind = kind;
    dialog.querySelector("h2").textContent =
      kind === "image" ? "Insert image" : "Edit link";
    dialog.querySelector("[data-description]").hidden = kind !== "image";
    dialog.querySelector("[data-remove]").hidden =
      kind !== "link" || !editor.isActive("link");
    dialog.querySelector("[name=url]").value =
      kind === "link" ? editor.getAttributes("link").href || "" : "";
    dialog.querySelector("[name=description]").value = "";
    dialog.querySelector("[role=alert]").textContent = "";
    dialog.showModal();
    dialog.querySelector("input").focus();
  }
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.querySelector("[data-remove]").onclick = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    dialog.close();
  };
  dialog.addEventListener("close", () => editor.commands.focus());
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    const url = safeUrl(
      dialog.querySelector("[name=url]").value,
      dialogKind === "image",
    );
    if (!url) {
      dialog.querySelector("[role=alert]").textContent =
        "Enter a valid https:// URL or a relative path beginning with ./ or /.";
      return;
    }
    if (dialogKind === "image")
      editor
        .chain()
        .focus()
        .setImage({
          src: url,
          alt: dialog.querySelector("[name=description]").value,
        })
        .run();
    else if (editor.state.selection.empty && !editor.isActive("link"))
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    else
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    dialog.close();
  };
  function showMode() {
    source.classList.toggle("visual-source-hidden", !sourceMode);
    surface.hidden = sourceMode;
    toolbar.hidden = sourceMode;
    mode.textContent = sourceMode ? "Visual editor" : "Markdown source";
    mode.setAttribute("aria-pressed", String(sourceMode));
  }
  function load() {
    if (syncing) return;
    lastValue = source.value;
    const unsupported = needsSource(lastValue);
    notice.hidden = !unsupported;
    notice.textContent = unsupported
      ? "This document uses extended Markdown or HTML. Source editing keeps that content intact; Preview still renders it."
      : "";
    if (protectiveMode && !unsupported) sourceMode = false;
    protectiveMode = unsupported;
    if (unsupported) sourceMode = true;
    else {
      syncing = true;
      editor.commands.setContent(lastValue, {
        contentType: "markdown",
        emitUpdate: false,
      });
      editor.view.updateState(
        EditorState.create({
          doc: editor.state.doc,
          schema: editor.schema,
          plugins: editor.state.plugins,
        }),
      );
      syncing = false;
    }
    showMode();
  }
  mode.onclick = () => {
    if (sourceMode && needsSource(source.value)) {
      notice.hidden = false;
      return;
    }
    sourceMode = !sourceMode;
    load();
    sourceMode ? source.focus() : editor.commands.focus();
  };
  source.addEventListener("input", () => {
    if (!syncing && source.value !== lastValue) load();
  });
  // All existing document-loading and command-palette paths write through this setter.
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  Object.defineProperty(source, "value", {
    configurable: true,
    get() {
      return valueDescriptor.get.call(this);
    },
    set(value) {
      valueDescriptor.set.call(this, value);
      if (!syncing) load();
    },
  });
  const sourceFocus = source.focus.bind(source);
  source.focus = (options) => {
    if (sourceMode) sourceFocus(options);
    else editor.commands.focus();
  };
  window.MarkVVisualEditor = {
    editor,
    refresh: load,
    showSource() {
      sourceMode = true;
      showMode();
      sourceFocus();
    },
  };
  load();
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mount);
else mount();
