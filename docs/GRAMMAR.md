# Tanglish Grammar Reference

This document describes the formal grammar that `src/parser.js` implements
and the AST (Abstract Syntax Tree) nodes it produces. It exists so future
maintainers (and viva examiners) can understand the language without reading
the parser code first.

## Pipeline recap

```
.tml source
   → tokenize()            src/lexer.js      (hand-written, char by char)
   → adaptTokens()         src/tokens.js     (reshape for Chevrotain)
   → TanglishParser        src/parser.js     (Chevrotain CstParser → CST)
   → AstBuilder visitor    src/parser.js     (CST → plain-object AST)
```

**Why Chevrotain is used only as a grammar engine:** the hand-written lexer
is a graded project requirement, so Chevrotain's built-in `Lexer` class is
deliberately bypassed. The parser receives externally produced tokens
(every token type is created with `pattern: Lexer.NA`, Chevrotain's
official marker for "never matched from text").

## Grammar (EBNF-style)

UPPERCASE names are token types from the lexer; quoted text shows the
actual Tanglish word or symbol.

```ebnf
program              ::= statementList

statementList        ::= ( NEWLINE | ";" | statement )*

statement            ::= functionDeclaration
                       | ifStatement
                       | whileStatement
                       | forStatement
                       | breakStatement
                       | continueStatement
                       | constStatement
                       | returnStatement
                       | printStatement
                       | assignmentStatement
                       | expressionStatement

functionDeclaration  ::= "seyal" IDENTIFIER "(" parameterList? ")" block
parameterList        ::= IDENTIFIER ( "," IDENTIFIER )*

ifStatement          ::= "enil" "(" expression ")" block
                         ( "illaenil" "(" expression ")" block )*
                         ( "illana" block )?

whileStatement       ::= "varai" "(" expression ")" block
forStatement         ::= "mindum" IDENTIFIER "ulla" expression
                         ( ".." expression )? block
breakStatement       ::= "niruthu"
continueStatement    ::= "thodar"
constStatement       ::= "marathu" IDENTIFIER "=" expression

returnStatement      ::= "thiruppi" expression
printStatement       ::= "achchu" "(" expression ")"
assignmentStatement  ::= IDENTIFIER ( "[" expression "]" )* "=" expression
expressionStatement  ::= expression

block                ::= "{" statementList "}"

expression           ::= orExpression
orExpression         ::= andExpression ( "allathu" andExpression )*
andExpression        ::= notExpression ( "matrum" notExpression )*
notExpression        ::= "alla" notExpression | comparisonExpression

comparisonExpression ::= additiveExpression
                         ( comparisonOperator additiveExpression )?
comparisonOperator   ::= ">=" | "<=" | ">" | "<" | "==" | "!="

additiveExpression   ::= multiplicativeExpression
                         ( ( "+" | "-" ) multiplicativeExpression )*

multiplicativeExpression ::= unaryExpression
                             ( ( "*" | "/" ) unaryExpression )*

unaryExpression      ::= "-"? primaryExpression

primaryExpression    ::= NUMBER | STRING
                       | "unmei" | "poi" | "onnumilai"
                       | listLiteral
                       | callOrIdentifier
                       | "(" expression ")"

listLiteral          ::= "[" ( expression ( "," expression )* )? "]"
callOrIdentifier     ::= IDENTIFIER ( "(" argumentList? ")" )?
                         ( "[" expression "]" )*
argumentList         ::= expression ( "," expression )*
```

### Notes

- **Keywords are case-insensitive** (`enil` = `Enil` = `ENIL`); the lexer
  lowercases each word only for the keyword lookup, so variable names
  stay case-sensitive.
- **Statement separators.** Newlines end statements (Python-style);
  semicolons are optional and treated exactly like newlines. Blank lines
  are allowed anywhere.
- **`illana`/`illaenil` on their own line.** A small pre-pass in `parse()`
  removes newlines that appear directly before them, so each branch may
  be written on the line after the closing `}` (as in the demo program).
- **Ranges are inclusive.** `mindum i ulla 1 .. 10` runs i = 1, 2, …, 10.
  Without `..`, the loop walks a list item by item. The loop variable
  survives after the loop, like Python.
- **Comparisons are not chained.** `a < b < c` is not valid; write
  `a < b matrum b < c` instead. Additive and multiplicative operators DO
  chain and group left-to-right: `10 - 3 - 2` means `(10 - 3) - 2`.
