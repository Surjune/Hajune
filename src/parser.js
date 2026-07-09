/**
 * parser.js — Tanglish grammar (Chevrotain) + AST builder
 * --------------------------------------------------------
 * Takes the token array produced by the HAND-WRITTEN lexer
 * (src/lexer.js) and turns it into a clean, plain-object AST
 * (Abstract Syntax Tree) that the transpiler can walk.
 *
 * The work happens in three small steps:
 *
 *   1. adaptTokens()  (src/tokens.js) — reshape our tokens into the
 *      form Chevrotain expects. Chevrotain's own Lexer is NOT used.
 *   2. TanglishParser — a Chevrotain CstParser subclass. Each RULE()
 *      describes one piece of grammar. Chevrotain automatically builds
 *      a CST (Concrete Syntax Tree) from these rules.
 *   3. AstBuilder — a visitor that walks the CST and returns the small,
 *      tidy AST nodes documented in docs/GRAMMAR.md, for example:
 *          { type: "IfStatement", condition, consequent, alternate }
 *
 * Errors: any grammar problem is thrown as TanglishParserError with a
 * human-friendly message and a line number — never a raw Chevrotain
 * exception dump.
 *
 * Expression precedence (weakest binding first):
 *   comparison  (>= <= > < == !=)
 *   additive    (+ -)
 *   multiplicative (* /)
 *   unary minus (-x)
 *   primary     (literals, names, calls, parenthesized expressions)
 * Lower rules call higher rules, so "2 + 3 * 4" naturally groups as
 * 2 + (3 * 4) = 14.
 */
"use strict";
const { CstParser } = require("chevrotain");
const { TanglishParserError } = require("./errors");
const {
  T,
  allTokens,
  adaptTokens,
  ComparisonOperator,
  AdditiveOperator,
  MultiplicativeOperator,
} = require("./tokens");

// ---------------------------------------------------------------------
// Friendly error messages
// ---------------------------------------------------------------------

/** Describe a token in plain words for error messages. */
function describeToken(tok) {
  if (!tok || tok.image === "") return "the end of the file";
  if (tok.tokenType && tok.tokenType.name === "Newline") return "the end of the line";
  return `'${tok.image}'`;
}

/** Preferred display name of an expected token type (uses its label). */
function describeExpected(tokenType) {
  return tokenType.LABEL || tokenType.name;
}

/**
 * Chevrotain lets us replace its (very technical) default error text
 * with our own. These four methods cover every kind of parse error.
 */
const friendlyErrorProvider = {
  buildMismatchTokenMessage({ expected, actual }) {
    return `expected ${describeExpected(expected)} but found ${describeToken(actual)}`;
  },
  buildNotAllInputParsedMessage({ firstRedundant }) {
    return `unexpected ${describeToken(firstRedundant)} — Tanglish could not understand this part`;
  },
  buildNoViableAltMessage({ actual }) {
    return `this does not look like a valid Tanglish statement or expression ` +
      `(problem near ${describeToken(actual[0])})`;
  },
  buildEarlyExitMessage({ actual }) {
    return `something is missing here (problem near ${describeToken(actual[0])})`;
  },
};

// ---------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------

