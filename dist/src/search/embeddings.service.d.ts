import { ConfigService } from '@nestjs/config';
export declare const EMBEDDING_MODELS: {
    readonly 'bge-base': {
        readonly name: "bge-base-en-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 512;
        readonly columnName: "embedding_bge";
        readonly description: "Best for short methods, precise matching";
    };
    readonly nomic: {
        readonly name: "nomic-embed-text-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 8192;
        readonly columnName: "embedding_nomic";
        readonly description: "Best for full classes, long methods (8K context)";
    };
    readonly 'gte-base': {
        readonly name: "gte-base-en-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 512;
        readonly columnName: "embedding_gte";
        readonly description: "Alternative semantic space";
    };
    readonly minilm: {
        readonly name: "all-MiniLM-L6-v2";
        readonly dimensions: 384;
        readonly maxTokens: 256;
        readonly columnName: "embedding_minilm";
        readonly description: "Fast, lightweight";
    };
};
export type EmbeddingModelId = keyof typeof EMBEDDING_MODELS;
export declare class EmbeddingsService {
    private readonly configService;
    private readonly logger;
    private readonly baseUrl;
    constructor(configService: ConfigService);
    embed(text: string, modelId?: EmbeddingModelId): Promise<number[]>;
    embedMultiModel(text: string, models?: EmbeddingModelId[]): Promise<Record<EmbeddingModelId, number[]>>;
    embedBatch(texts: string[], modelId?: EmbeddingModelId): Promise<number[][]>;
    prepareChunkText(chunk: {
        chunkType: string;
        name: string;
        content: string;
        parentName?: string;
    }): string;
    healthCheck(): Promise<boolean>;
    getModelColumnName(modelId: EmbeddingModelId): string;
    getAvailableModels(): EmbeddingModelId[];
    getModelInfo(modelId: EmbeddingModelId): {
        readonly name: "bge-base-en-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 512;
        readonly columnName: "embedding_bge";
        readonly description: "Best for short methods, precise matching";
    } | {
        readonly name: "nomic-embed-text-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 8192;
        readonly columnName: "embedding_nomic";
        readonly description: "Best for full classes, long methods (8K context)";
    } | {
        readonly name: "gte-base-en-v1.5";
        readonly dimensions: 768;
        readonly maxTokens: 512;
        readonly columnName: "embedding_gte";
        readonly description: "Alternative semantic space";
    } | {
        readonly name: "all-MiniLM-L6-v2";
        readonly dimensions: 384;
        readonly maxTokens: 256;
        readonly columnName: "embedding_minilm";
        readonly description: "Fast, lightweight";
    };
}
