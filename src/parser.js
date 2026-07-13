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
 *   allathu     (or)
 *   matrum      (and)
 *   alla        (not)
 *   comparison  (>= <= > < == !=)
 *   additive    (+ -)
 *   multiplicative (* /)
 *   unary minus (-x)
 *   primary     (literals, names, calls, lists, parenthesized exprs)
 * Lower rules call higher rules, so "2 + 3 * 4" naturally groups as
 * 2 + (3 * 4) = 14, and "a matrum b allathu c" as (a and b) or c.
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

/**
 * Lookahead helper for the statement rule: does an '=' follow the
 * leading identifier, either immediately (x = ...) or after balanced
 * square brackets (marks[0] = ..., grid[i][j] = ...)?
 */
function isAssignmentAhead($) {
  if ($.LA(2).tokenType === T.ASSIGN) return true;
  if ($.LA(2).tokenType !== T.LBRACKET) return false;
  let i = 2;
  let depth = 0;
  while (i < 200) { // safety cap; no sane index runs this long
    const tt = $.LA(i).tokenType;
    if (tt === T.LBRACKET) {
      depth++;
    } else if (tt === T.RBRACKET) {
      depth--;
      if (depth === 0) {
        const after = $.LA(i + 1).tokenType;
        if (after === T.ASSIGN) return true;      // marks[0] =
        if (after !== T.LBRACKET) return false;   // marks[0] used as value
      }
    } else if (depth === 0) {
      return false;
    }
    i++;
  }
  return false;
}

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

    // statement := one of the eleven statement forms.
    // Assignment and expression-statement BOTH start with a name, so we
    // look ahead: 'name =' is an assignment, 'name[...]... =' is an
    // indexed assignment (the gate walks past balanced brackets to find
    // the '='), anything else is a bare expression.
    $.RULE("statement", () => {
      $.OR([
        { ALT: () => $.SUBRULE($.functionDeclaration) },
        { ALT: () => $.SUBRULE($.ifStatement) },
        { ALT: () => $.SUBRULE($.whileStatement) },
        { ALT: () => $.SUBRULE($.forStatement) },
        { ALT: () => $.SUBRULE($.breakStatement) },
        { ALT: () => $.SUBRULE($.continueStatement) },
        { ALT: () => $.SUBRULE($.constStatement) },
        { ALT: () => $.SUBRULE($.returnStatement) },
        { ALT: () => $.SUBRULE($.printStatement) },
        {
          GATE: () => isAssignmentAhead($),
          ALT: () => $.SUBRULE($.assignmentStatement),
        },
        { ALT: () => $.SUBRULE($.expressionStatement) },
      ]);
    });

    // functionDeclaration := 'seyal' name '(' parameterList? ')' block
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

    // ifStatement := 'enil' '(' expr ')' block
    //                ('illaenil' '(' expr ')' block)*
    //                ('illana' block)?
    // (Newlines before 'illaenil'/'illana' are removed by a pre-pass in
    //  parse(), so both may freely sit on their own line in the source.)
    $.RULE("ifStatement", () => {
      $.CONSUME(T.IF);
      $.CONSUME(T.LPAREN);
      $.SUBRULE($.expression);
      $.CONSUME(T.RPAREN);
      $.SUBRULE($.block); // the "then" block
      $.MANY(() => {
        $.CONSUME(T.ELSEIF); // any number of illaenil branches
        $.CONSUME2(T.LPAREN);
        $.SUBRULE2($.expression);
        $.CONSUME2(T.RPAREN);
        $.SUBRULE2($.block);
      });
      $.OPTION(() => {
        $.CONSUME(T.ELSE); // the final illana block
        $.SUBRULE3($.block);
      });
    });

    // whileStatement := 'varai' '(' expression ')' block
    $.RULE("whileStatement", () => {
      $.CONSUME(T.WHILE);
      $.CONSUME(T.LPAREN);
      $.SUBRULE($.expression);
      $.CONSUME(T.RPAREN);
      $.SUBRULE($.block);
    });

    // forStatement := 'mindum' name 'ulla' expression ('..' expression)? block
    // With '..' it is a counting loop:   mindum i ulla 1 .. 10 { }
    // Without, it walks a list:          mindum m ulla marks { }
    $.RULE("forStatement", () => {
      $.CONSUME(T.FOR);
      $.CONSUME(T.IDENTIFIER);
      $.CONSUME(T.IN);
      $.SUBRULE($.expression); // range start, or the list itself
      $.OPTION(() => {
        $.CONSUME(T.DOTDOT);
        $.SUBRULE2($.expression); // range end (inclusive)
      });
      $.SUBRULE($.block);
    });

    // breakStatement := 'niruthu'        (exit the loop now)
    $.RULE("breakStatement", () => {
      $.CONSUME(T.BREAK);
    });

    // continueStatement := 'thodar'      (skip to the next round)
    $.RULE("continueStatement", () => {
      $.CONSUME(T.CONTINUE);
    });

    // constStatement := 'marathu' name '=' expression
    $.RULE("constStatement", () => {
      $.CONSUME(T.CONST);
      $.CONSUME(T.IDENTIFIER);
      $.CONSUME(T.ASSIGN);
      $.SUBRULE($.expression);
    });

    // returnStatement := 'thiruppi' expression
    $.RULE("returnStatement", () => {
      $.CONSUME(T.RETURN);
      $.SUBRULE($.expression);
    });

    // printStatement := 'achchu' '(' expression ')'
    $.RULE("printStatement", () => {
      $.CONSUME(T.PRINT);
      $.CONSUME(T.LPAREN);
      $.SUBRULE($.expression);
      $.CONSUME(T.RPAREN);
    });

    // assignmentStatement := name ('[' expression ']')* '=' expression
    // Plain (x = 5) or into a list slot (marks[0] = 90, grid[i][j] = 1).
    $.RULE("assignmentStatement", () => {
      $.CONSUME(T.IDENTIFIER);
      $.MANY(() => {
        $.CONSUME(T.LBRACKET);
        $.SUBRULE($.expression); // the index
        $.CONSUME(T.RBRACKET);
      });
      $.CONSUME(T.ASSIGN);
      $.SUBRULE2($.expression); // the value
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
    // allathu(or) < matrum(and) < alla(not) < comparison < additive
    //             < multiplicative < unary minus < primary
    // Same ladder as Python, so conditions read naturally:
    //   enil (mark >= 50 matrum alla absent)  → (mark >= 50) && (!absent)

    // expression := orExpression        (the weakest level starts here)
    $.RULE("expression", () => {
      $.SUBRULE($.orExpression);
    });

    // orExpression := andExpr ('allathu' andExpr)*
    $.RULE("orExpression", () => {
      $.SUBRULE($.andExpression);
      $.MANY(() => {
        $.CONSUME(T.OR);
        $.SUBRULE2($.andExpression);
      });
    });

    // andExpression := notExpr ('matrum' notExpr)*
    $.RULE("andExpression", () => {
      $.SUBRULE($.notExpression);
      $.MANY(() => {
        $.CONSUME(T.AND);
        $.SUBRULE2($.notExpression);
      });
    });

    // notExpression := 'alla' notExpression | comparison
    // Recursive, so 'alla alla x' (double negation) also parses.
    $.RULE("notExpression", () => {
      $.OR([
        {
          ALT: () => {
            $.CONSUME(T.NOT);
            $.SUBRULE($.notExpression);
          },
        },
        { ALT: () => $.SUBRULE($.comparisonExpression) },
      ]);
    });

    // comparisonExpression := additive (comparisonOp additive)?
    // "score >= pass_marku + 5" compares score against the whole sum.
    $.RULE("comparisonExpression", () => {
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

    // primaryExpression := number | string | unmei | poi | onnumilai
    //                    | list | name | name(...) | '(' expression ')'
    $.RULE("primaryExpression", () => {
      $.OR([
        { ALT: () => $.CONSUME(T.NUMBER) },
        { ALT: () => $.CONSUME(T.STRING) },
        { ALT: () => $.CONSUME(T.TRUE) },
        { ALT: () => $.CONSUME(T.FALSE) },
        { ALT: () => $.CONSUME(T.NULL) },
        { ALT: () => $.SUBRULE($.listLiteral) },
        { ALT: () => $.SUBRULE($.callOrIdentifier) },
        { ALT: () => $.SUBRULE($.parenExpression) },
      ]);
    });

    // listLiteral := '[' (expression (',' expression)*)? ']'
    // e.g.  marks = [80, 65, 92]   or an empty list  []
    $.RULE("listLiteral", () => {
      $.CONSUME(T.LBRACKET);
      $.OPTION(() => {
        $.SUBRULE($.expression);
        $.MANY(() => {
          $.CONSUME(T.COMMA);
          $.SUBRULE2($.expression);
        });
      });
      $.CONSUME(T.RBRACKET);
    });

    // callOrIdentifier := name ('(' argumentList? ')')? ('[' expr ']')*
    // A name followed by '(' is a function call; otherwise a variable.
    // Either may then be indexed:  marks[0], grid[i][j], top_three()[0].
    $.RULE("callOrIdentifier", () => {
      $.CONSUME(T.IDENTIFIER);
      $.OPTION(() => {
        $.CONSUME(T.LPAREN);
        $.OPTION2(() => $.SUBRULE($.argumentList));
        $.CONSUME(T.RPAREN);
      });
      $.MANY(() => {
        $.CONSUME(T.LBRACKET);
        $.SUBRULE($.expression); // the index
        $.CONSUME(T.RBRACKET);
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
      ctx.whileStatement ||
      ctx.forStatement ||
      ctx.breakStatement ||
      ctx.continueStatement ||
      ctx.constStatement ||
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
    // enil + any illaenil branches + optional illana, folded into
    // nested IfStatements from the BOTTOM up:
    //   enil A / illaenil B / illana  →  if A else (if B else (else-block))
    const conditions = ctx.expression.map((e) => this.visit(e));
    const blocks = ctx.block.map((b) => this.visit(b));
    // One more block than conditions means the trailing illana exists.
    let alternate =
      blocks.length > conditions.length ? blocks[blocks.length - 1] : null;
    for (let i = conditions.length - 1; i >= 0; i--) {
      alternate = {
        type: "IfStatement",
        condition: conditions[i],
        consequent: blocks[i],
        alternate,
        line: i === 0 ? ctx.If[0].startLine : ctx.Elseif[i - 1].startLine,
      };
    }
    return alternate; // the outermost if
  }

  whileStatement(ctx) {
    return {
      type: "WhileStatement",
      condition: this.visit(ctx.expression),
      body: this.visit(ctx.block),
      line: ctx.While[0].startLine,
    };
  }

  forStatement(ctx) {
    const variable = ctx.Identifier[0].image;
    const line = ctx.For[0].startLine;
    const body = this.visit(ctx.block);
    if (ctx.DotDot) {
      // mindum i ulla 1 .. 10  → counting loop, both ends included
      return {
        type: "ForRangeStatement",
        variable,
        from: this.visit(ctx.expression[0]),
        to: this.visit(ctx.expression[1]),
        body,
        line,
      };
    }
    // mindum m ulla marks  → walk each item of a list
    return {
      type: "ForEachStatement",
      variable,
      iterable: this.visit(ctx.expression[0]),
      body,
      line,
    };
  }

  breakStatement(ctx) {
    return { type: "BreakStatement", line: ctx.Break[0].startLine };
  }

  continueStatement(ctx) {
    return { type: "ContinueStatement", line: ctx.Continue[0].startLine };
  }

  constStatement(ctx) {
    return {
      type: "ConstDeclaration",
      name: ctx.Identifier[0].image,
      value: this.visit(ctx.expression),
      line: ctx.Const[0].startLine,
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
    // ctx.expression holds the index expressions (if any) followed by
    // the value expression — the value is always the LAST one.
    const exprs = ctx.expression.map((e) => this.visit(e));
    const value = exprs[exprs.length - 1];
    const indices = exprs.slice(0, -1);
    const name = ctx.Identifier[0].image;
    const line = ctx.Identifier[0].startLine;
    if (indices.length === 0) {
      return { type: "Assignment", name, value, line };
    }
    // marks[0] = 90   or nested like grid[i][j] = 1
    return { type: "IndexAssignment", name, indices, value, line };
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
    return this.visit(ctx.orExpression);
  }

  // "a allathu b allathu c" folds left-to-right, like additive does.
  orExpression(ctx) {
    let node = this.visit(ctx.andExpression[0]);
    if (ctx.Or) {
      for (let i = 0; i < ctx.Or.length; i++) {
        node = {
          type: "BinaryExpression",
          operator: "allathu", // becomes || in JavaScript
          left: node,
          right: this.visit(ctx.andExpression[i + 1]),
          line: ctx.Or[i].startLine,
        };
      }
    }
    return node;
  }

  andExpression(ctx) {
    let node = this.visit(ctx.notExpression[0]);
    if (ctx.And) {
      for (let i = 0; i < ctx.And.length; i++) {
        node = {
          type: "BinaryExpression",
          operator: "matrum", // becomes && in JavaScript
          left: node,
          right: this.visit(ctx.notExpression[i + 1]),
          line: ctx.And[i].startLine,
        };
      }
    }
    return node;
  }

  notExpression(ctx) {
    if (!ctx.Not) return this.visit(ctx.comparisonExpression);
    return {
      type: "UnaryExpression",
      operator: "alla", // becomes ! in JavaScript
      argument: this.visit(ctx.notExpression),
      line: ctx.Not[0].startLine,
    };
  }

  comparisonExpression(ctx) {
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
    if (ctx.listLiteral) return this.visit(ctx.listLiteral);
    if (ctx.callOrIdentifier) return this.visit(ctx.callOrIdentifier);
    return this.visit(ctx.parenExpression);
  }

  callOrIdentifier(ctx) {
    const nameTok = ctx.Identifier[0];
    let node;
    if (!ctx.LParen) {
      // Just a variable reference, e.g.  pass_marku
      node = { type: "Identifier", name: nameTok.image, line: nameTok.startLine };
    } else {
      // A function call, e.g.  match_check("Surjune", 87)
      node = {
        type: "CallExpression",
        callee: nameTok.image,
        args: ctx.argumentList ? this.visit(ctx.argumentList) : [],
        line: nameTok.startLine,
      };
    }
    // Any [index] parts wrap around what we have so far, left to right:
    // grid[i][j]  →  Index(Index(grid, i), j)
    if (ctx.expression) {
      for (const idx of ctx.expression) {
        node = {
          type: "IndexExpression",
          object: node,
          index: this.visit(idx),
          line: nameTok.startLine,
        };
      }
    }
    return node;
  }

  listLiteral(ctx) {
    return {
      type: "ListLiteral",
      elements: ctx.expression ? ctx.expression.map((e) => this.visit(e)) : [],
      line: ctx.LBracket[0].startLine,
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
 * Pre-pass: delete NEWLINE tokens that come right before 'illana' or
 * 'illaenil'. Tanglish lets you write  }  and  illana {  on separate
 * lines (see the demo program); grammatically they still belong to the
 * if above, so those newlines are not real statement breaks.
 */
function dropNewlinesBeforeElse(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "NEWLINE") {
      let j = i;
      while (j < tokens.length && tokens[j].type === "NEWLINE") j++;
      if (j < tokens.length && (tokens[j].type === "ELSE" || tokens[j].type === "ELSEIF")) {
        i = j - 1; // skip the whole newline run; loop's i++ lands on it
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
