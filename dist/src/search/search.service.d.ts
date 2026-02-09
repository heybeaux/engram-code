import { EmbeddingsService, EmbeddingModelId } from './embeddings.service';
import { VectorsService } from './vectors.service';
export interface SearchQuery {
    query: string;
    projectId?: string;
    language?: string;
    chunkType?: string;
    limit?: number;
}
export interface EnsembleSearchQuery extends SearchQuery {
    models?: EmbeddingModelId[];
}
export interface SearchResultChunk {
    id: string;
    projectId: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    content: string;
    language: string;
    chunkType: string;
    name: string;
    parentName: string | null;
    dependencies: string[];
}
export interface SearchResult {
    chunk: SearchResultChunk;
    score: number;
    distance: number;
    highlights?: string[];
}
export interface SearchResponse {
    query: string;
    results: SearchResult[];
    totalFound: number;
    searchTimeMs: number;
}
export interface EnsembleSearchResult extends SearchResult {
    fusedScore: number;
    modelRanks: Record<string, number>;
}
export interface EnsembleSearchResponse {
    query: string;
    results: EnsembleSearchResult[];
    totalFound: number;
    searchTimeMs: number;
    fusionMethod: 'rrf';
    modelsUsed: EmbeddingModelId[];
    perModelResults: Record<EmbeddingModelId, SearchResult[]>;
}
export declare class SearchService {
    private readonly embeddingsService;
    private readonly vectorsService;
    private readonly logger;
    private readonly highlightPatterns;
    private readonly RRF_K;
    constructor(embeddingsService: EmbeddingsService, vectorsService: VectorsService);
    search(searchQuery: SearchQuery): Promise<SearchResponse>;
    searchEnsemble(searchQuery: EnsembleSearchQuery): Promise<EnsembleSearchResponse>;
    private applyRRFFusion;
    private vectorResultToChunk;
    findSimilar(chunkId: string, limit?: number): Promise<SearchResult[]>;
    getAvailableModels(projectId?: string): Promise<{
        all: EmbeddingModelId[];
        populated: EmbeddingModelId[];
    }>;
    private extractHighlights;
    private escapeRegex;
    getExampleQueries(): string[];
}
