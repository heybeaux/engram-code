import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    create(createProjectDto: CreateProjectDto): Promise<{
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
    remove(id: string): Promise<{
        rootPath: string;
        languages: string[];
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastIngestedAt: Date | null;
    }>;
}
