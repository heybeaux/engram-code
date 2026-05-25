/**
 * v2 Cards API (EC-15).
 *
 * Read-only HTTP endpoints over the markdown card artifacts produced by the
 * synthesis/structure passes (EC-14 writer). Phase 1 is filesystem-only —
 * cards live on disk under `<artifactsRoot>/cards/<conceptPath>.md`. The
 * Postgres `cards` table is the eventual fast path, but Phase 2 work.
 *
 * Endpoints:
 *   - `GET /v1/cards` — list every card path under the artifacts root.
 *   - `GET /v1/cards/:path` — fetch one card at a requested LoD.
 *
 * The `:path` param is slash-delimited (`engram/ingestion/parsers/typescript`)
 * which means clients should URL-encode slashes (`%2F`). NestJS' wildcard
 * route below preserves the original path so callers can use either style.
 *
 * Spec: docs/specs/engram-code-v2.md §4.6 Query Layer.
 */

import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Query,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { cardFilePath, readCard } from '../writers/markdown/writer';
import type { Card, LoDContent } from '../writers/markdown/types';

/** Valid `?lod=` query values. Mirrors `LoDContent` keys. */
const VALID_LODS: readonly (keyof LoDContent)[] = [
  'index',
  'summary',
  'standard',
  'deep',
];

/** Default LoD if the caller omits `?lod=`. */
const DEFAULT_LOD: keyof LoDContent = 'summary';

/**
 * Response shape for `GET /v1/cards/:path`.
 *
 * Returns the requested LoD body plus enough metadata for the caller to
 * decide whether to fetch a richer level. `kind` and `conceptPath` are
 * always echoed so the caller doesn't need to parse the path itself.
 */
export interface CardResponse {
  conceptPath: string;
  kind: Card['kind'];
  lod: keyof LoDContent;
  content: string;
  metadata: Record<string, unknown>;
}

/** Response shape for `GET /v1/cards` (list). */
export interface CardListResponse {
  cards: Array<{ conceptPath: string }>;
  count: number;
}

/**
 * Resolve the on-disk artifacts root.
 *
 * Configurable via `ENGRAM_ARTIFACTS_ROOT` for tests and multi-repo setups;
 * defaults to `.engram/artifacts` under the process cwd to match the task
 * brief and keep the dev workflow zero-config.
 */
function resolveArtifactsRoot(): string {
  const fromEnv = process.env.ENGRAM_ARTIFACTS_ROOT;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return join(process.cwd(), '.engram', 'artifacts');
}

@Controller('v1/cards')
export class CardsController {
  private readonly logger = new Logger(CardsController.name);

  /**
   * `GET /v1/cards` — list every card discoverable on disk.
   *
   * Walks `<root>/cards/` and reports the concept path for each `.md` file.
   * Cheap O(n) scan; Phase 2 will back this with the `cards` table.
   */
  @Get()
  async list(): Promise<CardListResponse> {
    const root = resolveArtifactsRoot();
    const cardsDir = join(root, 'cards');

    let conceptPaths: string[];
    try {
      conceptPaths = await collectConceptPaths(cardsDir);
    } catch (err: unknown) {
      // Empty/missing artifacts root is a legitimate "no cards yet" state,
      // not a server error. Anything else (permission, IO) bubbles as 500.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { cards: [], count: 0 };
      }
      this.logger.error(`Failed to list cards under ${cardsDir}`, err as Error);
      throw new HttpException(
        'Failed to enumerate cards',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    conceptPaths.sort();
    return {
      cards: conceptPaths.map((conceptPath) => ({ conceptPath })),
      count: conceptPaths.length,
    };
  }

  /**
   * `GET /v1/cards/*` — fetch one card at the requested LoD.
   *
   * The path segment is a slash-delimited concept identifier. NestJS' `*`
   * wildcard captures the full remainder so paths with multiple segments
   * (`engram/ingestion/parsers/typescript`) Just Work.
   */
  @Get('*path')
  async get(
    @Param('path') rawPath: string | string[],
    @Query('lod') lodParam?: string,
  ): Promise<CardResponse> {
    const conceptPath = normalizeConceptPath(rawPath);
    if (conceptPath === '') {
      throw new HttpException(
        'Missing concept path',
        HttpStatus.BAD_REQUEST,
      );
    }

    const lod = validateLod(lodParam);
    const root = resolveArtifactsRoot();
    const filePath = cardFilePath(root, conceptPath);

    let card: Card;
    try {
      card = await readCard(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new HttpException(
          `Card not found: ${conceptPath}`,
          HttpStatus.NOT_FOUND,
        );
      }
      this.logger.error(`Failed to read card ${filePath}`, err as Error);
      throw new HttpException(
        'Failed to read card',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      conceptPath: card.conceptPath,
      kind: card.kind,
      lod,
      content: card.lod[lod] ?? '',
      metadata: card.metadata,
    };
  }
}

/**
 * Normalize the captured `*path` param into a slash-delimited concept path.
 *
 * Nest's wildcard binding can deliver either a string or an array of
 * segments depending on version; we accept both. Strips any trailing `.md`
 * so callers can pass the URL form returned by INDEX.md links verbatim.
 */
function normalizeConceptPath(raw: string | string[]): string {
  const joined = Array.isArray(raw) ? raw.join('/') : raw ?? '';
  const trimmed = joined.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed.endsWith('.md') ? trimmed.slice(0, -3) : trimmed;
}

/**
 * Validate the `?lod=` query parameter, defaulting to `summary`.
 *
 * Throws 400 for anything outside the four canonical LoD names so invalid
 * input surfaces immediately rather than silently returning the default.
 */
function validateLod(raw: string | undefined): keyof LoDContent {
  if (raw === undefined || raw === '') return DEFAULT_LOD;
  if ((VALID_LODS as readonly string[]).includes(raw)) {
    return raw as keyof LoDContent;
  }
  throw new HttpException(
    `Invalid lod "${raw}"; must be one of ${VALID_LODS.join('|')}`,
    HttpStatus.BAD_REQUEST,
  );
}

/**
 * Recursively walk `<root>/cards/` and return concept paths for every `.md`
 * file found, relative to the cards dir and POSIX-normalized.
 */
async function collectConceptPaths(cardsDir: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rel = relative(cardsDir, abs).split(sep).join('/');
        out.push(rel.slice(0, -3)); // strip .md
      }
    }
  }

  await walk(cardsDir);
  return out;
}