class TanglishParser extends CstParser {
  constructor() {
    super(allTokens, {
      // Stop at the FIRST real error instead of guessing and producing
      // a confusing cascade of follow-up errors.
      recoveryEnabled: false,
      errorMessageProvider: friendlyErrorProvider,
    });
    const $ = this;

    // program := statementList        (the whole .tml file)
    $.RULE("program", () => {
      $.SUBRULE($.statementList);
    });

    // statementList := (NEWLINE | ";" | statement)*
    // One loop handles everything: blank lines, optional semicolons,
    // and the statements themselves, in any order.
    $.RULE("statementList", () => {
      $.MANY(() =>
        $.OR([
          { ALT: () => $.CONSUME(T.NEWLINE) },
          { ALT: () => $.CONSUME(T.SEMICOLON) },
          { ALT: () => $.SUBRULE($.statement) },
        ])
      );
    });

    // statement := one of the six statement forms.
    // Assignment and expression-statement BOTH start with a name, so we
    // peek two tokens ahead (LA(2)): if the next-next token is '=',
    // it is an assignment; otherwise it is a bare expression.
    $.RULE("statement", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.functionDeclaration) },
        { ALT: () => $.SUBRULE($.ifStatement) },
        { ALT: () => $.SUBRULE($.returnStatement) },
        { ALT: () => $.SUBRULE($.printStatement) },
        {
          GATE: () => $.LA(2).tokenType === T.ASSIGN,
          ALT: () => $.SUBRULE($.assignmentStatement),
        },
        { ALT: () => $.SUBRULE($.expressionStatement) },
      ]);
    });

    // functionDeclaration := 'uruvaaku' name '(' parameterList? ')' block
    $.RULE("functionDeclaration", () => {
      $.CONSUME(T.FUNCTION);
      $.CONSUME(T.IDENTIFIER);
      $.CONSUME(T.LPAREN);
      $.OPTION(() => $.SUBRULE($.parameterList));
      $.CONSUME(T.RPAREN);
      $.SUBRULE($.block);
    });

    // parameterList := name (',' name)*
    // The SECOND use of the same token in one rule must be numbered
    // (CONSUME2) — a Chevrotain requirement so CST children stay distinct.
    $.RULE("parameterList", () => {
      $.CONSUME(T.IDENTIFIER);
      $.MANY(() => {
        $.CONSUME(T.COMMA);
        $.CONSUME2(T.IDENTIFIER);
      });
    });

    // ifStatement := 'irundhal' '(' expression ')' block ('illana' block)?
    // (Newlines before 'illana' are removed by a pre-pass in parse(),
    //  so 'illana' may freely sit on its own line in the source.)
    $.RULE("ifStatement", () => {
      $.CONSUME(T.IF);
      $.CONSUME(T.LPAREN);
      $.SUBRULE($.expression);
      $.CONSUME(T.RPAREN);
      $.SUBRULE($.block); // consequent (the "then" part)
      $.OPTION(() => {
        $.CONSUME(T.ELSE);
        $.SUBRULE2($.block); // alternate (the "else" part)
      });
    });

    // returnStatement := 'thiruppi' expression
    $.RULE("returnStatement", () => {
      $.CONSUME(T.RETURN);
      $.SUBRULE($.expression);
    });

    // printStatement := 'solluu' '(' expression ')'
    $.RULE("printStatement", () => {
      $.CONSUME(T.PRINT);
      $.CONSUME(T.LPAREN);
      $.SUBRULE($.expression);
      $.CONSUME(T.RPAREN);
    });

    // assignmentStatement := name '=' expression
    $.RULE("assignmentStatement", () => {
      $.CONSUME(T.IDENTIFIER);
      $.CONSUME(T.ASSIGN);
      $.SUBRULE($.expression);
    });

    // expressionStatement := expression      (e.g. a bare function call)
    $.RULE("expressionStatement", () => {
      $.SUBRULE($.expression);
    });

    // block := '{' statementList '}'
    $.RULE("block", () => {
      $.CONSUME(T.LBRACE);
      $.SUBRULE($.statementList);
      $.CONSUME(T.RBRACE);
    });

    // ---- Expressions, from weakest to strongest binding ----

    // expression := additive (comparisonOp additive)?
    // Comparison sits at the TOP (weakest), so "score >= pass_marku + 5"
    // compares score against the whole sum.
    $.RULE("expression", () => {
      $.SUBRULE($.additiveExpression);
      $.OPTION(() => {
        $.CONSUME(ComparisonOperator); // any of  >= <= > < == !=
        $.SUBRULE2($.additiveExpression);
      });
    });

    // additiveExpression := multiplicative (('+'|'-') multiplicative)*
    $.RULE("additiveExpression", () => {
      $.SUBRULE($.multiplicativeExpression);
      $.MANY(() => {
        $.CONSUME(AdditiveOperator); // + or -
        $.SUBRULE2($.multiplicativeExpression);
      });
    });

    // multiplicativeExpression := unary (('*'|'/') unary)*
    $.RULE("multiplicativeExpression", () => {
      $.SUBRULE($.unaryExpression);
      $.MANY(() => {
        $.CONSUME(MultiplicativeOperator); // * or /
        $.SUBRULE2($.unaryExpression);
      });
    });

    // unaryExpression := '-'? primary        (unary minus, e.g. -5)
    $.RULE("unaryExpression", () => {
      $.OPTION(() => $.CONSUME(T.MINUS));
      $.SUBRULE($.primaryExpression);
    });

    // primaryExpression := number | string | unmai | poi | onnumilla
    //                    | name | name(...)  | '(' expression ')'
    $.RULE("primaryExpression", () => {
      $.OR([
        { ALT: () => $.CONSUME(T.NUMBER) },
        { ALT: () => $.CONSUME(T.STRING) },
        { ALT: () => $.CONSUME(T.TRUE) },
        { ALT: () => $.CONSUME(T.FALSE) },
        { ALT: () => $.CONSUME(T.NULL) },
        { ALT: () => $.SUBRULE($.callOrIdentifier) },
        { ALT: () => $.SUBRULE($.parenExpression) },
      ]);
    });

    // callOrIdentifier := name ('(' argumentList? ')')?
    // A name followed by '(' is a function call; otherwise it is a
    // plain variable reference. The visitor tells them apart.
    $.RULE("callOrIdentifier", () => {
      $.CONSUME(T.IDENTIFIER);
      $.OPTION(() => {
        $.CONSUME(T.LPAREN);
        $.OPTION2(() => $.SUBRULE($.argumentList));
        $.CONSUME(T.RPAREN);
      });
    });

    // argumentList := expression (',' expression)*
    $.RULE("argumentList", () => {
      $.SUBRULE($.expression);
      $.MANY(() => {
        $.CONSUME(T.COMMA);
        $.SUBRULE2($.expression);
      });
    });

    // parenExpression := '(' expression ')'
    $.RULE("parenExpression", () => {
      $.CONSUME(T.LPAREN);
      $.SUBRULE($.expression);
      $.CONSUME(T.RPAREN);
    });

    // Chevrotain analyses the whole grammar once, up front.
    this.performSelfAnalysis();
  }
}

