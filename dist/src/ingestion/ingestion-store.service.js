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
var IngestionStoreService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionStoreService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const crypto_1 = require("crypto");
function isValidEmbedding(embedding) {
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        return false;
    }
    return embedding.slice(0, 5).every(v => typeof v === 'number' && !isNaN(v));
}
let IngestionStoreService = IngestionStoreService_1 = class IngestionStoreService {
    prisma;
    logger = new common_1.Logger(IngestionStoreService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async storeChunks(projectId, chunks, options) {
        const errors = [];
        let chunksStored = 0;
        let chunksDeleted = 0;
        if (options?.clearExisting) {
            const deleted = await this.prisma.codeChunk.deleteMany({
                where: { projectId },
            });
            chunksDeleted = deleted.count;
            this.logger.log(`Cleared ${chunksDeleted} existing chunks for project ${projectId}`);
        }
        const BATCH_SIZE = 50;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            for (const chunk of batch) {
                try {
                    const id = (0, crypto_1.randomUUID)();
                    const primaryVectorString = isValidEmbedding(chunk.embedding)
                        ? `[${chunk.embedding.join(',')}]`
                        : null;
                    const embeddings = 'embeddings' in chunk
                        ? chunk.embeddings
                        : null;
                    const bgeEmb = embeddings?.['bge-base'];
                    const bgeVector = isValidEmbedding(bgeEmb) ? `[${bgeEmb.join(',')}]` : null;
                    const nomicEmb = embeddings?.['nomic'];
                    const nomicVector = isValidEmbedding(nomicEmb) ? `[${nomicEmb.join(',')}]` : null;
                    const gteEmb = embeddings?.['gte-base'];
                    const gteVector = isValidEmbedding(gteEmb) ? `[${gteEmb.join(',')}]` : null;
                    const minilmEmb = embeddings?.['minilm'];
                    const minilmVector = isValidEmbedding(minilmEmb) ? `[${minilmEmb.join(',')}]` : null;
                    if (!primaryVectorString && !bgeVector) {
                        errors.push(`Skipping chunk ${chunk.name || 'unnamed'} in ${chunk.filePath}: no valid embedding`);
                        continue;
                    }
                    const sql = `
            INSERT INTO code_chunks (
              id, "projectId", "filePath", "lineStart", "lineEnd",
              content, language, "chunkType", name, "parentName",
              dependencies, embedding, embedding_bge, embedding_nomic,
              embedding_gte, embedding_minilm, "createdAt", checksum
            ) VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              ${primaryVectorString ? `'${primaryVectorString}'::vector` : 'NULL'},
              ${bgeVector ? `'${bgeVector}'::vector` : 'NULL'},
              ${nomicVector ? `'${nomicVector}'::vector` : 'NULL'},
              ${gteVector ? `'${gteVector}'::vector` : 'NULL'},
              ${minilmVector ? `'${minilmVector}'::vector` : 'NULL'},
              NOW(),
              $12
            )
          `;
                    await this.prisma.$executeRawUnsafe(sql, id, projectId, chunk.filePath, chunk.lineStart, chunk.lineEnd, chunk.content, chunk.language, chunk.chunkType, chunk.name, chunk.parentName || null, chunk.dependencies || [], chunk.checksum);
                    chunksStored++;
                }
                catch (error) {
                    const errMsg = `Failed to store chunk ${chunk.name} in ${chunk.filePath}: ${error instanceof Error ? error.message : error}`;
                    this.logger.error(errMsg);
                    errors.push(errMsg);
                }
            }
            if (chunks.length > BATCH_SIZE) {
                this.logger.log(`Stored ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
            }
        }
        return { chunksStored, chunksDeleted, errors };
    }
    async updateProjectTimestamp(projectId) {
        await this.prisma.project.update({
            where: { id: projectId },
            data: { lastIngestedAt: new Date() },
        });
    }
    async getExistingChecksums(projectId) {
        const chunks = await this.prisma.codeChunk.findMany({
            where: { projectId },
            select: { filePath: true, checksum: true },
            distinct: ['filePath'],
        });
        return new Map(chunks.map((c) => [c.filePath, c.checksum]));
    }
    async getEmbeddingStats(projectId) {
        const result = await this.prisma.$queryRaw `
      SELECT 
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedding_count,
        COUNT(*) FILTER (WHERE embedding_bge IS NOT NULL) as bge_count,
        COUNT(*) FILTER (WHERE embedding_nomic IS NOT NULL) as nomic_count,
        COUNT(*) FILTER (WHERE embedding_gte IS NOT NULL) as gte_count,
        COUNT(*) FILTER (WHERE embedding_minilm IS NOT NULL) as minilm_count,
        COUNT(*) as total
      FROM code_chunks
      WHERE "projectId" = ${projectId}::uuid
    `;
        const stats = result[0];
        return {
            total: Number(stats.total),
            embedding: Number(stats.embedding_count),
            'bge-base': Number(stats.bge_count),
            nomic: Number(stats.nomic_count),
            'gte-base': Number(stats.gte_count),
            minilm: Number(stats.minilm_count),
        };
    }
};
exports.IngestionStoreService = IngestionStoreService;
exports.IngestionStoreService = IngestionStoreService = IngestionStoreService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], IngestionStoreService);
//# sourceMappingURL=ingestion-store.service.js.map