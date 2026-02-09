"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apexParser = exports.ApexParser = void 0;
class ApexParser {
    supportedLanguages = ['apex'];
    supportedExtensions = ['.cls', '.trigger'];
    patterns = {
        classDeclaration: /^(\s*)((?:@\w+(?:\([^)]*\))?\s*)*)((?:public|private|global)\s+)?(?:(virtual|abstract)\s+)?(?:(with|without|inherited)\s+sharing\s+)?(?:class|interface)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?\s*\{/gm,
        triggerDeclaration: /^(\s*)trigger\s+(\w+)\s+on\s+(\w+)\s*\(([\w\s,]+)\)\s*\{/gm,
        methodDeclaration: /^(\s*)((?:@\w+(?:\([^)]*\))?\s*)*)((?:public|private|protected|global)\s+)?(?:(static)\s+)?(?:(virtual|abstract|override)\s+)?(\w+(?:<[\w<>,\s]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*\{/gm,
        annotation: /@(\w+)(?:\(([^)]*)\))?/g,
        soqlQuery: /\[\s*SELECT\s+[\s\S]*?\s+FROM\s+\w+[\s\S]*?\]/gi,
        dynamicSoql: /Database\.query\s*\([^)]+\)/gi,
        dmlOperations: /\b(insert|update|delete|upsert|undelete)\s+/gi,
        innerClass: /^(\s*)((?:@\w+(?:\([^)]*\))?\s*)*)((?:public|private|protected)\s+)?(?:(static)\s+)?(?:(virtual|abstract)\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?\s*\{/gm,
    };
    canParse(filePath) {
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        return this.supportedExtensions.includes(ext);
    }
    parse(content, filePath) {
        const chunks = [];
        const errors = [];
        const lines = content.split('\n');
        const isTrigger = filePath.endsWith('.trigger');
        try {
            if (isTrigger) {
                this.parseTrigger(content, lines, chunks, filePath);
            }
            else {
                this.parseClass(content, lines, chunks, filePath);
            }
        }
        catch (error) {
            errors.push(`Error parsing ${filePath}: ${error}`);
        }
        const fileHeader = this.extractFileHeader(content, lines, chunks);
        return {
            filePath,
            language: 'apex',
            chunks,
            fileHeader,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    parseClass(content, lines, chunks, filePath) {
        const classMatch = this.patterns.classDeclaration.exec(content);
        this.patterns.classDeclaration.lastIndex = 0;
        if (!classMatch) {
            return;
        }
        const className = classMatch[6];
        const annotations = this.extractAnnotations(classMatch[2]);
        const isTest = annotations.some(a => a.toLowerCase() === 'istest') ||
            className.toLowerCase().includes('test');
        const classLineStart = this.getLineNumber(content, classMatch.index);
        const classLineEnd = this.findMatchingBrace(lines, classLineStart - 1);
        const classContent = lines.slice(classLineStart - 1, classLineEnd).join('\n');
        const metadata = {
            accessModifier: classMatch[3]?.trim() || 'public',
            isVirtual: classMatch[4] === 'virtual',
            isAbstract: classMatch[4] === 'abstract',
            sharingMode: classMatch[5] ? `${classMatch[5]} sharing` : undefined,
            annotations,
            isTest,
            extends: classMatch[7],
            implements: classMatch[8]?.split(',').map(i => i.trim()).filter(Boolean),
            soqlQueries: this.extractSoqlQueries(classContent),
            dmlOperations: this.extractDmlOperations(classContent),
        };
        const classChunk = {
            content: classContent,
            lineStart: classLineStart,
            lineEnd: classLineEnd,
            chunkType: isTest ? 'test' : 'class',
            name: className,
            language: 'apex',
            metadata,
        };
        chunks.push(classChunk);
        this.parseMethods(classContent, classLineStart, className, isTest, chunks);
    }
    parseTrigger(content, lines, chunks, filePath) {
        const triggerMatch = this.patterns.triggerDeclaration.exec(content);
        this.patterns.triggerDeclaration.lastIndex = 0;
        if (!triggerMatch) {
            return;
        }
        const triggerName = triggerMatch[2];
        const sObjectType = triggerMatch[3];
        const events = triggerMatch[4];
        const lineStart = this.getLineNumber(content, triggerMatch.index);
        const lineEnd = this.findMatchingBrace(lines, lineStart - 1);
        const triggerContent = lines.slice(lineStart - 1, lineEnd).join('\n');
        const metadata = {
            soqlQueries: this.extractSoqlQueries(triggerContent),
            dmlOperations: this.extractDmlOperations(triggerContent),
        };
        const chunk = {
            content: triggerContent,
            lineStart,
            lineEnd,
            chunkType: 'trigger',
            name: triggerName,
            language: 'apex',
            metadata: {
                ...metadata,
                sObjectType,
                triggerEvents: events.split(',').map(e => e.trim()),
            },
        };
        chunks.push(chunk);
    }
    parseMethods(classContent, classLineStart, className, isTestClass, chunks) {
        const lines = classContent.split('\n');
        let match;
        this.patterns.methodDeclaration.lastIndex = 0;
        while ((match = this.patterns.methodDeclaration.exec(classContent)) !== null) {
            const methodAnnotations = this.extractAnnotations(match[2]);
            const accessModifier = match[3]?.trim();
            const isStatic = match[4] === 'static';
            const returnType = match[6];
            const methodName = match[7];
            const parameters = match[8];
            const isTestMethod = isTestClass ||
                methodAnnotations.some(a => a.toLowerCase() === 'istest') ||
                methodName.toLowerCase().startsWith('test');
            const methodLineStart = this.getLineNumber(classContent, match.index);
            const methodLineEnd = this.findMatchingBrace(lines, methodLineStart - 1);
            const methodContent = lines.slice(methodLineStart - 1, methodLineEnd).join('\n');
            const metadata = {
                accessModifier: accessModifier || 'private',
                isStatic,
                annotations: methodAnnotations,
                isTest: isTestMethod,
                returnType,
                parameters,
                soqlQueries: this.extractSoqlQueries(methodContent),
                dmlOperations: this.extractDmlOperations(methodContent),
            };
            const chunk = {
                content: methodContent,
                lineStart: classLineStart + methodLineStart - 1,
                lineEnd: classLineStart + methodLineEnd - 1,
                chunkType: isTestMethod ? 'test' : 'method',
                name: methodName,
                parentName: className,
                language: 'apex',
                metadata,
            };
            chunks.push(chunk);
        }
    }
    extractAnnotations(annotationBlock) {
        if (!annotationBlock)
            return [];
        const annotations = [];
        let match;
        const regex = new RegExp(this.patterns.annotation.source, 'g');
        while ((match = regex.exec(annotationBlock)) !== null) {
            annotations.push(match[1]);
        }
        return annotations;
    }
    extractSoqlQueries(content) {
        const queries = [];
        let match;
        const inlineRegex = new RegExp(this.patterns.soqlQuery.source, 'gi');
        while ((match = inlineRegex.exec(content)) !== null) {
            queries.push(match[0].trim());
        }
        const dynamicRegex = new RegExp(this.patterns.dynamicSoql.source, 'gi');
        while ((match = dynamicRegex.exec(content)) !== null) {
            queries.push('[DYNAMIC] ' + match[0].trim());
        }
        return queries;
    }
    extractDmlOperations(content) {
        const operations = new Set();
        let match;
        const regex = new RegExp(this.patterns.dmlOperations.source, 'gi');
        while ((match = regex.exec(content)) !== null) {
            operations.add(match[1].toLowerCase());
        }
        const dbMethods = /Database\.(insert|update|delete|upsert|undelete)/gi;
        while ((match = dbMethods.exec(content)) !== null) {
            operations.add(match[1].toLowerCase());
        }
        return Array.from(operations);
    }
    extractFileHeader(content, lines, chunks) {
        if (chunks.length === 0)
            return undefined;
        const firstChunkLine = Math.min(...chunks.map(c => c.lineStart));
        if (firstChunkLine <= 1)
            return undefined;
        const headerContent = lines.slice(0, firstChunkLine - 1).join('\n').trim();
        if (!headerContent)
            return undefined;
        return {
            content: headerContent,
            lineStart: 1,
            lineEnd: firstChunkLine - 1,
            chunkType: 'class',
            name: 'file_header',
            language: 'apex',
        };
    }
    getLineNumber(content, charIndex) {
        const upToIndex = content.substring(0, charIndex);
        return upToIndex.split('\n').length;
    }
    findMatchingBrace(lines, startLine) {
        let braceCount = 0;
        let foundFirstBrace = false;
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            for (const char of line) {
                if (char === '{') {
                    braceCount++;
                    foundFirstBrace = true;
                }
                else if (char === '}') {
                    braceCount--;
                    if (foundFirstBrace && braceCount === 0) {
                        return i + 1;
                    }
                }
            }
        }
        return lines.length;
    }
}
exports.ApexParser = ApexParser;
exports.apexParser = new ApexParser();
//# sourceMappingURL=apex.parser.js.map