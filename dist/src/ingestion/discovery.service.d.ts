import { Language, DiscoveredFile } from './types';
export interface DiscoveryOptions {
    rootPath: string;
    languages?: Language[];
    customIgnore?: string[];
}
export interface DiscoveryResult {
    files: DiscoveredFile[];
    stats: {
        totalFiles: number;
        byLanguage: Record<Language, number>;
        skippedDirs: number;
        skippedSymlinks: number;
    };
}
export declare function discoverFiles(options: DiscoveryOptions): Promise<DiscoveryResult>;
export declare function formatDiscoverySummary(result: DiscoveryResult): string;
