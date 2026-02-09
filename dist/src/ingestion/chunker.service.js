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
exports.processChunks = processChunks;
exports.buildEmbeddingText = buildEmbeddingText;
exports.computeChecksum = computeChecksum;
exports.computeChunkChecksum = computeChunkChecksum;
exports.extractFileHeader = extractFileHeader;
exports.hasChunkChanged = hasChunkChanged;
exports.processBatch = processBatch;
const crypto = __importStar(require("crypto"));
const types_1 = require("./types");
function processChunks(rawChunks, options) {
    const { filePath, language, fileContent } = options;
    const fileChecksum = computeChecksum(fileContent);
    return rawChunks.map((chunk) => {
        const embeddingText = buildEmbeddingText(chunk);
        const chunkChecksum = computeChunkChecksum(chunk, filePath);
        return {
            ...chunk,
            filePath,
            language,
            checksum: chunkChecksum,
            embeddingText,
        };
    });
}
function buildEmbeddingText(chunk) {
    const parts = [];
    parts.push(formatChunkType(chunk.chunkType));
    if (chunk.parentName) {
        parts.push(`in ${chunk.parentName}`);
    }
    parts.push(chunk.name);
    const content = truncateForEmbedding(chunk.content);
    return `${parts.join(' ')}: ${content}`;
}
function formatChunkType(type) {
    switch (type) {
        case types_1.ChunkType.CLASS:
            return 'class';
        case types_1.ChunkType.METHOD:
            return 'method';
        case types_1.ChunkType.FUNCTION:
            return 'function';
        case types_1.ChunkType.COMPONENT:
            return 'LWC component';
        case types_1.ChunkType.TRIGGER:
            return 'Apex trigger';
        case types_1.ChunkType.TEST:
            return 'test class';
        case types_1.ChunkType.INTERFACE:
            return 'interface';
        case types_1.ChunkType.FILE_HEADER:
            return 'file header';
        default:
            return type;
    }
}
function truncateForEmbedding(content, maxChars = 4000) {
    if (content.length <= maxChars) {
        return content;
    }
    return content.substring(0, maxChars - 20) + '\n... [truncated]';
}
function computeChecksum(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
function computeChunkChecksum(chunk, filePath) {
    const data = JSON.stringify({
        content: chunk.content,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        name: chunk.name,
        chunkType: chunk.chunkType,
        filePath,
    });
    return computeChecksum(data);
}
function extractFileHeader(content, firstChunkLine = Infinity) {
    const lines = content.split('\n');
    let headerEnd = 0;
    for (let i = 0; i < lines.length && i < firstChunkLine - 1; i++) {
        const line = lines[i].trim();
        if (line === '' ||
            line.startsWith('//') ||
            line.startsWith('/*') ||
            line.startsWith('*') ||
            line.startsWith('*/') ||
            line.startsWith('import ') ||
            line.startsWith('from ') ||
            line.startsWith('package ') ||
            line.startsWith('@')) {
            headerEnd = i + 1;
            continue;
        }
        break;
    }
    if (headerEnd === 0) {
        return null;
    }
    const headerContent = lines.slice(0, headerEnd).join('\n').trim();
    if (!headerContent) {
        return null;
    }
    return {
        content: headerContent,
        lineStart: 1,
        lineEnd: headerEnd,
        chunkType: types_1.ChunkType.FILE_HEADER,
        name: 'file_header',
        dependencies: extractImports(headerContent),
    };
}
function extractImports(header) {
    const imports = [];
    const jsImportRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = jsImportRegex.exec(header)) !== null) {
        imports.push(match[1]);
    }
    const pyImportRegex = /(?:from\s+(\S+)\s+)?import\s+(\S+)/g;
    while ((match = pyImportRegex.exec(header)) !== null) {
        imports.push(match[1] || match[2]);
    }
    return [...new Set(imports)];
}
function hasChunkChanged(newChunk, existingChecksum) {
    return newChunk.checksum !== existingChecksum;
}
function processBatch(files) {
    const allChunks = [];
    for (const { rawChunks, options } of files) {
        const processed = processChunks(rawChunks, options);
        allChunks.push(...processed);
    }
    return allChunks;
}
//# sourceMappingURL=chunker.service.js.map