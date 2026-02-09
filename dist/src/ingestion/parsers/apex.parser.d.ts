import { Parser, ParseResult, Language } from './parser.interface';
export declare class ApexParser implements Parser {
    supportedLanguages: Language[];
    supportedExtensions: string[];
    private patterns;
    canParse(filePath: string): boolean;
    parse(content: string, filePath: string): ParseResult;
    private parseClass;
    private parseTrigger;
    private parseMethods;
    private extractAnnotations;
    private extractSoqlQueries;
    private extractDmlOperations;
    private extractFileHeader;
    private getLineNumber;
    private findMatchingBrace;
}
export declare const apexParser: ApexParser;
