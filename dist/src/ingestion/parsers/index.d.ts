export * from './parser.interface';
export * from './apex.parser';
export * from './lwc.parser';
import { Parser, ParseResult } from './parser.interface';
export declare const parsers: Parser[];
export declare function getParserForFile(filePath: string): Parser | undefined;
export declare function parseFile(content: string, filePath: string): ParseResult | undefined;
