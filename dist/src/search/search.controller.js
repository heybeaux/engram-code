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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SearchController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchController = exports.EnsembleSearchResponseDto = exports.SearchResponseDto = exports.EnsembleSearchResultDto = exports.SearchResultDto = exports.EnsembleSearchRequestDto = exports.SearchRequestDto = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const search_service_1 = require("./search.service");
class SearchRequestDto {
    query;
    projectId;
    language;
    chunkType;
    limit;
}
exports.SearchRequestDto = SearchRequestDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchRequestDto.prototype, "query", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SearchRequestDto.prototype, "projectId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchRequestDto.prototype, "language", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SearchRequestDto.prototype, "chunkType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SearchRequestDto.prototype, "limit", void 0);
class EnsembleSearchRequestDto extends SearchRequestDto {
    models;
}
exports.EnsembleSearchRequestDto = EnsembleSearchRequestDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], EnsembleSearchRequestDto.prototype, "models", void 0);
class SearchResultDto {
    chunk;
    score;
    highlights;
}
exports.SearchResultDto = SearchResultDto;
class EnsembleSearchResultDto extends SearchResultDto {
    fusedScore;
    modelRanks;
}
exports.EnsembleSearchResultDto = EnsembleSearchResultDto;
class SearchResponseDto {
    query;
    results;
    totalFound;
    searchTimeMs;
}
exports.SearchResponseDto = SearchResponseDto;
class EnsembleSearchResponseDto {
    query;
    results;
    totalFound;
    searchTimeMs;
    fusionMethod;
    modelsUsed;
    perModelResults;
}
exports.EnsembleSearchResponseDto = EnsembleSearchResponseDto;
let SearchController = SearchController_1 = class SearchController {
    searchService;
    logger = new common_1.Logger(SearchController_1.name);
    constructor(searchService) {
        this.searchService = searchService;
    }
    async search(dto) {
        this.logger.log(`Search request: "${dto.query}"`);
        const searchQuery = {
            query: dto.query,
            projectId: dto.projectId,
            language: dto.language?.toLowerCase(),
            chunkType: dto.chunkType?.toLowerCase(),
            limit: dto.limit ?? 10,
        };
        const response = await this.searchService.search(searchQuery);
        return {
            query: response.query,
            results: response.results.map((r) => ({
                chunk: r.chunk,
                score: r.score,
                highlights: r.highlights,
            })),
            totalFound: response.totalFound,
            searchTimeMs: response.searchTimeMs,
        };
    }
    async searchEnsemble(dto) {
        this.logger.log(`Ensemble search request: "${dto.query}" with models [${dto.models?.join(', ') || 'default'}]`);
        const searchQuery = {
            query: dto.query,
            projectId: dto.projectId,
            language: dto.language?.toLowerCase(),
            chunkType: dto.chunkType?.toLowerCase(),
            limit: dto.limit ?? 10,
            models: dto.models,
        };
        const response = await this.searchService.searchEnsemble(searchQuery);
        return {
            query: response.query,
            results: response.results.map((r) => ({
                chunk: r.chunk,
                score: r.score,
                fusedScore: r.fusedScore,
                modelRanks: r.modelRanks,
                highlights: r.highlights,
            })),
            totalFound: response.totalFound,
            searchTimeMs: response.searchTimeMs,
            fusionMethod: response.fusionMethod,
            modelsUsed: response.modelsUsed,
            perModelResults: response.perModelResults,
        };
    }
    async findSimilar(chunkId, limit) {
        const parsedLimit = limit ? parseInt(limit, 10) : 5;
        const results = await this.searchService.findSimilar(chunkId, parsedLimit);
        return {
            results: results.map((r) => ({
                chunk: r.chunk,
                score: r.score,
                highlights: r.highlights,
            })),
        };
    }
    async getModels(projectId) {
        return this.searchService.getAvailableModels(projectId);
    }
    getExamples() {
        return {
            queries: this.searchService.getExampleQueries(),
        };
    }
    async health() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }
};
exports.SearchController = SearchController;
__decorate([
    (0, common_1.Post)('search'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SearchRequestDto]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "search", null);
__decorate([
    (0, common_1.Post)('search/ensemble'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [EnsembleSearchRequestDto]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "searchEnsemble", null);
__decorate([
    (0, common_1.Get)('search/similar/:chunkId'),
    __param(0, (0, common_1.Param)('chunkId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "findSimilar", null);
__decorate([
    (0, common_1.Get)('search/models'),
    __param(0, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "getModels", null);
__decorate([
    (0, common_1.Get)('search/examples'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], SearchController.prototype, "getExamples", null);
__decorate([
    (0, common_1.Get)('search/health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "health", null);
exports.SearchController = SearchController = SearchController_1 = __decorate([
    (0, common_1.Controller)('v1'),
    __metadata("design:paramtypes", [search_service_1.SearchService])
], SearchController);
//# sourceMappingURL=search.controller.js.map