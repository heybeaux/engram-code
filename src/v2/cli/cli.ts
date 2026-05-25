/**
 * engram-code v2 CLI (EC-16).
 *
 * Two commands in Phase 1:
 *
 *   - `engram-code index <repo-path>`
 *     Runs Pass 1 (structure) over the repo and writes one module-level
 *     card per source file via the EC-14 markdown writer. Synthesis (EC-13,
 *     LLM-backed) is **stubbed** here — each card is populated with a
 *     deterministic placeholder body derived from the structure graph so
 *     the rest of the pipeline (writer, API, downstream consumers) has
 *     real artifacts to work against. Once EC-13 lands, replace
 *     `buildStubCards` with the real synthesizer.
 *
 *   - `engram-code cards <conceptPath> [--lod=summary]`
 *     Reads a card off disk and prints the requested LoD body to stdout.
 *
 * Arg parsing is intentionally hand-rolled: we don't want a new runtime
 * dependency just to handle two commands and one flag.
 */

import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { runStructurePass } from '../passes/structure/orchestrator';
import type { StructurePassResult } from '../passes/structure/orchestrator';
import { registerGoExtractor } from '../parsers/go.extractor';
import { registerPythonExtractor } from '../parsers/python.extractor';
import { registerTypeScriptExtractor } from '../parsers/typescript.extractor';
import type { StructureNode } from '../parsers/types';
import { cardFilePath, readCard, writeCard } from '../writers/markdown/writer';
import type { Card, LoDContent } from '../writers/markdown/types';
import { writeRepoIndex } from '../writers/markdown/index-writer';

/** Exit codes — kept distinct so shells / CI can branch on them. */
export const EXIT = {
  OK: 0,
  USAGE: 64,
  NOT_FOUND: 66,
  RUNTIME: 70,
} as const;

/** Minimal IO surface so the CLI is testable without spawning processes. */
export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

const DEFAULT_IO: CliIO = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

const VALID_LODS: readonly (keyof LoDContent)[] = [
  'index',
  'summary',
  'standard',
  'deep',
];

/**
 * Top-level entrypoint. Returns a numeric exit code rather than calling
 * `process.exit` directly so tests can assert on it.
 */
export async function run(argv: string[], io: CliIO = DEFAULT_IO): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    io.stdout(usage());
    return command ? EXIT.OK : EXIT.USAGE;
  }

  switch (command) {
    case 'index':
      return runIndex(rest, io);
    case 'cards':
      return runCards(rest, io);
    default:
      io.stderr(`engram-code: unknown command "${command}"\n${usage()}`);
      return EXIT.USAGE;
  }
}

function usage(): string {
  return [
    'engram-code — LoD card generator for codebases (v2 Phase 1)',
    '',
    'Usage:',
    '  engram-code index <repo-path> [--out=<dir>] [--repo-id=<id>]',
    '  engram-code cards <conceptPath> [--lod=summary] [--root=<dir>]',
    '',
    'Options:',
    '  --out=<dir>     Artifacts root for `index` (default: <repo>/.engram/artifacts)',
    '  --repo-id=<id>  Repo identifier stamped into card metadata (default: dir name)',
    '  --root=<dir>    Artifacts root for `cards` (default: $ENGRAM_ARTIFACTS_ROOT or ./.engram/artifacts)',
    '  --lod=<level>   One of index|summary|standard|deep (default: summary)',
    '',
  ].join('\n');
}

// ─── `engram-code index` ─────────────────────────────────────────────────

interface IndexArgs {
  repoPath: string;
  outDir?: string;
  repoId?: string;
}

