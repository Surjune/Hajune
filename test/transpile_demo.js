/**
 * transpile_demo.js — Transpiler demonstration & sanity checks
 * -------------------------------------------------------------
 * Run with:  node test/transpile_demo.js
 *
 * 1. Transpiles examples/grade_check.tml and prints the generated JS.
 * 2. RUNS the generated JS (with console.log captured) and verifies the
 *    program output is exactly "Surjunepass".
 * 3. Verifies the locked emitter rules:
 *      - first assignment → let, reassignment → plain name
 *      - unmai/poi/onnumilla → true/false/null
 *      - precedence survives the round trip (2 + 3 * 4 prints 14)
 *      - parentheses are re-inserted where needed ((2 + 3) * 4 prints 20)
 *      - unary minus works
 *      - semicolons, comments and blank lines don't disturb the output
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { tokenize } = require("../src/lexer");
const { parse } = require("../src/parser");
const { transpile } = require("../src/transpiler");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

/** Full pipeline: Tanglish source string → JavaScript source string. */
function compile(source) {
  return transpile(parse(tokenize(source)));
}

/** Run generated JS and capture everything it console.logs. */
function runJS(js) {
  const captured = [];
  const realLog = console.log;
  console.log = (...args) => captured.push(args.join(" "));
  try {
    new Function(js)(); // fresh scope each run, so top-level `let` is safe
  } finally {
    console.log = realLog;
  }
  return captured;
}

/** Convenience: Tanglish source → array of printed lines. */
function run(source) {
  return runJS(compile(source));
}

// ---- 1. Transpile the demo program and show the JavaScript --------------
const demoPath = path.join(__dirname, "..", "examples", "grade_check.tml");
const demoJS = compile(fs.readFileSync(demoPath, "utf8"));

console.log("Generated JavaScript for examples/grade_check.tml:");
console.log("---------------------------------------------------");
console.log(demoJS);

// ---- 2. Execute it and verify the program output -------------------------
console.log("Checks:");
const demoOutput = runJS(demoJS);
check(`demo program prints "Surjunepass" (got "${demoOutput[0]}")`,
  demoOutput.length === 1 && demoOutput[0] === "Surjunepass");

// ---- 3. Keyword / emitter mapping ----------------------------------------
check("uruvaaku becomes a JS function declaration",
  demoJS.includes("function match_check(peyar, score) {"));
check("irundhal/illana become if/else",
  demoJS.includes("if (score >= pass_marku) {") && demoJS.includes("} else {"));
check("thiruppi becomes return",
  demoJS.includes('return peyar + "pass";'));
check("solluu becomes console.log",
  demoJS.includes("console.log(match_check(\"Surjune\", 87));"));
check("first assignment emits let",
  demoJS.includes("let pass_marku = 50;"));

const reassign = compile("x = 1\nx = 2");
check("reassignment drops the let",
  reassign.includes("let x = 1;") && reassign.includes("\nx = 2;") &&
  reassign.indexOf("let") === reassign.lastIndexOf("let"));

const literals = compile("a = unmai\nb = poi\nc = onnumilla");
check("unmai → true, poi → false, onnumilla → null",
  literals.includes("let a = true;") &&
  literals.includes("let b = false;") &&
  literals.includes("let c = null;"));

const paramAssign = compile("uruvaaku f(score) {\nscore = score + 1\nthiruppi score\n}");
check("assigning to a parameter never re-declares it",
  paramAssign.includes("score = score + 1;") && !paramAssign.includes("let score"));

// ---- 4. Precedence and parentheses round-trip -----------------------------
check(`solluu(2 + 3 * 4) prints 14 (got ${run("solluu(2 + 3 * 4)")[0]})`,
  run("solluu(2 + 3 * 4)")[0] === "14");
check(`solluu((2 + 3) * 4) prints 20 (got ${run("solluu((2 + 3) * 4)")[0]})`,
  run("solluu((2 + 3) * 4)")[0] === "20");
check("needed parentheses reappear in the JS",
  compile("solluu((2 + 3) * 4)").includes("(2 + 3) * 4"));
check("unneeded parentheses are not added",
  compile("solluu(2 + 3 * 4)").includes("console.log(2 + 3 * 4);"));
check(`10 - (3 - 2) keeps its grouping (got ${run("solluu(10 - (3 - 2))")[0]})`,
  run("solluu(10 - (3 - 2))")[0] === "9");

// ---- 5. Unary minus --------------------------------------------------------
check(`solluu(-5) prints -5 (got ${run("solluu(-5)")[0]})`, run("solluu(-5)")[0] === "-5");
check(`solluu(-(2 + 3)) prints -5 (got ${run("solluu(-(2 + 3))")[0]})`,
  run("solluu(-(2 + 3))")[0] === "-5");
check(`solluu(2 * -3) prints -6 (got ${run("solluu(2 * -3)")[0]})`,
  run("solluu(2 * -3)")[0] === "-6");

// ---- 6. Semicolons, comments, blank lines end-to-end -----------------------
const messy = 'x = 5;\n\n// oru comment\n\nirundhal (x > 3) {\n  solluu("periya")\n}\nillana {\n  solluu("chinna")\n}\n';
check(`semicolons + comments + blank lines run fine (got "${run(messy)[0]}")`,
  run(messy)[0] === "periya");

console.log("");
if (failures === 0) {
  console.log("All transpiler checks passed.");
} else {
  console.log(`${failures} check(s) FAILED.`);
  process.exitCode = 1;
}
