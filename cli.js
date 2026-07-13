#!/usr/bin/env node
/**
 * cli.js — The Tanglish command line
 * -----------------------------------
 * Makes running a Tanglish program feel exactly like running Python:
 *
 *     tanglish run grade_check.tml          (after npm link)
 *     node cli.js run examples/grade_check.tml
 *     node cli.js run examples/grade_check.tml --show-js
 *
 * Pipeline per run:  read file → tokenize → parse → transpile → execute.
 * Any Tanglish language error (lexer or parser) is printed as ONE
 * friendly line with the line number — never a JavaScript stack trace.
 */
"use strict";
const fs = require("fs");
const { program } = require("commander");
const { tokenize } = require("./src/lexer");
const { parse } = require("./src/parser");
const { transpile } = require("./src/transpiler");
const { TanglishError } = require("./src/errors");
const { version } = require("./package.json");

program
  .name("tanglish")
  .description("Tanglish — programming in phonetic Tamil. Runs .tml files.")
  .version(version);

program
  .command("run")
  .description("transpile a .tml program to JavaScript and run it")
  .argument("<file>", "path to the .tml program")
  .option("--show-js", "also print the generated JavaScript before running")
  .action(runFile);

/** The whole 'tanglish run' journey, start to finish. */
function runFile(file, options) {
  // A missing file should read like a sentence, not an ENOENT dump.
  if (!fs.existsSync(file)) {
    console.error(`Error: cannot find '${file}' — check the file name and path.`);
    process.exit(1);
  }

  // Wrong extension is only a warning; maybe they know what they're doing.
  if (!file.endsWith(".tml")) {
    console.error(`Warning: '${file}' does not end in .tml — trying to run it anyway.`);
  }

  // Windows editors (Notepad, PowerShell) often save UTF-8 files with an
  // invisible "byte order mark" as the very first character. Strip it,
  // or the lexer reports a baffling 'unexpected character' on line 1.
  const source = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");

  // Source → JavaScript. Language mistakes stop here with one clear line.
  let js;
  try {
    js = transpile(parse(tokenize(source)));
  } catch (err) {
    if (err instanceof TanglishError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err; // not a language error — a real bug in Tanglish itself
  }

  if (options.showJs) {
    console.log("---- generated JavaScript ----");
    console.log(js.trimEnd());
    console.log("---- program output ----------");
  }

  // Execute the generated JavaScript right here in Node. We hand it
  // 'require' so built-ins like ullidu (keyboard input) can reach
  // Node's own modules. If the program crashes while running (e.g.
  // calling a function that doesn't exist), report it in one line —
  // no JavaScript stack trace.
  try {
    new Function("require", js)(require);
  } catch (err) {
    console.error(`Runtime error: ${err.message}`);
    process.exit(1);
  }
}

program.parse();
