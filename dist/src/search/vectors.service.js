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
var VectorsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const embeddings_service_1 = require("./embeddings.service");
let VectorsService = VectorsService_1 = class VectorsService {
    prisma;
    logger = new common_1.Logger(VectorsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async searchSimilar(queryVector, options = {}) {
        return this.searchByModel(queryVector, 'bge-base', options);
    }
    async searchByModel(queryVector, modelId, options = {}) {
        const { projectId, language, chunkType, limit = 10 } = options;
        const columnName = embeddings_service_1.EMBEDDING_MODELS[modelId].columnName;
        const conditions = [`${columnName} IS NOT NULL`];
        const params = [];
        let paramIndex = 1;
        const vectorString = `[${queryVector.join(',')}]`;
        params.push(vectorString);
        paramIndex++;
        if (projectId) {
            conditions.push(`"projectId" = $${paramIndex}`);
            params.push(projectId);
            paramIndex++;
        }
        if (language) {
            conditions.push(`language = $${paramIndex}`);
            params.push(language);
            paramIndex++;
        }
        if (chunkType) {
            conditions.push(`"chunkType" = $${paramIndex}`);
            params.push(chunkType);
            paramIndex++;
        }
        params.push(limit);
        const limitParam = `$${paramIndex}`;
        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        const query = `
      SELECT 
        id,
        "projectId",
        "filePath",
        "lineStart",
        "lineEnd",
        content,
        language,
        "chunkType",
        name,
        "parentName",
        dependencies,
        checksum,
        "createdAt",
        ${columnName} <=> $1::vector AS distance
      FROM code_chunks
      ${whereClause}
      ORDER BY distance ASC
      LIMIT ${limitParam};
    `;
        this.logger.debug(`Executing vector search on ${columnName} with ${params.length} params`);
        try {
            const results = await this.prisma.$queryRawUnsafe(query, ...params);
            return results;
        }
        catch (error) {
            this.logger.error(`Vector search failed on ${columnName}`, error);
            throw error;
        }
    }
    async searchEnsemble(queryVectors, options = {}) {
        const models = options.models || Object.keys(queryVectors);
        const results = [];
        const promises = models.map(async (modelId) => {
            const vector = queryVectors[modelId];
            if (!vector) {
                this.logger.warn(`No query vector provided for model ${modelId}`);
                return { modelId, results: [] };
            }
            try {
                const modelResults = await this.searchByModel(vector, modelId, {
                    ...options,
                    limit: options.limit || 20,
                });
                return { modelId, results: modelResults };
            }
            catch (error) {
                this.logger.error(`Ensemble search failed for model ${modelId}`, error);
                return { modelId, results: [] };
            }
        });
        const resolved = await Promise.all(promises);
        return resolved;
    }
    async searchByProject(queryVector, projectId, limit = 10) {
        const vectorString = `[${queryVector.join(',')}]`;
        const results = await this.prisma.$queryRaw `
      SELECT 
        id,
        "projectId",
        "filePath",
        "lineStart",
        "lineEnd",
        content,
        language,
        "chunkType",
        name,
        "parentName",
        dependencies,
        checksum,
        "createdAt",
        embedding <=> ${vectorString}::vector AS distance
      FROM code_chunks
      WHERE "projectId" = ${projectId}
      ORDER BY distance ASC
      LIMIT ${limit};
    `;
        return results;
    }
    async searchGlobal(queryVector, limit = 10) {
        const vectorString = `[${queryVector.join(',')}]`;
        const results = await this.prisma.$queryRaw `
      SELECT 
        id,
        "projectId",
        "filePath",
        "lineStart",
        "lineEnd",
        content,
        language,
        "chunkType",
        name,
        "parentName",
        dependencies,
        checksum,
        "createdAt",
        embedding <=> ${vectorString}::vector AS distance
      FROM code_chunks
      ORDER BY distance ASC
      LIMIT ${limit};
    `;
        return results;
    }
    async findSimilarChunks(chunkId, limit = 5, excludeSameFile = true) {
        const excludeClause = excludeSameFile
            ? `AND c2."filePath" != c1."filePath"`
            : '';
        const results = await this.prisma.$queryRaw `
      SELECT 
        c2.id,
        c2."projectId",
        c2."filePath",
        c2."lineStart",
        c2."lineEnd",
        c2.content,
        c2.language,
        c2."chunkType",
        c2.name,
        c2."parentName",
        c2.dependencies,
        c2.checksum,
        c2."createdAt",
        c1.embedding <=> c2.embedding AS distance
      FROM code_chunks c1
      CROSS JOIN code_chunks c2
      WHERE c1.id = ${chunkId}
        AND c2.id != ${chunkId}
        ${client_1.Prisma.raw(excludeClause)}
      ORDER BY distance ASC
      LIMIT ${limit};
    `;
        return results;
    }
    distanceToScore(distance) {
        return Math.max(0, Math.min(1, 1 - distance));
    }
    async getPopulatedModels(projectId) {
        const whereClause = projectId ? `WHERE "projectId" = '${projectId}'::uuid` : '';
        const result = await this.prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) FILTER (WHERE embedding_bge IS NOT NULL) > 0 as has_bge,
        COUNT(*) FILTER (WHERE embedding_nomic IS NOT NULL) > 0 as has_nomic,
        COUNT(*) FILTER (WHERE embedding_gte IS NOT NULL) > 0 as has_gte,
        COUNT(*) FILTER (WHERE embedding_minilm IS NOT NULL) > 0 as has_minilm
      FROM code_chunks
      ${whereClause}
    `);
        const populated = [];
        if (result[0]?.has_bge)
            populated.push('bge-base');
        if (result[0]?.has_nomic)
            populated.push('nomic');
        if (result[0]?.has_gte)
            populated.push('gte-base');
        if (result[0]?.has_minilm)
            populated.push('minilm');
        return populated;
    }
};
exports.VectorsService = VectorsService;
exports.VectorsService = VectorsService = VectorsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], VectorsService);
//# sourceMappingURL=vectors.service.js.map