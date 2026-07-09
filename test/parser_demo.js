/**
 * parser_demo.js — Parser demonstration & sanity checks
 * ------------------------------------------------------
 * Run with:  node test/parser_demo.js
 *
 * 1. Parses examples/grade_check.tml and prints the resulting AST.
 * 2. Verifies the locked parser behaviors:
 *      - demo program → Program with 3 statements of the right types
 *      - precedence: 2 + 3 * 4 groups as 2 + (3 * 4) and equals 14
 *      - unary minus: -5 and -(2 + 3)
 *      - optional semicolons are accepted
 *      - blank lines are tolerated anywhere
 *      - grammar mistakes throw TanglishParserError with a line number
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { tokenize } = require("../src/lexer");
const { parse, TanglishParserError } = require("../src/parser");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

/** Expect fn() to throw a TanglishParserError whose message contains `snippet`. */
function checkError(label, fn, snippet) {
  try {
    fn();
    failures++;
    console.log(`  FAIL  ${label} (no error was thrown)`);
  } catch (err) {
    const ok = err instanceof TanglishParserError && err.message.includes(snippet);
    check(`${label} — "${err.message.slice(0, 70)}..."`, ok);
  }
}

/** Shortcut: source string → AST. */
function parseSource(source) {
  return parse(tokenize(source));
}

/**
 * Tiny test-only evaluator for numeric expression ASTs.
 * Lets us PROVE precedence: evaluating the tree for "2 + 3 * 4"
 * must give 14, not 20.
 */
function evalExpr(node) {
  switch (node.type) {
    case "NumberLiteral": return node.value;
    case "UnaryExpression": return -evalExpr(node.argument);
    case "BinaryExpression": {
      const l = evalExpr(node.left);
      const r = evalExpr(node.right);
      switch (node.operator) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
      }
    }
  }
  throw new Error(`evalExpr cannot handle node type ${node.type}`);
}

// ---- 1. Parse the demo program and show the AST -------------------------
const demoPath = path.join(__dirname, "..", "examples", "grade_check.tml");
const ast = parseSource(fs.readFileSync(demoPath, "utf8"));

console.log("AST for examples/grade_check.tml:");
console.log("---------------------------------");
console.log(JSON.stringify(ast, null, 2));
console.log("");

// ---- 2. Structure checks on the demo AST --------------------------------
console.log("Checks:");
check("root node is a Program", ast.type === "Program");
check(`program has 3 top-level statements (got ${ast.body.length})`, ast.body.length === 3);
check("statement 1 is Assignment of pass_marku",
  ast.body[0].type === "Assignment" && ast.body[0].name === "pass_marku");
check("statement 2 is FunctionDeclaration match_check(peyar, score)",
  ast.body[1].type === "FunctionDeclaration" &&
  ast.body[1].name === "match_check" &&
  JSON.stringify(ast.body[1].params) === '["peyar","score"]');
check("statement 3 is PrintStatement", ast.body[2].type === "PrintStatement");

const ifNode = ast.body[1].body.body[0];
check("function body holds an IfStatement", ifNode.type === "IfStatement");
check("if condition is score >= pass_marku",
  ifNode.condition.type === "BinaryExpression" && ifNode.condition.operator === ">=");
check("then-branch returns peyar + \"pass\"",
  ifNode.consequent.body[0].type === "ReturnStatement" &&
  ifNode.consequent.body[0].argument.operator === "+");
check("else-branch exists (illana on its own line works)",
  ifNode.alternate !== null && ifNode.alternate.body[0].type === "ReturnStatement");
check("print argument is the match_check(...) call",
  ast.body[2].argument.type === "CallExpression" &&
  ast.body[2].argument.callee === "match_check" &&
  ast.body[2].argument.args.length === 2);
check("AST nodes carry line numbers", ifNode.line === 3 && ast.body[0].line === 1);

// ---- 3. Operator precedence ---------------------------------------------
const prec = parseSource("x = 2 + 3 * 4").body[0].value;
check("2 + 3 * 4 groups multiplication inside addition's right side",
  prec.type === "BinaryExpression" && prec.operator === "+" &&
  prec.right.type === "BinaryExpression" && prec.right.operator === "*");
check(`2 + 3 * 4 evaluates to 14 (got ${evalExpr(prec)})`, evalExpr(prec) === 14);
const grouped = parseSource("x = (2 + 3) * 4").body[0].value;
check(`(2 + 3) * 4 evaluates to 20 (got ${evalExpr(grouped)})`, evalExpr(grouped) === 20);

// ---- 4. Unary minus -------------------------------------------------------
const neg = parseSource("x = -5").body[0].value;
check("-5 parses as UnaryExpression(-, 5)",
  neg.type === "UnaryExpression" && neg.operator === "-" &&
  neg.argument.type === "NumberLiteral" && evalExpr(neg) === -5);
const negGroup = parseSource("x = -(2 + 3)").body[0].value;
check(`-(2 + 3) evaluates to -5 (got ${evalExpr(negGroup)})`,
  negGroup.type === "UnaryExpression" && evalExpr(negGroup) === -5);

// ---- 5. Literals: unmai / poi / onnumilla ---------------------------------
const lits = parseSource("a = unmai\nb = poi\nc = onnumilla");
check("unmai → BooleanLiteral true", lits.body[0].value.type === "BooleanLiteral" && lits.body[0].value.value === true);
check("poi → BooleanLiteral false", lits.body[1].value.type === "BooleanLiteral" && lits.body[1].value.value === false);
check("onnumilla → NullLiteral", lits.body[2].value.type === "NullLiteral");

// ---- 6. Optional semicolons and blank lines -------------------------------
check("optional semicolons parse cleanly",
  parseSource("a = 1;\nb = 2;").body.length === 2);
check("blank lines are tolerated anywhere",
  parseSource("\n\na = 1\n\n\nb = 2\n\n").body.length === 2);
check("comments plus blank lines still parse",
  parseSource("// header comment\n\na = 1 // trailing\n").body.length === 1);

// ---- 7. Friendly parser errors --------------------------------------------
checkError("missing closing brace is reported with a line number",
  () => parseSource("uruvaaku f() {\nthiruppi 1\n"), "on line");
checkError("malformed if (missing ')') is reported",
  () => parseSource("irundhal (x > 1 {\nthiruppi 1\n}"), "on line 1");
checkError("dangling operator is reported",
  () => parseSource("a = 1 +"), "on line 1");

console.log("");
if (failures === 0) {
  console.log("All parser checks passed.");
} else {
  console.log(`${failures} check(s) FAILED.`);
  process.exitCode = 1;
}
