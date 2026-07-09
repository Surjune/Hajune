/**
 * errors.js — Tanglish error classes
 * -----------------------------------
 * Every user-facing Tanglish error (from the lexer, the parser, and
 * later the transpiler/CLI) extends one base class, TanglishError.
 *
 * Why a shared base class?  The CLI (Task 4) can then catch ALL
 * language errors with a single check:
 *
 *     if (err instanceof TanglishError) { print friendly message }
 *
 * instead of listing every error type separately.  Each error carries
 * the line and column where the problem was found, so messages can
 * always point the student to the right place in their .tml file.
 */
"use strict";

/** Base class for all Tanglish language errors. */
class TanglishError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = "TanglishError";
    this.line = line;
    this.column = column;
  }
}

/** Thrown by src/lexer.js when the source text itself is invalid. */
class TanglishLexerError extends TanglishError {
  constructor(message, line, column) {
    super(message, line, column);
    this.name = "TanglishLexerError";
  }
}

/** Thrown by src/parser.js when the token stream is not valid Tanglish grammar. */
class TanglishParserError extends TanglishError {
  constructor(message, line, column) {
    super(message, line, column);
    this.name = "TanglishParserError";
  }
}

module.exports = { TanglishError, TanglishLexerError, TanglishParserError };