// One shared parser instance, reused for every parse() call.
const parserInstance = new TanglishParser();

// ---------------------------------------------------------------------
// CST → AST visitor
// ---------------------------------------------------------------------
// Chevrotain generates a base visitor class from the grammar above.
// We override one method PER RULE (same name as the rule); each method
// receives that rule's CST children (ctx) and returns one AST node.

const BaseVisitor = parserInstance.getBaseCstVisitorConstructor();

class AstBuilder extends BaseVisitor {
  constructor() {
    super();
    this.validateVisitor(); // fails fast if a rule method is missing
  }

  program(ctx) {
    return { type: "Program", body: this.visit(ctx.statementList) };
  }

  statementList(ctx) {
    // No statements (e.g. empty block) → empty array.
    if (!ctx.statement) return [];
    return ctx.statement.map((s) => this.visit(s));
  }

  statement(ctx) {
    // Exactly one of these keys exists; visit whichever it is.
    const inner =
      ctx.functionDeclaration ||
      ctx.ifStatement ||
      ctx.returnStatement ||
      ctx.printStatement ||
      ctx.assignmentStatement ||
      ctx.expressionStatement;
    return this.visit(inner);
  }

  functionDeclaration(ctx) {
    return {
      type: "FunctionDeclaration",
      name: ctx.Identifier[0].image,
      params: ctx.parameterList ? this.visit(ctx.parameterList) : [],
      body: this.visit(ctx.block),
      line: ctx.Function[0].startLine,
    };
  }

  parameterList(ctx) {
    // Parameters are plain strings, e.g. ["peyar", "score"].
    return ctx.Identifier.map((tok) => tok.image);
  }

  ifStatement(ctx) {
    return {
      type: "IfStatement",
      condition: this.visit(ctx.expression),
      consequent: this.visit(ctx.block[0]),           // the "then" block
      alternate: ctx.block[1] ? this.visit(ctx.block[1]) : null, // else block or null
      line: ctx.If[0].startLine,
    };
  }

  returnStatement(ctx) {
    return {
      type: "ReturnStatement",
      argument: this.visit(ctx.expression),
      line: ctx.Return[0].startLine,
    };
  }

  printStatement(ctx) {
    return {
      type: "PrintStatement",
      argument: this.visit(ctx.expression),
      line: ctx.Print[0].startLine,
    };
  }

  assignmentStatement(ctx) {
    return {
      type: "Assignment",
      name: ctx.Identifier[0].image,
      value: this.visit(ctx.expression),
      line: ctx.Identifier[0].startLine,
    };
  }

  expressionStatement(ctx) {
    // A bare expression used as a statement — no wrapper node needed;
    // the expression's own AST node goes straight into the body list.
    return this.visit(ctx.expression);
  }

  block(ctx) {
    return { type: "Block", body: this.visit(ctx.statementList) };
  }

  expression(ctx) {
    const left = this.visit(ctx.additiveExpression[0]);
    if (!ctx.ComparisonOperator) return left; // no comparison — pass through
    return {
      type: "BinaryExpression",
      operator: ctx.ComparisonOperator[0].image, // ">=", "==", ...
      left,
      right: this.visit(ctx.additiveExpression[1]),
      line: ctx.ComparisonOperator[0].startLine,
    };
  }

  // "2 + 3 - 1" folds LEFT-to-right into nested nodes: ((2 + 3) - 1).
  additiveExpression(ctx) {
    let node = this.visit(ctx.multiplicativeExpression[0]);
    if (ctx.AdditiveOperator) {
      for (let i = 0; i < ctx.AdditiveOperator.length; i++) {
        node = {
          type: "BinaryExpression",
          operator: ctx.AdditiveOperator[i].image, // "+" or "-"
          left: node,
          right: this.visit(ctx.multiplicativeExpression[i + 1]),
          line: ctx.AdditiveOperator[i].startLine,
        };
      }
    }
    return node;
  }

