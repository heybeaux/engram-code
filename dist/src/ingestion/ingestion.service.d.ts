import { ChunkWithEmbedding, IngestStats, ProjectConfig } from './types';
import { DiscoveryResult } from './discovery.service';
export interface IngestOptions {
    projectConfig: ProjectConfig;
    existingChecksums?: Map<string, string>;
    onProgress?: (phase: string, current: number, total: number) => void;
    skipEmbeddings?: boolean;
    models?: ('bge-base' | 'nomic' | 'gte-base' | 'minilm')[];
}
export interface IngestResult {
    stats: IngestStats;
    chunks: ChunkWithEmbedding[];
    discovery: DiscoveryResult;
}
export declare function ingest(options: IngestOptions): Promise<IngestResult>;
export declare function formatIngestStats(stats: IngestStats): string;
