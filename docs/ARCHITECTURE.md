# How Hajune Works — A Guided Tour

Read this first. It explains what every file does, in the order the
code actually runs, and traces one tiny program through the whole
pipeline so you can see each stage's input and output.

## The big picture

Hajune is a **transpiler**: it does not execute Tamil-keyword code
directly. It translates a `.tml` program into plain JavaScript and lets
Node.js run that. Four stages, each one small enough to read in a
sitting:

```
your .tml file
     │
     ▼
┌──────────────┐   flat token list        ┌──────────────┐
│ 1. LEXER     │ ────────────────────────▶│ 2. PARSER    │
│ src/lexer.js │  {type,value,line,col}   │ src/parser.js│
└──────────────┘                          └──────┬───────┘
                                                 │  AST (a tree)
                                                 ▼
┌──────────────┐   JavaScript text        ┌───────────────────┐
│ 4. NODE.JS   │ ◀────────────────────────│ 3. TRANSPILER     │
│ runs it      │                          │ src/transpiler.js │
└──────────────┘                          └───────────────────┘
```

The command-line tool (`cli.js`) is the driver that pushes a file
through all four stages when you type `hajune run program.tml`.

## One program, all four stages

Take this two-line program:

```
mark = 45
achchu(mark + 5)
```

**Stage 1 — the lexer** reads it character by character and produces
tokens. It doesn't know grammar; it only recognises *words and symbols*:

```
IDENTIFIER "mark"   ASSIGN "="   NUMBER "45"   NEWLINE
PRINT "achchu"   LPAREN "("   IDENTIFIER "mark"   PLUS "+"
NUMBER "5"   RPAREN ")"   NEWLINE   EOF
```

Every token carries its line and column — that is how every later error
can point at the right place.

**Stage 2 — the parser** checks the token order against the grammar
(documented in [GRAMMAR.md](GRAMMAR.md)) and builds the AST — a tree of
plain objects that captures *structure*, not spelling:

```
Program
├── Assignment  name:"mark"
│   └── NumberLiteral 45
└── PrintStatement
    └── BinaryExpression "+"
        ├── Identifier "mark"
        └── NumberLiteral 5
```

**Stage 3 — the transpiler** walks that tree top-down and prints
JavaScript. It remembers that `mark` is new (so it gets `let`), and it
knows `achchu` means `console.log`:

```js
let mark = 45;
console.log(mark + 5);
```

**Stage 4 — Node.js** executes that text. The terminal shows `50`.

## The files, in reading order

Read them in this order and each file only uses ideas from the ones
before it.

| # | File | One-line job |
|---|---|---|
| 1 | `src/keywords.js` | The dictionary: 18 Hajune keywords → token type names. Case-insensitive lookup. The ONLY place the vocabulary lives. |
| 2 | `src/lexer.js` | Hand-written scanner: characters in, tokens out. Rejects floats, unknown symbols and unclosed strings with friendly line-numbered errors. |
| 3 | `src/errors.js` | Three small error classes with one shared parent, `HajuneError`, so the CLI can catch every language error with a single check. |
| 4 | `src/tokens.js` | The bridge to Chevrotain: declares its token vocabulary (never used for scanning — our lexer is the scanner) and adapts our tokens into the shape Chevrotain expects. |
| 5 | `src/parser.js` | The grammar (Chevrotain `CstParser`, ~20 rules) plus the `AstBuilder` visitor that turns Chevrotain's raw tree into our clean AST. |
| 6 | `src/builtins.js` | The 10 built-in functions (`ullidu`, `neelam`, `enn`, …) as ready-made JavaScript snippets. Not keywords — just functions that exist for free. |
| 7 | `src/transpiler.js` | Walks the AST, emits indented JavaScript. Handles `let` vs reassignment, `marathu` constants, Python-style hoisting, precedence-aware parentheses, and pastes in only the built-ins the program used. |
| 8 | `cli.js` | Commander.js front door: `hajune run file.tml [--show-js]`. Friendly errors for missing files, strips Windows BOMs, executes the generated JS. |

Supporting folders:

| Folder | Contents |
|---|---|
| `docs/` | This file, plus `GRAMMAR.md` — the formal grammar, precedence table and every AST node shape. |
| `examples/` | `grade_check.tml` (the classic demo), `marks_report.tml` (lists + loops + grading), `number_game.tml` (interactive input). |
| `test/` | One demo/test file per stage: `tokenize_demo.js`, `parser_demo.js`, `transpile_demo.js`. `npm test` runs all three (~100 checks). The transpiler tests actually *execute* the generated JS and check the printed output. |

## Design decisions worth knowing

- **The lexer is hand-written on purpose** (a graded requirement).
  Chevrotain is used *only* as a grammar engine — its own lexer is
  bypassed, which is why every token in `src/tokens.js` has the pattern
  `Lexer.NA` ("never matched from text").
- **Keywords vs built-ins.** Control-flow words (`enil`, `varai`,
  `mindum`…) are grammar-level keywords. Utility words (`neelam`,
  `ullidu`…) are ordinary functions — same split Python makes between
  `while` and `len()`. That keeps the grammar small and the utilities
  easy to add.
- **Python-style scoping by hoisting.** A variable born inside a branch
  or loop must survive it (like Python). JavaScript's `let` dies at the
  closing brace, so the transpiler declares such names just above the
  block: `let result;` then `if (...) { result = "pass"; }`.
- **Errors are sentences.** Every stage throws a `HajuneError`
  subclass whose message names the line. The CLI prints exactly that
  one line — a student never sees a JavaScript stack trace.

## Where to add things

| You want to… | Touch |
|---|---|
| Add a built-in function | `src/builtins.js` only (plus a test) |
| Add/rename a keyword | `src/keywords.js` + `src/tokens.js`, and the design team must approve the word |
| Add new syntax (a new statement) | `src/keywords.js` → `src/tokens.js` → grammar rule + visitor in `src/parser.js` → emit case in `src/transpiler.js` → tests |
| Change how errors look | `src/errors.js` (classes) or `cli.js` (printing) |
