/**
 * builtins.js — Tanglish built-in functions
 * ------------------------------------------
 * These ten names are NOT keywords — they are ready-made functions,
 * exactly like achchu maps to console.log. The transpiler watches for
 * calls to them and pastes the matching JavaScript helper at the top
 * of the generated program (only the ones actually used, so --show-js
 * output stays small and readable).
 *
 * Built-in names are ordinary identifiers, so they are lowercase and
 * case-sensitive like any variable — unlike keywords.
 *
 * Vocabulary (locked by the design team):
 *   ullidu   — read a line the user types (input)
 *   neelam   — length of a string or list
 *   innaipu  — add an item to the end of a list (append)
 *   neekku   — remove and return the last item of a list (pop)
 *   enn      — convert to a number
 *   urai     — convert to a string (text)
 *   ehtho    — random number between 0 and 1
 *   muulu    — round to the nearest whole number
 *   uchcham  — the biggest of the given values (max)
 *   vagai    — what kind of value is this? (type)
 */
"use strict";

const BUILTINS = Object.freeze({
  ullidu: [
    'function ullidu(message) {',
    '  if (message !== undefined) process.stdout.write(String(message));',
    '  const fs = require("fs");',
    '  const buffer = Buffer.alloc(4096);',
    '  const bytes = fs.readSync(0, buffer, 0, 4096);',
    '  return buffer.toString("utf8", 0, bytes)',
    '    .replace(/^\\uFEFF/, "") // piped Windows input may start with a BOM',
    '    .replace(/\\r?\\n$/, "");',
    '}',
  ].join("\n"),

  neelam: "function neelam(x) { return x.length; }",

  innaipu: "function innaipu(list, item) { list.push(item); return list; }",

  neekku: "function neekku(list) { return list.pop(); }",

  enn: "function enn(x) { return Number(x); }",

  urai: "function urai(x) { return String(x); }",

  ehtho: "function ehtho() { return Math.random(); }",

  muulu: "function muulu(x) { return Math.round(x); }",

  uchcham: "function uchcham(...values) { return Math.max(...values); }",

  vagai: [
    "function vagai(x) {",
    '  if (x === null) return "null";',
    '  if (Array.isArray(x)) return "list";',
    "  return typeof x; // \"number\", \"string\", \"boolean\", ...",
    "}",
  ].join("\n"),
});

module.exports = { BUILTINS };