  // Same left-fold pattern as additiveExpression, one level tighter.
  multiplicativeExpression(ctx) {
    let node = this.visit(ctx.unaryExpression[0]);
    if (ctx.MultiplicativeOperator) {
      for (let i = 0; i < ctx.MultiplicativeOperator.length; i++) {
        node = {
          type: "BinaryExpression",
          operator: ctx.MultiplicativeOperator[i].image, // "*" or "/"
          left: node,
          right: this.visit(ctx.unaryExpression[i + 1]),
          line: ctx.MultiplicativeOperator[i].startLine,
        };
      }
    }
    return node;
  }

  unaryExpression(ctx) {
    const inner = this.visit(ctx.primaryExpression);
    if (!ctx.Minus) return inner; // no leading minus — pass through
    return {
      type: "UnaryExpression",
      operator: "-",
      argument: inner,
      line: ctx.Minus[0].startLine,
    };
  }

  primaryExpression(ctx) {
    if (ctx.Number) {
      return {
        type: "NumberLiteral",
        value: Number(ctx.Number[0].image),
        line: ctx.Number[0].startLine,
      };
    }
    if (ctx.String) {
      return {
        type: "StringLiteral",
        value: ctx.String[0].image,
        line: ctx.String[0].startLine,
      };
    }
    if (ctx.True) return { type: "BooleanLiteral", value: true, line: ctx.True[0].startLine };
    if (ctx.False) return { type: "BooleanLiteral", value: false, line: ctx.False[0].startLine };
    if (ctx.Null) return { type: "NullLiteral", line: ctx.Null[0].startLine };
    if (ctx.callOrIdentifier) return this.visit(ctx.callOrIdentifier);
    return this.visit(ctx.parenExpression);
  }

  callOrIdentifier(ctx) {
    const nameTok = ctx.Identifier[0];
    if (!ctx.LParen) {
      // Just a variable reference, e.g.  pass_marku
      return { type: "Identifier", name: nameTok.image, line: nameTok.startLine };
    }
    // A function call, e.g.  match_check("Surjune", 87)
    return {
      type: "CallExpression",
      callee: nameTok.image,
      args: ctx.argumentList ? this.visit(ctx.argumentList) : [],
      line: nameTok.startLine,
    };
  }

  argumentList(ctx) {
    return ctx.expression.map((e) => this.visit(e));
  }

  parenExpression(ctx) {
    // Parentheses only affect grouping — they leave no AST node behind.
    return this.visit(ctx.expression);
  }
}

const astBuilder = new AstBuilder();

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Pre-pass: delete NEWLINE tokens that come right before 'illana'.
 * Tanglish lets you write  }  and  illana {  on separate lines (see the
 * demo program); grammatically the 'illana' still belongs to the if
 * above it, so those newlines are not real statement breaks.
 */
function dropNewlinesBeforeElse(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "NEWLINE") {
      let j = i;
      while (j < tokens.length && tokens[j].type === "NEWLINE") j++;
      if (j < tokens.length && tokens[j].type === "ELSE") {
        i = j - 1; // skip the whole newline run; loop's i++ lands on ELSE
        continue;
      }
    }
    out.push(tokens[i]);
  }
  return out;
}

/** Wrap Chevrotain's error object in our own friendly error class. */
function toTanglishParserError(chevErr, lexerTokens) {
  const tok = chevErr.token;
  let line = tok && Number.isFinite(tok.startLine) ? tok.startLine : null;
  let column = tok && Number.isFinite(tok.startColumn) ? tok.startColumn : null;
  if (line === null) {
    // Error at end of file (Chevrotain's EOF marker has no position) —
    // point at the last real token instead.
    const last = lexerTokens.filter((t) => t.type !== "EOF" && t.type !== "NEWLINE").pop();
    if (last) {
      line = last.line;
      column = last.column;
    }
  }
  const where = line !== null ? ` on line ${line}` : "";
  return new TanglishParserError(
    `Parser error${where}: ${chevErr.message}.`,
    line,
    column
  );
}

/**
 * parse(tokens) — the one function other files call.
 * Input:  token array from tokenize() in src/lexer.js
 * Output: the Program AST node
 * Throws: TanglishParserError with a line number on any grammar problem
 */
function parse(lexerTokens) {
  const prepared = dropNewlinesBeforeElse(lexerTokens);
  parserInstance.input = adaptTokens(prepared);
  const cst = parserInstance.program();
  if (parserInstance.errors.length > 0) {
    throw toTanglishParserError(parserInstance.errors[0], lexerTokens);
  }
  return astBuilder.visit(cst);
}

module.exports = { parse, TanglishParserError };
