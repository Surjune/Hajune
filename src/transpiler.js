/**
 * transpiler.js — Tanglish AST → JavaScript emitter
 * --------------------------------------------------
 * The final stage of the pipeline. Walks the AST produced by
 * src/parser.js and returns a string of clean, indented JavaScript
 * that Node.js can run directly.
 *
 * Keyword mapping (locked):
 *   seyal      → function          achchu(x)  → console.log(x)
 *   enil       → if                unmei      → true
 *   illana     → else              poi        → false
 *   thiruppi   → return            onnumilai  → null
 *
 * Variables: Tanglish has no 'let' — you just assign, like Python.
 * The transpiler remembers which names it has already seen in the
 * current scope:
 *   - FIRST assignment of a name  →  let name = ...;
 *   - later assignments           →  name = ...;
 * Each function body starts a fresh scope (its parameters are already
 * "seen", so assigning to a parameter never re-declares it).
 * if/illana blocks do NOT start a new scope — a variable created
 * inside them belongs to the surrounding function, like in Python.
 *
 * Parentheses: the AST stores grouping as tree shape, not as '(' ')'
 * tokens, so the emitter re-inserts parentheses only where operator
 * precedence demands them. "2 + 3 * 4" stays as-is, but the tree for
 * "(2 + 3) * 4" comes out as "(2 + 3) * 4" again.
 */
"use strict";
const { TanglishTranspilerError } = require("./errors");

const INDENT = "  "; // two spaces per nesting level in the generated JS

// Operator strength, used to decide where parentheses are needed.
// Higher number = binds tighter. Matches the parser's precedence
// (and JavaScript's, so the emitted text means what the tree means).
const PRECEDENCE = {
  allathu: 1,                                         // or  → ||
  matrum: 2,                                          // and → &&
  ">=": 3, "<=": 3, ">": 3, "<": 3, "==": 3, "!=": 3, // comparison
  "+": 4, "-": 4,                                     // additive
  "*": 5, "/": 5,                                     // multiplicative
};
const UNARY_PRECEDENCE = 6;   // unary minus and alla (not)
const PRIMARY_PRECEDENCE = 7; // literals, names, calls, list slots

// Word operators become JavaScript symbols; everything else is itself.
const JS_OPERATOR = { allathu: "||", matrum: "&&" };

/**
 * transpile(ast) — the one function other files call.
 * Input:  the Program AST node from parse()
 * Output: a JavaScript source string, ready for Node.js
 */
