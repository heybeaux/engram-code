import { SearchService } from './search.service';
import { EmbeddingModelId } from './embeddings.service';
export declare class SearchRequestDto {
    query: string;
    projectId?: string;
    language?: string;
    chunkType?: string;
    limit?: number;
}
export declare class EnsembleSearchRequestDto extends SearchRequestDto {
    models?: EmbeddingModelId[];
}
export declare class SearchResultDto {
    chunk: {
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
    };
    score: number;
    highlights?: string[];
}
export declare class EnsembleSearchResultDto extends SearchResultDto {
    fusedScore: number;
    modelRanks: Record<string, number>;
}
export declare class SearchResponseDto {
    query: string;
    results: SearchResultDto[];
    totalFound: number;
    searchTimeMs: number;
}
export declare class EnsembleSearchResponseDto {
    query: string;
    results: EnsembleSearchResultDto[];
    totalFound: number;
    searchTimeMs: number;
    fusionMethod: 'rrf';
    modelsUsed: EmbeddingModelId[];
    perModelResults: Record<EmbeddingModelId, SearchResultDto[]>;
}
export declare class SearchController {
    private readonly searchService;
    private readonly logger;
    constructor(searchService: SearchService);
    search(dto: SearchRequestDto): Promise<SearchResponseDto>;
    searchEnsemble(dto: EnsembleSearchRequestDto): Promise<EnsembleSearchResponseDto>;
    findSimilar(chunkId: string, limit?: string): Promise<{
        results: SearchResultDto[];
    }>;
    getModels(projectId?: string): Promise<{
        all: EmbeddingModelId[];
        populated: EmbeddingModelId[];
    }>;
    getExamples(): {
        queries: string[];
    };
    health(): Promise<{
        status: string;
        timestamp: string;
    }>;
}