- **Unary minus** applies once per expression: `-5`, `-(2 + 3)`, `2 * -3`
  all work; `--5` does not. `alla` (not) DOES chain: `alla alla x` is fine.
- **`achchu`** takes exactly one argument.
- **Built-in functions** (`ullidu`, `neelam`, `enn`, …) are not part of
  the grammar — they parse as ordinary function calls; see `src/builtins.js`.

## Operator precedence (weakest → strongest binding)

| Level | Operators | Example grouping |
|---|---|---|
| 1. or | `allathu` | `a matrum b allathu c` → `(a and b) or c` |
| 2. and | `matrum` | |
| 3. not | `alla` | `alla a == b` → `alla (a == b)` |
| 4. comparison | `>=` `<=` `>` `<` `==` `!=` | `a + b >= c` → `(a + b) >= c` |
| 5. additive | `+` `-` | `2 + 3 * 4` → `2 + (3 * 4)` |
| 6. multiplicative | `*` `/` | `6 / 2 * 3` → `(6 / 2) * 3` |
| 7. unary minus | `-x` | `2 * -3` → `2 * (-3)` |
| 8. primary | literals, names, calls, lists, `[i]`, `( )` | |

## AST node reference

Every node is a plain object with a `type` field; most carry the source
`line` for error reporting.

| Node type | Fields | Produced by |
|---|---|---|
| `Program` | `body` (statement array) | whole file |
| `Block` | `body` (statement array) | `{ ... }` |
| `FunctionDeclaration` | `name` (string), `params` (string array), `body` (Block), `line` | `seyal` |
| `IfStatement` | `condition`, `consequent` (Block), `alternate` (Block, IfStatement or `null`), `line` | `enil` / `illaenil` / `illana` — each `illaenil` becomes a nested IfStatement in `alternate` |
| `ReturnStatement` | `argument`, `line` | `thiruppi` |
| `PrintStatement` | `argument`, `line` | `achchu(...)` |
| `Assignment` | `name` (string), `value`, `line` | `x = ...` |
| `IndexAssignment` | `name` (string), `indices` (expr array), `value`, `line` | `marks[0] = 99` |
| `ConstDeclaration` | `name` (string), `value`, `line` | `marathu` |
| `WhileStatement` | `condition`, `body` (Block), `line` | `varai` |
| `ForRangeStatement` | `variable` (string), `from`, `to`, `body` (Block), `line` | `mindum i ulla 1 .. 10` |
| `ForEachStatement` | `variable` (string), `iterable`, `body` (Block), `line` | `mindum m ulla marks` |
| `BreakStatement` | `line` | `niruthu` |
| `ContinueStatement` | `line` | `thodar` |
| `BinaryExpression` | `operator` (string), `left`, `right`, `line` | `+ - * / > < >= <= == != matrum allathu` |
| `UnaryExpression` | `operator` (`"-"` or `"alla"`), `argument`, `line` | `-x`, `alla x` |
| `ListLiteral` | `elements` (expr array), `line` | `[80, 65, 92]` |
| `IndexExpression` | `object`, `index`, `line` | `marks[0]`, `g[i][j]` |
| `CallExpression` | `callee` (string), `args` (expression array), `line` | `name(...)` |
| `Identifier` | `name` (string), `line` | variable reference |
| `NumberLiteral` | `value` (JS number), `line` | `50` |
| `StringLiteral` | `value` (string, no quotes), `line` | `"pass"` |
| `BooleanLiteral` | `value` (`true`/`false`), `line` | `unmei` / `poi` |
| `NullLiteral` | `line` | `onnumilai` |

Conventions:

- A bare expression used as a statement (e.g. a function call on its own
  line) appears in `body` directly as its expression node — there is no
  `ExpressionStatement` wrapper.
- Declaration-site names (`Assignment.name`, `FunctionDeclaration.name`,
  `params`, `CallExpression.callee`) are plain strings. Only identifiers
  used as *values* inside expressions become `Identifier` nodes.
- Parentheses affect grouping only; they leave no node in the AST.

## Errors

All grammar problems throw `TanglishParserError` (see `src/errors.js`),
whose message always names the line, e.g.:

```
Parser error on line 2: expected '}' but found the end of the file.
```

Both `TanglishLexerError` and `TanglishParserError` extend the shared
`TanglishError` base class, so the CLI can catch every language error
with a single `instanceof TanglishError` check.
