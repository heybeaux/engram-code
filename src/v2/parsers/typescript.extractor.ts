/**
 * TypeScript language extractor backed by tree-sitter.
 *
 * Projects a TS/TSX file's AST onto the v2 `StructureNode` / `StructureEdge`
 * vocabulary. Coverage is intentionally narrow — only the entities the
 * structure-graph pass actually consumes:
 *
 *   - top-level function / class / interface declarations
 *   - class methods
 *   - exports (named, default, and re-exports)
 *   - imports (named, default, namespace, side-effect)
 *   - call sites within functions and methods
 *
 * Each declaration emits a `contains` edge from its parent (module or class),
 * imports emit an `imports` edge from the module, class heritage emits
 * `extends` edges, and call sites emit `calls` edges from the enclosing
 * function/method. Parse errors detected by tree-sitter are surfaced via
 * `parseErrors` rather than thrown so the harness can keep moving.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser: typeof import('tree-sitter') = require('tree-sitter');
// tree-sitter-typescript's published types use `export =` with an object
// literal, which `nodenext` resolution exposes via a default-only import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TreeSitterTypeScript: typeof import('tree-sitter-typescript') = require('tree-sitter-typescript');

import { register } from './registry';
import {
  LanguageExtractor,
  NodeKind,
  ParseResult,
  StructureEdge,
  StructureNode,
} from './types';

type SyntaxNode = Parser.SyntaxNode;

/**
 * Collected mutable state for a single parse. Keeping this in a struct (rather
 * than threading parameters through every visitor) keeps the recursion sites
 * readable without resorting to module-level globals.
 */
interface ParseContext {
  filePath: string;
  moduleName: string;
  nodes: StructureNode[];
  edges: StructureEdge[];
  parseErrors: string[];
}

function lineOf(node: SyntaxNode): { start: number; end: number } {
  return {
    start: node.startPosition.row + 1,
    end: node.endPosition.row + 1,
  };
}

function pushNode(
  ctx: ParseContext,
  kind: NodeKind,
  name: string,
  node: SyntaxNode,
  parent?: string,
  metadata?: Record<string, unknown>,
): StructureNode {
  const { start, end } = lineOf(node);
  const structureNode: StructureNode = {
    kind,
    name,
    filePath: ctx.filePath,
    startLine: start,
    endLine: end,
    ...(parent !== undefined ? { parent } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
  ctx.nodes.push(structureNode);
  return structureNode;
}

function pushEdge(
  ctx: ParseContext,
  from: string,
  to: string,
  type: StructureEdge['type'],
  metadata?: Record<string, unknown>,
): void {
  ctx.edges.push({
    from,
    to,
    type,
    ...(metadata !== undefined ? { metadata } : {}),
  });
}

/**
 * Best-effort name resolver for the callee side of a call_expression.
 * Returns the raw textual form (e.g. `foo`, `obj.bar`, `a.b.c`) so downstream
 * passes can do their own resolution against the symbol table later.
 */
function calleeName(node: SyntaxNode): string | null {
  const fn = node.childForFieldName('function') ?? node.namedChild(0);
  if (!fn) return null;
  return fn.text;
}

function collectImport(ctx: ParseContext, node: SyntaxNode): void {
  const source = node.childForFieldName('source');
  const sourcePath = source ? stripStringQuotes(source.text) : '<unknown>';

  pushNode(ctx, 'import', sourcePath, node, ctx.moduleName, {
    raw: node.text,
  });
  pushEdge(ctx, ctx.moduleName, sourcePath, 'imports');
}

function stripStringQuotes(text: string): string {
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' || first === "'" || first === '`') && first === last) {
      return text.slice(1, -1);
    }
  }
  return text;
}

/**
 * Walk a class body, emitting a `method` node for each method definition and
 * a `contains` edge from the class. Also recurses into method bodies for
 * call-site extraction.
 */
function collectClassMembers(
  ctx: ParseContext,
  classNode: SyntaxNode,
  className: string,
): void {
  const body = classNode.childForFieldName('body');
  if (!body) return;

  for (const member of body.namedChildren) {
    if (member.type === 'method_definition') {
      const nameNode = member.childForFieldName('name');
      const methodName = nameNode ? nameNode.text : '<anonymous>';
      const qualified = `${className}.${methodName}`;
      pushNode(ctx, 'method', methodName, member, className);
      pushEdge(ctx, className, qualified, 'contains');
      collectCalls(ctx, member, qualified);
    }
  }
}

