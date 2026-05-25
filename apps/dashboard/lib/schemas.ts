/**
 * Zod schemas mirroring `src/v2/api/dto/index.ts`.
 *
 * The API DTOs are pure TypeScript interfaces (no class-validator) and live
 * in the engram-code backend. We re-declare the wire contract here as zod
 * schemas so the dashboard can validate responses at runtime without
 * importing across the workspace boundary into NestJS code. Update both
 * sides together if the contract changes.
 */

import { z } from 'zod';

export const lodLevelSchema = z.enum(['index', 'summary', 'standard', 'deep']);
export type LodLevel = z.infer<typeof lodLevelSchema>;

export const cardKindSchema = z.enum([
  'repository',
  'subsystem',
  'module',
  'capability',
]);
export type CardKind = z.infer<typeof cardKindSchema>;

export const conceptPathSchema = z.string();
export type ConceptPath = z.infer<typeof conceptPathSchema>;

export const cardResponseSchema = z.object({
  conceptPath: conceptPathSchema,
  kind: cardKindSchema,
  lod: lodLevelSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
export type CardResponse = z.infer<typeof cardResponseSchema>;

export const cardListResponseSchema = z.object({
  cards: z.array(z.object({ conceptPath: conceptPathSchema })),
  count: z.number().int().nonnegative(),
});
export type CardListResponse = z.infer<typeof cardListResponseSchema>;

const baseMapNodeSchema = z.object({
  conceptPath: conceptPathSchema,
  level: cardKindSchema,
  summary: z.string(),
});

export type MapNode = z.infer<typeof baseMapNodeSchema> & {
  children: MapNode[];
};

export const mapNodeSchema: z.ZodType<MapNode> = baseMapNodeSchema.extend({
  children: z.lazy(() => z.array(mapNodeSchema)),
});

export const mapResponseSchema = z.object({
  root: conceptPathSchema.nullable(),
  depth: z.number().int().nonnegative(),
  nodes: z.array(mapNodeSchema),
});
export type MapResponse = z.infer<typeof mapResponseSchema>;

export const searchConceptRequestSchema = z.object({
  query: z.string(),
  level: cardKindSchema.optional(),
  lod: lodLevelSchema.optional(),
  limit: z.number().int().positive().optional(),
});
export type SearchConceptRequest = z.infer<typeof searchConceptRequestSchema>;

export const searchConceptHitSchema = z.object({
  conceptPath: conceptPathSchema,
  level: cardKindSchema,
  lod: lodLevelSchema,
  score: z.number(),
  snippet: z.string(),
});
export type SearchConceptHit = z.infer<typeof searchConceptHitSchema>;

export const searchConceptResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchConceptHitSchema),
  totalFound: z.number().int().nonnegative(),
  searchTimeMs: z.number().nonnegative(),
});
export type SearchConceptResponse = z.infer<typeof searchConceptResponseSchema>;

export const subsystemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
  description: z.string().optional(),
});
export type Subsystem = z.infer<typeof subsystemSchema>;

export const subsystemListResponseSchema = z.object({
  subsystems: z.array(subsystemSchema),
  count: z.number().int().nonnegative(),
});
export type SubsystemListResponse = z.infer<typeof subsystemListResponseSchema>;
