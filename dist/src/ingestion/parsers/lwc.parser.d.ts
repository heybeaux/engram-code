import { Parser, ParseResult, Language } from './parser.interface';
export declare class LwcParser implements Parser {
    supportedLanguages: Language[];
    supportedExtensions: string[];
    private patterns;
    canParse(filePath: string): boolean;
    parse(content: string, filePath: string): ParseResult;
    private parseComponent;
    private parseMethods;
    private parseArrowFunctions;
    private extractImports;
    private extractApiProperties;
    private extractTrackProperties;
    private extractWireDecorators;
    private extractEventHandlers;
    private extractDispatchedEvents;
    private getDecoratorsForMethod;
    private extractFileHeader;
    private getLineNumber;
    private findMatchingBrace;
}
export declare const lwcParser: LwcParser;
