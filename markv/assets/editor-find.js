(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVEditorFind = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  // ponytail: capped so a one-letter query on a huge file stays responsive;
  // raise it or page results if real documents hit the cap.
  const MAX_MATCHES = 10000;

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildRegExp(query, options, global) {
    const opts = options || {};
    const source = opts.regex ? String(query) : escapeRegExp(query);
    const flags = (global ? "g" : "") + (opts.caseSensitive ? "" : "i") + (opts.regex ? "m" : "");
    try {
      return { re: new RegExp(source, flags), error: null };
    } catch (error) {
      return { re: null, error: error && error.message ? error.message : "Invalid pattern" };
    }
  }

  function findMatches(text, query, options) {
    if (!query) return { matches: [], error: null };
    const built = buildRegExp(query, options, true);
    if (!built.re) return { matches: [], error: built.error };
    const value = String(text || "");
    const matches = [];
    let match;
    while (matches.length < MAX_MATCHES && (match = built.re.exec(value))) {
      if (match[0].length === 0) {
        // Zero-length hits (^, \b, a*) can't be selected or replaced.
        built.re.lastIndex += 1;
        continue;
      }
      matches.push({ start: match.index, end: match.index + match[0].length });
    }
    return { matches: matches, error: null };
  }

  function nextMatchIndex(matches, caret, direction) {
    if (!matches || !matches.length) return -1;
    if (direction < 0) {
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        if (matches[index].end <= caret) return index;
      }
      return matches.length - 1;
    }
    for (let index = 0; index < matches.length; index += 1) {
      if (matches[index].start >= caret) return index;
    }
    return 0;
  }

  // ponytail: regex groups expand against the matched slice alone, so
  // lookbehind/anchors in a replacement pattern see no surrounding text.
  function replacementFor(text, match, query, replacement, options) {
    const value = String(replacement == null ? "" : replacement);
    if (!(options && options.regex)) return value;
    const built = buildRegExp(query, options, false);
    if (!built.re) return value;
    return String(text).slice(match.start, match.end).replace(built.re, value);
  }

  function replaceAllMatches(text, query, replacement, options) {
    const value = String(text || "");
    const found = findMatches(value, query, options);
    if (found.error || !found.matches.length) {
      return { start: 0, end: 0, text: "", count: 0, error: found.error };
    }
    const matches = found.matches;
    const start = matches[0].start;
    const end = matches[matches.length - 1].end;
    let out = "";
    let cursor = start;
    matches.forEach(function (match) {
      out += value.slice(cursor, match.start);
      out += replacementFor(value, match, query, replacement, options);
      cursor = match.end;
    });
    return { start: start, end: end, text: out, count: matches.length, error: null };
  }

  return {
    MAX_MATCHES: MAX_MATCHES,
    findMatches: findMatches,
    nextMatchIndex: nextMatchIndex,
    replaceAllMatches: replaceAllMatches,
    replacementFor: replacementFor,
  };
});