async function runIndex(argv: string[], io: CliIO): Promise<number> {
  let parsed: IndexArgs;
  try {
    parsed = parseIndexArgs(argv);
  } catch (err) {
    io.stderr(`engram-code index: ${(err as Error).message}\n${usage()}`);
    return EXIT.USAGE;
  }

  const repoPath = resolve(parsed.repoPath);
  let stat;
  try {
    stat = await fs.stat(repoPath);
  } catch {
    io.stderr(`engram-code index: repo path not found: ${repoPath}\n`);
    return EXIT.NOT_FOUND;
  }
  if (!stat.isDirectory()) {
    io.stderr(`engram-code index: not a directory: ${repoPath}\n`);
    return EXIT.USAGE;
  }

  const repoId = parsed.repoId ?? defaultRepoId(repoPath);
  const outDir = parsed.outDir ?? join(repoPath, '.engram', 'artifacts');

  io.stdout(`engram-code: indexing ${repoPath}\n`);

  // The parser registry is process-global but extractors don't self-register
  // on import; do it lazily here so the CLI doesn't force tree-sitter native
  // bindings to load when only `engram-code cards` is invoked.
  ensureExtractorsRegistered();

  let result: StructurePassResult;
  try {
    result = await runStructurePass(repoPath, repoId);
  } catch (err) {
    io.stderr(`engram-code index: structure pass failed: ${(err as Error).message}\n`);
    return EXIT.RUNTIME;
  }

  io.stdout(
    `engram-code: walked ${result.filesWalked} files, parsed ${result.filesParsed}, ${result.nodes.length} nodes, ${result.edges.length} edges\n`,
  );
  if (result.fileErrors.length > 0) {
    io.stderr(
      `engram-code: ${result.fileErrors.length} file(s) had parse errors (continuing)\n`,
    );
  }

  // STUB: real synthesis is EC-13 (LLM-backed). For now we emit a
  // deterministic card per source file from the structure graph so the
  // rest of the pipeline (writer, API, INDEX.md) has real artifacts to
  // work with. Swap this out when EC-13 merges.
  const cards = buildStubCards(result, repoId);

  for (const card of cards) {
    await writeCard(outDir, card);
  }
  await writeRepoIndex(outDir, { name: repoId, cards });

  io.stdout(
    `engram-code: wrote ${cards.length} stub card(s) and INDEX.md to ${outDir}\n`,
  );
  return EXIT.OK;
}

function parseIndexArgs(argv: string[]): IndexArgs {
  let repoPath: string | undefined;
  let outDir: string | undefined;
  let repoId: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--out=')) outDir = arg.slice('--out='.length);
    else if (arg.startsWith('--repo-id='))
      repoId = arg.slice('--repo-id='.length);
    else if (arg.startsWith('--')) {
      throw new Error(`unknown flag "${arg}"`);
    } else if (!repoPath) repoPath = arg;
    else throw new Error(`unexpected positional argument "${arg}"`);
  }
  if (!repoPath) {
    throw new Error('missing required <repo-path>');
  }
  return { repoPath, outDir, repoId };
}

let extractorsRegistered = false;
function ensureExtractorsRegistered(): void {
  if (extractorsRegistered) return;
  registerTypeScriptExtractor();
  registerPythonExtractor();
  registerGoExtractor();
  extractorsRegistered = true;
}

function defaultRepoId(repoPath: string): string {
  const base = repoPath.replace(/\/+$/, '').split(/[\\/]/).pop();
  return base && base !== '' ? base : 'repo';
}

/**
 * Build placeholder cards from a structure-pass result.
 *
 * One module-level card per source file. The card's `conceptPath` is the
 * file path with the extension stripped (so `src/foo.ts` →
 * `src/foo`). LoD bodies are deterministic summaries of the structure
 * graph — enough to round-trip the writer and exercise the API end-to-end
 * without standing up an LLM.
 *
 * Replace with the real synthesizer once EC-13 lands.
 */
