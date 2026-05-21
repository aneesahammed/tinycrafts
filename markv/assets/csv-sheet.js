(function (root, factory) {
  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.MarkVCsvSheet = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_MAX_ROWS = 500;
  var DELIMITER_AUTO = "auto";

  function defaultEscapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  function normalizeDelimiter(value) {
    var delimiter = String(value || DELIMITER_AUTO).toLowerCase();

    if (delimiter === DELIMITER_AUTO) return DELIMITER_AUTO;
    if (delimiter === "tab" || delimiter === "\\t" || delimiter === "\t") {
      return "\t";
    }
    if (delimiter === "," || delimiter === ";") return delimiter;

    return DELIMITER_AUTO;
  }

  function parseCsvInfoString(info) {
    var tokens = String(info || "").trim().split(/\s+/).filter(Boolean);
    var lang = String(tokens[0] || "").toLowerCase();
    var config = {
      isCsv: lang === "csv",
      header: true,
      maxRows: DEFAULT_MAX_ROWS,
      delimiter: DELIMITER_AUTO,
    };

    if (!config.isCsv) return config;

    for (var i = 1; i < tokens.length; i += 1) {
      var token = String(tokens[i] || "").trim();
      var lower = token.toLowerCase();

      if (lower === "noheader") {
        config.header = false;
        continue;
      }

      if (lower === "header") {
        config.header = true;
        continue;
      }

      if (lower.indexOf("max=") === 0) {
        var maxValue = lower.slice(4);

        if (maxValue === "all") {
          config.maxRows = Infinity;
          continue;
        }

        var parsedMax = Number.parseInt(maxValue, 10);
        if (Number.isFinite(parsedMax) && parsedMax > 0) {
          config.maxRows = parsedMax;
        }
        continue;
      }

      if (lower.indexOf("delim=") === 0) {
        config.delimiter = normalizeDelimiter(token.slice(6));
      }
    }

    return config;
  }

  function isCsvInfoString(info) {
    return parseCsvInfoString(info).isCsv;
  }

  function stripBom(text) {
    var source = String(text || "");
    return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  }

  function sampleDelimiterScore(text, delimiter) {
    var inQuotes = false;
    var rowDelimiterCount = 0;
    var rows = [];

    for (var i = 0; i < text.length && rows.length < 10; i += 1) {
      var char = text.charAt(i);

      if (char === '"') {
        if (inQuotes && text.charAt(i + 1) === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (inQuotes) continue;

      if (char === delimiter) {
        rowDelimiterCount += 1;
        continue;
      }

      if (char === "\r" || char === "\n") {
        rows.push(rowDelimiterCount);
        rowDelimiterCount = 0;
        if (char === "\r" && text.charAt(i + 1) === "\n") i += 1;
      }
    }

    if (rows.length < 10 && (rowDelimiterCount > 0 || rows.length === 0)) {
      rows.push(rowDelimiterCount);
    }

    return rows.reduce(function (score, count) {
      return score + count;
    }, 0);
  }

  function detectDelimiter(text) {
    var commaScore = sampleDelimiterScore(text, ",");
    var semicolonScore = sampleDelimiterScore(text, ";");

    return semicolonScore > commaScore ? ";" : ",";
  }

  function normalizeStoredRows(rows, columnCount) {
    for (var i = 0; i < rows.length; i += 1) {
      while (rows[i].length < columnCount) {
        rows[i].push("");
      }
    }
  }

  function parseCsv(text, options) {
    var opts = options || {};
    var source = stripBom(text);
    var requestedDelimiter = normalizeDelimiter(opts.delimiter);
    var delimiter =
      requestedDelimiter === DELIMITER_AUTO
        ? detectDelimiter(source)
        : requestedDelimiter;
    var maxStoredRows = Number.isFinite(opts.maxRows)
      ? Math.max(0, opts.maxRows)
      : Infinity;
    var rows = [];
    var row = [];
    var field = "";
    var totalRows = 0;
    var columnCount = 0;
    var storedColumnCount = 0;
    var inQuotes = false;
    var afterQuote = false;
    var rowStarted = false;
    var endedWithRecordSeparator = false;

    function storeRow(nextRow) {
      totalRows += 1;
      columnCount = Math.max(columnCount, nextRow.length);

      if (rows.length < maxStoredRows) {
        rows.push(nextRow);
        storedColumnCount = Math.max(storedColumnCount, nextRow.length);
      }
    }

    function pushField() {
      row.push(field);
      field = "";
      rowStarted = true;
      endedWithRecordSeparator = false;
    }

    function finishRow() {
      pushField();
      storeRow(row);
      row = [];
      rowStarted = false;
      afterQuote = false;
      endedWithRecordSeparator = true;
    }

    for (var i = 0; i < source.length; i += 1) {
      var char = source.charAt(i);

      if (inQuotes) {
        if (char === '"') {
          if (source.charAt(i + 1) === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
            afterQuote = true;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (afterQuote) {
        if (char === delimiter) {
          pushField();
          afterQuote = false;
          continue;
        }

        if (char === "\r" || char === "\n") {
          finishRow();
          if (char === "\r" && source.charAt(i + 1) === "\n") i += 1;
          continue;
        }

        if (char === " " || char === "\t") continue;

        field += char;
        rowStarted = true;
        afterQuote = false;
        continue;
      }

      if (char === '"') {
        if (field === "") {
          inQuotes = true;
          rowStarted = true;
        } else {
          field += char;
          rowStarted = true;
        }
        endedWithRecordSeparator = false;
        continue;
      }

      if (char === delimiter) {
        pushField();
        continue;
      }

      if (char === "\r" || char === "\n") {
        finishRow();
        if (char === "\r" && source.charAt(i + 1) === "\n") i += 1;
        continue;
      }

      field += char;
      rowStarted = true;
      endedWithRecordSeparator = false;
    }

    if (inQuotes) {
      return {
        delimiter: delimiter,
        rows: [],
        totalRows: 0,
        columnCount: 0,
        storedColumnCount: 0,
        truncated: false,
        error: "Unterminated quoted field",
      };
    }

    if (
      source.length > 0 &&
      !(endedWithRecordSeparator && row.length === 0 && field === "" && !rowStarted)
    ) {
      finishRow();
    }

    normalizeStoredRows(rows, storedColumnCount);

    return {
      delimiter: delimiter,
      rows: rows,
      totalRows: totalRows,
      columnCount: columnCount,
      storedColumnCount: storedColumnCount,
      truncated: totalRows > rows.length,
      error: null,
    };
  }

  function formatCount(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function normalizeDisplayRow(row, columnCount) {
    var normalized = row ? row.slice() : [];
    while (normalized.length < columnCount) normalized.push("");
    return normalized;
  }

  function renderHeaderRow(headerRow, columnCount, escapeHtml) {
    var cells = ['<th class="csv-sheet__corner" scope="col">#</th>'];
    var normalized = normalizeDisplayRow(headerRow, columnCount);

    for (var i = 0; i < normalized.length; i += 1) {
      cells.push('<th scope="col">' + escapeHtml(normalized[i]) + "</th>");
    }

    return "<thead><tr>" + cells.join("") + "</tr></thead>";
  }

  function renderBodyRows(rows, columnCount, escapeHtml) {
    var output = ["<tbody>"];

    for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      var row = normalizeDisplayRow(rows[rowIndex], columnCount);
      output.push(
        '<tr><th class="csv-sheet__row-number" scope="row">' +
          escapeHtml(String(rowIndex + 1)) +
          "</th>",
      );

      for (var colIndex = 0; colIndex < columnCount; colIndex += 1) {
        output.push("<td>" + escapeHtml(row[colIndex]) + "</td>");
      }

      output.push("</tr>");
    }

    output.push("</tbody>");
    return output.join("");
  }

  function renderCsvSheet(text, info, escapeHtml) {
    var config = parseCsvInfoString(info);
    if (!config.isCsv) return null;

    var escape = typeof escapeHtml === "function" ? escapeHtml : defaultEscapeHtml;
    var visibleLimit = config.maxRows;
    var parseLimit = Number.isFinite(visibleLimit)
      ? visibleLimit + (config.header ? 1 : 0)
      : Infinity;
    var parsed = parseCsv(text, {
      delimiter: config.delimiter,
      maxRows: parseLimit,
    });

    if (parsed.error || !parsed.rows.length) return null;

    var hasHeader = config.header && parsed.totalRows > 1;
    var headerRow = hasHeader ? parsed.rows[0] : null;
    var bodyRows = hasHeader ? parsed.rows.slice(1) : parsed.rows.slice();
    if (Number.isFinite(visibleLimit)) {
      bodyRows = bodyRows.slice(0, visibleLimit);
    }

    var columnCount = Math.max(
      1,
      headerRow ? headerRow.length : 0,
      bodyRows.reduce(function (max, row) {
        return Math.max(max, row.length);
      }, 0),
    );
    var totalDataRows = hasHeader
      ? Math.max(0, parsed.totalRows - 1)
      : parsed.totalRows;
    var shownRows = Math.min(bodyRows.length, totalDataRows);
    var note =
      Number.isFinite(visibleLimit) && shownRows < totalDataRows
        ? '<p class="csv-sheet-note">Showing ' +
          formatCount(shownRows) +
          " of " +
          formatCount(totalDataRows) +
          " rows</p>"
        : "";
    var html = [
      '<div class="csv-sheet-wrap" role="region" aria-label="CSV sheet" tabindex="0">',
      '<table class="csv-sheet">',
    ];

    if (hasHeader) {
      html.push(renderHeaderRow(headerRow, columnCount, escape));
    }

    html.push(renderBodyRows(bodyRows, columnCount, escape));
    html.push("</table></div>");
    html.push(note);

    return html.join("");
  }

  return {
    parseCsv: parseCsv,
    parseCsvInfoString: parseCsvInfoString,
    renderCsvSheet: renderCsvSheet,
    isCsvInfoString: isCsvInfoString,
  };
});
