import { PrismaService } from '../prisma/prisma.service';
import { IngestionStoreService } from './ingestion-store.service';
interface IngestRequestBody {
    clearExisting?: boolean;
    skipEmbeddings?: boolean;
    models?: ('bge-base' | 'nomic' | 'gte-base' | 'minilm')[];
}
interface IngestResponse {
    success: boolean;
    projectId: string;
    projectName: string;
    stats: {
        filesProcessed: number;
        filesSkipped: number;
        chunksCreated: number;
        chunksStored: number;
        chunksDeleted: number;
        duration: number;
        errors: number;
    };
    message: string;
}
export declare class IngestionController {
    private prisma;
    private storeService;
    private readonly logger;
    constructor(prisma: PrismaService, storeService: IngestionStoreService);
    ingestProject(projectId: string, body?: IngestRequestBody): Promise<IngestResponse>;
}
export {};
