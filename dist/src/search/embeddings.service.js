"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmbeddingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingsService = exports.EMBEDDING_MODELS = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
exports.EMBEDDING_MODELS = {
    'bge-base': {
        name: 'bge-base-en-v1.5',
        dimensions: 768,
        maxTokens: 512,
        columnName: 'embedding_bge',
        description: 'Best for short methods, precise matching',
    },
    nomic: {
        name: 'nomic-embed-text-v1.5',
        dimensions: 768,
        maxTokens: 8192,
        columnName: 'embedding_nomic',
        description: 'Best for full classes, long methods (8K context)',
    },
    'gte-base': {
        name: 'gte-base-en-v1.5',
        dimensions: 768,
        maxTokens: 512,
        columnName: 'embedding_gte',
        description: 'Alternative semantic space',
    },
    minilm: {
        name: 'all-MiniLM-L6-v2',
        dimensions: 384,
        maxTokens: 256,
        columnName: 'embedding_minilm',
        description: 'Fast, lightweight',
    },
};
let EmbeddingsService = EmbeddingsService_1 = class EmbeddingsService {
    configService;
    logger = new common_1.Logger(EmbeddingsService_1.name);
    baseUrl;
    constructor(configService) {
        this.configService = configService;
        this.baseUrl = this.configService.get('ENGRAM_EMBED_URL', 'http://127.0.0.1:8080');
    }
    async embed(text, modelId = 'bge-base') {
        const embeddings = await this.embedBatch([text], modelId);
        return embeddings[0];
    }
    async embedMultiModel(text, models = ['bge-base', 'nomic']) {
        const results = {};
        const promises = models.map(async (modelId) => {
            const embedding = await this.embed(text, modelId);
            return { modelId, embedding };
        });
        const resolved = await Promise.all(promises);
        for (const { modelId, embedding } of resolved) {
            results[modelId] = embedding;
        }
        return results;
    }
    async embedBatch(texts, modelId = 'bge-base') {
        if (texts.length === 0) {
            return [];
        }
        const model = exports.EMBEDDING_MODELS[modelId];
        const url = `${this.baseUrl}/v1/embeddings`;
        this.logger.debug(`Generating ${texts.length} embeddings via ${model.name}`);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: texts,
                    model: model.name,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`engram-embed error: ${response.status} ${errorText}`);
                throw new common_1.HttpException(`Embedding service error: ${response.status}`, common_1.HttpStatus.SERVICE_UNAVAILABLE);
            }
            const data = await response.json();
            const sorted = data.data.sort((a, b) => a.index - b.index);
            const embeddings = sorted.map((d) => d.embedding);
            this.logger.debug(`Generated ${embeddings.length} embeddings with ${model.name} (${data.usage.total_tokens} tokens)`);
            return embeddings;
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            this.logger.error(`Failed to connect to engram-embed for model ${model.name}`, error);
            throw new common_1.HttpException('Embedding service unavailable. Is engram-embed running?', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
    prepareChunkText(chunk) {
        const parent = chunk.parentName ? ` in ${chunk.parentName}` : '';
        return `${chunk.chunkType} ${chunk.name}${parent}: ${chunk.content}`;
    }
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    getModelColumnName(modelId) {
        return exports.EMBEDDING_MODELS[modelId].columnName;
    }
    getAvailableModels() {
        return Object.keys(exports.EMBEDDING_MODELS);
    }
    getModelInfo(modelId) {
        return exports.EMBEDDING_MODELS[modelId];
    }
};
exports.EmbeddingsService = EmbeddingsService;
exports.EmbeddingsService = EmbeddingsService = EmbeddingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmbeddingsService);
//# sourceMappingURL=embeddings.service.js.map