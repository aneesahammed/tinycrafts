const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");

function functionSource(name) {
  const pattern = new RegExp("^        (?:async )?function " + name + "\\(", "m");
  const start = pattern.exec(html);
  if (!start) throw new Error("Missing app function: " + name);
  const tail = html.slice(start.index);
  const end = /^        }\s*$/m.exec(tail);
  if (!end) throw new Error("Missing function end: " + name);
  return tail.slice(0, end.index + end[0].trimEnd().length);
}

function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error("Missing app source boundary");
  return html.slice(from, to);
}

function runtime(globals, sources) {
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(sources.join("\n"), context);
  return context;
}

module.exports = { html, functionSource, between, runtime };
