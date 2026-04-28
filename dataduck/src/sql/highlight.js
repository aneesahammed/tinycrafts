const KEYWORDS = /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|USING|AS|AND|OR|NOT|IN|IS|NULL|TRUE|FALSE|CASE|WHEN|THEN|ELSE|END|UNION|ALL|DISTINCT|WITH|CREATE|VIEW|TABLE|REPLACE|DROP|DESCRIBE|SUMMARIZE|EXPLAIN|OVER|PARTITION|BETWEEN|LIKE|ILIKE|EXISTS|ASC|DESC)\b/gi;
const FUNCTIONS = /\b([A-Z_][A-Z_0-9]+)(?=\s*\()/gi;
const NUMBERS = /\b(\d+(?:\.\d+)?)\b/g;
const STRINGS = /'([^'\\]|\\.)*'/g;
const COMMENTS = /--[^\n]*/g;

export function highlightSql(sql) {
  const escaped = String(sql).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return escaped
    .replace(COMMENTS, (m) => `<span style="color: var(--ink-3);">${m}</span>`)
    .replace(STRINGS, (m) => `<span class="str">${m}</span>`)
    .replace(KEYWORDS, (m) => `<span class="kw">${m}</span>`)
    .replace(FUNCTIONS, (m) => `<span class="fn">${m}</span>`)
    .replace(NUMBERS, (m) => `<span class="num">${m}</span>`);
}
