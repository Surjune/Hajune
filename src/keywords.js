/**
 * keywords.js — Tanglish keyword vocabulary
 * ------------------------------------------
 * Maps every reserved Tanglish keyword (Roman/phonetic Tamil script)
 * to its token type name. The lexer consults this map after scanning
 * an identifier-shaped word: if the word is present here, it is a
 * KEYWORD token of the given type; otherwise it is a plain IDENTIFIER.
 *
 * Linguistic authority: R S Surjune / Shri Hari A K.
 * Do not add, remove, or alias keywords without their sign-off.
 */
"use strict";
const KEYWORDS = Object.freeze({
  uruvaaku:  "FUNCTION", // function definition
  irundhal:  "IF",       // conditional (if)
  illana:    "ELSE",     // else branch
  thiruppi:  "RETURN",   // return statement (canonical; 'thiruppu' is NOT reserved)
  solluu:    "PRINT",    // console output
  unmai:     "TRUE",     // boolean true
  poi:       "FALSE",    // boolean false
  onnumilla: "NULL",     // null value
});
/**
 * Look up a scanned word. Returns the keyword token type
 * (e.g. "IF") or null if the word is a plain identifier.
 */
function keywordType(word) {
  return Object.prototype.hasOwnProperty.call(KEYWORDS, word)
    ? KEYWORDS[word]
    : null;
}
module.exports = { KEYWORDS, keywordType };
