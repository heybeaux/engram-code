import { RawChunk, ProcessedChunk, Language } from './types';
export interface ChunkerOptions {
    filePath: string;
    language: Language;
    fileContent: string;
}
export declare function processChunks(rawChunks: RawChunk[], options: ChunkerOptions): ProcessedChunk[];
export declare function buildEmbeddingText(chunk: RawChunk): string;
export declare function computeChecksum(content: string): string;
export declare function computeChunkChecksum(chunk: RawChunk, filePath: string): string;
export declare function extractFileHeader(content: string, firstChunkLine?: number): RawChunk | null;
export declare function hasChunkChanged(newChunk: ProcessedChunk, existingChecksum: string): boolean;
export declare function processBatch(files: Array<{
    rawChunks: RawChunk[];
    options: ChunkerOptions;
}>): ProcessedChunk[];
