import { ProcessedChunk } from './types';
export declare const EMBEDDING_MODELS: {
    readonly 'bge-base': {
        readonly name: "bge-base-en-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 512;
        readonly columnName: "embedding_bge";
        readonly description: "Best for short methods, precise matching";
        readonly batchSize: 32;
    };
    readonly nomic: {
        readonly name: "nomic-embed-text-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 8192;
        readonly columnName: "embedding_nomic";
        readonly description: "Best for full classes, long methods (8K context)";
        readonly batchSize: 4;
    };
    readonly 'gte-base': {
        readonly name: "gte-base-en-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 512;
        readonly columnName: "embedding_gte";
        readonly description: "Alternative semantic space";
        readonly batchSize: 32;
    };
    readonly minilm: {
        readonly name: "all-MiniLM-L6-v2";
        readonly dimensions: 384;
        readonly maxTokens: 256;
        readonly columnName: "embedding_minilm";
        readonly description: "Fast, lightweight";
        readonly batchSize: 64;
    };
};
export type EmbeddingModelId = keyof typeof EMBEDDING_MODELS;
export interface EmbeddingsOptions {
    baseUrl?: string;
    batchSize?: number;
    models?: EmbeddingModelId[];
    onProgress?: (completed: number, total: number) => void;
}
export interface ChunkWithMultiEmbedding extends ProcessedChunk {
    embedding: number[];
    embeddings: Record<EmbeddingModelId, number[]>;
}
export declare function generateEmbeddings(chunks: ProcessedChunk[], options?: EmbeddingsOptions): Promise<ChunkWithMultiEmbedding[]>;
export declare function embedText(text: string, modelId?: EmbeddingModelId, baseUrl?: string): Promise<number[]>;
export declare function embedQueryMultiModel(text: string, models?: EmbeddingModelId[], baseUrl?: string): Promise<Record<EmbeddingModelId, number[]>>;
export declare function checkEmbeddingService(baseUrl?: string): Promise<{
    available: boolean;
    models?: string[];
    error?: string;
}>;
export declare function estimateTokens(text: string): number;
export declare function getEmbeddingConfig(): {
    url: string;
    models: {
        readonly 'bge-base': {
            readonly name: "bge-base-en-v1.5";
            readonly dimensions: 768;
            readonly maxTokens: 512;
            readonly columnName: "embedding_bge";
            readonly description: "Best for short methods, precise matching";
            readonly batchSize: 32;
        };
        readonly nomic: {
            readonly name: "nomic-embed-text-v1.5";
            readonly dimensions: 768;
            readonly maxTokens: 8192;
            readonly columnName: "embedding_nomic";
            readonly description: "Best for full classes, long methods (8K context)";
            readonly batchSize: 4;
        };
        readonly 'gte-base': {
            readonly name: "gte-base-en-v1.5";
            readonly dimensions: 768;
            readonly maxTokens: 512;
            readonly columnName: "embedding_gte";
            readonly description: "Alternative semantic space";
            readonly batchSize: 32;
        };
        readonly minilm: {
            readonly name: "all-MiniLM-L6-v2";
            readonly dimensions: 384;
            readonly maxTokens: 256;
            readonly columnName: "embedding_minilm";
            readonly description: "Fast, lightweight";
            readonly batchSize: 64;
        };
    };
    defaultModels: string[];
};
export declare function getModelInfo(modelId: EmbeddingModelId): {
    readonly name: "bge-base-en-v1.5";
    readonly dimensions: 768;
    readonly maxTokens: 512;
    readonly columnName: "embedding_bge";
    readonly description: "Best for short methods, precise matching";
    readonly batchSize: 32;
} | {
    readonly name: "nomic-embed-text-v1.5";
    readonly dimensions: 768;
    readonly maxTokens: 8192;
    readonly columnName: "embedding_nomic";
    readonly description: "Best for full classes, long methods (8K context)";
    readonly batchSize: 4;
} | {
    readonly name: "gte-base-en-v1.5";
    readonly dimensions: 768;
    readonly maxTokens: 512;
    readonly columnName: "embedding_gte";
    readonly description: "Alternative semantic space";
    readonly batchSize: 32;
} | {
    readonly name: "all-MiniLM-L6-v2";
    readonly dimensions: 384;
    readonly maxTokens: 256;
    readonly columnName: "embedding_minilm";
    readonly description: "Fast, lightweight";
    readonly batchSize: 64;
};
export declare function getModelColumnName(modelId: EmbeddingModelId): string;
