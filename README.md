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

| Tanglish | Meaning | JavaScript equivalent |
|---|---|---|
| `seyal` | function definition | `function` |
| `enil` | if | `if` |
| `illana` | else | `else` |
| `thiruppi` | return | `return` |
| `achchu` | print | `console.log` |
| `unmei` | true | `true` |
| `poi` | false | `false` |
| `onnumilai` | null | `null` |

Variables are declared Python-style — just assign: `pass_marku = 50`
(the transpiler emits `let` in the generated JavaScript).

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
- **Numbers**: whole numbers only — floats like `98.5` are a friendly lexer error.
- **Strings**: double-quoted `"..."`.
- **Identifiers**: Roman letters, digits, underscore (`[A-Za-z_][A-Za-z0-9_]*`).
- **Operators**: `=` `+` `-` `*` `/` `>` `<` `>=` `<=` `==` `!=`.
- Errors always report the **line number** in plain language.

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
│   ├── keywords.js           keyword → token type map
│   ├── lexer.js              hand-written tokenizer
│   ├── tokens.js             Chevrotain token vocabulary + adapter
│   ├── parser.js             Chevrotain grammar → AST
│   ├── errors.js             shared TanglishError classes
│   └── transpiler.js         AST → JavaScript emitter
├── docs/
│   └── GRAMMAR.md            formal grammar + AST node reference
├── examples/
│   └── grade_check.tml       demo program
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
