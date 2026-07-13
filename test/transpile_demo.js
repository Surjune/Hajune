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
 *      - unmei/poi/onnumilai → true/false/null
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
const { transpile, TanglishTranspilerError } = require("../src/transpiler");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

/** Expect fn() to throw a TanglishTranspilerError containing `snippet`. */
function checkError(label, fn, snippet) {
  try {
    fn();
    failures++;
    console.log(`  FAIL  ${label} (no error was thrown)`);
  } catch (err) {
    const ok = err instanceof TanglishTranspilerError && err.message.includes(snippet);
    check(`${label} — "${err.message.slice(0, 70)}..."`, ok);
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
    // fresh scope each run, so top-level `let` is safe; 'require' is
    // passed in for built-ins like ullidu that need Node modules
    new Function("require", js)(require);
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
check("seyal becomes a JS function declaration",
  demoJS.includes("function match_check(peyar, score) {"));
check("enil/illana become if/else",
  demoJS.includes("if (score >= pass_marku) {") && demoJS.includes("} else {"));
check("thiruppi becomes return",
  demoJS.includes('return peyar + "pass";'));
check("achchu becomes console.log",
  demoJS.includes("console.log(match_check(\"Surjune\", 87));"));
check("first assignment emits let",
  demoJS.includes("let pass_marku = 50;"));

const reassign = compile("x = 1\nx = 2");
check("reassignment drops the let",
  reassign.includes("let x = 1;") && reassign.includes("\nx = 2;") &&
  reassign.indexOf("let") === reassign.lastIndexOf("let"));

const literals = compile("a = unmei\nb = poi\nc = onnumilai");
check("unmei → true, poi → false, onnumilai → null",
  literals.includes("let a = true;") &&
  literals.includes("let b = false;") &&
  literals.includes("let c = null;"));

const paramAssign = compile("seyal f(score) {\nscore = score + 1\nthiruppi score\n}");
check("assigning to a parameter never re-declares it",
  paramAssign.includes("score = score + 1;") && !paramAssign.includes("let score"));

// ---- 4. Precedence and parentheses round-trip -----------------------------
check(`achchu(2 + 3 * 4) prints 14 (got ${run("achchu(2 + 3 * 4)")[0]})`,
  run("achchu(2 + 3 * 4)")[0] === "14");
check(`achchu((2 + 3) * 4) prints 20 (got ${run("achchu((2 + 3) * 4)")[0]})`,
  run("achchu((2 + 3) * 4)")[0] === "20");
check("needed parentheses reappear in the JS",
  compile("achchu((2 + 3) * 4)").includes("(2 + 3) * 4"));
check("unneeded parentheses are not added",
  compile("achchu(2 + 3 * 4)").includes("console.log(2 + 3 * 4);"));
check(`10 - (3 - 2) keeps its grouping (got ${run("achchu(10 - (3 - 2))")[0]})`,
  run("achchu(10 - (3 - 2))")[0] === "9");

// ---- 5. Unary minus --------------------------------------------------------
check(`achchu(-5) prints -5 (got ${run("achchu(-5)")[0]})`, run("achchu(-5)")[0] === "-5");
check(`achchu(-(2 + 3)) prints -5 (got ${run("achchu(-(2 + 3))")[0]})`,
  run("achchu(-(2 + 3))")[0] === "-5");
check(`achchu(2 * -3) prints -6 (got ${run("achchu(2 * -3)")[0]})`,
  run("achchu(2 * -3)")[0] === "-6");

// ---- 6. Variables born inside a branch survive after it (Python-style) -----
const branchBorn =
  'marks = 80\nenil (marks >= 50) {\n  result = "pass"\n}\nillana {\n  result = "fail"\n}\nachchu(result)\n';
check(`variable created inside enil is usable after the block (got "${run(branchBorn)[0]}")`,
  run(branchBorn)[0] === "pass");
check("branch-born variable is hoisted as a single let above the if",
  compile(branchBorn).includes("let result;\nif (marks >= 50) {"));
const elseBorn =
  'x = 1\nenil (x > 5) {\n  y = 10\n}\nillana {\n  y = 20\n}\nachchu(y)\n';
check(`variable set in BOTH branches works (got ${run(elseBorn)[0]})`,
  run(elseBorn)[0] === "20");
const nestedBorn =
  'a = 1\nenil (a > 0) {\n  enil (a > 2) {\n    z = 100\n  }\n  illana {\n    z = 5\n  }\n}\nillana {\n  z = 0\n}\nachchu(z)\n';
check(`nested-if variable also hoists correctly (got ${run(nestedBorn)[0]})`,
  run(nestedBorn)[0] === "5");
check("already-declared variables are NOT hoisted again",
  !compile("r = 1\nenil (unmei) {\n  r = 2\n}\nachchu(r)").includes("let r;"));

// ---- 7. Semicolons, comments, blank lines end-to-end -----------------------
const messy = 'x = 5;\n\n// oru comment\n\nenil (x > 3) {\n  achchu("periya")\n}\nillana {\n  achchu("chinna")\n}\n';
check(`semicolons + comments + blank lines run fine (got "${run(messy)[0]}")`,
  run(messy)[0] === "periya");

// ---- 8. v2 features: loops, logic, const, lists -----------------------------
check(`varai counts 1 2 3 (got ${run("i = 1\nvarai (i <= 3) {\n  achchu(i)\n  i = i + 1\n}").join(",")})`,
  run("i = 1\nvarai (i <= 3) {\n  achchu(i)\n  i = i + 1\n}").join(",") === "1,2,3");
check(`mindum 1 .. 5 sums to 15, both ends included (got ${run("t = 0\nmindum i ulla 1 .. 5 {\n  t = t + i\n}\nachchu(t)")[0]})`,
  run("t = 0\nmindum i ulla 1 .. 5 {\n  t = t + i\n}\nachchu(t)")[0] === "15");
check("mindum over a list visits every item in order",
  run("mindum m ulla [10, 20, 30] {\n  achchu(m)\n}").join(",") === "10,20,30");
check("the loop variable survives after the loop (Python-style)",
  run("mindum i ulla 1 .. 3 {\n}\nachchu(i)")[0] === "4");
const bcOut = run("mindum i ulla 1 .. 10 {\n  enil (i == 3) {\n    thodar\n  }\n  enil (i == 5) {\n    niruthu\n  }\n  achchu(i)\n}");
check(`niruthu stops and thodar skips (got ${bcOut.join(",")})`, bcOut.join(",") === "1,2,4");
const gradeSrc = 'm = 80\nenil (m >= 90) {\n  achchu("A")\n}\nillaenil (m >= 75) {\n  achchu("B")\n}\nillana {\n  achchu("F")\n}';
check(`illaenil chain picks the right branch (got ${run(gradeSrc)[0]})`, run(gradeSrc)[0] === "B");
check("illaenil emits the classic '} else if (' shape",
  compile(gradeSrc).includes("} else if (m >= 75) {"));
check("matrum/allathu/alla become &&/||/! with correct grouping",
  run('a = 60\nenil (a >= 50 matrum alla (a > 100) allathu poi) {\n  achchu("ok")\n}')[0] === "ok" &&
  compile("x = a matrum b allathu c").includes("a && b || c"));
check("alla wraps comparisons in parentheses (!(a == b))",
  compile("x = alla a == b").includes("!(a == b)"));
check("marathu emits const",
  compile("marathu PASS = 50").includes("const PASS = 50;"));
checkError("changing a marathu constant is refused with its line",
  () => compile("marathu P = 50\nP = 60"), "marathu constant");
check(`lists: literal, index read and index write all work (got ${run("marks = [80, 65]\nmarks[0] = 99\nachchu(marks[0] + marks[1])")[0]})`,
  run("marks = [80, 65]\nmarks[0] = 99\nachchu(marks[0] + marks[1])")[0] === "164");
check("nested lists index correctly (g[1][0])",
  run("g = [[1, 2], [3, 4]]\nachchu(g[1][0])")[0] === "3");
check("variables born inside a varai loop survive it",
  run('varai (poi) {\n  x = 1\n}\nachchu("alive")')[0] === "alive");

// ---- 9. Built-in functions ---------------------------------------------------
check(`neelam gives string and list lengths (got ${run('achchu(neelam("vanakkam"))\nachchu(neelam([1, 2, 3]))').join(",")})`,
  run('achchu(neelam("vanakkam"))\nachchu(neelam([1, 2, 3]))').join(",") === "8,3");
check("enn and urai convert both ways",
  run('achchu(enn("5") + 1)\nachchu(urai(5) + "0")').join(",") === "6,50");
check(`muulu rounds and uchcham picks the biggest (got ${run("achchu(muulu(7 / 2))\nachchu(uchcham(10, 25, 4))").join(",")})`,
  run("achchu(muulu(7 / 2))\nachchu(uchcham(10, 25, 4))").join(",") === "4,25");
check("vagai names the kind of a value (number/string/list/null)",
  run('achchu(vagai(5))\nachchu(vagai("hi"))\nachchu(vagai([1]))\nachchu(vagai(onnumilai))').join(",") ===
  "number,string,list,null");
check("innaipu and neekku grow and shrink a list",
  run("m = [1, 2]\ninnaipu(m, 3)\nachchu(neelam(m))\nachchu(neekku(m))\nachchu(neelam(m))").join(",") === "3,3,2");
check("ehtho gives a number between 0 and 1",
  run("r = ehtho()\nachchu(r >= 0 matrum r < 1)")[0] === "true");
check("only the built-ins a program uses are pasted into its JS",
  compile("achchu(neelam([1]))").includes("function neelam") &&
  !compile("achchu(neelam([1]))").includes("function ehtho") &&
  !compile("achchu(1)").includes("Tanglish built-ins"));
check("ullidu's helper (keyboard input) is included when called",
  compile('peyar = ullidu("Name: ")').includes("function ullidu"));

console.log("");
if (failures === 0) {
  console.log("All transpiler checks passed.");
} else {
  console.log(`${failures} check(s) FAILED.`);
  process.exitCode = 1;
}
