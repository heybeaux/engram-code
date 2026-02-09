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
var IngestionController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const ingestion_store_service_1 = require("./ingestion-store.service");
const ingestion_service_1 = require("./ingestion.service");
let IngestionController = IngestionController_1 = class IngestionController {
    prisma;
    storeService;
    logger = new common_1.Logger(IngestionController_1.name);
    constructor(prisma, storeService) {
        this.prisma = prisma;
        this.storeService = storeService;
    }
    async ingestProject(projectId, body = {}) {
        this.logger.log(`Starting ingestion for project ${projectId}`);
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
        });
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }
        this.logger.log(`Found project: ${project.name} at ${project.rootPath}`);
        const existingChecksums = body.clearExisting
            ? new Map()
            : await this.storeService.getExistingChecksums(projectId);
        const projectConfig = {
            rootPath: project.rootPath,
            projectId: project.id,
            languages: project.languages.map((l) => l),
        };
        const result = await (0, ingestion_service_1.ingest)({
            projectConfig,
            existingChecksums,
            skipEmbeddings: body.skipEmbeddings,
            models: body.models,
            onProgress: (phase, current, total) => {
                this.logger.debug(`[${phase}] ${current}/${total}`);
            },
        });
        this.logger.log((0, ingestion_service_1.formatIngestStats)(result.stats));
        const storeResult = await this.storeService.storeChunks(projectId, result.chunks, { clearExisting: body.clearExisting });
        await this.storeService.updateProjectTimestamp(projectId);
        this.logger.log(`Ingestion complete: ${storeResult.chunksStored} chunks stored, ${storeResult.errors.length} errors`);
        return {
            success: storeResult.errors.length === 0 && result.stats.errors.length === 0,
            projectId: project.id,
            projectName: project.name,
            stats: {
                filesProcessed: result.stats.filesProcessed,
                filesSkipped: result.stats.filesSkipped,
                chunksCreated: result.stats.chunksCreated,
                chunksStored: storeResult.chunksStored,
                chunksDeleted: storeResult.chunksDeleted,
                duration: result.stats.duration,
                errors: result.stats.errors.length + storeResult.errors.length,
            },
            message: (0, ingestion_service_1.formatIngestStats)(result.stats),
        };
    }
};
exports.IngestionController = IngestionController;
__decorate([
    (0, common_1.Post)(':id/ingest'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IngestionController.prototype, "ingestProject", null);
exports.IngestionController = IngestionController = IngestionController_1 = __decorate([
    (0, common_1.Controller)('v1/projects'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ingestion_store_service_1.IngestionStoreService])
], IngestionController);
//# sourceMappingURL=ingestion.controller.js.map