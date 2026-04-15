"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarkdownExportFileName = getMarkdownExportFileName;
exports.buildMarkdownHtmlDocument = buildMarkdownHtmlDocument;
exports.buildMarkdownDocxDocumentXml = buildMarkdownDocxDocumentXml;
exports.buildMarkdownPlainText = buildMarkdownPlainText;
exports.renderPdfFromHtml = renderPdfFromHtml;
exports.exportMarkdownArtifact = exportMarkdownArtifact;
var adm_zip_1 = require("adm-zip");
var marked_1 = require("marked");
var appRuntimeConfig_1 = require("./appRuntimeConfig");
var DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
var DOCX_MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
var PDF_MIME_TYPE = "application/pdf";
function escapeXml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function sanitizeFilenamePart(value) {
    return value
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "") || "document";
}
function stripKnownExtension(value) {
    var trimmed = value.trim();
    var match = trimmed.match(/^(.*?)(?:\.[^.]+)?$/);
    return sanitizeFilenamePart((match === null || match === void 0 ? void 0 : match[1]) || trimmed || "document");
}
function getMarkdownExportFileName(title, extension) {
    var base = stripKnownExtension(title || "document");
    return "".concat(base, ".").concat(extension);
}
function renderInlineText(tokens) {
    if (!Array.isArray(tokens)) {
        return "";
    }
    var result = "";
    for (var _i = 0, _a = tokens; _i < _a.length; _i++) {
        var token = _a[_i];
        var type = String((token === null || token === void 0 ? void 0 : token.type) || "");
        if (type === "text" || type === "codespan" || type === "escape") {
            result += String(token.text || token.raw || "");
            continue;
        }
        if (type === "br") {
            result += "\n";
            continue;
        }
        if (type === "link") {
            var text = renderInlineText(token.tokens) || String(token.text || "");
            var href = String(token.href || "").trim();
            if (href && text && href !== text) {
                result += "".concat(text, " (").concat(href, ")");
            }
            else {
                result += text || href;
            }
            continue;
        }
        if (type === "image") {
            result += String(token.text || token.alt || "image");
            continue;
        }
        if (type === "html") {
            result += String(token.raw || token.text || "").replace(/<[^>]+>/g, "");
            continue;
        }
        if (Array.isArray(token.tokens)) {
            result += renderInlineText(token.tokens);
            continue;
        }
        if (typeof token.text === "string") {
            result += token.text;
            continue;
        }
        if (typeof token.raw === "string") {
            result += token.raw;
        }
    }
    return result.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
}
function collectBlocks(tokens) {
    if (!Array.isArray(tokens)) {
        return [];
    }
    var blocks = [];
    var _loop_1 = function (token) {
        var type = String((token === null || token === void 0 ? void 0 : token.type) || "");
        if (!type || type === "space" || type === "def") {
            return "continue";
        }
        if (type === "heading") {
            blocks.push({
                kind: "heading",
                level: Number(token.depth || 1),
                text: renderInlineText(token.tokens) || String(token.text || ""),
            });
            return "continue";
        }
        if (type === "paragraph") {
            var text_1 = renderInlineText(token.tokens) || String(token.text || "");
            if (text_1.trim()) {
                blocks.push({ kind: "paragraph", text: text_1.trim() });
            }
            return "continue";
        }
        if (type === "blockquote") {
            var text_2 = renderInlineText(token.tokens) || String(token.text || "");
            if (text_2.trim()) {
                blocks.push({ kind: "quote", text: text_2.trim() });
            }
            return "continue";
        }
        if (type === "code") {
            var text_3 = String(token.text || "");
            if (text_3.trim() || text_3 === "") {
                blocks.push({ kind: "code", text: text_3 });
            }
            return "continue";
        }
        if (type === "list") {
            var ordered_1 = Boolean(token.ordered);
            var start_1 = Number(token.start || 1) || 1;
            var items = Array.isArray(token.items) ? token.items : [];
            items.forEach(function (item, index) {
                var text = renderInlineText(item === null || item === void 0 ? void 0 : item.tokens) || String((item === null || item === void 0 ? void 0 : item.text) || "");
                if (text.trim()) {
                    blocks.push({
                        kind: "list-item",
                        text: text.trim(),
                        ordered: ordered_1,
                        index: start_1 + index,
                    });
                }
            });
            return "continue";
        }
        if (type === "table") {
            var rows = [];
            var header = Array.isArray(token.header) ? token.header : [];
            var bodyRows = Array.isArray(token.rows) ? token.rows : [];
            var headerText = header
                .map(function (cell) { return renderInlineText(cell === null || cell === void 0 ? void 0 : cell.tokens) || String((cell === null || cell === void 0 ? void 0 : cell.text) || ""); })
                .map(function (text) { return text.trim(); })
                .filter(Boolean)
                .join(" | ");
            if (headerText) {
                rows.push(headerText);
            }
            for (var _b = 0, _c = bodyRows; _b < _c.length; _b++) {
                var row = _c[_b];
                var rowText = Array.isArray(row)
                    ? row
                        .map(function (cell) { return renderInlineText(cell === null || cell === void 0 ? void 0 : cell.tokens) || String((cell === null || cell === void 0 ? void 0 : cell.text) || ""); })
                        .map(function (text) { return text.trim(); })
                        .filter(Boolean)
                        .join(" | ")
                    : "";
                if (rowText) {
                    rows.push(rowText);
                }
            }
            if (rows.length > 0) {
                blocks.push({ kind: "table", rows: rows });
            }
            return "continue";
        }
        if (type === "hr") {
            blocks.push({ kind: "rule" });
            return "continue";
        }
        if (Array.isArray(token.tokens)) {
            blocks.push.apply(blocks, collectBlocks(token.tokens));
            return "continue";
        }
        var text = renderInlineText(token.tokens) || String(token.text || token.raw || "");
        if (text.trim()) {
            blocks.push({ kind: "paragraph", text: text.trim() });
        }
    };
    for (var _i = 0, _a = tokens; _i < _a.length; _i++) {
        var token = _a[_i];
        _loop_1(token);
    }
    return blocks;
}
function extractMarkdownBlocks(markdown) {
    var tokens = marked_1.marked.lexer(markdown, { gfm: true });
    return collectBlocks(tokens);
}
function buildMarkdownHtmlDocument(markdown) {
    var rendered = marked_1.marked.parse(markdown, { async: false });
    return "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>Markdown Export</title>\n  <style>\n    :root { color-scheme: light; }\n    body {\n      margin: 0;\n      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n      color: #0f172a;\n      background: #f8fafc;\n      line-height: 1.7;\n    }\n    main {\n      max-width: 840px;\n      margin: 0 auto;\n      padding: 40px 24px 56px;\n      background: white;\n      min-height: 100vh;\n      box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.12);\n    }\n    h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.25em 0 0.6em; }\n    p, ul, ol, blockquote, pre, table { margin: 0 0 1rem; }\n    pre {\n      overflow: auto;\n      padding: 1rem;\n      border-radius: 0.75rem;\n      background: #0f172a;\n      color: #e2e8f0;\n    }\n    code {\n      font-family: \"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace;\n      font-size: 0.95em;\n    }\n    pre code { color: inherit; }\n    blockquote {\n      padding: 0.75rem 1rem;\n      border-left: 4px solid #cbd5e1;\n      background: #f8fafc;\n      color: #334155;\n    }\n    table {\n      width: 100%;\n      border-collapse: collapse;\n    }\n    th, td {\n      border: 1px solid #e2e8f0;\n      padding: 0.5rem 0.65rem;\n      text-align: left;\n      vertical-align: top;\n    }\n    img { max-width: 100%; height: auto; }\n    a { color: #0369a1; }\n  </style>\n</head>\n<body>\n  <main>\n    ".concat(rendered, "\n  </main>\n</body>\n</html>");
}
function renderDocxParagraph(block) {
    if (block.kind === "rule") {
        return "<w:p><w:r><w:rPr><w:i/></w:rPr><w:t xml:space=\"preserve\">---</w:t></w:r></w:p>";
    }
    if (block.kind === "code") {
        return block.text
            .replace(/\r\n/g, "\n")
            .split("\n")
            .map(function (line) { return "<w:p><w:r><w:rPr><w:rFonts w:ascii=\"Courier New\" w:hAnsi=\"Courier New\" w:cs=\"Courier New\"/><w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/></w:rPr><w:t xml:space=\"preserve\">".concat(escapeXml(line.length > 0 ? line : " "), "</w:t></w:r></w:p>"); })
            .join("");
    }
    if (block.kind === "heading") {
        var sizeMap = { 1: 32, 2: 28, 3: 26, 4: 24, 5: 22, 6: 20 };
        return "<w:p><w:pPr><w:spacing w:after=\"120\"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val=\"".concat(sizeMap[block.level] || 24, "\"/><w:szCs w:val=\"").concat(sizeMap[block.level] || 24, "\"/></w:rPr><w:t xml:space=\"preserve\">").concat(escapeXml(block.text), "</w:t></w:r></w:p>");
    }
    if (block.kind === "quote") {
        return "<w:p><w:pPr><w:ind w:left=\"720\"/><w:spacing w:after=\"120\"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space=\"preserve\">".concat(escapeXml("> ".concat(block.text)), "</w:t></w:r></w:p>");
    }
    if (block.kind === "list-item") {
        var prefix = block.ordered ? "".concat(block.index, ". ") : "- ";
        return "<w:p><w:pPr><w:spacing w:after=\"120\"/></w:pPr><w:r><w:t xml:space=\"preserve\">".concat(escapeXml(prefix + block.text), "</w:t></w:r></w:p>");
    }
    if (block.kind === "table") {
        return block.rows
            .map(function (row) { return "<w:p><w:pPr><w:spacing w:after=\"120\"/></w:pPr><w:r><w:t xml:space=\"preserve\">".concat(escapeXml(row), "</w:t></w:r></w:p>"); })
            .join("");
    }
    return "<w:p><w:pPr><w:spacing w:after=\"120\"/></w:pPr><w:r><w:t xml:space=\"preserve\">".concat(escapeXml(block.text), "</w:t></w:r></w:p>");
}
function buildMarkdownDocxDocumentXml(markdown) {
    var blocks = extractMarkdownBlocks(markdown);
    var body = blocks.map(function (block) { return renderDocxParagraph(block); }).join("");
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\n  <w:body>\n    ".concat(body, "\n    <w:sectPr>\n      <w:pgSz w:w=\"12240\" w:h=\"15840\"/>\n      <w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/>\n    </w:sectPr>\n  </w:body>\n</w:document>");
}
function buildMarkdownDocxPackage(markdown) {
    var documentXml = buildMarkdownDocxDocumentXml(markdown);
    var zip = new adm_zip_1.default();
    zip.addFile("[Content_Types].xml", Buffer.from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n  <Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n  <Default Extension=\"xml\" ContentType=\"application/xml\"/>\n  <Override PartName=\"/word/document.xml\" ContentType=\"".concat(DOCX_MAIN_CONTENT_TYPE, "\"/>\n</Types>"), "utf8"));
    zip.addFile("_rels/.rels", Buffer.from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n  <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>\n</Relationships>", "utf8"));
    zip.addFile("word/document.xml", Buffer.from(documentXml, "utf8"));
    return zip.toBuffer();
}
function buildMarkdownPlainText(markdown) {
    var blocks = extractMarkdownBlocks(markdown);
    var lines = [];
    for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
        var block = blocks_1[_i];
        if (block.kind === "heading") {
            lines.push("".concat("#".repeat(Math.max(block.level, 1)), " ").concat(block.text));
            lines.push("");
            continue;
        }
        if (block.kind === "quote") {
            lines.push("> ".concat(block.text));
            lines.push("");
            continue;
        }
        if (block.kind === "list-item") {
            var prefix = block.ordered ? "".concat(block.index, ". ") : "- ";
            lines.push("".concat(prefix).concat(block.text));
            lines.push("");
            continue;
        }
        if (block.kind === "code") {
            lines.push("```");
            lines.push(block.text);
            lines.push("```");
            lines.push("");
            continue;
        }
        if (block.kind === "table") {
            lines.push.apply(lines, block.rows);
            lines.push("");
            continue;
        }
        if (block.kind === "rule") {
            lines.push("---");
            lines.push("");
            continue;
        }
        lines.push(block.text);
        lines.push("");
    }
    return "".concat(lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd(), "\n");
}
function renderPdfFromHtml(html) {
    return __awaiter(this, void 0, void 0, function () {
        var runtime, pythonBackendUrl, proxyToken, response, arrayBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 1:
                    runtime = _a.sent();
                    pythonBackendUrl = runtime.pythonBackendUrl;
                    proxyToken = runtime.proxyToken;
                    if (!proxyToken) {
                        throw new Error("SMARTSPEC proxy token is not configured");
                    }
                    return [4 /*yield*/, fetch("".concat(pythonBackendUrl, "/api/internal/library/render-pdf"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-proxy-token": proxyToken,
                            },
                            body: JSON.stringify({ html: html }),
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("PDF render failed with status ".concat(response.status));
                    }
                    return [4 /*yield*/, response.arrayBuffer()];
                case 3:
                    arrayBuffer = _a.sent();
                    return [2 /*return*/, Buffer.from(arrayBuffer)];
            }
        });
    });
}
function buildMarkdownPdfHtml(markdown, title) {
    var safeTitle = escapeHtml(title || "Markdown Export");
    var rendered = marked_1.marked.parse(markdown, { async: false });
    return "<!doctype html>\n<html lang=\"th\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>".concat(safeTitle, "</title>\n  <style>\n    @page { size: A4; margin: 18mm 16mm; }\n    body {\n      margin: 0;\n      color: #111827;\n      font-family: \"Inter\", \"Segoe UI\", Arial, sans-serif;\n      font-size: 12pt;\n      line-height: 1.6;\n      -webkit-print-color-adjust: exact;\n      print-color-adjust: exact;\n    }\n    main {\n      max-width: 840px;\n      margin: 0 auto;\n    }\n    h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin: 1.1em 0 0.5em; }\n    p, ul, ol, blockquote, pre, table { margin: 0 0 0.9em; }\n    pre {\n      white-space: pre-wrap;\n      word-break: break-word;\n      padding: 0.9em 1em;\n      border: 1px solid #dbe4f0;\n      border-radius: 10px;\n      background: #f8fafc;\n      font-family: \"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace;\n      font-size: 11pt;\n    }\n    code {\n      font-family: \"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace;\n      font-size: 0.95em;\n    }\n    blockquote {\n      padding: 0.7em 1em;\n      border-left: 4px solid #cbd5e1;\n      background: #f8fafc;\n      color: #334155;\n    }\n    table { width: 100%; border-collapse: collapse; }\n    th, td {\n      border: 1px solid #e2e8f0;\n      padding: 0.45em 0.6em;\n      text-align: left;\n      vertical-align: top;\n    }\n    a { color: #0f766e; word-break: break-word; }\n    img { max-width: 100%; height: auto; }\n  </style>\n</head>\n<body>\n  <main>\n    ").concat(rendered, "\n  </main>\n</body>\n</html>");
}
function exportMarkdownArtifact(params) {
    return __awaiter(this, void 0, void 0, function () {
        var fileName, html, text, bytes, printableHtml, pdfBytes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fileName = getMarkdownExportFileName(params.title, params.format === "txt" ? "txt" : params.format);
                    if (params.format === "html") {
                        html = buildMarkdownHtmlDocument(params.markdown);
                        return [2 /*return*/, {
                                fileName: fileName,
                                mimeType: "text/html;charset=utf-8",
                                dataBase64: Buffer.from(html, "utf8").toString("base64"),
                            }];
                    }
                    if (params.format === "txt") {
                        text = buildMarkdownPlainText(params.markdown);
                        return [2 /*return*/, {
                                fileName: fileName,
                                mimeType: "text/plain;charset=utf-8",
                                dataBase64: Buffer.from(text, "utf8").toString("base64"),
                            }];
                    }
                    if (params.format === "docx") {
                        bytes = buildMarkdownDocxPackage(params.markdown);
                        return [2 /*return*/, {
                                fileName: fileName,
                                mimeType: DOCX_MIME_TYPE,
                                dataBase64: bytes.toString("base64"),
                            }];
                    }
                    printableHtml = buildMarkdownPdfHtml(params.markdown, params.title);
                    return [4 /*yield*/, renderPdfFromHtml(printableHtml)];
                case 1:
                    pdfBytes = _a.sent();
                    return [2 /*return*/, {
                            fileName: fileName,
                            mimeType: PDF_MIME_TYPE,
                            dataBase64: pdfBytes.toString("base64"),
                        }];
            }
        });
    });
}
