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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingest = ingest;
exports.formatIngestStats = formatIngestStats;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const discovery_service_1 = require("./discovery.service");
const chunker_service_1 = require("./chunker.service");
const embeddings_service_1 = require("./embeddings.service");
async function ingest(options) {
    const startTime = Date.now();
    const { projectConfig, existingChecksums = new Map(), onProgress, skipEmbeddings, models } = options;
    const errors = [];
    let filesProcessed = 0;
    let filesSkipped = 0;
    let chunksCreated = 0;
    let chunksUpdated = 0;
    let chunksDeleted = 0;
    onProgress?.('discovery', 0, 1);
    let discovery;
    try {
        discovery = await (0, discovery_service_1.discoverFiles)({
            rootPath: projectConfig.rootPath,
            languages: projectConfig.languages,
            customIgnore: projectConfig.ignorePatterns,
        });
        onProgress?.('discovery', 1, 1);
    }
    catch (error) {
        throw new Error(`Discovery failed: ${error instanceof Error ? error.message : error}`);
    }
    if (!skipEmbeddings) {
        const embedCheck = await (0, embeddings_service_1.checkEmbeddingService)();
        if (!embedCheck.available) {
            throw new Error(`Embedding service unavailable: ${embedCheck.error}`);
        }
    }
    const allProcessedChunks = [];
    const totalFiles = discovery.files.length;
    for (let i = 0; i < discovery.files.length; i++) {
        const file = discovery.files[i];
        onProgress?.('parsing', i + 1, totalFiles);
        try {
            const content = await fs.promises.readFile(file.absolutePath, 'utf-8');
            const fileChecksum = (0, chunker_service_1.computeChecksum)(content);
            const existingChecksum = existingChecksums.get(file.relativePath);
            if (existingChecksum === fileChecksum) {
                filesSkipped++;
                continue;
            }
            const rawChunks = parseFile(content, file.language, file.relativePath);
            if (rawChunks.length > 0) {
                const firstChunkLine = Math.min(...rawChunks.map((c) => c.lineStart));
                const header = (0, chunker_service_1.extractFileHeader)(content, firstChunkLine);
                if (header) {
                    rawChunks.unshift(header);
                }
            }
            const processed = (0, chunker_service_1.processChunks)(rawChunks, {
                filePath: file.relativePath,
                language: file.language,
                fileContent: content,
            });
            allProcessedChunks.push(...processed);
            filesProcessed++;
            chunksCreated += processed.length;
            if (existingChecksum) {
                chunksUpdated += processed.length;
                chunksCreated -= processed.length;
            }
        }
        catch (error) {
            errors.push({
                file: file.relativePath,
                error: error instanceof Error ? error.message : String(error),
                phase: 'parse',
            });
        }
    }
    let chunksWithEmbeddings = [];
    if (!skipEmbeddings && allProcessedChunks.length > 0) {
        try {
            chunksWithEmbeddings = await (0, embeddings_service_1.generateEmbeddings)(allProcessedChunks, {
                models,
                onProgress: (completed, total) => {
                    onProgress?.('embedding', completed, total);
                },
            });
        }
        catch (error) {
            errors.push({
                file: 'embedding-batch',
                error: error instanceof Error ? error.message : String(error),
                phase: 'embed',
            });
        }
    }
    else if (skipEmbeddings) {
        chunksWithEmbeddings = allProcessedChunks.map((chunk) => ({
            ...chunk,
            embedding: [],
        }));
    }
    const duration = Date.now() - startTime;
    return {
        stats: {
            filesProcessed,
            filesSkipped,
            chunksCreated,
            chunksUpdated,
            chunksDeleted,
            errors,
            duration,
        },
        chunks: chunksWithEmbeddings,
        discovery,
    };
}
function parseFile(content, language, filePath) {
    switch (language) {
        case types_1.Language.APEX:
            return parseApex(content, filePath);
        case types_1.Language.LWC:
        case types_1.Language.JAVASCRIPT:
            return parseJavaScript(content, filePath, language);
        case types_1.Language.TYPESCRIPT:
            return parseTypeScript(content, filePath);
        case types_1.Language.HTML:
        case types_1.Language.CSS:
        case types_1.Language.XML:
            return parseMarkup(content, filePath, language);
        default:
            return [];
    }
}
function parseApex(content, filePath) {
    const chunks = [];
    const lines = content.split('\n');
    const isTestClass = /@isTest/i.test(content) || /testMethod/i.test(content);
    const classRegex = /(public|private|global)?\s*(virtual|abstract|with sharing|without sharing)?\s*(class|interface|trigger)\s+(\w+)/gi;
    const methodRegex = /(public|private|protected|global)?\s*(static)?\s*(testMethod\s+)?(\w+)\s+(\w+)\s*\([^)]*\)\s*\{/gi;
    let currentClass = null;
    let classMatch;
    while ((classMatch = classRegex.exec(content)) !== null) {
        currentClass = classMatch[4];
        const lineNum = content.substring(0, classMatch.index).split('\n').length;
        const classEnd = findMatchingBrace(content, classMatch.index);
        const endLine = content.substring(0, classEnd).split('\n').length;
        const isInterface = classMatch[3].toLowerCase() === 'interface';
        const isTrigger = classMatch[3].toLowerCase() === 'trigger';
        chunks.push({
            content: content.substring(classMatch.index, classEnd + 1),
            lineStart: lineNum,
            lineEnd: endLine,
            chunkType: isTrigger
                ? types_1.ChunkType.TRIGGER
                : isInterface
                    ? types_1.ChunkType.INTERFACE
                    : isTestClass
                        ? types_1.ChunkType.TEST
                        : types_1.ChunkType.CLASS,
            name: currentClass,
        });
    }
    let methodMatch;
    while ((methodMatch = methodRegex.exec(content)) !== null) {
        const methodName = methodMatch[5];
        const lineNum = content.substring(0, methodMatch.index).split('\n').length;
        const braceStart = content.indexOf('{', methodMatch.index);
        const methodEnd = findMatchingBrace(content, braceStart);
        const endLine = content.substring(0, methodEnd).split('\n').length;
        let methodStart = methodMatch.index;
        const prevLines = content.substring(0, methodStart).split('\n');
        let annotationLine = prevLines.length - 1;
        while (annotationLine >= 0 && prevLines[annotationLine].trim().startsWith('@')) {
            annotationLine--;
        }
        if (annotationLine < prevLines.length - 1) {
            methodStart = prevLines.slice(0, annotationLine + 1).join('\n').length + 1;
        }
        chunks.push({
            content: content.substring(methodStart, methodEnd + 1),
            lineStart: lineNum,
            lineEnd: endLine,
            chunkType: types_1.ChunkType.METHOD,
            name: methodName,
            parentName: currentClass || undefined,
        });
    }
    return chunks;
}
function parseJavaScript(content, filePath, language) {
    const chunks = [];
    const lines = content.split('\n');
    const lwcClassRegex = /export\s+default\s+class\s+(\w+)\s+extends\s+LightningElement/g;
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    const arrowRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    let match;
    while ((match = lwcClassRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const classEnd = findMatchingBrace(content, content.indexOf('{', match.index));
        const endLine = content.substring(0, classEnd).split('\n').length;
        chunks.push({
            content: content.substring(match.index, classEnd + 1),
            lineStart: lineNum,
            lineEnd: endLine,
            chunkType: types_1.ChunkType.COMPONENT,
            name: match[1],
        });
    }
    if (chunks.length === 0) {
        while ((match = classRegex.exec(content)) !== null) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            const classEnd = findMatchingBrace(content, content.indexOf('{', match.index));
            const endLine = content.substring(0, classEnd).split('\n').length;
            chunks.push({
                content: content.substring(match.index, classEnd + 1),
                lineStart: lineNum,
                lineEnd: endLine,
                chunkType: types_1.ChunkType.CLASS,
                name: match[1],
            });
        }
    }
    while ((match = funcRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const funcEnd = findMatchingBrace(content, content.indexOf('{', match.index));
        const endLine = content.substring(0, funcEnd).split('\n').length;
        chunks.push({
            content: content.substring(match.index, funcEnd + 1),
            lineStart: lineNum,
            lineEnd: endLine,
            chunkType: types_1.ChunkType.FUNCTION,
            name: match[1],
        });
    }
    return chunks;
}
function parseTypeScript(content, filePath) {
    return parseJavaScript(content, filePath, types_1.Language.TYPESCRIPT);
}
function parseMarkup(content, filePath, language) {
    const lines = content.split('\n');
    const fileName = path.basename(filePath, path.extname(filePath));
    return [
        {
            content,
            lineStart: 1,
            lineEnd: lines.length,
            chunkType: types_1.ChunkType.FILE_HEADER,
            name: fileName,
        },
    ];
}
function findMatchingBrace(content, openPos) {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inLineComment = false;
    for (let i = openPos; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        if (!inString && !inComment && char === '/' && nextChar === '*') {
            inComment = true;
            i++;
            continue;
        }
        if (inComment && char === '*' && nextChar === '/') {
            inComment = false;
            i++;
            continue;
        }
        if (!inString && !inComment && char === '/' && nextChar === '/') {
            inLineComment = true;
            continue;
        }
        if (inLineComment && char === '\n') {
            inLineComment = false;
            continue;
        }
        if (inComment || inLineComment)
            continue;
        if ((char === '"' || char === "'" || char === '`') && content[i - 1] !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            }
            else if (char === stringChar) {
                inString = false;
            }
            continue;
        }
        if (inString)
            continue;
        if (char === '{') {
            depth++;
        }
        else if (char === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return content.length - 1;
}
function formatIngestStats(stats) {
    const lines = [
        `Ingestion completed in ${(stats.duration / 1000).toFixed(2)}s`,
        '',
        `Files: ${stats.filesProcessed} processed, ${stats.filesSkipped} unchanged`,
        `Chunks: ${stats.chunksCreated} created, ${stats.chunksUpdated} updated`,
        '',
    ];
    if (stats.errors.length > 0) {
        lines.push(`Errors: ${stats.errors.length}`);
        for (const error of stats.errors.slice(0, 5)) {
            lines.push(`  - ${error.file} (${error.phase}): ${error.error}`);
        }
        if (stats.errors.length > 5) {
            lines.push(`  ... and ${stats.errors.length - 5} more`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=ingestion.service.js.map