/**
 * Walk a subtree looking for call_expression nodes, attributing each to the
 * provided enclosing qualified name. We deliberately do not descend into
 * nested function/method declarations — their calls belong to that inner
 * scope and are collected when we visit those declarations directly.
 */
function collectCalls(
  ctx: ParseContext,
  root: SyntaxNode,
  enclosing: string,
): void {
  const stack: SyntaxNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const child of node.namedChildren) {
      if (
        child.type === 'function_declaration' ||
        child.type === 'method_definition' ||
        child.type === 'class_declaration'
      ) {
        // Skip: handled by their own top-level / class walkers.
        continue;
      }
      if (child.type === 'call_expression') {
        const name = calleeName(child);
        if (name) {
          const { start, end } = lineOf(child);
          pushNode(ctx, 'call', name, child, enclosing, {
            startLine: start,
            endLine: end,
          });
          pushEdge(ctx, enclosing, name, 'calls');
        }
      }
      stack.push(child);
    }
  }
}

/**
 * Unwrap `export_statement` / `export default` wrappers so we can treat the
 * inner declaration uniformly. Returns the inner declaration plus whether
 * it was exported and (when applicable) whether it was a default export.
 */
function unwrapExport(node: SyntaxNode): {
  inner: SyntaxNode;
  exported: boolean;
  isDefault: boolean;
} {
  if (node.type !== 'export_statement') {
    return { inner: node, exported: false, isDefault: false };
  }
  const declaration =
    node.childForFieldName('declaration') ??
    node.namedChildren.find(
      (c) =>
        c.type === 'function_declaration' ||
        c.type === 'class_declaration' ||
        c.type === 'interface_declaration' ||
        c.type === 'lexical_declaration' ||
        c.type === 'variable_declaration',
    );
  const isDefault = node.children.some((c) => c.type === 'default');
  return {
    inner: declaration ?? node,
    exported: true,
    isDefault,
  };
}

function collectFunctionDeclaration(
  ctx: ParseContext,
  node: SyntaxNode,
  exported: boolean,
  isDefault: boolean,
): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? nameNode.text : isDefault ? 'default' : '<anonymous>';
  pushNode(ctx, 'function', name, node, ctx.moduleName, {
    exported,
    default: isDefault,
  });
  pushEdge(ctx, ctx.moduleName, name, 'contains');
  if (exported) {
    pushNode(ctx, 'export', name, node, ctx.moduleName, { default: isDefault });
  }

  const body = node.childForFieldName('body');
  if (body) collectCalls(ctx, body, name);
}

function collectClassDeclaration(
  ctx: ParseContext,
  node: SyntaxNode,
  exported: boolean,
  isDefault: boolean,
): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? nameNode.text : isDefault ? 'default' : '<anonymous>';
  pushNode(ctx, 'class', name, node, ctx.moduleName, {
    exported,
    default: isDefault,
  });
  pushEdge(ctx, ctx.moduleName, name, 'contains');
  if (exported) {
    pushNode(ctx, 'export', name, node, ctx.moduleName, { default: isDefault });
  }

  // `extends` clause lives under `class_heritage`.
  for (const child of node.namedChildren) {
    if (child.type === 'class_heritage') {
      for (const clause of child.namedChildren) {
        if (clause.type === 'extends_clause') {
          for (const target of clause.namedChildren) {
            if (target.type !== 'extends') {
              pushEdge(ctx, name, target.text, 'extends');
            }
          }
        }
      }
    }
  }

  collectClassMembers(ctx, node, name);
}

function collectInterfaceDeclaration(
  ctx: ParseContext,
  node: SyntaxNode,
  exported: boolean,
): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode ? nameNode.text : '<anonymous>';
  pushNode(ctx, 'interface', name, node, ctx.moduleName, { exported });
  pushEdge(ctx, ctx.moduleName, name, 'contains');
  if (exported) {
    pushNode(ctx, 'export', name, node, ctx.moduleName);
  }
}

/**
 * Top-level dispatcher. Walks the program node and routes each child to the
 * appropriate collector, handling the `export_statement` wrapper uniformly.
 */
