/**
 * Filesystem-backed cards repository (EC-28 Phase 2).
 *
 * Centralizes the on-disk read paths used by the v2 API controllers so the
 * map/search/subsystems endpoints don't each re-implement the conventions
 * defined by the markdown writer (EC-14). Once the Postgres `cards` table
 * is the source of truth, this is the single layer to swap.
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { cardFilePath, readCard } from '../../writers/markdown/writer';
import type { Card } from '../../writers/markdown/types';

@Injectable()
export class CardsFsService {
  private readonly logger = new Logger(CardsFsService.name);

  /**
   * Resolve the configured artifacts root. Matches the convention used by
   * `cards.controller.ts`: env override wins, then `<cwd>/.engram/artifacts`.
   */
  resolveArtifactsRoot(): string {
    const fromEnv = process.env.ENGRAM_ARTIFACTS_ROOT;
    if (fromEnv && fromEnv.trim() !== '') return fromEnv;
    return join(process.cwd(), '.engram', 'artifacts');
  }

  /** Resolve the on-disk path for a card by concept path. */
  cardFilePath(conceptPath: string): string {
    return cardFilePath(this.resolveArtifactsRoot(), conceptPath);
  }

  /**
   * Enumerate every card under `<root>/cards/`. Returns concept paths only —
   * callers can `readOne` for the bodies when needed.
   *
   * Empty/missing root is a legitimate "no cards yet" state and returns `[]`.
   */
  async listConceptPaths(): Promise<string[]> {
    const cardsDir = join(this.resolveArtifactsRoot(), 'cards');
    try {
      const paths = await walkMarkdown(cardsDir);
      paths.sort();
      return paths;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      this.logger.error(`Failed to list cards under ${cardsDir}`, err as Error);
      throw err;
    }
  }

  /**
   * Read one card by concept path. Returns `null` if the file does not exist
   * — callers decide between 404 and "skip" semantics.
   */
  async readOne(conceptPath: string): Promise<Card | null> {
    try {
      return await readCard(this.cardFilePath(conceptPath));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Read every card under the artifacts root. Convenient for in-memory
   * search/map operations on small repos. Cards that fail to parse are
   * logged and skipped rather than aborting the whole request.
   */
  async readAll(): Promise<Card[]> {
    const paths = await this.listConceptPaths();
    const out: Card[] = [];
    for (const conceptPath of paths) {
      try {
        const card = await readCard(this.cardFilePath(conceptPath));
        out.push(card);
      } catch (err) {
        this.logger.warn(
          `Skipping unreadable card ${conceptPath}: ${(err as Error).message}`,
        );
      }
    }
    return out;
  }

  /** Read every `<root>/subsystems/*.md` file as raw text. */
  async listSubsystemFiles(): Promise<Array<{ slug: string; raw: string }>> {
    const dir = join(this.resolveArtifactsRoot(), 'subsystems');
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: Array<{ slug: string; raw: string }> = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const slug = entry.name.slice(0, -3);
      const raw = await fs.readFile(join(dir, entry.name), 'utf8');
      out.push({ slug, raw });
    }
    out.sort((a, b) => a.slug.localeCompare(b.slug));
    return out;
  }
}

async function walkMarkdown(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rel = relative(rootDir, abs).split(sep).join('/');
        out.push(rel.slice(0, -3));
      }
    }
  }
  await walk(rootDir);
  return out;
}
