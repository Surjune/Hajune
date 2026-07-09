/**
 * lexer.js — Hand-written Tanglish tokenizer
 * -------------------------------------------
 * Reads a .tml source string character by character and produces a
 * flat array of token objects:
 *
 *   { type: "NUMBER", value: "50", line: 1, column: 14 }
 *
 * Spec (locked):
 *   - Keywords come from src/keywords.js (thiruppi only; no thiruppu alias)
 *   - Identifiers: [A-Za-z_][A-Za-z0-9_]*  (Roman baseline only)
 *   - Numbers: integers only (no floats, no leading sign)
 *   - Strings: double-quoted "..." (no escape sequences yet)
 *   - Operators: =  +  -  *  /  >=  <=  >  <  ==  !=
 *   - Punctuation: ( ) { } ,
 *   - Semicolons: optional — emitted as SEMICOLON if present
 *   - Newlines: statement terminators — emitted as NEWLINE
 *   - Spaces/tabs: skipped
 *   - Comments: // to end of line, skipped
 *   - Unknown character: throws TanglishLexerError with line + character
 */
"use strict";
const { keywordType } = require("./keywords");
// TanglishLexerError now lives in src/errors.js (shared with the parser),
// but is still re-exported below so existing require("./lexer") users keep working.
const { TanglishLexerError } = require("./errors");
function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}
function isIdentStart(ch) {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}
function isIdentPart(ch) {
  return isIdentStart(ch) || isDigit(ch);
}
const TWO_CHAR_OPS = {
  ">=": "GTE",
  "<=": "LTE",
  "==": "EQ",
  "!=": "NEQ",
};
const ONE_CHAR_TOKENS = {
  "=": "ASSIGN",
  "+": "PLUS",
  "-": "MINUS",
  "*": "STAR",
  "/": "SLASH",
  ">": "GT",
  "<": "LT",
  "(": "LPAREN",
  ")": "RPAREN",
  "{": "LBRACE",
  "}": "RBRACE",
  ",": "COMMA",
  ";": "SEMICOLON",
};
function tokenize(source) {
  const tokens = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;
  const col = () => pos - lineStart + 1;
  const push = (type, value, tokLine, tokCol) => {
    tokens.push({ type, value, line: tokLine, column: tokCol });
  };
  while (pos < source.length) {
    const ch = source[pos];
    if (ch === " " || ch === "\t" || ch === "\r") {
      pos++;
      continue;
    }
    if (ch === "\n") {
      push("NEWLINE", "\\n", line, col());
      pos++;
      line++;
      lineStart = pos;
      continue;
    }
    if (ch === "/" && source[pos + 1] === "/") {
      while (pos < source.length && source[pos] !== "\n") pos++;
      continue;
    }
    if (isDigit(ch)) {
      const startCol = col();
      let start = pos;
      while (pos < source.length && isDigit(source[pos])) pos++;
      const next = source[pos];
      if (next === "." && isDigit(source[pos + 1])) {
        throw new TanglishLexerError(
          `Lexer error on line ${line}: float literals like ` +
          `'${source.slice(start, pos + 2)}...' are not supported yet — ` +
          `Tanglish currently accepts whole numbers only.`,
          line, startCol
        );
      }
      if (next !== undefined && isIdentStart(next)) {
        throw new TanglishLexerError(
          `Lexer error on line ${line}: identifiers cannot start with a digit ` +
          `(saw '${source.slice(start, pos + 1)}').`,
          line, startCol
        );
      }
      push("NUMBER", source.slice(start, pos), line, startCol);
      continue;
    }
    if (isIdentStart(ch)) {
      const startCol = col();
      let start = pos;
      while (pos < source.length && isIdentPart(source[pos])) pos++;
      const word = source.slice(start, pos);
      const kw = keywordType(word);
      push(kw !== null ? kw : "IDENTIFIER", word, line, startCol);
      continue;
    }
    if (ch === '"') {
      const startCol = col();
      const startLine = line;
      pos++;
      let start = pos;
      while (pos < source.length && source[pos] !== '"' && source[pos] !== "\n") {
        pos++;
      }
      if (pos >= source.length || source[pos] === "\n") {
        throw new TanglishLexerError(
          `Lexer error on line ${startLine}: unterminated string literal — ` +
          `missing closing double quote (").`,
          startLine, startCol
        );
      }
      push("STRING", source.slice(start, pos), startLine, startCol);
      pos++;
      continue;
    }
    const two = source.slice(pos, pos + 2);
    if (TWO_CHAR_OPS[two]) {
      push(TWO_CHAR_OPS[two], two, line, col());
      pos += 2;
      continue;
    }
    if (ONE_CHAR_TOKENS[ch]) {
      push(ONE_CHAR_TOKENS[ch], ch, line, col());
      pos++;
      continue;
    }
    throw new TanglishLexerError(
      `Lexer error on line ${line}: unexpected character '${ch}' ` +
      `(column ${col()}). Tanglish does not recognize this symbol.`,
      line, col()
    );
  }
  push("EOF", "", line, col());
  return tokens;
}
module.exports = { tokenize, TanglishLexerError };
