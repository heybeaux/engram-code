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
var SearchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchService = void 0;
const common_1 = require("@nestjs/common");
const embeddings_service_1 = require("./embeddings.service");
const vectors_service_1 = require("./vectors.service");
let SearchService = SearchService_1 = class SearchService {
    embeddingsService;
    vectorsService;
    logger = new common_1.Logger(SearchService_1.name);
    highlightPatterns = [
        /without\s+sharing/gi,
        /with\s+sharing/gi,
        /Schema\.SObjectType/gi,
        /isAccessible\(\)/gi,
        /isCreateable\(\)/gi,
        /isUpdateable\(\)/gi,
        /isDeletable\(\)/gi,
        /stripInaccessible/gi,
        /CRUD/gi,
        /FLS/gi,
        /\binsert\b/gi,
        /\bupdate\b/gi,
        /\bdelete\b/gi,
        /\bupsert\b/gi,
        /\[SELECT\s+/gi,
        /Database\./gi,
        /async\s+/gi,
        /await\s+/gi,
        /@wire\(/gi,
        /@api\s+/gi,
        /LightningElement/gi,
    ];
    RRF_K = 60;
    constructor(embeddingsService, vectorsService) {
        this.embeddingsService = embeddingsService;
        this.vectorsService = vectorsService;
    }
    async search(searchQuery) {
        const startTime = Date.now();
        const { query, projectId, language, chunkType, limit = 10 } = searchQuery;
        this.logger.log(`Searching: "${query}" (project=${projectId || 'all'})`);
        const queryEmbedding = await this.embeddingsService.embed(query);
        const options = {
            projectId,
            language,
            chunkType,
            limit,
        };
        const vectorResults = await this.vectorsService.searchSimilar(queryEmbedding, options);
        const results = vectorResults.map((vr) => ({
            chunk: {
                id: vr.id,
                projectId: vr.projectId,
                filePath: vr.filePath,
                lineStart: vr.lineStart,
                lineEnd: vr.lineEnd,
                content: vr.content,
                language: vr.language,
                chunkType: vr.chunkType,
                name: vr.name,
                parentName: vr.parentName,
                dependencies: vr.dependencies,
            },
            score: this.vectorsService.distanceToScore(vr.distance),
            distance: vr.distance,
            highlights: this.extractHighlights(vr.content, query),
        }));
        const searchTimeMs = Date.now() - startTime;
        this.logger.log(`Found ${results.length} results in ${searchTimeMs}ms (top score: ${results[0]?.score.toFixed(3) || 'N/A'})`);
        return {
            query,
            results,
            totalFound: results.length,
            searchTimeMs,
        };
    }
    async searchEnsemble(searchQuery) {
        const startTime = Date.now();
        const { query, projectId, language, chunkType, limit = 10, models = ['bge-base', 'nomic'] } = searchQuery;
        this.logger.log(`Ensemble search: "${query}" with models [${models.join(', ')}]`);
        const queryEmbeddings = await this.embeddingsService.embedMultiModel(query, models);
        const modelResults = await this.vectorsService.searchEnsemble(queryEmbeddings, {
            projectId,
            language,
            chunkType,
            limit: Math.max(limit * 2, 20),
            models,
        });
        const fusedResults = this.applyRRFFusion(modelResults, limit);
        const perModelResults = {};
        for (const { modelId, results } of modelResults) {
            perModelResults[modelId] = results.slice(0, 5).map((vr) => ({
                chunk: this.vectorResultToChunk(vr),
                score: this.vectorsService.distanceToScore(vr.distance),
                distance: vr.distance,
                highlights: this.extractHighlights(vr.content, query),
            }));
        }
        const searchTimeMs = Date.now() - startTime;
        this.logger.log(`Ensemble search found ${fusedResults.length} results in ${searchTimeMs}ms (top fused score: ${fusedResults[0]?.fusedScore.toFixed(4) || 'N/A'})`);
        return {
            query,
            results: fusedResults,
            totalFound: fusedResults.length,
            searchTimeMs,
            fusionMethod: 'rrf',
            modelsUsed: models,
            perModelResults,
        };
    }
    applyRRFFusion(modelResults, limit) {
        const chunkScores = new Map();
        for (const { modelId, results } of modelResults) {
            results.forEach((result, rank) => {
                const chunkId = result.id;
                const rrfContribution = 1 / (this.RRF_K + rank + 1);
                if (chunkScores.has(chunkId)) {
                    const existing = chunkScores.get(chunkId);
                    existing.rrfScore += rrfContribution;
                    existing.modelRanks[modelId] = rank + 1;
                    existing.bestDistance = Math.min(existing.bestDistance, result.distance);
                }
                else {
                    chunkScores.set(chunkId, {
                        chunk: result,
                        rrfScore: rrfContribution,
                        modelRanks: { [modelId]: rank + 1 },
                        bestDistance: result.distance,
                    });
                }
            });
        }
        const sorted = Array.from(chunkScores.values())
            .sort((a, b) => b.rrfScore - a.rrfScore)
            .slice(0, limit);
        return sorted.map((item) => ({
            chunk: this.vectorResultToChunk(item.chunk),
            score: this.vectorsService.distanceToScore(item.bestDistance),
            distance: item.bestDistance,
            fusedScore: item.rrfScore,
            modelRanks: item.modelRanks,
            highlights: this.extractHighlights(item.chunk.content, ''),
        }));
    }
    vectorResultToChunk(vr) {
        return {
            id: vr.id,
            projectId: vr.projectId,
            filePath: vr.filePath,
            lineStart: vr.lineStart,
            lineEnd: vr.lineEnd,
            content: vr.content,
            language: vr.language,
            chunkType: vr.chunkType,
            name: vr.name,
            parentName: vr.parentName,
            dependencies: vr.dependencies,
        };
    }
    async findSimilar(chunkId, limit = 5) {
        const vectorResults = await this.vectorsService.findSimilarChunks(chunkId, limit);
        return vectorResults.map((vr) => ({
            chunk: this.vectorResultToChunk(vr),
            score: this.vectorsService.distanceToScore(vr.distance),
            distance: vr.distance,
            highlights: [],
        }));
    }
    async getAvailableModels(projectId) {
        const all = this.embeddingsService.getAvailableModels();
        const populated = await this.vectorsService.getPopulatedModels(projectId);
        return { all, populated };
    }
    extractHighlights(content, query) {
        const highlights = new Set();
        for (const pattern of this.highlightPatterns) {
            const matches = content.match(pattern);
            if (matches) {
                matches.forEach((m) => highlights.add(m.trim()));
            }
        }
        if (query) {
            const queryWords = query
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 3);
            for (const word of queryWords) {
                const regex = new RegExp(`\\b${this.escapeRegex(word)}\\w*\\b`, 'gi');
                const matches = content.match(regex);
                if (matches) {
                    matches.slice(0, 3).forEach((m) => highlights.add(m));
                }
            }
        }
        return Array.from(highlights).slice(0, 10);
    }
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    getExampleQueries() {
        return [
            'where is CRUD/FLS checked',
            'find classes using without sharing',
            'DML operations without security checks',
            'methods that insert or update records',
            'SOQL injection vulnerabilities',
            'authentication and authorization logic',
            'error handling patterns',
            'API integration methods',
            'trigger handlers',
            'batch job implementations',
            'wire service usage',
            'components with API properties',
            'event handling methods',
            'lightning element extensions',
            'utility functions',
            'test classes and methods',
            'data access layer',
            'service layer methods',
        ];
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = SearchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [embeddings_service_1.EmbeddingsService,
        vectors_service_1.VectorsService])
], SearchService);
//# sourceMappingURL=search.service.js.map