import { PrismaService } from '../prisma/prisma.service';
import { ChunkWithEmbedding, ChunkWithMultiEmbedding } from './types';
export interface StoreResult {
    chunksStored: number;
    chunksDeleted: number;
    errors: string[];
}
export declare class IngestionStoreService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    storeChunks(projectId: string, chunks: ChunkWithMultiEmbedding[] | ChunkWithEmbedding[], options?: {
        clearExisting?: boolean;
    }): Promise<StoreResult>;
    updateProjectTimestamp(projectId: string): Promise<void>;
    getExistingChecksums(projectId: string): Promise<Map<string, string>>;
    getEmbeddingStats(projectId: string): Promise<Record<string, number>>;
}
