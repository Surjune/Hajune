/**
 * errors.js — Hajune error classes
 * -----------------------------------
 * Every user-facing Hajune error (from the lexer, the parser, and
 * later the transpiler/CLI) extends one base class, HajuneError.
 *
 * Why a shared base class?  The CLI (Task 4) can then catch ALL
 * language errors with a single check:
 *
 *     if (err instanceof HajuneError) { print friendly message }
 *
 * instead of listing every error type separately.  Each error carries
 * the line and column where the problem was found, so messages can
 * always point the student to the right place in their .tml file.
 */
"use strict";

/** Base class for all Hajune language errors. */
class HajuneError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = "HajuneError";
    this.line = line;
    this.column = column;
  }
}

/** Thrown by src/lexer.js when the source text itself is invalid. */
class HajuneLexerError extends HajuneError {
  constructor(message, line, column) {
    super(message, line, column);
    this.name = "HajuneLexerError";
  }
}

/** Thrown by src/parser.js when the token stream is not valid Hajune grammar. */
class HajuneParserError extends HajuneError {
  constructor(message, line, column) {
    super(message, line, column);
    this.name = "HajuneParserError";
  }
}

/** Thrown by src/transpiler.js if it meets an AST node it does not know. */
class HajuneTranspilerError extends HajuneError {
  constructor(message, line, column) {
    super(message, line, column);
    this.name = "HajuneTranspilerError";
  }
}

module.exports = {
  HajuneError,
  HajuneLexerError,
  HajuneParserError,
  HajuneTranspilerError,
};