function collectTopLevel(ctx: ParseContext, program: SyntaxNode): void {
  for (const raw of program.namedChildren) {
    if (raw.type === 'import_statement') {
      collectImport(ctx, raw);
      continue;
    }

    const { inner, exported, isDefault } = unwrapExport(raw);

    switch (inner.type) {
      case 'function_declaration':
        collectFunctionDeclaration(ctx, inner, exported, isDefault);
        break;
      case 'class_declaration':
        collectClassDeclaration(ctx, inner, exported, isDefault);
        break;
      case 'interface_declaration':
        collectInterfaceDeclaration(ctx, inner, exported);
        break;
      default:
        // `export { foo } from './x'` style re-exports surface here with an
        // inner that's still the export_statement (no `declaration` field).
        if (exported && raw.type === 'export_statement') {
          pushNode(ctx, 'export', raw.text.slice(0, 80), raw, ctx.moduleName);
        }
        break;
    }
  }
}

/**
 * Walk the tree once collecting tree-sitter ERROR / MISSING nodes into a
 * short, human-readable line of diagnostics each. We cap to a small budget
 * to keep `parseErrors` bounded on pathologically broken files.
 */
function collectParseErrors(root: SyntaxNode, errors: string[]): void {
  const MAX_ERRORS = 16;
  const stack: SyntaxNode[] = [root];
  while (stack.length > 0 && errors.length < MAX_ERRORS) {
    const node = stack.pop()!;
    if (node.isError) {
      errors.push(
        `syntax error at ${node.startPosition.row + 1}:${
          node.startPosition.column + 1
        }`,
      );
    } else if (node.isMissing) {
      errors.push(
        `missing ${node.type} at ${node.startPosition.row + 1}:${
          node.startPosition.column + 1
        }`,
      );
    }
    for (const child of node.children) stack.push(child);
  }
}

// Reuse one parser per grammar across calls. tree-sitter parsers are stateful
// but safe to reuse for `parse()` as long as the language doesn't change,
// and recreating them per file produces flaky native-binding state when many
// extractors share the process (observed in Jest cross-suite runs).
function makeParser(ext: string): { parser: Parser; language: Parser.Language } {
  const useTsx = ext.toLowerCase() === '.tsx';
  const language = (
    useTsx ? TreeSitterTypeScript.tsx : TreeSitterTypeScript.typescript
  ) as unknown as Parser.Language;
  const parser = new Parser();
  parser.setLanguage(language);
  return { parser, language };
}

function moduleNameFor(filePath: string): string {
  // Strip the trailing extension to give downstream graph passes a stable
  // module identifier without coupling them to the file suffix.
  const dot = filePath.lastIndexOf('.');
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return dot > slash ? filePath.slice(0, dot) : filePath;
}

export const typescriptExtractor: LanguageExtractor = {
  language: 'typescript',
  extensions: ['.ts', '.tsx'],
  parse(filePath: string, source: string): ParseResult {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    const { parser, language } = makeParser(ext);

    const moduleName = moduleNameFor(filePath);
    const ctx: ParseContext = {
      filePath,
      moduleName,
      nodes: [],
      edges: [],
      parseErrors: [],
    };

    // Re-assert language immediately before parse. tree-sitter's native
    // bindings have a per-process global that can be overwritten by another
    // extractor running in the same Jest worker; re-asserting here ensures
    // the correct grammar is active even after contamination.
    parser.setLanguage(language);
    const tree = parser.parse(source);
    const root = tree?.rootNode;

    const lineCount = source.length === 0 ? 1 : source.split('\n').length;
    ctx.nodes.push({
      kind: 'module',
      name: moduleName,
      filePath,
      startLine: 1,
      endLine: Math.max(1, lineCount),
    });

    if (root?.hasError) {
      collectParseErrors(root, ctx.parseErrors);
    }

    if (root) collectTopLevel(ctx, root);

    return {
      filePath,
      language: 'typescript',
      nodes: ctx.nodes,
      edges: ctx.edges,
      parseErrors: ctx.parseErrors,
    };
  },
};

/**
 * Side-effecting install. Importing this module from a bootstrap file (or a
 * test) registers the extractor for `.ts` / `.tsx` against the global
 * registry.
 */
export function registerTypeScriptExtractor(): void {
  register(typescriptExtractor);
}
