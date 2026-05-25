/**
 * Typed client for the engram-code v1 API.
 *
 * Wraps `fetch` and validates responses against the zod schemas in
 * `./schemas`. Reads the API base URL from `EC_API_URL` (or
 * `NEXT_PUBLIC_EC_API_URL` for client-side calls), defaulting to
 * `http://localhost:3000` to match the backend's `PORT=3000` convention.
 */

import {
  cardResponseSchema,
  mapResponseSchema,
  searchConceptResponseSchema,
  subsystemListResponseSchema,
  type CardKind,
  type CardResponse,
  type LodLevel,
  type MapResponse,
  type SearchConceptResponse,
  type SubsystemListResponse,
} from './schemas';

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface SearchConceptOptions {
  level?: CardKind;
  lod?: LodLevel;
  limit?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function resolveBaseUrl(explicit?: string): string {
  if (explicit && explicit !== '') return explicit;
  if (typeof process !== 'undefined') {
    const env = process.env.EC_API_URL ?? process.env.NEXT_PUBLIC_EC_API_URL;
    if (env && env !== '') return env;
  }
  return 'http://localhost:3000';
}

export class EngramCodeApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(opts.baseUrl).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async getCard(path: string, lod?: LodLevel): Promise<CardResponse> {
    const encoded = encodeConceptPath(path);
    const search = lod ? `?lod=${encodeURIComponent(lod)}` : '';
    const url = `${this.baseUrl}/v1/cards/${encoded}${search}`;
    return this.request(url, cardResponseSchema);
  }

  async getMap(root?: string, depth?: number): Promise<MapResponse> {
    const params = new URLSearchParams();
    if (root && root !== '') params.set('root', root);
    if (depth !== undefined) params.set('depth', String(depth));
    const qs = params.toString();
    const url = `${this.baseUrl}/v1/map${qs ? `?${qs}` : ''}`;
    return this.request(url, mapResponseSchema);
  }

  async searchConcept(
    query: string,
    opts: SearchConceptOptions = {},
  ): Promise<SearchConceptResponse> {
    const url = `${this.baseUrl}/v1/search/concept`;
    const body: Record<string, unknown> = { query };
    if (opts.level !== undefined) body.level = opts.level;
    if (opts.lod !== undefined) body.lod = opts.lod;
    if (opts.limit !== undefined) body.limit = opts.limit;
    return this.request(url, searchConceptResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async listSubsystems(): Promise<SubsystemListResponse> {
    const url = `${this.baseUrl}/v1/subsystems`;
    return this.request(url, subsystemListResponseSchema);
  }

  private async request<T>(
    url: string,
    schema: { parse: (input: unknown) => T },
    init?: RequestInit,
  ): Promise<T> {
    const res = await this.fetchImpl(url, init);
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new ApiError(res.status, url, text || res.statusText);
    }
    const json: unknown = await res.json();
    return schema.parse(json);
  }
}

/**
 * Encode a slash-delimited concept path so each segment is URL-safe but
 * slashes are preserved. The backend's `*path` wildcard handles either
 * encoded or raw slashes, but keeping slashes raw makes server logs more
 * readable.
 */
function encodeConceptPath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/** Convenience singleton for callers that don't need a custom instance. */
export const api = new EngramCodeApi();

export const getCard = (path: string, lod?: LodLevel) => api.getCard(path, lod);
export const getMap = (root?: string, depth?: number) => api.getMap(root, depth);
export const searchConcept = (query: string, opts?: SearchConceptOptions) =>
  api.searchConcept(query, opts);
export const listSubsystems = () => api.listSubsystems();
