"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lwcParser = exports.LwcParser = void 0;
class LwcParser {
    supportedLanguages = ['lwc', 'javascript'];
    supportedExtensions = ['.js'];
    patterns = {
        componentClass: /export\s+default\s+class\s+(\w+)\s+extends\s+(NavigationMixin\s*\(\s*)?LightningElement\s*\)?/g,
        apiProperty: /@api\s+(?:get\s+)?(\w+)/g,
        trackProperty: /@track\s+(\w+)/g,
        wireDecorator: /@wire\s*\(\s*(\w+)(?:\s*,\s*\{([^}]*)\})?\s*\)/g,
        methodDeclaration: /^(\s*)(async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/gm,
        arrowFunction: /^(\s*)(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
        eventHandler: /\b(handle\w+)\s*[=(]/g,
        importStatement: /^import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/gm,
        dispatchEvent: /this\.dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"](\w+)['"]/g,
        getter: /get\s+(\w+)\s*\(\s*\)\s*\{/g,
        setter: /set\s+(\w+)\s*\([^)]*\)\s*\{/g,
        lifecycleCallback: /\b(connectedCallback|disconnectedCallback|renderedCallback|errorCallback)\s*\(\s*\)/g,
    };
    canParse(filePath) {
        const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
        if (ext !== '.js')
            return false;
        const isLwc = filePath.includes('/lwc/') || filePath.includes('\\lwc\\');
        const isTest = filePath.includes('__tests__') || filePath.includes('.test.');
        return isLwc && !isTest;
    }
    parse(content, filePath) {
        const chunks = [];
        const errors = [];
        const lines = content.split('\n');
        try {
            const imports = this.extractImports(content);
            this.parseComponent(content, lines, chunks, filePath, imports);
        }
        catch (error) {
            errors.push(`Error parsing ${filePath}: ${error}`);
        }
        const fileHeader = this.extractFileHeader(content, lines, chunks);
        return {
            filePath,
            language: 'lwc',
            chunks,
            fileHeader,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    parseComponent(content, lines, chunks, filePath, imports) {
        const classMatch = this.patterns.componentClass.exec(content);
        this.patterns.componentClass.lastIndex = 0;
        if (!classMatch) {
            return;
        }
        const componentName = classMatch[1];
        const usesNavigationMixin = !!classMatch[2];
        const classLineStart = this.getLineNumber(content, classMatch.index);
        const classLineEnd = this.findMatchingBrace(lines, classLineStart - 1);
        const classContent = lines.slice(classLineStart - 1, classLineEnd).join('\n');
        const apiProperties = this.extractApiProperties(classContent);
        const trackProperties = this.extractTrackProperties(classContent);
        const wireDecorators = this.extractWireDecorators(classContent);
        const eventHandlers = this.extractEventHandlers(classContent);
        const dispatchedEvents = this.extractDispatchedEvents(classContent);
        const metadata = {
            apiProperties,
            trackProperties,
            wireDecorators,
            eventHandlers,
            imports,
            extendsLightningElement: true,
            dispatchedEvents,
        };
        const componentChunk = {
            content: classContent,
            lineStart: classLineStart,
            lineEnd: classLineEnd,
            chunkType: 'component',
            name: componentName,
            language: 'lwc',
            metadata: {
                ...metadata,
                usesNavigationMixin,
            },
        };
        chunks.push(componentChunk);
        this.parseMethods(classContent, classLineStart, componentName, chunks);
    }
    parseMethods(classContent, classLineStart, componentName, chunks) {
        const lines = classContent.split('\n');
        const methodPattern = /^(\s*)(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*\{/gm;
        let match;
        const reservedWords = new Set([
            'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
            'break', 'continue', 'return', 'throw', 'try', 'catch', 'finally',
            'new', 'delete', 'typeof', 'void', 'in', 'instanceof', 'with',
            'function', 'var', 'let', 'const', 'class', 'extends', 'import',
            'export', 'static', 'get', 'set', 'async', 'await', 'yield',
            'true', 'false', 'null', 'undefined', 'this', 'super'
        ]);
        while ((match = methodPattern.exec(classContent)) !== null) {
            const methodName = match[2];
            if (reservedWords.has(methodName)) {
                continue;
            }
            if (['constructor', 'connectedCallback', 'disconnectedCallback',
                'renderedCallback', 'errorCallback'].includes(methodName)) {
                continue;
            }
            const methodLineStart = this.getLineNumber(classContent, match.index);
            const methodLineEnd = this.findMatchingBrace(lines, methodLineStart - 1);
            const methodContent = lines.slice(methodLineStart - 1, methodLineEnd).join('\n');
            const isEventHandler = methodName.startsWith('handle');
            const decorators = this.getDecoratorsForMethod(classContent, match.index);
            const metadata = {};
            if (isEventHandler) {
                metadata.isEventHandler = true;
            }
            if (decorators.length > 0) {
                metadata.decorators = decorators;
            }
            const chunk = {
                content: methodContent,
                lineStart: classLineStart + methodLineStart - 1,
                lineEnd: classLineStart + methodLineEnd - 1,
                chunkType: 'method',
                name: methodName,
                parentName: componentName,
                language: 'lwc',
                metadata,
            };
            chunks.push(chunk);
        }
        this.parseArrowFunctions(classContent, classLineStart, componentName, chunks, lines);
    }
    parseArrowFunctions(classContent, classLineStart, componentName, chunks, lines) {
        const arrowPattern = /^(\s*)(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm;
        let match;
        while ((match = arrowPattern.exec(classContent)) !== null) {
            const funcName = match[2];
            const funcLineStart = this.getLineNumber(classContent, match.index);
            const lineContent = lines[funcLineStart - 1];
            let funcLineEnd;
            if (lineContent.includes('{')) {
                funcLineEnd = this.findMatchingBrace(lines, funcLineStart - 1);
            }
            else {
                funcLineEnd = funcLineStart;
                for (let i = funcLineStart; i < lines.length; i++) {
                    if (lines[i].includes(';')) {
                        funcLineEnd = i + 1;
                        break;
                    }
                }
            }
            const funcContent = lines.slice(funcLineStart - 1, funcLineEnd).join('\n');
            const chunk = {
                content: funcContent,
                lineStart: classLineStart + funcLineStart - 1,
                lineEnd: classLineStart + funcLineEnd - 1,
                chunkType: 'function',
                name: funcName,
                parentName: componentName,
                language: 'lwc',
                metadata: {
                    isArrowFunction: true,
                    isEventHandler: funcName.startsWith('handle'),
                },
            };
            chunks.push(chunk);
        }
    }
    extractImports(content) {
        const imports = [];
        let match;
        const regex = new RegExp(this.patterns.importStatement.source, 'gm');
        while ((match = regex.exec(content)) !== null) {
            const namedImports = match[1];
            const namespaceImport = match[2];
            const defaultImport = match[3];
            const modulePath = match[4];
            const specifiers = [];
            if (namedImports) {
                specifiers.push(...namedImports.split(',').map(s => s.trim()).filter(Boolean));
            }
            if (namespaceImport) {
                specifiers.push(`* as ${namespaceImport}`);
            }
            if (defaultImport) {
                specifiers.push(defaultImport);
            }
            imports.push({
                module: modulePath,
                specifiers,
            });
        }
        return imports;
    }
    extractApiProperties(content) {
        const properties = [];
        let match;
        const regex = new RegExp(this.patterns.apiProperty.source, 'g');
        while ((match = regex.exec(content)) !== null) {
            properties.push(match[1]);
        }
        return properties;
    }
    extractTrackProperties(content) {
        const properties = [];
        let match;
        const regex = new RegExp(this.patterns.trackProperty.source, 'g');
        while ((match = regex.exec(content)) !== null) {
            properties.push(match[1]);
        }
        return properties;
    }
    extractWireDecorators(content) {
        const wires = [];
        let match;
        const regex = new RegExp(this.patterns.wireDecorator.source, 'g');
        while ((match = regex.exec(content)) !== null) {
            wires.push({
                adapter: match[1],
                config: match[2]?.trim(),
            });
        }
        return wires;
    }
    extractEventHandlers(content) {
        const handlers = new Set();
        let match;
        const regex = new RegExp(this.patterns.eventHandler.source, 'g');
        while ((match = regex.exec(content)) !== null) {
            handlers.add(match[1]);
        }
        return Array.from(handlers);
    }
    extractDispatchedEvents(content) {
        const events = [];
        let match;
        const regex = new RegExp(this.patterns.dispatchEvent.source, 'g');
        while ((match = regex.exec(content)) !== null) {
            events.push(match[1]);
        }
        return events;
    }
    getDecoratorsForMethod(content, methodIndex) {
        const decorators = [];
        const beforeMethod = content.substring(0, methodIndex);
        const lines = beforeMethod.split('\n');
        for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
            const line = lines[i].trim();
            if (line.startsWith('@')) {
                const match = line.match(/@(\w+)/);
                if (match) {
                    decorators.unshift(match[1]);
                }
            }
            else if (line && !line.startsWith('//') && !line.startsWith('*')) {
                break;
            }
        }
        return decorators;
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
            chunkType: 'component',
            name: 'file_header',
            language: 'lwc',
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
            let inString = false;
            let stringChar = '';
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                const prevChar = j > 0 ? line[j - 1] : '';
                if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
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
exports.LwcParser = LwcParser;
exports.lwcParser = new LwcParser();
//# sourceMappingURL=lwc.parser.js.map