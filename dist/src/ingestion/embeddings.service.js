"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMBEDDING_MODELS = void 0;
exports.generateEmbeddings = generateEmbeddings;
exports.embedText = embedText;
exports.embedQueryMultiModel = embedQueryMultiModel;
exports.checkEmbeddingService = checkEmbeddingService;
exports.estimateTokens = estimateTokens;
exports.getEmbeddingConfig = getEmbeddingConfig;
exports.getModelInfo = getModelInfo;
exports.getModelColumnName = getModelColumnName;
const ENGRAM_EMBED_URL = process.env.ENGRAM_EMBED_URL || 'http://127.0.0.1:8080';
const DEFAULT_BATCH_SIZE = 32;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
exports.EMBEDDING_MODELS = {
    'bge-base': {
        name: 'bge-base-en-v1.5',
        dimensions: 768,
        maxTokens: 512,
        columnName: 'embedding_bge',
        description: 'Best for short methods, precise matching',
        batchSize: 32,
    },
    nomic: {
        name: 'nomic-embed-text-v1.5',
        dimensions: 768,
        maxTokens: 8192,
        columnName: 'embedding_nomic',
        description: 'Best for full classes, long methods (8K context)',
        batchSize: 4,
    },
    'gte-base': {
        name: 'gte-base-en-v1.5',
        dimensions: 768,
        maxTokens: 512,
        columnName: 'embedding_gte',
        description: 'Alternative semantic space',
        batchSize: 32,
    },
    minilm: {
        name: 'all-MiniLM-L6-v2',
        dimensions: 384,
        maxTokens: 256,
        columnName: 'embedding_minilm',
        description: 'Fast, lightweight',
        batchSize: 64,
    },
};
async function generateEmbeddings(chunks, options = {}) {
    const { baseUrl = ENGRAM_EMBED_URL, batchSize = DEFAULT_BATCH_SIZE, models = ['bge-base'], onProgress, } = options;
    const results = chunks.map((chunk) => ({
        ...chunk,
        embedding: [],
        embeddings: {},
    }));
    const texts = chunks.map((chunk) => chunk.embeddingText);
    const totalOperations = models.reduce((sum, modelId) => {
        const modelBatchSize = exports.EMBEDDING_MODELS[modelId].batchSize || batchSize;
        return sum + Math.ceil(chunks.length / modelBatchSize);
    }, 0);
    let completedOperations = 0;
    for (const modelId of models) {
        const model = exports.EMBEDDING_MODELS[modelId];
        const modelBatchSize = model.batchSize || batchSize;
        console.log(`Generating embeddings with ${model.name} (${model.dimensions}-dim)...`);
        const batches = batchArray(texts, modelBatchSize);
        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
            const batch = batches[batchIdx];
            const embeddings = await embedBatch(batch, baseUrl, model.name);
            const startIdx = batchIdx * modelBatchSize;
            for (let i = 0; i < embeddings.length; i++) {
                results[startIdx + i].embeddings[modelId] = embeddings[i];
                if (modelId === 'bge-base') {
                    results[startIdx + i].embedding = embeddings[i];
                }
            }
            completedOperations++;
            onProgress?.(completedOperations, totalOperations);
        }
    }
    for (const result of results) {
        if (result.embedding.length === 0 && models.length > 0) {
            result.embedding = result.embeddings[models[0]] || [];
        }
    }
    return results;
}
async function embedBatch(texts, baseUrl, model) {
    const url = `${baseUrl}/v1/embeddings`;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: texts,
                    model: model,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Embedding request failed: ${response.status} ${errorText}`);
            }
            const data = (await response.json());
            const sorted = [...data.data].sort((a, b) => a.index - b.index);
            return sorted.map((item) => item.embedding);
        }
        catch (error) {
            if (attempt === MAX_RETRIES) {
                throw error;
            }
            console.warn(`Embedding attempt ${attempt} failed for ${model}, retrying in ${RETRY_DELAY_MS}ms...`);
            await sleep(RETRY_DELAY_MS * attempt);
        }
    }
    throw new Error('Embedding request failed after all retries');
}
async function embedText(text, modelId = 'bge-base', baseUrl = ENGRAM_EMBED_URL) {
    const model = exports.EMBEDDING_MODELS[modelId];
    const results = await embedBatch([text], baseUrl, model.name);
    return results[0];
}
async function embedQueryMultiModel(text, models = ['bge-base'], baseUrl = ENGRAM_EMBED_URL) {
    const results = {};
    for (const modelId of models) {
        const model = exports.EMBEDDING_MODELS[modelId];
        const [embedding] = await embedBatch([text], baseUrl, model.name);
        results[modelId] = embedding;
    }
    return results;
}
async function checkEmbeddingService(baseUrl = ENGRAM_EMBED_URL) {
    try {
        const response = await fetch(`${baseUrl}/v1/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: 'test',
                model: exports.EMBEDDING_MODELS['bge-base'].name,
            }),
        });
        if (!response.ok) {
            return {
                available: false,
                error: `HTTP ${response.status}`,
            };
        }
        const data = (await response.json());
        return {
            available: true,
            models: Object.keys(exports.EMBEDDING_MODELS),
        };
    }
    catch (error) {
        return {
            available: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function batchArray(arr, batchSize) {
    const batches = [];
    for (let i = 0; i < arr.length; i += batchSize) {
        batches.push(arr.slice(i, i + batchSize));
    }
    return batches;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function getEmbeddingConfig() {
    return {
        url: ENGRAM_EMBED_URL,
        models: exports.EMBEDDING_MODELS,
        defaultModels: ['bge-base'],
    };
}
function getModelInfo(modelId) {
    return exports.EMBEDDING_MODELS[modelId];
}
function getModelColumnName(modelId) {
    return exports.EMBEDDING_MODELS[modelId].columnName;
}
//# sourceMappingURL=embeddings.service.js.map