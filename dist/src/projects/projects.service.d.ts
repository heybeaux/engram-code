import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateProjectDto): Promise<{
        rootPath: string;
        languages: string[];
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastIngestedAt: Date | null;
    }>;
    findAll(): Promise<{
        rootPath: string;
        languages: string[];
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastIngestedAt: Date | null;
    }[]>;
    findOne(id: string): Promise<{
        rootPath: string;
        languages: string[];
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastIngestedAt: Date | null;
    }>;
    remove(id: string): Promise<{
        rootPath: string;
        languages: string[];
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastIngestedAt: Date | null;
    }>;
    getStats(id: string): Promise<{
        project: {
            rootPath: string;
            languages: string[];
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            lastIngestedAt: Date | null;
        };
        stats: {
            totalChunks: number;
            fileCount: number;
            byType: Record<string, number>;
        };
    }>;
}
