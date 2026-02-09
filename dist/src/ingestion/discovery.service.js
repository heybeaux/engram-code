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
exports.discoverFiles = discoverFiles;
exports.formatDiscoverySummary = formatDiscoverySummary;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    '.sfdx',
    'dist',
    'build',
    'coverage',
    '__tests__',
    '.husky',
    '.vscode',
    '.idea',
]);
const EXTENSION_LANGUAGE_MAP = {
    '.cls': types_1.Language.APEX,
    '.trigger': types_1.Language.APEX,
    '.ts': types_1.Language.TYPESCRIPT,
    '.tsx': types_1.Language.TYPESCRIPT,
    '.py': types_1.Language.PYTHON,
};
const CONTEXT_EXTENSIONS = new Set(['.js', '.html', '.css', '.xml']);
async function discoverFiles(options) {
    const { rootPath, languages, customIgnore = [] } = options;
    const files = [];
    const ignoreSet = new Set([...IGNORE_DIRS, ...customIgnore]);
    let skippedDirs = 0;
    if (!fs.existsSync(rootPath)) {
        throw new Error(`Root path does not exist: ${rootPath}`);
    }
    const stats = fs.statSync(rootPath);
    if (!stats.isDirectory()) {
        throw new Error(`Root path is not a directory: ${rootPath}`);
    }
    let skippedFiles = 0;
    async function walkDir(dir) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isSymbolicLink()) {
                skippedFiles++;
                continue;
            }
            if (entry.isDirectory()) {
                if (ignoreSet.has(entry.name)) {
                    skippedDirs++;
                    continue;
                }
                await walkDir(fullPath);
            }
            else if (entry.isFile()) {
                const discovered = detectFile(fullPath, rootPath, dir);
                if (discovered) {
                    if (!languages || languages.includes(discovered.language)) {
                        files.push(discovered);
                    }
                }
            }
        }
    }
    await walkDir(rootPath);
    const byLanguage = {};
    for (const file of files) {
        byLanguage[file.language] = (byLanguage[file.language] || 0) + 1;
    }
    return {
        files,
        stats: {
            totalFiles: files.length,
            byLanguage,
            skippedDirs,
            skippedSymlinks: skippedFiles,
        },
    };
}
function detectFile(absolutePath, rootPath, parentDir) {
    const ext = path.extname(absolutePath).toLowerCase();
    const relativePath = path.relative(rootPath, absolutePath);
    if (EXTENSION_LANGUAGE_MAP[ext]) {
        return {
            absolutePath,
            relativePath,
            language: EXTENSION_LANGUAGE_MAP[ext],
            extension: ext,
        };
    }
    if (CONTEXT_EXTENSIONS.has(ext)) {
        const language = detectLanguageFromContext(absolutePath, parentDir, ext);
        if (language) {
            return {
                absolutePath,
                relativePath,
                language,
                extension: ext,
            };
        }
    }
    return null;
}
function detectLanguageFromContext(absolutePath, parentDir, ext) {
    const isInLwc = parentDir.includes('/lwc/') || parentDir.includes('\\lwc\\');
    switch (ext) {
        case '.js':
            if (isInLwc) {
                return types_1.Language.LWC;
            }
            const basename = path.basename(absolutePath);
            if (basename.includes('.config.') || basename.startsWith('.')) {
                return null;
            }
            return types_1.Language.JAVASCRIPT;
        case '.html':
            if (isInLwc) {
                return types_1.Language.HTML;
            }
            return null;
        case '.css':
            if (isInLwc) {
                return types_1.Language.CSS;
            }
            return null;
        case '.xml':
            if (absolutePath.includes('force-app') ||
                absolutePath.includes('/lwc/') ||
                absolutePath.includes('/classes/')) {
                return types_1.Language.XML;
            }
            return null;
        default:
            return null;
    }
}
function formatDiscoverySummary(result) {
    const lines = [
        `Discovered ${result.stats.totalFiles} files`,
        `Skipped ${result.stats.skippedDirs} directories`,
        '',
        'By language:',
    ];
    for (const [lang, count] of Object.entries(result.stats.byLanguage)) {
        lines.push(`  ${lang}: ${count}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=discovery.service.js.map