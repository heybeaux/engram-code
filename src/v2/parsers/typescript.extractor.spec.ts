/**
 * Tests for the TypeScript tree-sitter extractor.
 *
 * Co-located under `src/` because Jest's rootDir is `src` (see EC-8 spec for
 * the rationale). Tests exercise the extractor directly, not through the
 * harness, so they don't need a tmpdir + writeFile dance.
 */

import { clear, getByExtension, getByLanguage } from './registry';
import {
  registerTypeScriptExtractor,
  typescriptExtractor,
} from './typescript.extractor';

describe('v2 typescript extractor', () => {
  beforeEach(() => {
    clear();
  });

  afterEach(() => {
    clear();
  });

  it('registers under .ts and .tsx with language id "typescript"', () => {
    registerTypeScriptExtractor();
    expect(getByLanguage('typescript')).toBe(typescriptExtractor);
    expect(getByExtension('.ts')).toBe(typescriptExtractor);
    expect(getByExtension('.tsx')).toBe(typescriptExtractor);
  });

  it('extracts exported functions with a contains edge and export node', () => {
    const result = typescriptExtractor.parse(
      'src/example.ts',
      'export function greet(name: string): string {\n  return `hi ${name}`;\n}\n',
    );

    expect(result.parseErrors).toEqual([]);
    expect(result.language).toBe('typescript');

    const fn = result.nodes.find((n) => n.kind === 'function');
    expect(fn).toMatchObject({
      kind: 'function',
      name: 'greet',
      parent: 'src/example',
      startLine: 1,
    });
    expect(fn?.metadata).toMatchObject({ exported: true, default: false });

    const exportNode = result.nodes.find((n) => n.kind === 'export');
    expect(exportNode?.name).toBe('greet');

    expect(result.edges).toContainEqual({
      from: 'src/example',
      to: 'greet',
      type: 'contains',
    });
  });

  it('extracts exported classes, methods, and extends edges', () => {
    const source = [
      'export class Dog extends Animal {',
      '  bark(): void {',
      '    console.log("woof");',
      '  }',
      '  fetch(): void {}',
      '}',
      '',
    ].join('\n');
    const result = typescriptExtractor.parse('src/dog.ts', source);

    expect(result.parseErrors).toEqual([]);

    const cls = result.nodes.find((n) => n.kind === 'class');
    expect(cls).toMatchObject({ name: 'Dog', parent: 'src/dog' });
    expect(cls?.metadata).toMatchObject({ exported: true });

    const methods = result.nodes.filter((n) => n.kind === 'method');
    expect(methods.map((m) => m.name).sort()).toEqual(['bark', 'fetch']);
    expect(methods.every((m) => m.parent === 'Dog')).toBe(true);

    expect(result.edges).toContainEqual({
      from: 'Dog',
      to: 'Animal',
      type: 'extends',
    });
    expect(result.edges).toContainEqual({
      from: 'Dog',
      to: 'Dog.bark',
      type: 'contains',
    });
  });

  it('extracts interface declarations', () => {
    const result = typescriptExtractor.parse(
      'src/types.ts',
      'export interface User {\n  id: string;\n  name: string;\n}\n',
    );

    expect(result.parseErrors).toEqual([]);

    const iface = result.nodes.find((n) => n.kind === 'interface');
    expect(iface).toMatchObject({
      name: 'User',
      parent: 'src/types',
      kind: 'interface',
    });
    expect(iface?.metadata).toMatchObject({ exported: true });

    expect(result.edges).toContainEqual({
      from: 'src/types',
      to: 'User',
      type: 'contains',
    });
  });

  it('extracts imports with source path and imports edges', () => {
    const source = [
      'import { readFileSync } from "node:fs";',
      'import path from "node:path";',
      'import * as os from "node:os";',
      'import "./side-effect";',
      '',
    ].join('\n');
    const result = typescriptExtractor.parse('src/app.ts', source);

    expect(result.parseErrors).toEqual([]);

    const imports = result.nodes.filter((n) => n.kind === 'import');
    const sources = imports.map((i) => i.name).sort();
    expect(sources).toEqual([
      './side-effect',
      'node:fs',
      'node:os',
      'node:path',
    ]);

    expect(result.edges).toContainEqual({
      from: 'src/app',
      to: 'node:fs',
      type: 'imports',
    });
    expect(result.edges.filter((e) => e.type === 'imports')).toHaveLength(4);
  });

  it('captures call sites within functions as calls edges', () => {
    const source = [
      'import { helper } from "./helper";',
      '',
      'export function main(): void {',
      '  helper();',
      '  console.log("done");',
      '  nested(deeper());',
      '}',
      '',
    ].join('\n');
    const result = typescriptExtractor.parse('src/main.ts', source);

    expect(result.parseErrors).toEqual([]);

    const callEdges = result.edges.filter((e) => e.type === 'calls');
    const targets = callEdges.map((e) => e.to).sort();
    // We collect both `nested` and the inner `deeper` it wraps, plus member
    // expressions like `console.log` show up by their full textual form.
    expect(targets).toEqual(
      ['console.log', 'deeper', 'helper', 'nested'].sort(),
    );
    expect(callEdges.every((e) => e.from === 'main')).toBe(true);

    const callNodes = result.nodes.filter((n) => n.kind === 'call');
    expect(callNodes.length).toBeGreaterThanOrEqual(4);
    expect(callNodes.every((n) => n.parent === 'main')).toBe(true);
  });

  it('captures parse errors on malformed TypeScript without throwing', () => {
    // Missing closing brace + dangling parameter list.
    const source = 'function broken(x: number {\n  return ;\n';
    expect(() => typescriptExtractor.parse('src/broken.ts', source)).not.toThrow();

    const result = typescriptExtractor.parse('src/broken.ts', source);
    expect(result.parseErrors.length).toBeGreaterThan(0);
    expect(result.language).toBe('typescript');
    // Module node is still emitted so downstream passes have something to anchor on.
    expect(result.nodes.some((n) => n.kind === 'module')).toBe(true);
  });

  it('handles .tsx by selecting the tsx grammar', () => {
    const source = [
      'export function View(): JSX.Element {',
      '  return <div onClick={handler()}>hi</div>;',
      '}',
      '',
    ].join('\n');
    const result = typescriptExtractor.parse('src/view.tsx', source);

    expect(result.parseErrors).toEqual([]);
    expect(result.nodes.some((n) => n.kind === 'function' && n.name === 'View')).toBe(true);
  });
});
