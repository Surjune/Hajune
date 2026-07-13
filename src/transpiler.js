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
// Higher number = binds tighter. Matches the parser's precedence.
const PRECEDENCE = {
  ">=": 1, "<=": 1, ">": 1, "<": 1, "==": 1, "!=": 1, // comparison
  "+": 2, "-": 2,                                     // additive
  "*": 3, "/": 3,                                     // multiplicative
};
const UNARY_PRECEDENCE = 4;   // unary minus
const PRIMARY_PRECEDENCE = 5; // literals, names, calls

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
  // The program's top level is the outermost scope.
  const programScope = new Set();
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
        return `${pad}${node.name} = ${value};`; // reassignment
      }
      current.add(node.name);
      return `${pad}let ${node.name} = ${value};`; // first assignment
    }

    case "FunctionDeclaration": {
      // A function body is a brand-new scope; parameters are already
      // declared names inside it.
      const functionScope = new Set(node.params);
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
      const current = scopes[scopes.length - 1];
      const born = new Set();
      collectAssignedNames(node.consequent, born);
      if (node.alternate) collectAssignedNames(node.alternate, born);
      const toHoist = [...born].filter((name) => !current.has(name));
      let code = "";
      if (toHoist.length > 0) {
        toHoist.forEach((name) => current.add(name));
        code += `${pad}let ${toHoist.join(", ")};\n`;
      }
      const condition = emitExpression(node.condition);
      code +=
        `${pad}if (${condition}) {\n` +
        emitBlockBody(node.consequent, depth + 1, scopes) +
        `${pad}}`;
      if (node.alternate) {
        code +=
          ` else {\n` +
          emitBlockBody(node.alternate, depth + 1, scopes) +
          `${pad}}`;
      }
      return code;
    }

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
 * Collect every variable name assigned anywhere inside a block,
 * including inside nested if/illana blocks. Used for hoisting.
 * Does NOT look inside nested function declarations — those have
 * their own scope and take care of their own variables.
 */
function collectAssignedNames(block, names) {
  for (const stmt of block.body) {
    if (stmt.type === "Assignment") {
      names.add(stmt.name);
    } else if (stmt.type === "IfStatement") {
      collectAssignedNames(stmt.consequent, names);
      if (stmt.alternate) collectAssignedNames(stmt.alternate, names);
    }
  }
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
      // The operand needs parens when it is weaker than unary minus,
      // e.g. -(2 + 3). A plain -5 stays bare.
      const inner = emitExpression(node.argument, UNARY_PRECEDENCE);
      const code = `-${inner}`;
      return parentPrecedence > UNARY_PRECEDENCE ? `(${code})` : code;
    }

    case "BinaryExpression": {
      const myPrecedence = PRECEDENCE[node.operator];
      const left = emitExpression(node.left, myPrecedence);
      // +1 on the right side: equal-strength operators group left-to-
      // right, so a same-level tree on the RIGHT means the source had
      // explicit parentheses, e.g. 10 - (3 - 2). Keep them.
      const right = emitExpression(node.right, myPrecedence + 1);
      const code = `${left} ${node.operator} ${right}`;
      return parentPrecedence > myPrecedence ? `(${code})` : code;
    }

    default:
      throw new TanglishTranspilerError(
        `Transpiler error${node.line ? ` on line ${node.line}` : ""}: ` +
        `unknown AST node type "${node.type}".`,
        node.line
      );
  }
}

module.exports = { transpile, TanglishTranspilerError };
