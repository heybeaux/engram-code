"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkType = exports.Language = void 0;
var Language;
(function (Language) {
    Language["APEX"] = "apex";
    Language["LWC"] = "lwc";
    Language["JAVASCRIPT"] = "javascript";
    Language["TYPESCRIPT"] = "typescript";
    Language["PYTHON"] = "python";
    Language["HTML"] = "html";
    Language["CSS"] = "css";
    Language["XML"] = "xml";
})(Language || (exports.Language = Language = {}));
var ChunkType;
(function (ChunkType) {
    ChunkType["CLASS"] = "class";
    ChunkType["METHOD"] = "method";
    ChunkType["FUNCTION"] = "function";
    ChunkType["COMPONENT"] = "component";
    ChunkType["TRIGGER"] = "trigger";
    ChunkType["TEST"] = "test";
    ChunkType["INTERFACE"] = "interface";
    ChunkType["FILE_HEADER"] = "file_header";
})(ChunkType || (exports.ChunkType = ChunkType = {}));
//# sourceMappingURL=types.js.map