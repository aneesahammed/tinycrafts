(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MarkVCommandPaletteCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const GROUP_ORDER = ["command", "file", "draft"];
  const DEFAULT_LIMIT = 80;

  function normalizeSearchValue(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokenizeQuery(query) {
    const normalized = normalizeSearchValue(query);
    return normalized ? normalized.split(/\s+/) : [];
  }

  function fuzzyContains(haystack, needle) {
    if (!needle) return true;
    let offset = 0;
    for (let index = 0; index < needle.length; index += 1) {
      offset = haystack.indexOf(needle[index], offset);
      if (offset === -1) return false;
      offset += 1;
    }
    return true;
  }

  function getGroupRank(type) {
    const index = GROUP_ORDER.indexOf(type);
    return index === -1 ? GROUP_ORDER.length : index;
  }

  function getItemSearchFields(item) {
    if (item && Array.isArray(item.searchFields) && item.searchFields.length) {
      return item.searchFields;
    }

    const keywords = Array.isArray(item && item.keywords)
      ? item.keywords.join(" ")
      : "";
    return [
      { value: item && item.title, weight: 70 },
      { value: item && item.subtitle, weight: 38 },
      { value: keywords, weight: 30 },
    ];
  }

  function scoreField(field, token) {
    const value = normalizeSearchValue(field && field.value);
    if (!value) return 0;
    const weight = Number(field && field.weight) || 1;
    const words = value.split(/\s+/);

    if (value === token) return weight + 140;
    if (words.some(function (word) { return word === token; })) {
      return weight + 110;
    }
    if (value.startsWith(token)) return weight + 96;
    if (words.some(function (word) { return word.startsWith(token); })) {
      return weight + 72;
    }
    if (value.includes(token)) return weight + 44;
    if (token.length >= 3 && fuzzyContains(value, token)) return weight + 20;
    return 0;
  }

  function scorePaletteItem(item, query) {
    const tokens = tokenizeQuery(query);
    if (!tokens.length) {
      return item && item.defaultVisible !== false
        ? 10000 - (Number(item.defaultRank) || 500)
        : 0;
    }

    const fields = getItemSearchFields(item);
    let total = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      let tokenScore = 0;
      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
        tokenScore = Math.max(tokenScore, scoreField(fields[fieldIndex], token));
      }
      if (!tokenScore) return 0;
      total += tokenScore;
    }

    return total + Math.max(0, 12 - getGroupRank(item && item.type));
  }

  function comparePaletteItems(a, b, query) {
    const scoreDelta = b.score - a.score;
    if (scoreDelta) return scoreDelta;

    const groupDelta =
      getGroupRank(a.item && a.item.type) - getGroupRank(b.item && b.item.type);
    if (groupDelta) return groupDelta;

    const rankDelta =
      (Number(a.item && a.item.defaultRank) || 500) -
      (Number(b.item && b.item.defaultRank) || 500);
    if (rankDelta) return rankDelta;

    return String(a.item && a.item.title || "").localeCompare(
      String(b.item && b.item.title || ""),
      undefined,
      { numeric: true, sensitivity: "base" },
    );
  }

  function mergeRanges(ranges) {
    const sorted = ranges
      .filter(function (range) {
        return range && range.start >= 0 && range.end > range.start;
      })
      .sort(function (a, b) {
        return a.start - b.start || a.end - b.end;
      });
    const merged = [];
    sorted.forEach(function (range) {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) {
        last.end = Math.max(last.end, range.end);
      } else {
        merged.push({ start: range.start, end: range.end });
      }
    });
    return merged;
  }

  function getLiteralMatchRanges(text, query) {
    const source = String(text || "");
    const lower = source.toLowerCase();
    const tokens = tokenizeQuery(query);
    const ranges = [];

    tokens.forEach(function (token) {
      if (!token) return;
      let offset = 0;
      while (offset < lower.length) {
        const index = lower.indexOf(token, offset);
        if (index === -1) break;
        ranges.push({ start: index, end: index + token.length });
        offset = index + Math.max(1, token.length);
      }
    });

    return mergeRanges(ranges);
  }

  function decorateResult(item, score, query) {
    return {
      item: item,
      score: score,
      matches: {
        title: getLiteralMatchRanges(item && item.title, query),
        subtitle: getLiteralMatchRanges(item && item.subtitle, query),
      },
    };
  }

  function filterPaletteItems(items, query, options) {
    const list = Array.isArray(items) ? items : [];
    const opts = options || {};
    const limit = Number(opts.limit) > 0 ? Number(opts.limit) : DEFAULT_LIMIT;
    const results = [];

    list.forEach(function (item) {
      const score = scorePaletteItem(item, query);
      if (score <= 0) return;
      results.push(decorateResult(item, score, query));
    });

    results.sort(function (a, b) {
      return comparePaletteItems(a, b, query);
    });
    return results.slice(0, limit);
  }

  function groupPaletteResults(results) {
    const buckets = new Map();
    (Array.isArray(results) ? results : []).forEach(function (result) {
      const item = result && result.item ? result.item : {};
      const key = item.type || "command";
      if (!buckets.has(key)) {
        buckets.set(key, {
          type: key,
          title: item.groupLabel || key,
          results: [],
        });
      }
      buckets.get(key).results.push(result);
    });

    return Array.from(buckets.values()).sort(function (a, b) {
      return getGroupRank(a.type) - getGroupRank(b.type);
    });
  }

  function clampActiveIndex(index, count) {
    const length = Math.max(0, Number(count) || 0);
    if (!length) return -1;
    const value = Number(index);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(length - 1, value));
  }

  function reducePaletteKeyboard(state, key, resultCount) {
    const source = state && typeof state === "object" ? state : {};
    const count = Math.max(0, Number(resultCount) || 0);
    const active = clampActiveIndex(source.activeIndex, count);
    const query = String(source.query || "");

    if (key === "Escape") {
      return query
        ? { action: "clear", activeIndex: active, query: "" }
        : { action: "close", activeIndex: active, query: query };
    }

    if (!count) {
      return { action: "none", activeIndex: -1, query: query };
    }

    if (key === "ArrowDown") {
      return {
        action: "navigate",
        activeIndex: active === -1 ? 0 : (active + 1) % count,
        query: query,
      };
    }
    if (key === "ArrowUp") {
      return {
        action: "navigate",
        activeIndex: active === -1 ? count - 1 : (active - 1 + count) % count,
        query: query,
      };
    }
    if (key === "Home") {
      return { action: "navigate", activeIndex: 0, query: query };
    }
    if (key === "End") {
      return { action: "navigate", activeIndex: count - 1, query: query };
    }
    if (key === "Enter") {
      return { action: "execute", activeIndex: active, query: query };
    }

    return { action: "none", activeIndex: active, query: query };
  }

  function getPaletteActionState(item) {
    if (!item) return { action: "none", reason: "" };
    if (item.disabled) {
      return {
        action: "disabled",
        reason: item.disabledReason || "This action is unavailable right now.",
      };
    }
    return { action: "execute", reason: "" };
  }

  return {
    GROUP_ORDER: GROUP_ORDER.slice(),
    clampActiveIndex: clampActiveIndex,
    filterPaletteItems: filterPaletteItems,
    fuzzyContains: fuzzyContains,
    getLiteralMatchRanges: getLiteralMatchRanges,
    getPaletteActionState: getPaletteActionState,
    groupPaletteResults: groupPaletteResults,
    normalizeSearchValue: normalizeSearchValue,
    reducePaletteKeyboard: reducePaletteKeyboard,
    scorePaletteItem: scorePaletteItem,
    tokenizeQuery: tokenizeQuery,
  };
});
