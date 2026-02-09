export type ChunkType = 'class' | 'method' | 'function' | 'component' | 'trigger' | 'test' | 'interface';
export type Language = 'apex' | 'lwc' | 'javascript' | 'typescript' | 'python';
export interface RawChunk {
    content: string;
    lineStart: number;
    lineEnd: number;
    chunkType: ChunkType;
    name: string;
    parentName?: string;
    language: Language;
    metadata?: Record<string, any>;
}
export interface ParseResult {
    filePath: string;
    language: Language;
    chunks: RawChunk[];
    fileHeader?: RawChunk;
    errors?: string[];
}
export interface Parser {
    supportedLanguages: Language[];
    supportedExtensions: string[];
    parse(content: string, filePath: string): ParseResult;
    canParse(filePath: string): boolean;
}
export interface ApexMetadata {
    sharingMode?: 'with sharing' | 'without sharing' | 'inherited sharing';
    accessModifier?: 'public' | 'private' | 'global' | 'protected';
    annotations?: string[];
    isStatic?: boolean;
    isVirtual?: boolean;
    isAbstract?: boolean;
    isTest?: boolean;
    soqlQueries?: string[];
    dmlOperations?: string[];
    returnType?: string;
    parameters?: string;
    implements?: string[];
    extends?: string;
}
export interface LwcMetadata {
    wireDecorators?: Array<{
        adapter: string;
        config?: string;
    }>;
    apiProperties?: string[];
    trackProperties?: string[];
    eventHandlers?: string[];
    imports?: Array<{
        module: string;
        specifiers: string[];
    }>;
    extendsLightningElement?: boolean;
    dispatchedEvents?: string[];
}
