"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let ProjectsService = class ProjectsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto) {
        const normalizedPath = path.resolve(dto.rootPath);
        if (normalizedPath !== dto.rootPath || dto.rootPath.includes('..')) {
            throw new common_1.BadRequestException('Invalid rootPath: path traversal not allowed');
        }
        if (!fs.existsSync(normalizedPath)) {
            throw new common_1.BadRequestException(`rootPath does not exist: ${normalizedPath}`);
        }
        const stats = fs.statSync(normalizedPath);
        if (!stats.isDirectory()) {
            throw new common_1.BadRequestException(`rootPath is not a directory: ${normalizedPath}`);
        }
        const existing = await this.prisma.project.findUnique({
            where: { name: dto.name },
        });
        if (existing) {
            throw new common_1.ConflictException(`Project "${dto.name}" already exists`);
        }
        return this.prisma.project.create({
            data: {
                name: dto.name,
                rootPath: normalizedPath,
                languages: dto.languages,
            },
        });
    }
    async findAll() {
        return this.prisma.project.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const project = await this.prisma.project.findUnique({
            where: { id },
        });
        if (!project) {
            throw new common_1.NotFoundException(`Project with ID "${id}" not found`);
        }
        return project;
    }
    async remove(id) {
        try {
            return await this.prisma.project.delete({
                where: { id },
            });
        }
        catch {
            throw new common_1.NotFoundException(`Project with ID "${id}" not found`);
        }
    }
    async getStats(id) {
        const project = await this.findOne(id);
        const chunkCounts = await this.prisma.codeChunk.groupBy({
            by: ['chunkType'],
            where: { projectId: id },
            _count: true,
        });
        const totalChunks = await this.prisma.codeChunk.count({
            where: { projectId: id },
        });
        const fileCount = await this.prisma.codeChunk.findMany({
            where: { projectId: id },
            select: { filePath: true },
            distinct: ['filePath'],
        });
        return {
            project,
            stats: {
                totalChunks,
                fileCount: fileCount.length,
                byType: chunkCounts.reduce((acc, curr) => {
                    acc[curr.chunkType] = curr._count;
                    return acc;
                }, {}),
            },
        };
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map