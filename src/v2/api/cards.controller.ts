/**
 * v2 Cards API (EC-15 Phase 1 / EC-28 Phase 2).
 *
 * Read-only HTTP endpoints over the markdown card artifacts produced by the
 * synthesis/structure passes (EC-14 writer). Phase 1 was filesystem-only;
 * Phase 2 (EC-28) extends the per-card GET to return 404 when the requested
 * LoD has not been generated yet, and introduces the sibling controllers
 * for `/v1/map`, `/v1/search/concept`, and `/v1/subsystems`.
 *
 * Endpoints:
 *   - `GET /v1/cards` — list every card path under the artifacts root.
 *   - `GET /v1/cards/:path` — fetch one card at a requested LoD; 404 if the
 *     card file is missing OR if the requested LoD body has not been
 *     generated (i.e. the section is empty).
 *
 * The `:path` param is slash-delimited (`engram/ingestion/parsers/typescript`)
 * which means clients should URL-encode slashes (`%2F`). NestJS' wildcard
 * route below preserves the original path so callers can use either style.
 *
 * OpenAPI tag: `cards`.
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

import type { LoDContent } from '../writers/markdown/types';
import type {
  CardListResponseDto,
  CardResponseDto,
} from './dto';
import { CardsFsService } from './services/cards-fs.service';

/** Valid `?lod=` query values. Mirrors `LoDContent` keys. */
const VALID_LODS: readonly (keyof LoDContent)[] = [
  'index',
  'summary',
  'standard',
  'deep',
];

/** Default LoD if the caller omits `?lod=`. */
const DEFAULT_LOD: keyof LoDContent = 'summary';

@Controller('v1/cards')
export class CardsController {
  private readonly logger = new Logger(CardsController.name);

  constructor(private readonly cardsFs: CardsFsService) {}

  /**
   * `GET /v1/cards` — list every card discoverable on disk.
   *
   * Walks `<root>/cards/` and reports the concept path for each `.md` file.
   * Cheap O(n) scan; future revisions will back this with the `cards` table.
   */
  @Get()
  async list(): Promise<CardListResponseDto> {
    let conceptPaths: string[];
    try {
      conceptPaths = await this.cardsFs.listConceptPaths();
    } catch (err) {
      this.logger.error('Failed to enumerate cards', err as Error);
      throw new HttpException(
        'Failed to enumerate cards',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
   * (`engram/ingestion/parsers/typescript`) work transparently.
   *
   * Returns 404 when the card file is missing OR when the requested LoD
   * body has not been generated yet — empty LoD bodies indicate the
   * synthesizer skipped that tier for this concept, not a successful
   * "empty answer", so callers should know to fall back to a richer level.
   */
  @Get('*path')
  async get(
    @Param('path') rawPath: string | string[],
    @Query('lod') lodParam?: string,
  ): Promise<CardResponseDto> {
    const conceptPath = normalizeConceptPath(rawPath);
    if (conceptPath === '') {
      throw new HttpException(
        'Missing concept path',
        HttpStatus.BAD_REQUEST,
      );
    }

    const lod = validateLod(lodParam);

    let card;
    try {
      card = await this.cardsFs.readOne(conceptPath);
    } catch (err) {
      this.logger.error(`Failed to read card ${conceptPath}`, err as Error);
      throw new HttpException(
        'Failed to read card',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (card === null) {
      throw new HttpException(
        `Card not found: ${conceptPath}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const content = card.lod[lod] ?? '';
    if (content.trim() === '') {
      throw new HttpException(
        `Card "${conceptPath}" has no "${lod}" LoD generated yet`,
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      conceptPath: card.conceptPath,
      kind: card.kind,
      lod,
      content,
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
