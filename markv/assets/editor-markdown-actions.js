(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVEditorMarkdownActions = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const INDENT = "  ";
  const LIST_RE = /^(\s*)([*+-]|\d+[.)])\s+(.*)$/;
  const EMPTY_LIST_RE = /^(\s*)([*+-]|\d+[.)])\s*$/;
  const CHECKBOX_RE = /^(\s*)([*+-])\s+\[[ xX]\]\s+(.*)$/;
  const EMPTY_CHECKBOX_RE = /^(\s*)([*+-])\s+\[[ xX]\]\s*$/;

  function makeEdit(start, end, text, selectionStart, selectionEnd) {
    return {
      start: start,
      end: end,
      text: text,
      selectionStart: selectionStart,
      selectionEnd:
        typeof selectionEnd === "number" ? selectionEnd : selectionStart,
    };
  }

  function lineBounds(value, start, end) {
    const text = String(value || "");
    const safeStart = Math.max(0, Math.min(start || 0, text.length));
    const safeEnd = Math.max(safeStart, Math.min(end || safeStart, text.length));
    const lineStart = text.lastIndexOf("\n", Math.max(0, safeStart - 1)) + 1;
    let lineEnd = text.indexOf("\n", safeEnd);
    if (lineEnd === -1) lineEnd = text.length;
    return { lineStart: lineStart, lineEnd: lineEnd };
  }

  function selectedLineBlock(value, start, end) {
    const bounds = lineBounds(value, start, end);
    return {
      lineStart: bounds.lineStart,
      lineEnd: bounds.lineEnd,
      block: String(value || "").slice(bounds.lineStart, bounds.lineEnd),
    };
  }

  function toggleInline(value, start, end, prefix, suffix, placeholder) {
    const text = String(value || "");
    const from = Math.max(0, Math.min(start || 0, text.length));
    const to = Math.max(from, Math.min(end || from, text.length));
    const selected = text.slice(from, to);
    const close = typeof suffix === "string" ? suffix : prefix;

    if (from === to) {
      if (!placeholder) return null;
      const replacement = prefix + placeholder + close;
      return makeEdit(
        from,
        to,
        replacement,
        from + prefix.length,
        from + prefix.length + placeholder.length,
      );
    }

    if (
      selected.length >= prefix.length + close.length &&
      selected.slice(0, prefix.length) === prefix &&
      selected.slice(selected.length - close.length) === close
    ) {
      const inner = selected.slice(prefix.length, selected.length - close.length);
      return makeEdit(from, to, inner, from, from + inner.length);
    }

    if (
      from >= prefix.length &&
      to + close.length <= text.length &&
      text.slice(from - prefix.length, from) === prefix &&
      text.slice(to, to + close.length) === close
    ) {
      return makeEdit(
        from - prefix.length,
        to + close.length,
        selected,
        from - prefix.length,
        from - prefix.length + selected.length,
      );
    }

    return makeEdit(
      from,
      to,
      prefix + selected + close,
      from + prefix.length,
      from + prefix.length + selected.length,
    );
  }

  function toggleLinePrefix(value, start, end, type) {
    const data = selectedLineBlock(value, start, end);
    const lines = data.block.split("\n");
    let replacement;

    if (type === "quote") {
      const nonEmpty = lines.filter(function (line) { return line.length > 0; });
      const allQuoted =
        nonEmpty.length > 0 &&
        nonEmpty.every(function (line) {
          return /^(\s*)>\s?/.test(line);
        });
      replacement = lines
        .map(function (line) {
          if (!line) return line;
          return allQuoted ? line.replace(/^(\s*)>\s?/, "$1") : "> " + line;
        })
        .join("\n");
    } else if (type === "ordered-list") {
      const nonEmptyOrdered = lines.filter(function (line) {
        return line.length > 0;
      });
      const allOrdered =
        nonEmptyOrdered.length > 0 &&
        nonEmptyOrdered.every(function (line) {
          return /^(\s*)\d+[.)]\s+/.test(line);
        });
      let index = 1;
      replacement = lines
        .map(function (line) {
          if (!line) return line;
          if (allOrdered) return line.replace(/^(\s*)\d+[.)]\s+/, "$1");
          const indent = line.match(/^(\s*)/)[1];
          const body = line.slice(indent.length).replace(/^([*+-])\s+/, "");
          return indent + index++ + ". " + body;
        })
        .join("\n");
    } else {
      const nonEmptyUnordered = lines.filter(function (line) {
        return line.length > 0;
      });
      const allUnordered =
        nonEmptyUnordered.length > 0 &&
        nonEmptyUnordered.every(function (line) {
          return /^(\s*)[*+-]\s+/.test(line);
        });
      replacement = lines
        .map(function (line) {
          if (!line) return line;
          if (allUnordered) return line.replace(/^(\s*)[*+-]\s+/, "$1");
          const indent = line.match(/^(\s*)/)[1];
          const body = line.slice(indent.length).replace(/^\d+[.)]\s+/, "");
          return indent + "- " + body;
        })
        .join("\n");
    }

    return makeEdit(
      data.lineStart,
      data.lineEnd,
      replacement,
      data.lineStart,
      data.lineStart + replacement.length,
    );
  }

  function toggleCodeBlock(value, start, end) {
    const text = String(value || "");
    const from = Math.max(0, Math.min(start || 0, text.length));
    const to = Math.max(from, Math.min(end || from, text.length));
    const data = selectedLineBlock(text, from, to);
    const block = data.block || "code";
    const lines = block.split("\n");

    if (
      lines.length >= 2 &&
      lines[0].trim() === "```" &&
      lines[lines.length - 1].trim() === "```"
    ) {
      const inner = lines.slice(1, -1).join("\n");
      return makeEdit(data.lineStart, data.lineEnd, inner, data.lineStart, data.lineStart + inner.length);
    }

    const replacement = "```\n" + block + "\n```";
    const selectionStart = data.lineStart + 4;
    const selectionEnd = selectionStart + block.length;
    return makeEdit(data.lineStart, data.lineEnd, replacement, selectionStart, selectionEnd);
  }

  function insertImage(value, start, end) {
    const text = String(value || "");
    const from = Math.max(0, Math.min(start || 0, text.length));
    const to = Math.max(from, Math.min(end || from, text.length));
    const selected = text.slice(from, to) || "alt text";
    const prefix = "![";
    const middle = "](";
    const url = "https://";
    const suffix = ")";
    const replacement = prefix + selected + middle + url + suffix;
    const urlStart = from + prefix.length + selected.length + middle.length;
    return makeEdit(from, to, replacement, urlStart, urlStart + url.length);
  }

  function handleEnter(value, start, end) {
    const text = String(value || "");
    const from = Math.max(0, Math.min(start || 0, text.length));
    const to = Math.max(from, Math.min(end || from, text.length));
    if (from !== to) return null;

    const bounds = lineBounds(text, from, from);
    const line = text.slice(bounds.lineStart, bounds.lineEnd);
    const beforeCaret = text.slice(bounds.lineStart, from);
    const checkbox = beforeCaret.match(CHECKBOX_RE);
    const emptyCheckbox = line.match(EMPTY_CHECKBOX_RE);
    const list = beforeCaret.match(LIST_RE);
    const emptyList = line.match(EMPTY_LIST_RE);

    if (emptyCheckbox || emptyList) {
      const match = emptyCheckbox || emptyList;
      const replacement = match[1] || "";
      return makeEdit(bounds.lineStart, bounds.lineEnd, replacement, bounds.lineStart + replacement.length);
    }

    if (checkbox) {
      const marker = "\n" + checkbox[1] + checkbox[2] + " [ ] ";
      return makeEdit(from, to, marker, from + marker.length);
    }

    if (!list) return null;

    const marker = list[2];
    let nextMarker = marker;
    const ordered = marker.match(/^(\d+)([.)])$/);
    if (ordered) nextMarker = String(Number(ordered[1]) + 1) + ordered[2];
    const insert = "\n" + list[1] + nextMarker + " ";
    return makeEdit(from, to, insert, from + insert.length);
  }

  function selectedLinesForTab(value, start, end) {
    const data = selectedLineBlock(value, start, end);
    const lines = data.block.split("\n");
    const touchesList = lines.some(function (line) {
      return LIST_RE.test(line) || EMPTY_LIST_RE.test(line) || CHECKBOX_RE.test(line);
    });
    return {
      data: data,
      lines: lines,
      multiline: data.block.indexOf("\n") !== -1 || start !== end,
      touchesList: touchesList,
    };
  }

  function handleTab(value, start, end, outdent) {
    const text = String(value || "");
    const from = Math.max(0, Math.min(start || 0, text.length));
    const to = Math.max(from, Math.min(end || from, text.length));
    const selected = selectedLinesForTab(text, from, to);

    if (!selected.multiline && !selected.touchesList && !outdent) {
      return makeEdit(from, to, INDENT, from + INDENT.length);
    }

    if (!selected.multiline && !selected.touchesList && outdent) {
      return null;
    }

    let startDelta = 0;
    let endDelta = 0;
    let runningOffset = selected.data.lineStart;
    const replacement = selected.lines
      .map(function (line) {
        const lineStart = runningOffset;
        runningOffset += line.length + 1;
        if (outdent) {
          const removed = line.startsWith(INDENT)
            ? INDENT.length
            : line.startsWith(" ")
              ? 1
              : 0;
          if (removed) {
            if (lineStart < from) startDelta -= Math.min(removed, from - lineStart);
            endDelta -= removed;
            return line.slice(removed);
          }
          return line;
        }
        if (!line && !selected.touchesList) return line;
        if (lineStart < from || lineStart === from) startDelta += INDENT.length;
        endDelta += INDENT.length;
        return INDENT + line;
      })
      .join("\n");

    return makeEdit(
      selected.data.lineStart,
      selected.data.lineEnd,
      replacement,
      Math.max(selected.data.lineStart, from + startDelta),
      Math.max(selected.data.lineStart, to + endDelta),
    );
  }

  return {
    handleEnter: handleEnter,
    handleTab: handleTab,
    insertImage: insertImage,
    lineBounds: lineBounds,
    toggleCodeBlock: toggleCodeBlock,
    toggleInline: toggleInline,
    toggleLinePrefix: toggleLinePrefix,
  };
});