export function buildStubCards(
  result: StructurePassResult,
  repoId: string,
): Card[] {
  const byFile = new Map<string, StructureNode[]>();
  for (const node of result.nodes) {
    const arr = byFile.get(node.filePath) ?? [];
    arr.push(node);
    byFile.set(node.filePath, arr);
  }

  const cards: Card[] = [];
  for (const [filePath, nodes] of Array.from(byFile.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const conceptPath = toConceptPath(filePath);
    if (!conceptPath) continue;

    const symbolNames = nodes
      .filter((n) => n.kind !== 'import' && n.kind !== 'call')
      .map((n) => `${n.kind} ${n.parent ? `${n.parent}.` : ''}${n.name}`);

    const topLevel = symbolNames.slice(0, 5).join(', ');
    const indexLine = `${filePath} — ${nodes.length} structural node(s)`;
    const summary = topLevel
      ? `Stub card for \`${filePath}\`. Top-level symbols: ${topLevel}.`
      : `Stub card for \`${filePath}\`.`;
    const standard = renderStandard(filePath, symbolNames);
    const deep = renderDeep(filePath, nodes);

    cards.push({
      conceptPath,
      kind: 'module',
      lod: {
        index: indexLine,
        summary,
        standard,
        deep,
      },
      metadata: {
        generated_at: new Date().toISOString(),
        model: 'stub',
        repo_id: repoId,
        sources: [filePath],
      },
    });
  }
  return cards;
}

/**
 * Map a repo-relative file path to a writer-safe concept path.
 *
 * Strips the extension and rejects paths the writer would refuse (absolute
 * paths, `..` segments). Returns `null` for unusable inputs so the caller
 * can skip them without crashing the run.
 */
function toConceptPath(filePath: string): string | null {
  if (!filePath || filePath.startsWith('/') || filePath.includes('..')) {
    return null;
  }
  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = filePath.lastIndexOf('/');
  const stripped =
    lastDot > lastSlash && lastDot !== -1
      ? filePath.slice(0, lastDot)
      : filePath;
  return stripped;
}

function renderStandard(filePath: string, symbols: string[]): string {
  if (symbols.length === 0) {
    return `Structural placeholder for \`${filePath}\`. No top-level symbols extracted.`;
  }
  const lines = [
    `Structural placeholder for \`${filePath}\`.`,
    '',
    'Symbols:',
    ...symbols.map((s) => `- ${s}`),
  ];
  return lines.join('\n');
}

function renderDeep(filePath: string, nodes: StructureNode[]): string {
  if (nodes.length === 0) return `No structural data for \`${filePath}\`.`;
  const lines = [
    `Deep placeholder for \`${filePath}\`. ${nodes.length} structural node(s).`,
    '',
    'Nodes:',
    ...nodes.map(
      (n) =>
        `- ${n.kind} \`${n.parent ? `${n.parent}.` : ''}${n.name}\` @ L${n.startLine}-${n.endLine}`,
    ),
  ];
  return lines.join('\n');
}

// ─── `engram-code cards` ─────────────────────────────────────────────────

interface CardsArgs {
  conceptPath: string;
  lod: keyof LoDContent;
  root?: string;
}

async function runCards(argv: string[], io: CliIO): Promise<number> {
  let parsed: CardsArgs;
  try {
    parsed = parseCardsArgs(argv);
  } catch (err) {
    io.stderr(`engram-code cards: ${(err as Error).message}\n${usage()}`);
    return EXIT.USAGE;
  }

  const root = parsed.root ?? defaultCardsRoot();
  const filePath = cardFilePath(root, parsed.conceptPath);

  let card: Card;
  try {
    card = await readCard(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      io.stderr(`engram-code cards: not found: ${filePath}\n`);
      return EXIT.NOT_FOUND;
    }
    io.stderr(`engram-code cards: ${(err as Error).message}\n`);
    return EXIT.RUNTIME;
  }

  const body = card.lod[parsed.lod] ?? '';
  io.stdout(body.endsWith('\n') ? body : body + '\n');
  return EXIT.OK;
}

function parseCardsArgs(argv: string[]): CardsArgs {
  let conceptPath: string | undefined;
  let lod: keyof LoDContent = 'summary';
  let root: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--lod=')) {
      const raw = arg.slice('--lod='.length);
      if (!(VALID_LODS as readonly string[]).includes(raw)) {
        throw new Error(
          `invalid --lod=${raw}; must be one of ${VALID_LODS.join('|')}`,
        );
      }
      lod = raw as keyof LoDContent;
    } else if (arg.startsWith('--root=')) {
      root = arg.slice('--root='.length);
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag "${arg}"`);
    } else if (!conceptPath) {
      conceptPath = arg;
    } else {
      throw new Error(`unexpected positional argument "${arg}"`);
    }
  }
  if (!conceptPath) throw new Error('missing required <conceptPath>');
  return { conceptPath, lod, root };
}

function defaultCardsRoot(): string {
  const fromEnv = process.env.ENGRAM_ARTIFACTS_ROOT;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return join(process.cwd(), '.engram', 'artifacts');
}

// Re-export for the bin shim and tests.
export { cardFilePath, readCard, writeCard };
export type { Card };

// Resolve absolute-path helper used by tests that build expected paths.
export function _absolute(p: string): string {
  return isAbsolute(p) ? p : resolve(p);
}

// `dirname` is re-exported so consumers can derive companion paths without
// pulling in `node:path` themselves.
export { dirname };
