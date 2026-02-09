import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingModelId } from './embeddings.service';
export interface VectorSearchResult {
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
    checksum: string;
    createdAt: Date;
    distance: number;
}
export interface VectorSearchOptions {
    projectId?: string;
    language?: string;
    chunkType?: string;
    limit?: number;
}
export interface EnsembleSearchOptions extends VectorSearchOptions {
    models?: EmbeddingModelId[];
}
export interface ModelSearchResult {
    modelId: EmbeddingModelId;
    results: VectorSearchResult[];
}
export declare class VectorsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    searchSimilar(queryVector: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
    searchByModel(queryVector: number[], modelId: EmbeddingModelId, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
    searchEnsemble(queryVectors: Record<EmbeddingModelId, number[]>, options?: EnsembleSearchOptions): Promise<ModelSearchResult[]>;
    searchByProject(queryVector: number[], projectId: string, limit?: number): Promise<VectorSearchResult[]>;
    searchGlobal(queryVector: number[], limit?: number): Promise<VectorSearchResult[]>;
    findSimilarChunks(chunkId: string, limit?: number, excludeSameFile?: boolean): Promise<VectorSearchResult[]>;
    distanceToScore(distance: number): number;
    getPopulatedModels(projectId?: string): Promise<EmbeddingModelId[]>;
}
