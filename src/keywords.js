/**
 * keywords.js — Tanglish keyword vocabulary (v2)
 * -----------------------------------------------
 * Maps every reserved Tanglish keyword (Roman/phonetic Tamil script)
 * to its token type name. The lexer consults this map after scanning
 * an identifier-shaped word: if the word is present here, it is a
 * KEYWORD token of the given type; otherwise it is a plain IDENTIFIER.
 *
 * Keywords are CASE-INSENSITIVE: enil, Enil and ENIL all mean "if".
 * The map stores lowercase; keywordType() lowercases before looking up.
 * (Variable names stay case-sensitive — only keywords get this grace.)
 *
 * Linguistic authority: R S Surjune / Shri Hari A K.
 * Do not add, remove, or alias keywords without their sign-off.
 * Note: built-in FUNCTIONS (ullidu, neelam, enn, ...) are NOT keywords —
 * they live in src/builtins.js and behave like ordinary functions.
 */
"use strict";
const KEYWORDS = Object.freeze({
  // core (since v1, some renamed in v2)
  seyal:     "FUNCTION", // function definition        (v1: uruvaaku)
  enil:      "IF",       // conditional (if)           (v1: irundhal)
  illaenil:  "ELSEIF",   // chained condition (else if)
  illana:    "ELSE",     // else branch
  thiruppi:  "RETURN",   // return statement (canonical; 'thiruppu' is NOT reserved)
  achchu:    "PRINT",    // console output             (v1: solluu)
  unmei:     "TRUE",     // boolean true               (v1: unmai)
  poi:       "FALSE",    // boolean false
  onnumilai: "NULL",     // null value                 (v1: onnumilla)
  // loops
  varai:     "WHILE",    // repeat while condition holds
  mindum:    "FOR",      // counted / for-each loop
  niruthu:   "BREAK",    // exit the loop now
  thodar:    "CONTINUE", // skip to the next round
  ulla:      "IN",       // 'in' — joins mindum with its range or list
  // logic
  matrum:    "AND",      // both conditions true
  allathu:   "OR",       // either condition true
  alla:      "NOT",      // reverse a condition
  // declarations
  marathu:   "CONST",    // constant — assigned once, never changed
});
/**
 * Look up a scanned word (case-insensitively). Returns the keyword
 * token type (e.g. "IF") or null if the word is a plain identifier.
 */
function keywordType(word) {
  const lower = word.toLowerCase();
  return Object.prototype.hasOwnProperty.call(KEYWORDS, lower)
    ? KEYWORDS[lower]
    : null;
}
module.exports = { KEYWORDS, keywordType };
