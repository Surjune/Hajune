/**
 * tokens.js — Chevrotain token vocabulary + adapter
 * --------------------------------------------------
 * The Tanglish lexer (src/lexer.js) is HAND-WRITTEN — a graded project
 * requirement — so we do NOT use Chevrotain's built-in Lexer class.
 * Chevrotain's parser, however, needs two things from us:
 *
 *   1. A "vocabulary" of TokenType objects made with createToken().
 *      Since Chevrotain never scans source text here, every token's
 *      pattern is Lexer.NA ("not applicable") — Chevrotain's official
 *      sentinel for tokens that are produced externally.
 *
 *   2. The token array converted into Chevrotain's IToken shape.
 *      adaptTokens() below does that mapping using Chevrotain's own
 *      createTokenInstance() factory.
 *
 * CATEGORY tokens: ComparisonOperator, AdditiveOperator and
 * MultiplicativeOperator are "parent" tokens. For example, GT, LT, GTE,
 * LTE, EQ and NEQ all declare `categories: [ComparisonOperator]`, so a
 * grammar rule can say CONSUME(ComparisonOperator) once instead of a
 * six-way OR. This keeps the expression grammar short and readable.
 */
"use strict";
const { createToken, createTokenInstance, Lexer } = require("chevrotain");

// ---- Category (parent) tokens — never matched directly -----------------
const ComparisonOperator = createToken({ name: "ComparisonOperator", pattern: Lexer.NA });
const AdditiveOperator = createToken({ name: "AdditiveOperator", pattern: Lexer.NA });
const MultiplicativeOperator = createToken({ name: "MultiplicativeOperator", pattern: Lexer.NA });

// Small helper so every concrete token reads as one tidy line.
// `label` is the human-friendly name Chevrotain uses in error messages.
// (categories is only added when present — Chevrotain treats an
//  explicit `categories: undefined` as a real, broken category.)
function token(name, label, categories) {
  const config = { name, pattern: Lexer.NA, label };
  if (categories) config.categories = categories;
  return createToken(config);
}

// ---- Concrete tokens (1:1 with the hand-written lexer's type names) ----
const T = {
  // literals and names
  NUMBER: token("Number", "a number"),
  STRING: token("String", "a string"),
  IDENTIFIER: token("Identifier", "a name"),
  // keywords
  FUNCTION: token("Function", "'seyal'"),
  IF: token("If", "'enil'"),
  ELSE: token("Else", "'illana'"),
  RETURN: token("Return", "'thiruppi'"),
  PRINT: token("Print", "'achchu'"),
  TRUE: token("True", "'unmei'"),
  FALSE: token("False", "'poi'"),
  NULL: token("Null", "'onnumilai'"),
  // operators
  ASSIGN: token("Assign", "'='"),
  PLUS: token("Plus", "'+'", [AdditiveOperator]),
  MINUS: token("Minus", "'-'", [AdditiveOperator]),
  STAR: token("Star", "'*'", [MultiplicativeOperator]),
  SLASH: token("Slash", "'/'", [MultiplicativeOperator]),
  GT: token("Gt", "'>'", [ComparisonOperator]),
  LT: token("Lt", "'<'", [ComparisonOperator]),
  GTE: token("Gte", "'>='", [ComparisonOperator]),
  LTE: token("Lte", "'<='", [ComparisonOperator]),
  EQ: token("Eq", "'=='", [ComparisonOperator]),
  NEQ: token("Neq", "'!='", [ComparisonOperator]),
  // punctuation
  LPAREN: token("LParen", "'('"),
  RPAREN: token("RParen", "')'"),
  LBRACE: token("LBrace", "'{'"),
  RBRACE: token("RBrace", "'}'"),
  COMMA: token("Comma", "','"),
  SEMICOLON: token("Semicolon", "';'"),
  NEWLINE: token("Newline", "end of line"),
  // NOTE: no "EOF" token — Chevrotain reserves that name and appends its
  // own end-of-file marker automatically; adaptTokens() drops ours.
};

// The full vocabulary the parser is constructed with.
// Categories must be included so Chevrotain's self-analysis knows them.
const allTokens = [
  ComparisonOperator,
  AdditiveOperator,
  MultiplicativeOperator,
  ...Object.values(T),
];

/**
 * Convert the hand-written lexer's tokens
 *   { type: "NUMBER", value: "50", line: 1, column: 14 }
 * into Chevrotain IToken instances.
 *
 * Offsets are NaN because the hand-written lexer tracks line/column,
 * not absolute offsets — Chevrotain only needs offsets for editor
 * features we don't use. Line/column are what power our error messages.
 */
function adaptTokens(lexerTokens) {
  const adapted = [];
  for (const t of lexerTokens) {
    if (t.type === "EOF") continue; // Chevrotain adds its own EOF marker
    const tokenType = T[t.type];
    if (!tokenType) {
      throw new Error(`Internal error: no Chevrotain token type for "${t.type}"`);
    }
    adapted.push(
      createTokenInstance(
        tokenType,
        t.value,                              // image (the raw text)
        NaN, NaN,                             // startOffset, endOffset (unused)
        t.line, t.line,                       // startLine, endLine
        t.column,                             // startColumn
        t.column + t.value.length - 1         // endColumn
      )
    );
  }
  return adapted;
}

module.exports = {
  T,
  allTokens,
  adaptTokens,
  ComparisonOperator,
  AdditiveOperator,
  MultiplicativeOperator,
};