function transpile(ast) {
  if (!ast || ast.type !== "Program") {
    throw new TanglishTranspilerError(
      "Transpiler error: expected a Program AST node from the parser."
    );
  }
  // The program's top level is the outermost scope. Scopes are Maps of
  // variable name → how it was born ("let", "const" or "param"), so we
  // can refuse changes to marathu constants with a friendly message.
  const programScope = new Map();
  const lines = ast.body.map((stmt) => emitStatement(stmt, 0, [programScope]));
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------

/**
 * Emit one statement as fully indented line(s) of JavaScript.
 *   depth  — current nesting level (0 = top of file)
 *   scopes — stack of Sets holding variable names already declared;
 *            the LAST entry is the current function (or program) scope.
 */
function emitStatement(node, depth, scopes) {
  const pad = INDENT.repeat(depth);

  switch (node.type) {
    case "Assignment": {
      const current = scopes[scopes.length - 1];
      const value = emitExpression(node.value);
      if (current.has(node.name)) {
        if (current.get(node.name) === "const") {
          throw new TanglishTranspilerError(
            `Transpiler error on line ${node.line}: '${node.name}' is a ` +
            `marathu constant — its value can never be changed.`,
            node.line
          );
        }
        return `${pad}${node.name} = ${value};`; // reassignment
      }
      current.set(node.name, "let");
      return `${pad}let ${node.name} = ${value};`; // first assignment
    }

    case "ConstDeclaration": {
      const current = scopes[scopes.length - 1];
      if (current.has(node.name)) {
        throw new TanglishTranspilerError(
          `Transpiler error on line ${node.line}: '${node.name}' already ` +
          `exists — marathu must introduce a brand-new name.`,
          node.line
        );
      }
      current.set(node.name, "const");
      return `${pad}const ${node.name} = ${emitExpression(node.value)};`;
    }

    case "IndexAssignment": {
      // marks[0] = 90  — changing a slot, not the variable itself,
      // so this is allowed even on a marathu list.
      const target =
        node.name + node.indices.map((ix) => `[${emitExpression(ix)}]`).join("");
      return `${pad}${target} = ${emitExpression(node.value)};`;
    }

    case "FunctionDeclaration": {
      // A function body is a brand-new scope; parameters are already
      // declared names inside it.
      const functionScope = new Map(node.params.map((p) => [p, "param"]));
      const body = emitBlockBody(node.body, depth + 1, [...scopes, functionScope]);
      return (
        `${pad}function ${node.name}(${node.params.join(", ")}) {\n` +
        body +
        `${pad}}`
      );
    }

    case "IfStatement": {
      // No new scope here — Tanglish variables are function-scoped,
      // so the if/illana blocks reuse the scopes we already have.
      //
      // Hoisting: a variable BORN inside a branch must survive after
      // the branch (Python behaviour), but a `let` inside JS braces
      // would die at the closing `}`. So we declare such names just
      // above the if, and the branch assignment becomes a plain one:
      //     let result;
      //     if (...) { result = "pass"; } else { result = "fail"; }
      const condition = emitExpression(node.condition);
      let code = hoistBornNames(node, pad, scopes);
      code +=
        `${pad}if (${condition}) {\n` +
        emitBlockBody(node.consequent, depth + 1, scopes) +
        `${pad}}`;
      if (node.alternate) {
        if (node.alternate.type === "IfStatement") {
          // An illaenil branch: glue the nested if onto the same line,
          // giving the classic  } else if (...) {  shape. Its own hoist
          // finds nothing new — we already hoisted the whole chain.
          code += ` else ` + emitStatement(node.alternate, depth, scopes).trimStart();
        } else {
          code +=
            ` else {\n` +
            emitBlockBody(node.alternate, depth + 1, scopes) +
            `${pad}}`;
        }
      }
      return code;
    }

    case "WhileStatement": {
      let code = hoistBornNames(node, pad, scopes);
      code +=
        `${pad}while (${emitExpression(node.condition)}) {\n` +
        emitBlockBody(node.body, depth + 1, scopes) +
        `${pad}}`;
      return code;
    }

    case "ForRangeStatement": {
      // mindum i ulla 1 .. 10  →  a counting loop, BOTH ends included.
      // The loop variable is hoisted (never declared in the header), so
      // like Python it survives after the loop ends.
      let code = hoistBornNames(node, pad, scopes);
      const v = node.variable;
      code +=
        `${pad}for (${v} = ${emitExpression(node.from)}; ` +
        `${v} <= ${emitExpression(node.to)}; ${v} = ${v} + 1) {\n` +
        emitBlockBody(node.body, depth + 1, scopes) +
        `${pad}}`;
      return code;
    }

    case "ForEachStatement": {
      // mindum m ulla marks  →  visit every item of a list in order.
      let code = hoistBornNames(node, pad, scopes);
      code +=
        `${pad}for (${node.variable} of ${emitExpression(node.iterable)}) {\n` +
        emitBlockBody(node.body, depth + 1, scopes) +
        `${pad}}`;
      return code;
    }

    case "BreakStatement":
      return `${pad}break;`; // niruthu

    case "ContinueStatement":
      return `${pad}continue;`; // thodar

    case "ReturnStatement":
      return `${pad}return ${emitExpression(node.argument)};`;

    case "PrintStatement":
      return `${pad}console.log(${emitExpression(node.argument)});`;

    default:
      // Anything else must be a bare expression used as a statement
      // (e.g. a function call on its own line).
      return `${pad}${emitExpression(node)};`;
  }
}

/** Emit every statement in a Block, one per line, at the given depth. */
function emitBlockBody(block, depth, scopes) {
  if (block.body.length === 0) return "";
  return block.body.map((s) => emitStatement(s, depth, scopes)).join("\n") + "\n";
}

/**
 * Hoisting: a variable BORN inside a branch or loop body must survive
 * after it (Python behaviour), but a `let` inside JS braces would die
 * at the closing `}`. So before emitting an if/varai/mindum we declare
 * every newly-born name just above it, and the inner assignments
 * become plain ones:
 *     let result;
 *     if (...) { result = "pass"; } else { result = "fail"; }
 * Returns the "let a, b;" line (or "" if nothing needs hoisting) and
 * records the names in the current scope.
 */
function hoistBornNames(node, pad, scopes) {
  const current = scopes[scopes.length - 1];
  const born = new Set();
  collectFromStatement(node, born);
  const toHoist = [...born].filter((name) => !current.has(name));
  if (toHoist.length === 0) return "";
  toHoist.forEach((name) => current.set(name, "let"));
  return `${pad}let ${toHoist.join(", ")};\n`;
}

/**
 * Collect every variable name a statement gives birth to, looking
 * inside nested ifs and loops. Does NOT look inside nested function
 * declarations — those have their own scope and care for themselves.
 */
function collectFromStatement(stmt, names) {
  switch (stmt.type) {
    case "Assignment":
      names.add(stmt.name);
      break;
    case "IfStatement":
      collectFromBlock(stmt.consequent, names);
      if (stmt.alternate) {
        if (stmt.alternate.type === "IfStatement") {
          collectFromStatement(stmt.alternate, names); // illaenil link
        } else {
          collectFromBlock(stmt.alternate, names); // final illana block
        }
      }
      break;
    case "WhileStatement":
      collectFromBlock(stmt.body, names);
      break;
    case "ForRangeStatement":
    case "ForEachStatement":
      names.add(stmt.variable); // the loop variable itself survives too
      collectFromBlock(stmt.body, names);
      break;
  }
}

/** Run collectFromStatement over every statement in a block. */
function collectFromBlock(block, names) {
  for (const stmt of block.body) collectFromStatement(stmt, names);
}

// ---------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------

/**
 * Emit an expression as JavaScript text.
 * parentPrecedence is the strength of the operator ABOVE this node;
 * if this node binds more weakly, it must be wrapped in parentheses.
 */
function emitExpression(node, parentPrecedence = 0) {
  switch (node.type) {
    case "NumberLiteral":
      return String(node.value);

    case "StringLiteral":
      // JSON.stringify adds the quotes (and would escape anything odd).
      return JSON.stringify(node.value);

    case "BooleanLiteral":
      return node.value ? "true" : "false"; // unmei / poi

    case "NullLiteral":
      return "null"; // onnumilai

    case "Identifier":
      return node.name;

    case "CallExpression": {
      const args = node.args.map((a) => emitExpression(a)).join(", ");
      return `${node.callee}(${args})`;
    }

    case "UnaryExpression": {
      // The operand needs parens when it is weaker than the unary op,
      // e.g. -(2 + 3) or alla (a == b) → !(a == b). Plain -5 / !x stay bare.
      const inner = emitExpression(node.argument, UNARY_PRECEDENCE);
      const code = node.operator === "alla" ? `!${inner}` : `-${inner}`;
      return parentPrecedence > UNARY_PRECEDENCE ? `(${code})` : code;
    }

    case "BinaryExpression": {
      const myPrecedence = PRECEDENCE[node.operator];
      const jsOp = JS_OPERATOR[node.operator] || node.operator; // matrum→&&
      const left = emitExpression(node.left, myPrecedence);
      // +1 on the right side: equal-strength operators group left-to-
      // right, so a same-level tree on the RIGHT means the source had
      // explicit parentheses, e.g. 10 - (3 - 2). Keep them.
      const right = emitExpression(node.right, myPrecedence + 1);
      const code = `${left} ${jsOp} ${right}`;
      return parentPrecedence > myPrecedence ? `(${code})` : code;
    }

    case "ListLiteral":
      return `[${node.elements.map((e) => emitExpression(e)).join(", ")}]`;

    case "IndexExpression":
      // marks[0] or grid[i][j] — the object is always primary-strength
      // (a name, call or another index), so no parens are ever needed.
      return `${emitExpression(node.object, PRIMARY_PRECEDENCE)}[${emitExpression(node.index)}]`;

    default:
      throw new TanglishTranspilerError(
        `Transpiler error${node.line ? ` on line ${node.line}` : ""}: ` +
        `unknown AST node type "${node.type}".`,
        node.line
      );
  }
}

module.exports = { transpile, TanglishTranspilerError };
