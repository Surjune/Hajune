# Tanglish (தமிழ் + English)

**Tanglish** is a beginner-friendly programming language whose keywords are
phonetic Tamil words written in Roman/English script. It is designed so that
rural and Tamil-medium students can learn coding *logic* without having to
learn English vocabulary at the same time.

> A college capstone project by **R S Surjune (25BDS057)** 

## How it works

Tanglish is a **transpiler**, not a compiler or virtual machine:

```
.tml source → Lexer (hand-written) → Parser (Chevrotain, AST)
            → Transpiler (emits JavaScript) → Node.js executes it
```

| Component | Technology |
|---|---|
| Implementation language | JavaScript (Node.js v20.19+) |
| Lexer | Hand-written (character-by-character) |
| Parser | Chevrotain |
| CLI | Commander.js |
| Source file extension | `.tml` |
| Transpile target | JavaScript |

## Keywords

Keywords are **case-insensitive** — `enil`, `Enil` and `ENIL` all work.
(Variable names stay case-sensitive, like Python.)

| Tanglish | Meaning | JavaScript equivalent |
|---|---|---|
| `seyal` | function definition | `function` |
| `enil` | if | `if` |
| `illaenil` | else-if | `else if` |
| `illana` | else | `else` |
| `thiruppi` | return | `return` |
| `achchu` | print | `console.log` |
| `unmei` | true | `true` |
| `poi` | false | `false` |
| `onnumilai` | null | `null` |
| `varai` | while loop | `while` |
| `mindum` | for loop | `for` |
| `ulla` | in (joins `mindum` to a range or list) | `of` |
| `niruthu` | break out of a loop | `break` |
| `thodar` | skip to the next round | `continue` |
| `matrum` | and | `&&` |
| `allathu` | or | `\|\|` |
| `alla` | not | `!` |
| `marathu` | constant | `const` |

Variables are declared Python-style — just assign: `pass_marku = 50`
(the transpiler emits `let` in the generated JavaScript). Loops read
like sentences: `mindum i ulla 1 .. 10 { ... }` counts 1 to 10 (both
ends included), and `mindum m ulla marks { ... }` walks a list.

## Built-in functions

These are ready-made functions, not keywords — they work like `achchu`:

| Tanglish | Does | Example |
|---|---|---|
| `ullidu` | read what the user types | `peyar = ullidu("Enter name: ")` |
| `neelam` | length of a string or list | `neelam(marks)` |
| `innaipu` | add to the end of a list | `innaipu(marks, 77)` |
| `neekku` | remove and return the last item | `neekku(marks)` |
| `enn` | convert to a number | `enn("5") + 1` → 6 |
| `urai` | convert to text | `urai(5) + "0"` → "50" |
| `ehtho` | random number between 0 and 1 | `ehtho()` |
| `muulu` | round to the nearest whole number | `muulu(7 / 2)` → 4 |
| `uchcham` | biggest of the given values | `uchcham(10, 25)` → 25 |
| `vagai` | kind of a value | `vagai([1])` → "list" |

Only the built-ins a program actually calls are pasted into its
generated JavaScript, so `--show-js` output stays small.

## Example

`examples/grade_check.tml`:

```
pass_marku = 50
seyal match_check(peyar, score) {
    enil (score >= pass_marku) {
        thiruppi peyar + "pass"
    }
    illana {
        thiruppi peyar + "fail"
    }
}
achchu(match_check("Surjune", 87))
```

Output:

```
Surjunepass
```

## Language rules (current version)

- **Statements** end at a newline (Python-style). Semicolons are optional.
- **Comments**: `//` to end of line.
- **Numbers**: whole numbers only in source — floats like `98.5` are a
  friendly lexer error (but `7 / 2` may produce 3.5 at runtime; use `muulu`).
- **Strings**: double-quoted `"..."`.
- **Lists**: `marks = [80, 65, 92]`, first item `marks[0]`, change a slot
  with `marks[0] = 99`, grow/shrink with `innaipu`/`neekku`.
- **Identifiers**: Roman letters, digits, underscore (`[A-Za-z_][A-Za-z0-9_]*`).
- **Operators**: `=` `+` `-` `*` `/` `>` `<` `>=` `<=` `==` `!=` `..`
  plus the word operators `matrum` (and), `allathu` (or), `alla` (not).
- **Constants**: `marathu PASS = 50` — changing one later is a friendly
  transpile-time error.
- **Scoping is Python-like**: a variable born inside an `enil` branch or a
  loop body survives after it (the transpiler hoists its declaration).
- Errors always report the **line number** in plain language.

More example programs live in `examples/`: `marks_report.tml` (lists,
loops, grading with `illaenil`) and `number_game.tml` (interactive
guess-the-number using `ullidu` and `ehtho`).

## Running a program

```
node cli.js run examples/grade_check.tml
```

Show the generated JavaScript too:

```
node cli.js run examples/grade_check.tml --show-js
```

After `npm link`, run it from anywhere — just like Python:

```
tanglish run grade_check.tml
```

## Project structure

```
Hajune/                       (repo root = the project)
├── src/
│   ├── keywords.js           keyword → token type map (18 words)
│   ├── builtins.js           built-in functions (ullidu, neelam, ...)
│   ├── lexer.js              hand-written tokenizer
│   ├── tokens.js             Chevrotain token vocabulary + adapter
│   ├── parser.js             Chevrotain grammar → AST
│   ├── errors.js             shared TanglishError classes
│   └── transpiler.js         AST → JavaScript emitter
├── docs/
│   └── GRAMMAR.md            formal grammar + AST node reference
├── examples/
│   ├── grade_check.tml       the classic demo program
│   ├── marks_report.tml      lists, loops, illaenil grading
│   └── number_game.tml       interactive game (ullidu + ehtho)
├── test/
│   ├── tokenize_demo.js      lexer sanity checks
│   ├── parser_demo.js        parser/AST sanity checks
│   └── transpile_demo.js     transpiler + program-output checks
├── cli.js                    Commander.js entry point   (Task 4 — later)
└── package.json
```

## Setup

```
npm install
npm test        # runs the lexer checks
```
