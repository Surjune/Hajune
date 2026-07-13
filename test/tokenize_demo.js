/**
 * tokenize_demo.js — Lexer demonstration & sanity checks
 * -------------------------------------------------------
 * Run with:  node test/tokenize_demo.js
 *
 * 1. Tokenizes examples/grade_check.tml and prints every token.
 * 2. Verifies the locked lexer behaviors:
 *      - demo program produces 51 tokens (including EOF)
 *      - optional semicolons emit SEMICOLON without error
 *      - // comments are skipped
 *      - float literal (98.5) throws a friendly error with line number
 *      - unknown character (@) throws with line + column
 *      - unterminated string throws a clear error
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { tokenize, TanglishLexerError } = require("../src/lexer");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

/** Expect fn() to throw a TanglishLexerError whose message contains `snippet`. */
function checkError(label, fn, snippet) {
  try {
    fn();
    failures++;
    console.log(`  FAIL  ${label} (no error was thrown)`);
  } catch (err) {
    const ok = err instanceof TanglishLexerError && err.message.includes(snippet);
    check(`${label} — "${err.message.slice(0, 60)}..."`, ok);
  }
}

// ---- 1. Tokenize the demo program -------------------------------------
const demoPath = path.join(__dirname, "..", "examples", "grade_check.tml");
const source = fs.readFileSync(demoPath, "utf8");
const tokens = tokenize(source);

console.log("Tokens for examples/grade_check.tml:");
console.log("------------------------------------");
for (const t of tokens) {
  console.log(
    `  line ${String(t.line).padStart(2)}  col ${String(t.column).padStart(2)}  ` +
    `${t.type.padEnd(11)} ${JSON.stringify(t.value)}`
  );
}
console.log("");

// ---- 2. Sanity checks ---------------------------------------------------
console.log("Checks:");
check(`demo program tokenizes to 51 tokens (got ${tokens.length})`, tokens.length === 51);
check("last token is EOF", tokens[tokens.length - 1].type === "EOF");
check("'thiruppi' lexes as RETURN keyword", tokens.some((t) => t.type === "RETURN"));
check(
  "'thiruppu' lexes as plain IDENTIFIER (not a keyword)",
  tokenize("thiruppu")[0].type === "IDENTIFIER"
);
check(
  "keywords are case-insensitive (Enil / ENIL both mean if)",
  tokenize("Enil")[0].type === "IF" && tokenize("ENIL")[0].type === "IF"
);
check(
  "new v2 keywords lex correctly (varai/mindum/matrum/marathu)",
  tokenize("varai")[0].type === "WHILE" &&
  tokenize("mindum")[0].type === "FOR" &&
  tokenize("matrum")[0].type === "AND" &&
  tokenize("marathu")[0].type === "CONST"
);
check(
  "list brackets lex ([1, 2] → LBRACKET NUMBER COMMA NUMBER RBRACKET)",
  tokenize("[1, 2]").map((t) => t.type).join(" ") ===
    "LBRACKET NUMBER COMMA NUMBER RBRACKET EOF"
);
check(
  "range dots lex (1 .. 10 and 1..10 both give DOTDOT)",
  tokenize("1 .. 10")[1].type === "DOTDOT" &&
  tokenize("1..10").map((t) => t.type).join(" ") === "NUMBER DOTDOT NUMBER EOF"
);
check(
  "optional semicolon emits SEMICOLON without error",
  tokenize("x = 5;").some((t) => t.type === "SEMICOLON")
);
check(
  "// comment is skipped",
  tokenize("x = 1 // vilakkam (comment)").every((t) => t.type !== "IDENTIFIER" || t.value === "x")
);
checkError("float literal 98.5 is rejected", () => tokenize("mark = 98.5"), "float literals");
checkError("unknown character @ is rejected", () => tokenize("a @ b"), "unexpected character '@'");
checkError("unterminated string is rejected", () => tokenize('s = "hello'), "unterminated string");

console.log("");
if (failures === 0) {
  console.log("All lexer checks passed.");
} else {
  console.log(`${failures} check(s) FAILED.`);
  process.exitCode = 1;
}
