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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsers = void 0;
exports.getParserForFile = getParserForFile;
exports.parseFile = parseFile;
__exportStar(require("./parser.interface"), exports);
__exportStar(require("./apex.parser"), exports);
__exportStar(require("./lwc.parser"), exports);
const apex_parser_1 = require("./apex.parser");
const lwc_parser_1 = require("./lwc.parser");
exports.parsers = [
    new apex_parser_1.ApexParser(),
    new lwc_parser_1.LwcParser(),
];
function getParserForFile(filePath) {
    return exports.parsers.find(p => p.canParse(filePath));
}
function parseFile(content, filePath) {
    const parser = getParserForFile(filePath);
    if (!parser)
        return undefined;
    return parser.parse(content, filePath);
}
//# sourceMappingURL=index.js.map