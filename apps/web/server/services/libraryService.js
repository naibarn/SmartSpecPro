"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibraryMarkdownVersionConflictError = exports.LibraryUrlValidationError = void 0;
exports.normalizeLibraryMetadata = normalizeLibraryMetadata;
exports.resolveLibraryVectorIndexName = resolveLibraryVectorIndexName;
exports.collectLibraryVectorCleanupTargets = collectLibraryVectorCleanupTargets;
exports.cleanupLibraryVectorArtifacts = cleanupLibraryVectorArtifacts;
exports.getUserEffectivePermission = getUserEffectivePermission;
exports.canReadLibraryItem = canReadLibraryItem;
exports.canManageLibraryItem = canManageLibraryItem;
exports.getLibraryGalleryPublicationState = getLibraryGalleryPublicationState;
exports.publishLibraryItemToGallery = publishLibraryItemToGallery;
exports.unpublishLibraryItemFromGallery = unpublishLibraryItemFromGallery;
exports.createLibraryItem = createLibraryItem;
exports.createVirtualDriveReference = createVirtualDriveReference;
exports.uploadLibraryFile = uploadLibraryFile;
exports.replaceLibraryFile = replaceLibraryFile;
exports.getLibraryItemById = getLibraryItemById;
exports.getLibraryUploadStatuses = getLibraryUploadStatuses;
exports.updateLibraryItem = updateLibraryItem;
exports.softDeleteLibraryItem = softDeleteLibraryItem;
exports.shareLibraryItem = shareLibraryItem;
exports.getPublicShareLinkState = getPublicShareLinkState;
exports.createPublicShareLink = createPublicShareLink;
exports.revokePublicShareLink = revokePublicShareLink;
exports.resolvePublicShareLink = resolvePublicShareLink;
exports.enqueueLibraryIndexJob = enqueueLibraryIndexJob;
exports.safeEnqueueLibraryIndexJob = safeEnqueueLibraryIndexJob;
exports.listLibraryDocuments = listLibraryDocuments;
exports.getLibraryMarkdownContent = getLibraryMarkdownContent;
exports.saveLibraryMarkdown = saveLibraryMarkdown;
exports.getContentVersionHistory = getContentVersionHistory;
exports.getContentVersionById = getContentVersionById;
exports.getVersionSnapshotDownloadUrl = getVersionSnapshotDownloadUrl;
exports.restoreContentVersion = restoreContentVersion;
exports.searchLibraryItems = searchLibraryItems;
exports.removeLibraryShare = removeLibraryShare;
exports.updateLibrarySharePermission = updateLibrarySharePermission;
exports.getLibraryItemShares = getLibraryItemShares;
exports.listLibraryTrash = listLibraryTrash;
exports.restoreFromLibraryTrash = restoreFromLibraryTrash;
exports.cascadeDeleteLibraryItem = cascadeDeleteLibraryItem;
exports.permanentDeleteLibraryItem = permanentDeleteLibraryItem;
exports.removeGoogleDriveData = removeGoogleDriveData;
exports.findOwnedLibraryFolderByName = findOwnedLibraryFolderByName;
exports.createLibraryFolder = createLibraryFolder;
exports.ensureOwnedLibraryFolder = ensureOwnedLibraryFolder;
exports.getLibraryFolderChildCount = getLibraryFolderChildCount;
exports.getLibraryFolderAncestors = getLibraryFolderAncestors;
exports.batchSoftDeleteLibraryItems = batchSoftDeleteLibraryItems;
exports.shareLibraryToGroup = shareLibraryToGroup;
var crypto_1 = require("crypto");
var server_1 = require("@trpc/server");
var drizzle_orm_1 = require("drizzle-orm");
var logger_1 = require("../_core/logger");
var db_1 = require("../db");
var appRuntimeConfig_1 = require("./appRuntimeConfig");
var storage_1 = require("../storage");
var crypto_2 = require("./crypto");
var libraryUrlPolicy_1 = require("./libraryUrlPolicy");
var libraryIndexJobContract_1 = require("./libraryIndexJobContract");
var mediaPromptNormalization_1 = require("./mediaPromptNormalization");
var uploadContentSafety_1 = require("./uploadContentSafety");
var schema_1 = require("../../drizzle/schema");
var groupsService_1 = require("./groupsService");
var creditService_1 = require("./creditService");
var documentOcrSettings_1 = require("./documentOcrSettings");
var financeOcrDebug_1 = require("./financeOcrDebug");
var libraryUploadPipeline_1 = require("./libraryUploadPipeline");
var tenantFeatureFlagService_1 = require("./tenantFeatureFlagService");
var traceContext_1 = require("./traceContext");
var vectorProvider_1 = require("./vectorProvider");
var LibraryUrlValidationError = /** @class */ (function (_super) {
    __extends(LibraryUrlValidationError, _super);
    function LibraryUrlValidationError(field, reason, clientMessage) {
        var _this = _super.call(this, clientMessage) || this;
        _this.name = "LibraryUrlValidationError";
        _this.field = field;
        _this.reason = reason;
        _this.clientMessage = clientMessage;
        return _this;
    }
    return LibraryUrlValidationError;
}(Error));
exports.LibraryUrlValidationError = LibraryUrlValidationError;
var DEFAULT_LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS = 1500;
var DEFAULT_LIBRARY_PGVECTOR_CANDIDATE_LIMIT = 1000;
var MAX_LIBRARY_PGVECTOR_QUERY_LENGTH = 2000;
function parseBoundedIntegerEnv(params) {
    var raw = process.env[params.name];
    if (!raw)
        return params.fallback;
    var parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed))
        return params.fallback;
    return Math.min(Math.max(parsed, params.min), params.max);
}
var LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS = parseBoundedIntegerEnv({
    name: "LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS",
    fallback: DEFAULT_LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS,
    min: 100,
    max: 10000,
});
var LIBRARY_PGVECTOR_CANDIDATE_LIMIT = parseBoundedIntegerEnv({
    name: "LIBRARY_PGVECTOR_CANDIDATE_LIMIT",
    fallback: DEFAULT_LIBRARY_PGVECTOR_CANDIDATE_LIMIT,
    min: 1,
    max: 5000,
});
function fetchPgvectorLibraryScores(params) {
    return __awaiter(this, void 0, void 0, function () {
        var runtime, proxyToken, controller_1, timeoutHandle, response, payload, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!params.query.trim() || params.itemIds.length === 0) {
                        return [2 /*return*/, new Map()];
                    }
                    return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 1:
                    runtime = _a.sent();
                    proxyToken = runtime.proxyToken;
                    if (!proxyToken) {
                        return [2 /*return*/, null];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 8, , 9]);
                    controller_1 = new AbortController();
                    timeoutHandle = setTimeout(function () { return controller_1.abort(); }, LIBRARY_PGVECTOR_SEARCH_TIMEOUT_MS);
                    response = void 0;
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, , 5, 6]);
                    return [4 /*yield*/, fetch("".concat(runtime.pythonBackendUrl, "/api/internal/library/search"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-proxy-token": proxyToken,
                            },
                            body: JSON.stringify({
                                tenant_id: params.tenantId,
                                query: params.query.slice(0, MAX_LIBRARY_PGVECTOR_QUERY_LENGTH),
                                candidate_item_ids: params.itemIds.slice(0, LIBRARY_PGVECTOR_CANDIDATE_LIMIT),
                            }),
                            signal: controller_1.signal,
                        })];
                case 4:
                    response = _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    clearTimeout(timeoutHandle);
                    return [7 /*endfinally*/];
                case 6:
                    if (!response.ok) {
                        console.warn("[library.search] pgvector native search failed:", response.status);
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, response.json()];
                case 7:
                    payload = (_a.sent());
                    return [2 /*return*/, new Map((payload.results || []).map(function (row) { return [Number(row.item_id), Number(row.vector_score) || 0]; }))];
                case 8:
                    error_1 = _a.sent();
                    if (error_1 instanceof Error && error_1.name === "AbortError") {
                        console.warn("[library.search] pgvector native search timed out");
                        return [2 /*return*/, null];
                    }
                    console.warn("[library.search] pgvector native search error:", error_1);
                    return [2 /*return*/, null];
                case 9: return [2 /*return*/];
            }
        });
    });
}
var PUBLIC_SHARE_TOKEN_BYTES = 32;
var PUBLIC_SHARE_DEFAULT_TTL_DAYS = 7;
function normalizeLibraryTenantId(tenantId) {
    var normalized = String(tenantId).trim();
    if (!normalized) {
        throw new Error("Invalid tenant ID");
    }
    return normalized;
}
function hashPublicShareToken(token) {
    return crypto_1.default.createHash("sha256").update(token).digest("hex");
}
function isPublicShareLinkActive(row) {
    if (row.revokedAt) {
        return false;
    }
    if (!row.expiresAt) {
        return true;
    }
    return row.expiresAt > new Date();
}
function serializePublicShareLink(row) {
    var _a, _b;
    var token = (0, crypto_2.decrypt)(row.tokenEncrypted);
    return {
        id: row.id,
        itemId: row.libraryItemId,
        token: token,
        expiresAt: (_a = row.expiresAt) !== null && _a !== void 0 ? _a : null,
        revokedAt: (_b = row.revokedAt) !== null && _b !== void 0 ? _b : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function getActivePublicShareLinkRow(db, itemId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.libraryPublicShareLinks)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPublicShareLinks.tenantId, tenantId), (0, drizzle_orm_1.eq)(schema_1.libraryPublicShareLinks.libraryItemId, itemId), (0, drizzle_orm_1.isNull)(schema_1.libraryPublicShareLinks.revokedAt), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.libraryPublicShareLinks.expiresAt), (0, drizzle_orm_1.gt)(schema_1.libraryPublicShareLinks.expiresAt, new Date()))))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.libraryPublicShareLinks.createdAt))
                        .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function getPublicShareOwnerUserId(item) {
    var metadata = normalizeLibraryMetadata(item.metadata);
    var candidates = [
        metadata.uploaded_by_user_id,
        metadata.uploadedByUserId,
        metadata.created_by_user_id,
        metadata.createdByUserId,
        metadata.owner_user_id,
        metadata.ownerUserId,
    ];
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var candidate = candidates_1[_i];
        if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
            return candidate;
        }
        if (typeof candidate === "string" && candidate.trim()) {
            var parsed = Number(candidate);
            if (Number.isFinite(parsed) && parsed > 0) {
                return parsed;
            }
        }
    }
    return item.ownerUserId;
}
function assertCanManagePublicShare(item, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, permissionLevel;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId)) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "You do not have access to this item",
                        });
                    }
                    if (isPrivateVaultLibraryItem(item)) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Private vault items cannot be shared publicly",
                        });
                    }
                    if (getPublicShareOwnerUserId(item) === actor.userId) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, getUserPermissionLevel(db, item.id, actor)];
                case 2:
                    permissionLevel = _a.sent();
                    if (!canManageLibraryItem(item, actor, permissionLevel)) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Only users who can manage this file can create public share links",
                        });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function resolvePublicShareDownloadUrl(item) {
    return __awaiter(this, void 0, void 0, function () {
        var metadata, sourceKey, resolved, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    metadata = normalizeLibraryMetadata(item.metadata);
                    sourceKey = typeof metadata.source_key === "string" ? metadata.source_key : null;
                    if (!sourceKey) return [3 /*break*/, 4];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, storage_1.storageGet)(sourceKey)];
                case 2:
                    resolved = _c.sent();
                    if (resolved.url) {
                        return [2 /*return*/, resolved.url];
                    }
                    return [3 /*break*/, 4];
                case 3:
                    _a = _c.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, (_b = item.sourceUrl) !== null && _b !== void 0 ? _b : null];
            }
        });
    });
}
function isPrivateVaultLibraryItem(item) {
    var metadata = normalizeLibraryMetadata(item.metadata);
    return metadata.private_vault === true || metadata.privateVault === true || metadata.vault === true;
}
function isPrivateVaultMetadata(metadata) {
    var normalized = normalizeLibraryMetadata(metadata);
    return normalized.private_vault === true || normalized.privateVault === true || normalized.vault === true;
}
function hasPrivateVaultAccess(actor) {
    return actor.privateVaultUnlocked === true;
}
function getLibraryQueueBackpressureState() {
    var enabled = ["1", "true", "yes", "on"].includes((process.env.LIBRARY_INDEX_BACKPRESSURE_ENABLED || "").toLowerCase());
    var currentQueueLagMinutes = Number(process.env.LIBRARY_INDEX_QUEUE_LAG_MINUTES || "0");
    var maxQueueLagMinutes = Number(process.env.LIBRARY_INDEX_MAX_QUEUE_LAG_MINUTES || "15");
    return {
        enabled: enabled,
        currentQueueLagMinutes: currentQueueLagMinutes,
        maxQueueLagMinutes: maxQueueLagMinutes,
    };
}
function validateLibraryItemUrlField(field, value) {
    if (value === undefined || value === null) {
        return null;
    }
    var context = field === "sourceUrl" ? "library_source_url" : "library_thumbnail_url";
    var result = (0, libraryUrlPolicy_1.validateLibraryUrl)(value, context);
    if (!result.ok) {
        throw new LibraryUrlValidationError(field, result.reason, "Invalid ".concat(field, ": ").concat(result.message));
    }
    return result.normalizedUrl;
}
function toLibraryItemDto(row) {
    var _a;
    return {
        id: row.id,
        tenantId: row.tenantId,
        ownerUserId: row.ownerUserId,
        projectId: (_a = row.projectId) !== null && _a !== void 0 ? _a : null,
        itemType: row.itemType,
        source: row.source,
        title: row.title,
        description: row.description,
        status: row.status,
        visibility: row.visibility,
        metadata: normalizeLibraryMetadata(row.metadata),
        sourceUrl: row.sourceUrl,
        thumbnailUrl: row.thumbnailUrl,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function resolveDb(dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (dbClient) {
                        return [2 /*return*/, dbClient];
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [2 /*return*/, db];
            }
        });
    });
}
var MAX_LIBRARY_UPLOAD_BYTES = 50 * 1024 * 1024;
var ALLOWED_LIBRARY_UPLOAD_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp",
    "mp4", "webm", "mov", "avi", "mkv",
    "mp3", "wav", "m4a", "ogg", "aac",
    "pdf",
    "txt", "md", "markdown", "csv", "json", "html", "htm", "xml",
    "doc", "docx", "ppt", "pptx", "xls", "xlsx",
    "zip", "rar", "7z",
]);
var ALLOWED_LIBRARY_UPLOAD_MIME_PREFIXES = [
    "image/",
    "video/",
    "audio/",
    "text/",
];
var ALLOWED_LIBRARY_UPLOAD_MIME_TYPES = new Set([
    "application/pdf",
    "application/json",
    "application/xml",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.rar",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
]);
var TEXT_LIKE_LIBRARY_UPLOAD_EXTENSIONS = new Set([
    "txt", "md", "markdown", "csv", "json", "xml", "html", "htm",
    "js", "jsx", "ts", "tsx", "css", "scss", "less",
    "py", "rb", "java", "c", "cpp", "cs", "go", "rs",
    "sql", "sh", "yaml", "yml", "toml", "ini",
]);
function extractFileExtension(fileName) {
    var ext = fileName.split(".").pop() || "";
    return ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}
function inferLibraryItemType(fileType, extension) {
    var normalizedFileType = fileType.toLowerCase();
    if (normalizedFileType.startsWith("image/"))
        return "image";
    if (normalizedFileType.startsWith("video/"))
        return "video";
    if (normalizedFileType.startsWith("audio/"))
        return "audio";
    if (extension === "md" || extension === "markdown")
        return "md";
    if (extension === "pdf" ||
        extension === "doc" ||
        extension === "docx" ||
        extension === "ppt" ||
        extension === "pptx" ||
        extension === "xls" ||
        extension === "xlsx") {
        return "document";
    }
    if (normalizedFileType.startsWith("text/") ||
        extension === "txt" ||
        extension === "csv" ||
        extension === "json" ||
        extension === "xml" ||
        extension === "html" ||
        extension === "htm") {
        return "text";
    }
    return "file";
}
function isMarkdownLibraryUpload(extension) {
    return extension === "md" || extension === "markdown";
}
function extractTextLikeUploadContent(fileBuffer, fileType, extension) {
    var normalizedFileType = fileType.toLowerCase();
    var isTextLikeMime = normalizedFileType.startsWith("text/")
        || normalizedFileType === "application/json"
        || normalizedFileType === "application/xml";
    var isTextLikeExtension = TEXT_LIKE_LIBRARY_UPLOAD_EXTENSIONS.has(extension);
    if (!isTextLikeMime && !isTextLikeExtension) {
        return null;
    }
    var text = fileBuffer.toString("utf8").replace(/\r\n/g, "\n").trim();
    return text.length > 0 ? text : null;
}
function extractTextLikeUploadMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") {
        return null;
    }
    var candidates = [
        metadata.extracted_text,
        metadata.ocr_text,
        metadata.text,
        metadata.full_text,
    ];
    for (var _i = 0, candidates_2 = candidates; _i < candidates_2.length; _i++) {
        var candidate = candidates_2[_i];
        if (typeof candidate === "string") {
            var trimmed = candidate.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return null;
}
function upsertLibrarySourceTextChunk(db, params) {
    return __awaiter(this, void 0, void 0, function () {
        var resolvedProjectId, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!((_b = params.projectId) !== null && _b !== void 0)) return [3 /*break*/, 1];
                    _a = _b;
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, resolveLibraryItemProjectId(db, params.libraryItemId, params.tenantId)];
                case 2:
                    _a = _c.sent();
                    _c.label = 3;
                case 3:
                    resolvedProjectId = _a;
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryChunks)
                            .values({
                            tenantId: params.tenantId,
                            libraryItemId: params.libraryItemId,
                            projectId: resolvedProjectId !== null && resolvedProjectId !== void 0 ? resolvedProjectId : null,
                            chunkIndex: 0,
                            content: params.content,
                            contentType: "markdown_source",
                            tokenCount: null,
                            vectorRefId: null,
                            vectorIndexName: resolveLibraryVectorIndexName(),
                            metadata: {
                                source: params.source,
                            },
                            createdAt: new Date(),
                        })
                            .onConflictDoUpdate({
                            target: [schema_1.libraryChunks.libraryItemId, schema_1.libraryChunks.chunkIndex],
                            set: {
                                projectId: resolvedProjectId !== null && resolvedProjectId !== void 0 ? resolvedProjectId : null,
                                content: params.content,
                                contentType: "markdown_source",
                                tokenCount: null,
                                vectorRefId: null,
                                vectorIndexName: resolveLibraryVectorIndexName(),
                                metadata: {
                                    source: params.source,
                                },
                            },
                        })];
                case 4:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function isAllowedLibraryUploadMime(fileType) {
    var normalizedFileType = fileType.toLowerCase();
    if (ALLOWED_LIBRARY_UPLOAD_MIME_TYPES.has(normalizedFileType))
        return true;
    return ALLOWED_LIBRARY_UPLOAD_MIME_PREFIXES.some(function (prefix) { return normalizedFileType.startsWith(prefix); });
}
function normalizeTagList(value) {
    var asArray = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(",")
            : [];
    var unique = new Set();
    for (var _i = 0, asArray_1 = asArray; _i < asArray_1.length; _i++) {
        var entry = asArray_1[_i];
        if (typeof entry !== "string")
            continue;
        var normalized = entry.trim();
        if (normalized) {
            unique.add(normalized);
        }
    }
    return Array.from(unique);
}
function normalizeLibraryMetadata(metadata) {
    if (!metadata || Array.isArray(metadata)) {
        return {};
    }
    var output = {};
    for (var _i = 0, _a = Object.keys(metadata).sort(); _i < _a.length; _i++) {
        var key = _a[_i];
        var value = metadata[key];
        if (value === undefined || value === null) {
            continue;
        }
        if (key === "tags") {
            output.tags = normalizeTagList(value);
            continue;
        }
        if (key === "prompt" && typeof value === "string") {
            var normalizedPrompt = (0, mediaPromptNormalization_1.normalizeMediaPrompt)(value);
            if (normalizedPrompt.length > 0) {
                output.prompt = normalizedPrompt;
            }
            continue;
        }
        if (typeof value === "string") {
            var trimmed = value.trim();
            if (trimmed.length > 0) {
                output[key] = trimmed;
            }
            continue;
        }
        if (typeof value === "number" || typeof value === "boolean") {
            output[key] = value;
            continue;
        }
        if (Array.isArray(value)) {
            output[key] = value;
            continue;
        }
        if (typeof value === "object") {
            output[key] = value;
        }
    }
    return output;
}
function buildLibraryUploadMetadata(baseMetadata, uploadFields) {
    var _a, _b, _c, _d;
    var pipeline = (0, libraryUploadPipeline_1.buildUploadPipelineState)(uploadFields.stage, {
        checksumSha256: uploadFields.checksumSha256,
        extractor: uploadFields.extractor,
        searchQuality: uploadFields.searchQuality,
        parseError: (_a = uploadFields.parseError) !== null && _a !== void 0 ? _a : null,
        warnings: (_b = uploadFields.warnings) !== null && _b !== void 0 ? _b : [],
        stageMessage: uploadFields.stageMessage,
    });
    return normalizeLibraryMetadata(__assign(__assign(__assign({}, (baseMetadata || {})), { file_name: uploadFields.fileName, file_type: uploadFields.fileType, extension: uploadFields.extension || null, file_size_bytes: uploadFields.fileSizeBytes, source_type: "document_upload", extracted_text: uploadFields.extractedText || undefined, extraction_method: uploadFields.extractor || undefined, content_checksum_sha256: uploadFields.checksumSha256, search_quality: uploadFields.searchQuality, upload_pipeline: pipeline, upload_pipeline_updated_at: pipeline.updatedAt, parse_error: uploadFields.parseError || undefined, parse_warnings: ((_c = uploadFields.warnings) === null || _c === void 0 ? void 0 : _c.length) ? uploadFields.warnings : undefined, duplicate_of_item_id: (_d = uploadFields.duplicateOfItemId) !== null && _d !== void 0 ? _d : undefined, svg_sanitized: uploadFields.svgSanitized || undefined }), (uploadFields.extraMetadata || {})));
}
function buildOcrChargePlan(params) {
    return __awaiter(this, void 0, void 0, function () {
        var settings, fileClass, provider, creditsPerUnit, pageCount, amount, billingUnit, unitCount, description;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(0, documentOcrSettings_1.isOcrExtractor)(params.extractor))
                        return [2 /*return*/, null];
                    return [4 /*yield*/, (0, documentOcrSettings_1.getDocumentOcrSettings)()];
                case 1:
                    settings = _b.sent();
                    fileClass = (0, documentOcrSettings_1.classifyOcrFileClass)({
                        mimeType: params.mimeType,
                        fileName: params.fileName,
                    });
                    provider = (0, documentOcrSettings_1.resolveOcrProvider)(params.metadata, params.extractor);
                    creditsPerUnit = (0, documentOcrSettings_1.getDocumentOcrCreditsPerUnit)({
                        settings: settings,
                        providerId: provider,
                        fileClass: fileClass,
                    });
                    if (creditsPerUnit <= 0)
                        return [2 /*return*/, null];
                    pageCount = (0, documentOcrSettings_1.resolveOcrPageCount)(params.metadata, params.mimeType);
                    amount = (0, documentOcrSettings_1.calculateOcrCredits)(pageCount, creditsPerUnit);
                    if (amount <= 0)
                        return [2 /*return*/, null];
                    billingUnit = fileClass === "pdf" ? "page" : "image";
                    unitCount = fileClass === "pdf" ? pageCount : 1;
                    description = "OCR (".concat(provider || "document_ocr", "): ").concat(params.fileName, " \u00B7 ").concat(unitCount, " ").concat(billingUnit).concat(unitCount === 1 ? "" : "s");
                    return [2 /*return*/, {
                            amount: amount,
                            pageCount: pageCount,
                            creditsPerUnit: creditsPerUnit,
                            billingUnit: billingUnit,
                            provider: provider,
                            extractor: params.extractor,
                            idempotencyKey: "ocr:".concat(params.source, ":").concat(params.libraryItemId),
                            description: description,
                            metadata: {
                                service: "library.ocr",
                                source: params.source,
                                libraryItemId: params.libraryItemId,
                                fileName: params.fileName,
                                fileType: params.mimeType,
                                fileSizeBytes: params.fileSizeBytes,
                                fileClass: fileClass,
                                pageCount: pageCount,
                                billingUnit: billingUnit,
                                creditsPerUnit: creditsPerUnit,
                                ocrProvider: provider,
                                extractor: params.extractor,
                                traceId: (_a = params.traceId) !== null && _a !== void 0 ? _a : null,
                            },
                        }];
            }
        });
    });
}
function getUploadPipelineMetadata(metadata) {
    if (!metadata || Array.isArray(metadata)) {
        return {};
    }
    var pipeline = metadata.upload_pipeline;
    if (!pipeline || Array.isArray(pipeline) || typeof pipeline !== "object") {
        return {};
    }
    return pipeline;
}
function resolveLibraryItemProjectId(db, libraryItemId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        projectId: schema_1.libraryItems.projectId,
                    })
                        .from(schema_1.libraryItems)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, libraryItemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, tenantId)))
                        .limit(1)];
                case 1:
                    rows = _c.sent();
                    return [2 /*return*/, (_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.projectId) !== null && _b !== void 0 ? _b : null];
            }
        });
    });
}
function normalizeVectorIndexName(value) {
    if (typeof value !== "string") {
        return null;
    }
    var trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function resolveLibraryVectorIndexName() {
    var candidates = [
        process.env.LIBRARY_VECTOR_INDEX_NAME,
        process.env.VECTORIZE_LIBRARY_INDEX,
        process.env.VECTORIZE_DOCS_INDEX,
        "library-index",
    ];
    for (var _i = 0, candidates_3 = candidates; _i < candidates_3.length; _i++) {
        var candidate = candidates_3[_i];
        var normalized = normalizeVectorIndexName(candidate);
        if (normalized) {
            return normalized;
        }
    }
    return "library-index";
}
function resolveProcessingMimeType(declaredMimeType, sniffedMimeType) {
    var normalizedDeclared = declaredMimeType.trim().toLowerCase();
    var normalizedSniffed = typeof sniffedMimeType === "string" ? sniffedMimeType.trim().toLowerCase() : "";
    return normalizedSniffed || normalizedDeclared || "application/octet-stream";
}
function extractVectorIndexNames(metadata) {
    if (!metadata || Array.isArray(metadata)) {
        return [];
    }
    var candidates = [
        metadata.vectorIndexName,
        metadata.vector_index_name,
        metadata.indexName,
        metadata.collectionName,
        metadata.collection_name,
    ];
    var unique = new Set();
    for (var _i = 0, candidates_4 = candidates; _i < candidates_4.length; _i++) {
        var candidate = candidates_4[_i];
        var normalized = normalizeVectorIndexName(candidate);
        if (normalized) {
            unique.add(normalized);
        }
    }
    return Array.from(unique);
}
function getLibraryVectorIndexCandidates() {
    var envCandidates = [
        process.env.LIBRARY_VECTOR_INDEX_NAME,
        process.env.VECTORIZE_LIBRARY_INDEX,
        process.env.VECTORIZE_DOCS_INDEX,
        "library-index",
        "docs-index-prod",
    ];
    var unique = new Set();
    for (var _i = 0, envCandidates_1 = envCandidates; _i < envCandidates_1.length; _i++) {
        var candidate = envCandidates_1[_i];
        var normalized = normalizeVectorIndexName(candidate);
        if (normalized) {
            unique.add(normalized);
        }
    }
    return Array.from(unique);
}
function collectLibraryVectorCleanupTargets(itemIds, tenantId, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, normalizedTenantId, normalizedItemIds, _a, chunkRows, itemRows, vectorRefIds, indexNames, _i, chunkRows_1, row, trimmed, trimmedIndex, _b, _c, indexName, _d, itemRows_1, row, _e, _f, indexName;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _g.sent();
                    normalizedTenantId = normalizeLibraryTenantId(tenantId);
                    normalizedItemIds = Array.isArray(itemIds)
                        ? Array.from(new Set(itemIds.filter(function (value) { return Number.isFinite(value); })))
                        : [itemIds];
                    if (normalizedItemIds.length === 0) {
                        return [2 /*return*/, { vectorRefIds: [], indexNames: [] }];
                    }
                    return [4 /*yield*/, Promise.all([
                            db
                                .select({
                                vectorRefId: schema_1.libraryChunks.vectorRefId,
                                vectorIndexName: schema_1.libraryChunks.vectorIndexName,
                                metadata: schema_1.libraryChunks.metadata,
                            })
                                .from(schema_1.libraryChunks)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryChunks.tenantId, normalizedTenantId), (0, drizzle_orm_1.inArray)(schema_1.libraryChunks.libraryItemId, normalizedItemIds))),
                            db
                                .select({
                                metadata: schema_1.libraryItems.metadata,
                            })
                                .from(schema_1.libraryItems)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, normalizedTenantId), (0, drizzle_orm_1.inArray)(schema_1.libraryItems.id, normalizedItemIds))),
                        ])];
                case 2:
                    _a = _g.sent(), chunkRows = _a[0], itemRows = _a[1];
                    vectorRefIds = new Set();
                    indexNames = new Set();
                    for (_i = 0, chunkRows_1 = chunkRows; _i < chunkRows_1.length; _i++) {
                        row = chunkRows_1[_i];
                        if (typeof row.vectorRefId === "string") {
                            trimmed = row.vectorRefId.trim();
                            if (trimmed) {
                                vectorRefIds.add(trimmed);
                            }
                        }
                        if (typeof row.vectorIndexName === "string") {
                            trimmedIndex = row.vectorIndexName.trim();
                            if (trimmedIndex) {
                                indexNames.add(trimmedIndex);
                            }
                        }
                        for (_b = 0, _c = extractVectorIndexNames(row.metadata); _b < _c.length; _b++) {
                            indexName = _c[_b];
                            indexNames.add(indexName);
                        }
                    }
                    for (_d = 0, itemRows_1 = itemRows; _d < itemRows_1.length; _d++) {
                        row = itemRows_1[_d];
                        for (_e = 0, _f = extractVectorIndexNames(row.metadata); _e < _f.length; _e++) {
                            indexName = _f[_e];
                            indexNames.add(indexName);
                        }
                    }
                    return [2 /*return*/, {
                            vectorRefIds: Array.from(vectorRefIds),
                            indexNames: Array.from(indexNames),
                        }];
            }
        });
    });
}
function cleanupLibraryVectorArtifacts(params) {
    return __awaiter(this, void 0, void 0, function () {
        var vectorRefIds, explicitIndexNames, candidateIndexNames, providerConfig, _a, _i, candidateIndexNames_1, indexName, error_2;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    vectorRefIds = Array.from(new Set(params.vectorRefIds
                        .map(function (value) { return (typeof value === "string" ? value.trim() : ""); })
                        .filter(function (value) { return value.length > 0; })));
                    if (vectorRefIds.length === 0) {
                        return [2 /*return*/];
                    }
                    explicitIndexNames = Array.from(new Set(((_b = params.indexNames) !== null && _b !== void 0 ? _b : [])
                        .map(function (value) { return (typeof value === "string" ? value.trim() : ""); })
                        .filter(function (value) { return value.length > 0; })));
                    candidateIndexNames = explicitIndexNames.length > 0
                        ? explicitIndexNames
                        : getLibraryVectorIndexCandidates();
                    if (candidateIndexNames.length === 0) {
                        return [2 /*return*/];
                    }
                    providerConfig = (0, vectorProvider_1.getVectorProviderConfigFromEnv)();
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, vectorProvider_1.getEffectiveVectorProviderConfig)({
                            tenantId: normalizeLibraryTenantId(params.tenantId),
                        })];
                case 2:
                    providerConfig = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _c.sent();
                    return [3 /*break*/, 4];
                case 4:
                    _i = 0, candidateIndexNames_1 = candidateIndexNames;
                    _c.label = 5;
                case 5:
                    if (!(_i < candidateIndexNames_1.length)) return [3 /*break*/, 10];
                    indexName = candidateIndexNames_1[_i];
                    _c.label = 6;
                case 6:
                    _c.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, (0, vectorProvider_1.dispatchVectorOperation)({
                            operation: "delete",
                            indexName: indexName,
                            ids: vectorRefIds,
                            providerConfig: providerConfig,
                        })];
                case 7:
                    _c.sent();
                    return [3 /*break*/, 9];
                case 8:
                    error_2 = _c.sent();
                    console.warn("[library.delete] Vector cleanup failed for index ".concat(indexName, ":"), error_2 instanceof Error ? error_2.message : String(error_2));
                    return [3 /*break*/, 9];
                case 9:
                    _i++;
                    return [3 /*break*/, 5];
                case 10: return [2 /*return*/];
            }
        });
    });
}
function findDuplicateUploadedLibraryItem(db, params) {
    return __awaiter(this, void 0, void 0, function () {
        var predicates, rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    predicates = [
                        (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, params.tenantId),
                        (0, drizzle_orm_1.eq)(schema_1.libraryItems.ownerUserId, params.userId),
                        (0, drizzle_orm_1.eq)(schema_1.libraryItems.source, "document_upload"),
                        (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt),
                        (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["coalesce(", "->>'content_checksum_sha256', '') = ", ""], ["coalesce(", "->>'content_checksum_sha256', '') = ", ""])), schema_1.libraryItems.metadata, params.checksumSha256),
                    ];
                    if (params.excludeItemId) {
                        predicates.push((0, drizzle_orm_1.ne)(schema_1.libraryItems.id, params.excludeItemId));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryItems)
                            .where(drizzle_orm_1.and.apply(void 0, predicates))
                            .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function tokenize(value) {
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map(function (token) { return token.trim(); })
        .filter(function (token) { return token.length > 1; });
}
function computeTokenOverlapScore(queryTokens, content) {
    if (!queryTokens.length)
        return 0;
    var contentTokens = new Set(tokenize(content));
    if (!contentTokens.size)
        return 0;
    var hits = 0;
    for (var _i = 0, queryTokens_1 = queryTokens; _i < queryTokens_1.length; _i++) {
        var token = queryTokens_1[_i];
        if (contentTokens.has(token))
            hits += 1;
    }
    return hits / queryTokens.length;
}
var ALLOWED_LIBRARY_RECENT_DAYS = new Set([1, 3, 7, 15, 30]);
var DAY_MS = 86400000;
function getRecentCutoffDate(recentDays) {
    if (recentDays === undefined)
        return null;
    if (!ALLOWED_LIBRARY_RECENT_DAYS.has(recentDays))
        return null;
    return new Date(Date.now() - recentDays * DAY_MS);
}
function getLibraryItemLastActivityAt(item) {
    return item.updatedAt > item.createdAt ? item.updatedAt : item.createdAt;
}
function itemMatchesFilters(item, filters) {
    if (!filters)
        return true;
    if (filters.itemType && item.itemType !== filters.itemType)
        return false;
    if (filters.ownerUserId !== undefined && item.ownerUserId !== filters.ownerUserId)
        return false;
    if (filters.projectId !== undefined && item.projectId !== filters.projectId)
        return false;
    if (filters.status && item.status !== filters.status)
        return false;
    if (filters.fromDate && item.createdAt < filters.fromDate)
        return false;
    if (filters.toDate && item.createdAt > filters.toDate)
        return false;
    var recentCutoff = getRecentCutoffDate(filters.recentDays);
    if (recentCutoff && getLibraryItemLastActivityAt(item) < recentCutoff)
        return false;
    var metadata = normalizeLibraryMetadata(item.metadata);
    if (filters.model) {
        var model = typeof metadata.model === "string" ? metadata.model : null;
        var modelName = typeof metadata.model_name === "string" ? metadata.model_name : null;
        if (model !== filters.model && modelName !== filters.model)
            return false;
    }
    if (filters.tags && filters.tags.length > 0) {
        var metadataTags = Array.isArray(metadata.tags) ? metadata.tags.map(function (tag) { return String(tag); }) : [];
        var tagsSet_1 = new Set(metadataTags.map(function (tag) { return tag.toLowerCase(); }));
        var required = filters.tags.map(function (tag) { return tag.toLowerCase(); });
        if (!required.every(function (tag) { return tagsSet_1.has(tag); }))
            return false;
    }
    return true;
}
function rankPermissionLevel(permissionLevel) {
    switch (permissionLevel) {
        case "owner":
            return 4;
        case "delete":
            return 3;
        case "write":
            return 2;
        case "read":
            return 1;
        default:
            return 0;
    }
}
function selectHighestPermissionLevel(permissionLevels) {
    var highest = null;
    var highestRank = 0;
    for (var _i = 0, permissionLevels_1 = permissionLevels; _i < permissionLevels_1.length; _i++) {
        var permissionLevel = permissionLevels_1[_i];
        var rank = rankPermissionLevel(permissionLevel);
        if (rank > highestRank) {
            highestRank = rank;
            highest = permissionLevel;
        }
    }
    return highest;
}
function getPermissionLevelForItem(permissions, itemId, actor, userGroupIds) {
    var now = new Date();
    var relevant = permissions.filter(function (permission) {
        if (permission.libraryItemId !== itemId)
            return false;
        if (permission.expiresAt && permission.expiresAt <= now)
            return false;
        return true;
    });
    if (!relevant.length) {
        return {
            effectivePermissionLevel: null,
            hasDirectShare: false,
            hasTenantRoleShare: false,
            hasGroupShare: false,
        };
    }
    var directMatches = relevant.filter(function (permission) {
        return permission.subjectType === "user" &&
            permission.subjectId === String(actor.userId);
    });
    var tenantRoleMatches = relevant.filter(function (permission) {
        return permission.subjectType === "tenant_role" &&
            Boolean(actor.role) &&
            permission.subjectId === actor.role;
    });
    var groupMatches = (userGroupIds === null || userGroupIds === void 0 ? void 0 : userGroupIds.length)
        ? relevant.filter(function (permission) {
            return permission.subjectType === "group" &&
                userGroupIds.includes(Number(permission.subjectId));
        })
        : [];
    var highest = selectHighestPermissionLevel(__spreadArray(__spreadArray(__spreadArray([], directMatches.map(function (permission) { return permission.permissionLevel; }), true), tenantRoleMatches.map(function (permission) { return permission.permissionLevel; }), true), groupMatches.map(function (permission) { return permission.permissionLevel; }), true));
    return {
        effectivePermissionLevel: highest,
        hasDirectShare: directMatches.length > 0,
        hasTenantRoleShare: tenantRoleMatches.length > 0,
        hasGroupShare: groupMatches.length > 0,
    };
}
function getUserPermissionLevel(db, itemId, actor) {
    return __awaiter(this, void 0, void 0, function () {
        var actorTenantId, userGroupsList, groupIds, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getUserGroups(actor.userId, actorTenantId, db)];
                case 1:
                    userGroupsList = _a.sent();
                    groupIds = userGroupsList.map(function (g) { return String(g.id); });
                    return [4 /*yield*/, db
                            .select({
                            subjectType: schema_1.libraryPermissions.subjectType,
                            subjectId: schema_1.libraryPermissions.subjectId,
                            permissionLevel: schema_1.libraryPermissions.permissionLevel,
                            expiresAt: schema_1.libraryPermissions.expiresAt,
                        })
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.libraryItemId, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId), drizzle_orm_1.or.apply(void 0, __spreadArray([(0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "user"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, String(actor.userId))),
                            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "tenant_role"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, actor.role || ""))], (groupIds.length > 0
                            ? [
                                (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "group"), (0, drizzle_orm_1.inArray)(schema_1.libraryPermissions.subjectId, groupIds)),
                            ]
                            : []), false)), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.libraryPermissions.expiresAt), (0, drizzle_orm_1.gt)(schema_1.libraryPermissions.expiresAt, new Date()))))
                            .limit(50)];
                case 2:
                    rows = _a.sent();
                    return [2 /*return*/, selectHighestPermissionLevel(rows.map(function (row) { return row.permissionLevel; }))];
            }
        });
    });
}
/**
 * Get all active groups for a user in their tenant.
 * Thin wrapper around groupsService.getUserGroups().
 * Caching is handled in groupsService layer (Redis, 1-minute TTL).
 */
function getUserGroups(userId, tenantId, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var groups;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, groupsService_1.getUserGroups)({ userId: userId, tenantId: tenantId }, dbClient)];
                case 1:
                    groups = _a.sent();
                    return [2 /*return*/, groups.map(function (g) { return ({
                            id: g.id,
                            name: g.name,
                            role: g.role
                        }); })];
            }
        });
    });
}
/**
 * Get user's effective permission for an item across all sources.
 * Returns the highest permission level and all sources that grant access.
 * No caching - queries database on every call for immediate permission changes.
 */
function getUserEffectivePermission(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, sources, highestLevel, highestRank, itemRows, item, userGroups, groupIds, permissions, directShare, rank, groupShares, _loop_1, _i, groupShares_1, groupShare, roleShare, rank;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    sources = [];
                    highestLevel = null;
                    highestRank = 0;
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))
                            .limit(1)];
                case 2:
                    itemRows = _a.sent();
                    item = itemRows[0];
                    if (!item) {
                        return [2 /*return*/, {
                                effectivePermissionLevel: null,
                                sources: []
                            }];
                    }
                    // Explicit tenant isolation check (defense-in-depth)
                    if (item.tenantId !== actorTenantId) {
                        return [2 /*return*/, {
                                effectivePermissionLevel: null,
                                sources: []
                            }];
                    }
                    if (item.ownerUserId === actor.userId) {
                        sources.push({ type: 'owner' });
                        highestLevel = 'owner';
                        highestRank = 4;
                    }
                    return [4 /*yield*/, getUserGroups(actor.userId, actorTenantId)];
                case 3:
                    userGroups = _a.sent();
                    groupIds = userGroups.map(function (g) { return g.id; });
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.libraryItemId, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.libraryPermissions.expiresAt), (0, drizzle_orm_1.gt)(schema_1.libraryPermissions.expiresAt, new Date()))))];
                case 4:
                    permissions = _a.sent();
                    directShare = permissions.find(function (p) {
                        return p.subjectType === 'user' && p.subjectId === String(actor.userId);
                    });
                    if (directShare) {
                        sources.push({
                            type: 'direct',
                            permissionLevel: directShare.permissionLevel,
                            subjectId: directShare.subjectId
                        });
                        rank = rankPermissionLevel(directShare.permissionLevel);
                        if (rank > highestRank) {
                            highestLevel = directShare.permissionLevel;
                            highestRank = rank;
                        }
                    }
                    groupShares = permissions.filter(function (p) {
                        return p.subjectType === 'group' && groupIds.includes(Number(p.subjectId));
                    });
                    _loop_1 = function (groupShare) {
                        var group = userGroups.find(function (g) { return g.id === Number(groupShare.subjectId); });
                        // SKIP permissions for deleted groups (defensive coding)
                        if (!group) {
                            return "continue";
                        }
                        sources.push({
                            type: 'group',
                            permissionLevel: groupShare.permissionLevel,
                            subjectId: groupShare.subjectId,
                            groupName: group.name
                        });
                        var rank = rankPermissionLevel(groupShare.permissionLevel);
                        if (rank > highestRank) {
                            highestLevel = groupShare.permissionLevel;
                            highestRank = rank;
                        }
                    };
                    for (_i = 0, groupShares_1 = groupShares; _i < groupShares_1.length; _i++) {
                        groupShare = groupShares_1[_i];
                        _loop_1(groupShare);
                    }
                    roleShare = permissions.find(function (p) {
                        return p.subjectType === 'tenant_role' && p.subjectId !== null && p.subjectId === actor.role;
                    });
                    if (roleShare) {
                        sources.push({
                            type: 'tenant_role',
                            permissionLevel: roleShare.permissionLevel,
                            subjectId: roleShare.subjectId
                        });
                        rank = rankPermissionLevel(roleShare.permissionLevel);
                        if (rank > highestRank) {
                            highestLevel = roleShare.permissionLevel;
                            highestRank = rank;
                        }
                    }
                    return [2 /*return*/, {
                            effectivePermissionLevel: highestLevel,
                            sources: sources
                        }];
            }
        });
    });
}
function canReadLibraryItem(item, actor, permissionLevel) {
    if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId))
        return false;
    if (isPrivateVaultLibraryItem(item)) {
        return item.ownerUserId === actor.userId && hasPrivateVaultAccess(actor);
    }
    if (actor.role === "admin")
        return true;
    if (item.ownerUserId === actor.userId)
        return true;
    if (item.visibility === "public")
        return true;
    if (item.visibility === "team")
        return true;
    return permissionLevel !== null;
}
function canManageLibraryItem(item, actor, permissionLevel) {
    if (normalizeLibraryTenantId(item.tenantId) !== normalizeLibraryTenantId(actor.tenantId))
        return false;
    if (isPrivateVaultLibraryItem(item)) {
        return item.ownerUserId === actor.userId && hasPrivateVaultAccess(actor);
    }
    if (actor.role === "admin")
        return true;
    if (item.ownerUserId === actor.userId)
        return true;
    return permissionLevel === "write" || permissionLevel === "delete" || permissionLevel === "owner";
}
var LIBRARY_GALLERY_LINK_TYPE = "gallery_item";
function mapLibraryItemTypeToGalleryType(itemType) {
    if (itemType === "image")
        return "image";
    if (itemType === "video")
        return "video";
    return null;
}
function readNumericMetadata(metadata) {
    var keys = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        keys[_i - 1] = arguments[_i];
    }
    for (var _a = 0, keys_1 = keys; _a < keys_1.length; _a++) {
        var key = keys_1[_a];
        var value = metadata[key];
        var parsed = typeof value === "number"
            ? value
            : typeof value === "string"
                ? Number.parseFloat(value)
                : NaN;
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}
function resolveGalleryAspectRatio(itemType, metadata) {
    var explicit = typeof metadata.aspectRatio === "string"
        ? metadata.aspectRatio
        : typeof metadata.aspect_ratio === "string"
            ? metadata.aspect_ratio
            : null;
    if (explicit === "1:1" || explicit === "9:16" || explicit === "16:9") {
        return explicit;
    }
    var width = readNumericMetadata(metadata, "width", "image_width", "video_width");
    var height = readNumericMetadata(metadata, "height", "image_height", "video_height");
    if (width && height) {
        var ratio = width / height;
        if (ratio <= 0.75)
            return "9:16";
        if (ratio >= 1.4)
            return "16:9";
        return "1:1";
    }
    return itemType === "video" ? "16:9" : "1:1";
}
function getLibraryGalleryLinkRow(db, libraryItemId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        id: schema_1.libraryLinks.id,
                        linkId: schema_1.libraryLinks.linkId,
                        galleryItemId: schema_1.galleryItems.id,
                        isPublished: schema_1.galleryItems.isPublished,
                    })
                        .from(schema_1.libraryLinks)
                        .leftJoin(schema_1.galleryItems, (0, drizzle_orm_1.eq)(schema_1.galleryItems.id, (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", "::int"], ["", "::int"])), schema_1.libraryLinks.linkId)))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryLinks.libraryItemId, libraryItemId), (0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkType, LIBRARY_GALLERY_LINK_TYPE)))
                        .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function removeGalleryPublicationLink(db, libraryItemId) {
    return __awaiter(this, void 0, void 0, function () {
        var galleryLink;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getLibraryGalleryLinkRow(db, libraryItemId)];
                case 1:
                    galleryLink = _a.sent();
                    if (!galleryLink) {
                        return [2 /*return*/];
                    }
                    if (!galleryLink.galleryItemId) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.delete(schema_1.galleryItems).where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, galleryLink.galleryItemId))];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, db.delete(schema_1.libraryLinks).where((0, drizzle_orm_1.eq)(schema_1.libraryLinks.id, galleryLink.id))];
                case 4:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function buildGalleryPayloadFromLibraryItem(item) {
    var metadata = normalizeLibraryMetadata(item.metadata);
    var galleryType = mapLibraryItemTypeToGalleryType(item.itemType);
    if (!galleryType) {
        throw new Error("Only image and video files can be published to the Gallery");
    }
    if (!item.sourceUrl) {
        throw new Error("This file does not have a public source URL yet");
    }
    var numericTenantId = Number.parseInt(String(item.tenantId), 10);
    var model = typeof metadata.model === "string"
        ? metadata.model
        : typeof metadata.model_name === "string"
            ? metadata.model_name
            : null;
    var tags = normalizeTagList(metadata.tags);
    var description = item.description
        || (typeof metadata.prompt === "string" ? metadata.prompt : null)
        || null;
    return {
        tenantId: Number.isFinite(numericTenantId) ? numericTenantId : undefined,
        type: galleryType,
        title: item.title,
        description: description,
        aspectRatio: resolveGalleryAspectRatio(galleryType, metadata),
        fileUrl: item.sourceUrl,
        thumbnailUrl: item.thumbnailUrl || item.sourceUrl,
        model: model,
        tags: tags,
        isPublished: true,
        authorId: item.ownerUserId,
    };
}
function getLibraryItemRowById(db, itemId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedTenantId, rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    normalizedTenantId = normalizeLibraryTenantId(tenantId);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, normalizedTenantId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))
                            .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function canActorPublishLibraryItem(item, actor) {
    return actor.role === "admin" || item.ownerUserId === actor.userId;
}
function getLibraryGalleryPublicationState(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, permission, canManage, galleryType, galleryLink, reason;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    item = _b.sent();
                    if (!item) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, item.id, actor)];
                case 3:
                    permission = _b.sent();
                    canManage = canManageLibraryItem(item, actor, permission);
                    galleryType = mapLibraryItemTypeToGalleryType(item.itemType);
                    return [4 /*yield*/, getLibraryGalleryLinkRow(db, item.id)];
                case 4:
                    galleryLink = _b.sent();
                    reason = null;
                    if (!canManage) {
                        reason = "Only users who can manage this file can publish it";
                    }
                    else if (!canActorPublishLibraryItem(item, actor)) {
                        reason = "Only the file owner or an admin can publish to the Gallery";
                    }
                    else if (isPrivateVaultLibraryItem(item)) {
                        reason = "Private vault files cannot be published to the Gallery";
                    }
                    else if (!galleryType) {
                        reason = "Only image and video files can be published to the Gallery";
                    }
                    else if (!item.sourceUrl) {
                        reason = "This file is missing a public source URL";
                    }
                    return [2 /*return*/, {
                            canManage: canManage,
                            canPublish: reason === null,
                            isPublished: Boolean((galleryLink === null || galleryLink === void 0 ? void 0 : galleryLink.galleryItemId) && galleryLink.isPublished),
                            galleryItemId: (_a = galleryLink === null || galleryLink === void 0 ? void 0 : galleryLink.galleryItemId) !== null && _a !== void 0 ? _a : null,
                            supported: galleryType !== null,
                            reason: reason,
                        }];
            }
        });
    });
}
function publishLibraryItemToGallery(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, permission, payload;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    item = _a.sent();
                    if (!item) {
                        throw new Error("Library item not found");
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, item.id, actor)];
                case 3:
                    permission = _a.sent();
                    if (!canManageLibraryItem(item, actor, permission)) {
                        throw new Error("You do not have permission to manage this file");
                    }
                    if (!canActorPublishLibraryItem(item, actor)) {
                        throw new Error("Only the file owner or an admin can publish to the Gallery");
                    }
                    if (isPrivateVaultLibraryItem(item)) {
                        throw new Error("Private vault files cannot be published to the Gallery");
                    }
                    payload = buildGalleryPayloadFromLibraryItem(item);
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var galleryLink, inserted, createdGalleryItemId;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, getLibraryGalleryLinkRow(tx, item.id)];
                                    case 1:
                                        galleryLink = _b.sent();
                                        if (!(galleryLink === null || galleryLink === void 0 ? void 0 : galleryLink.galleryItemId)) return [3 /*break*/, 3];
                                        return [4 /*yield*/, tx
                                                .update(schema_1.galleryItems)
                                                .set(__assign(__assign({}, payload), { updatedAt: new Date() }))
                                                .where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, galleryLink.galleryItemId))];
                                    case 2:
                                        _b.sent();
                                        return [2 /*return*/, {
                                                success: true,
                                                galleryItemId: galleryLink.galleryItemId,
                                                created: false,
                                            }];
                                    case 3: return [4 /*yield*/, tx
                                            .insert(schema_1.galleryItems)
                                            .values(payload)
                                            .returning({ id: schema_1.galleryItems.id })];
                                    case 4:
                                        inserted = _b.sent();
                                        createdGalleryItemId = (_a = inserted[0]) === null || _a === void 0 ? void 0 : _a.id;
                                        if (!createdGalleryItemId) {
                                            throw new Error("Failed to publish file to the Gallery");
                                        }
                                        if (!(galleryLink === null || galleryLink === void 0 ? void 0 : galleryLink.id)) return [3 /*break*/, 6];
                                        return [4 /*yield*/, tx
                                                .update(schema_1.libraryLinks)
                                                .set({
                                                linkId: String(createdGalleryItemId),
                                                tenantId: actorTenantId,
                                                createdAt: new Date(),
                                            })
                                                .where((0, drizzle_orm_1.eq)(schema_1.libraryLinks.id, galleryLink.id))];
                                    case 5:
                                        _b.sent();
                                        return [3 /*break*/, 8];
                                    case 6: return [4 /*yield*/, tx.insert(schema_1.libraryLinks).values({
                                            libraryItemId: item.id,
                                            linkType: LIBRARY_GALLERY_LINK_TYPE,
                                            linkId: String(createdGalleryItemId),
                                            tenantId: actorTenantId,
                                            createdAt: new Date(),
                                        })];
                                    case 7:
                                        _b.sent();
                                        _b.label = 8;
                                    case 8: return [2 /*return*/, {
                                            success: true,
                                            galleryItemId: createdGalleryItemId,
                                            created: true,
                                        }];
                                }
                            });
                        }); })];
                case 4: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function unpublishLibraryItemFromGallery(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, permission;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    item = _a.sent();
                    if (!item) {
                        throw new Error("Library item not found");
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, item.id, actor)];
                case 3:
                    permission = _a.sent();
                    if (!canManageLibraryItem(item, actor, permission)) {
                        throw new Error("You do not have permission to manage this file");
                    }
                    if (!canActorPublishLibraryItem(item, actor)) {
                        throw new Error("Only the file owner or an admin can unpublish from the Gallery");
                    }
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, removeGalleryPublicationLink(tx, item.id)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function createLibraryItem(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, now, validatedSourceUrl, validatedThumbnailUrl, existing, found, inserted, created, linkCreatedAt;
        var _a, _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _h.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    now = new Date();
                    validatedSourceUrl = validateLibraryItemUrlField("sourceUrl", input.sourceUrl);
                    validatedThumbnailUrl = validateLibraryItemUrlField("thumbnailUrl", input.thumbnailUrl);
                    if (isPrivateVaultMetadata(input.metadata) && !hasPrivateVaultAccess(actor)) {
                        throw new Error("Private vault is locked");
                    }
                    if (!input.sourceLink) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .select({
                            item: schema_1.libraryItems,
                        })
                            .from(schema_1.libraryLinks)
                            .innerJoin(schema_1.libraryItems, (0, drizzle_orm_1.eq)(schema_1.libraryLinks.libraryItemId, schema_1.libraryItems.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkType, input.sourceLink.linkType), (0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkId, input.sourceLink.linkId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))
                            .limit(1)];
                case 2:
                    existing = _h.sent();
                    found = (_a = existing[0]) === null || _a === void 0 ? void 0 : _a.item;
                    if (found) {
                        if (normalizeLibraryTenantId(found.tenantId) !== actorTenantId) {
                            throw new Error("Source link already belongs to another tenant");
                        }
                        return [2 /*return*/, {
                                item: toLibraryItemDto(found),
                                idempotent: true,
                            }];
                    }
                    _h.label = 3;
                case 3: return [4 /*yield*/, db
                        .insert(schema_1.libraryItems)
                        .values({
                        tenantId: actorTenantId,
                        ownerUserId: actor.userId,
                        parentId: (_b = input.parentId) !== null && _b !== void 0 ? _b : null,
                        itemType: input.itemType,
                        source: input.source,
                        projectId: (_c = input.projectId) !== null && _c !== void 0 ? _c : null,
                        title: input.title,
                        description: (_d = input.description) !== null && _d !== void 0 ? _d : null,
                        status: (_e = input.status) !== null && _e !== void 0 ? _e : "ready",
                        visibility: (_f = input.visibility) !== null && _f !== void 0 ? _f : "private",
                        metadata: normalizeLibraryMetadata(input.metadata),
                        sourceUrl: validatedSourceUrl,
                        thumbnailUrl: validatedThumbnailUrl,
                        createdAt: now,
                        updatedAt: now,
                    })
                        .returning()];
                case 4:
                    inserted = _h.sent();
                    created = inserted[0];
                    if (!created) {
                        throw new Error("Failed to create library item");
                    }
                    if (!input.sourceLink) return [3 /*break*/, 6];
                    linkCreatedAt = new Date();
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryLinks)
                            .values({
                            libraryItemId: created.id,
                            linkType: input.sourceLink.linkType,
                            linkId: input.sourceLink.linkId,
                            providerTaskId: (_g = input.sourceLink.providerTaskId) !== null && _g !== void 0 ? _g : null,
                            createdAt: linkCreatedAt,
                        })
                            .onConflictDoNothing()];
                case 5:
                    _h.sent();
                    _h.label = 6;
                case 6: return [2 /*return*/, {
                        item: toLibraryItemDto(created),
                        idempotent: false,
                    }];
            }
        });
    });
}
function mapDriveMimeToItemType(mimeType) {
    var m = mimeType.toLowerCase();
    if (m.includes("document") || m.includes("word") || m.includes("msword"))
        return "document";
    if (m.includes("spreadsheet") || m.includes("excel") || m.includes("ms-excel"))
        return "spreadsheet";
    if (m.includes("presentation") || m.includes("powerpoint") || m.includes("ms-powerpoint"))
        return "presentation";
    if (m === "application/pdf")
        return "pdf";
    if (m.startsWith("text/"))
        return "text";
    return "file";
}
function createVirtualDriveReference(driveFile, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, existing, itemType, now, inserted, created;
        var _a, _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _f.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, db
                            .select({ item: schema_1.libraryItems })
                            .from(schema_1.libraryLinks)
                            .innerJoin(schema_1.libraryItems, (0, drizzle_orm_1.eq)(schema_1.libraryLinks.libraryItemId, schema_1.libraryItems.id))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkType, "google_drive_file"), (0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkId, driveFile.driveFileId), (0, drizzle_orm_1.eq)(schema_1.libraryLinks.tenantId, actorTenantId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))
                            .limit(1)];
                case 2:
                    existing = _f.sent();
                    if ((_a = existing[0]) === null || _a === void 0 ? void 0 : _a.item) {
                        return [2 /*return*/, {
                                item: toLibraryItemDto(existing[0].item),
                                idempotent: true,
                            }];
                    }
                    itemType = mapDriveMimeToItemType(driveFile.mimeType);
                    now = new Date();
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryItems)
                            .values({
                            tenantId: actorTenantId,
                            ownerUserId: actor.userId,
                            itemType: itemType,
                            source: "google_drive",
                            title: driveFile.name,
                            status: "indexing",
                            visibility: "private",
                            sourceUrl: null,
                            thumbnailUrl: (_b = driveFile.iconLink) !== null && _b !== void 0 ? _b : null,
                            metadata: normalizeLibraryMetadata({
                                driveFileId: driveFile.driveFileId,
                                driveMimeType: driveFile.mimeType,
                                driveModifiedTime: driveFile.modifiedTime,
                                driveSize: (_c = driveFile.size) !== null && _c !== void 0 ? _c : null,
                                driveWebViewLink: (_d = driveFile.webViewLink) !== null && _d !== void 0 ? _d : null,
                                driveOwners: (_e = driveFile.owners) !== null && _e !== void 0 ? _e : null,
                                syncStatus: "pending",
                            }),
                            createdAt: now,
                            updatedAt: now,
                        })
                            .returning()];
                case 3:
                    inserted = _f.sent();
                    created = inserted[0];
                    if (!created) {
                        throw new Error("Failed to create virtual Drive reference");
                    }
                    // Insert library_link for dedup
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryLinks)
                            .values({
                            libraryItemId: created.id,
                            linkType: "google_drive_file",
                            linkId: driveFile.driveFileId,
                            tenantId: actorTenantId,
                            createdAt: now,
                        })
                            .onConflictDoNothing()];
                case 4:
                    // Insert library_link for dedup
                    _f.sent();
                    // Enqueue index job
                    return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                            libraryItemId: created.id,
                            tenantId: actorTenantId,
                            jobType: "google_drive_sync",
                            domain: "library",
                            operation: "index",
                            source: "ingestion.google_drive_sync",
                            sourceMetadata: {
                                ingestion: "google_drive",
                            },
                            allowThrottle: true,
                        }, db)];
                case 5:
                    // Enqueue index job
                    _f.sent();
                    return [2 /*return*/, {
                            item: toLibraryItemDto(created),
                            idempotent: false,
                        }];
            }
        });
    });
}
function uploadLibraryFile(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, fileName, fileType, ext, b64, fileBuffer, svgUpload, sanitized, sniffedMime, effectiveFileType, checksumSha256, duplicate, billing, fallbackText, debugTraceId, fileId, key, storage, enrichment, extractedText, created, featureFlags, inferredProcessingItemType, error_3, ocrChargePlan, totalCharge, hasCredits, ocrCharged, uploadCharged, error_4, softDeleted, _a, indexJob;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
        return __generator(this, function (_8) {
            switch (_8.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _8.sent();
                    tenantId = normalizeLibraryTenantId(actor.tenantId);
                    fileName = input.fileName.trim();
                    fileType = (input.fileType || "application/octet-stream").trim().toLowerCase();
                    if (!fileName) {
                        throw new Error("File name is required");
                    }
                    ext = extractFileExtension(fileName);
                    if (!isAllowedLibraryUploadMime(fileType) && !ALLOWED_LIBRARY_UPLOAD_EXTENSIONS.has(ext)) {
                        throw new Error("File type is not supported for library upload");
                    }
                    if (isPrivateVaultMetadata(input.metadata) && !hasPrivateVaultAccess(actor)) {
                        throw new Error("Private vault is locked");
                    }
                    if (ext && !ALLOWED_LIBRARY_UPLOAD_EXTENSIONS.has(ext)) {
                        throw new Error("File extension .".concat(ext, " is not allowed"));
                    }
                    b64 = input.fileBase64.includes(",")
                        ? input.fileBase64.split(",", 2)[1]
                        : input.fileBase64;
                    fileBuffer = Buffer.from(b64, "base64");
                    if (!fileBuffer.length) {
                        throw new Error("Uploaded file is empty");
                    }
                    if (fileBuffer.length > MAX_LIBRARY_UPLOAD_BYTES) {
                        throw new Error("File too large (max 50MB)");
                    }
                    svgUpload = (0, uploadContentSafety_1.isSvgUpload)(fileType, ext);
                    if (svgUpload) {
                        sanitized = (0, uploadContentSafety_1.sanitizeUploadedSvg)(fileBuffer);
                        if (!sanitized.safe) {
                            throw new Error("Unsafe SVG content is not allowed");
                        }
                        fileBuffer = sanitized.sanitizedBuffer;
                    }
                    sniffedMime = (0, libraryUploadPipeline_1.validateLibraryUploadSignature)(fileBuffer, fileType, ext).sniffedMime;
                    effectiveFileType = resolveProcessingMimeType(fileType, sniffedMime);
                    checksumSha256 = (0, libraryUploadPipeline_1.computeLibraryUploadChecksum)(fileBuffer);
                    return [4 /*yield*/, findDuplicateUploadedLibraryItem(db, {
                            tenantId: tenantId,
                            userId: actor.userId,
                            checksumSha256: checksumSha256,
                        })];
                case 2:
                    duplicate = _8.sent();
                    if (duplicate) {
                        return [2 /*return*/, {
                                item: toLibraryItemDto(duplicate),
                                storageKey: String(((_b = duplicate.metadata) !== null && _b !== void 0 ? _b : {}).source_key || ""),
                                duplicateOfItemId: duplicate.id,
                                indexJob: {
                                    jobId: 0,
                                    status: "duplicate_reused",
                                    created: false,
                                    payloadVersion: "v2",
                                    dedupeKey: "library-upload:duplicate:".concat(duplicate.id),
                                },
                                billing: {
                                    creditsCharged: 0,
                                    category: "duplicate_reused",
                                    fileSizeBytes: Number(((_c = duplicate.metadata) !== null && _c !== void 0 ? _c : {}).file_size_bytes || fileBuffer.length),
                                    baseCredits: 0,
                                    stepCredits: 0,
                                    extraSteps: 0,
                                    sizeStepMb: 0,
                                },
                            }];
                    }
                    return [4 /*yield*/, (0, creditService_1.calculateLibraryUploadCreditCost)(effectiveFileType, fileBuffer.length)];
                case 3:
                    billing = _8.sent();
                    fallbackText = (_d = extractTextLikeUploadMetadata(input.metadata)) !== null && _d !== void 0 ? _d : extractTextLikeUploadContent(fileBuffer, effectiveFileType, ext);
                    debugTraceId = (0, financeOcrDebug_1.getFinanceOcrDebugTraceId)(typeof ((_e = input.metadata) === null || _e === void 0 ? void 0 : _e.finance_debug_trace_id) === "string"
                        ? input.metadata.finance_debug_trace_id
                        : typeof ((_f = input.metadata) === null || _f === void 0 ? void 0 : _f.debug_trace_id) === "string"
                            ? input.metadata.debug_trace_id
                            : null);
                    fileId = crypto_1.default.randomUUID().replace(/-/g, "");
                    key = "library/uploads/".concat(tenantId, "/").concat(actor.userId, "/").concat(fileId).concat(ext ? ".".concat(ext) : "");
                    return [4 /*yield*/, (0, storage_1.storagePut)(key, fileBuffer, effectiveFileType)];
                case 4:
                    storage = _8.sent();
                    enrichment = null;
                    extractedText = null;
                    created = null;
                    _8.label = 5;
                case 5:
                    _8.trys.push([5, 9, , 11]);
                    return [4 /*yield*/, (0, tenantFeatureFlagService_1.getTenantFeatureFlags)(String(tenantId))];
                case 6:
                    featureFlags = _8.sent();
                    return [4 /*yield*/, (0, libraryUploadPipeline_1.enrichLibraryUploadContent)({
                            fileBuffer: fileBuffer,
                            fileName: fileName,
                            fileType: effectiveFileType,
                            extension: ext,
                            fallbackText: fallbackText,
                            sourceUrl: storage.url,
                            metadata: input.metadata,
                            externalProcessingAllowed: featureFlags.documentOcrExternalProcessing,
                            tenantId: String(tenantId),
                        })];
                case 7:
                    enrichment = _8.sent();
                    extractedText = enrichment.extractedText;
                    (0, logger_1.debugLog)("finance_ocr", "library upload enrichment", {
                        traceId: (_g = (0, traceContext_1.getTraceId)()) !== null && _g !== void 0 ? _g : "unknown",
                        debugTraceId: debugTraceId,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        fallbackTextLength: (_h = fallbackText === null || fallbackText === void 0 ? void 0 : fallbackText.length) !== null && _h !== void 0 ? _h : 0,
                        extractedTextLength: (_j = extractedText === null || extractedText === void 0 ? void 0 : extractedText.length) !== null && _j !== void 0 ? _j : 0,
                        extractor: enrichment.extractor,
                        searchQuality: enrichment.searchQuality,
                        warningCount: enrichment.warnings.length,
                        sourceUrlPresent: Boolean(storage.url),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_upload_enrichment", {
                        traceId: (_k = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _k !== void 0 ? _k : "unknown",
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        fallbackTextLength: (_l = fallbackText === null || fallbackText === void 0 ? void 0 : fallbackText.length) !== null && _l !== void 0 ? _l : 0,
                        extractedTextLength: (_m = extractedText === null || extractedText === void 0 ? void 0 : extractedText.length) !== null && _m !== void 0 ? _m : 0,
                        extractor: enrichment.extractor,
                        searchQuality: enrichment.searchQuality,
                        warningCount: enrichment.warnings.length,
                        sourceUrlPresent: Boolean(storage.url),
                    });
                    inferredProcessingItemType = inferLibraryItemType(effectiveFileType, ext);
                    return [4 /*yield*/, createLibraryItem({
                            itemType: inferredProcessingItemType,
                            source: "document_upload",
                            title: ((_o = input.title) === null || _o === void 0 ? void 0 : _o.trim()) || fileName,
                            description: null,
                            status: "indexing",
                            visibility: (_p = input.visibility) !== null && _p !== void 0 ? _p : "private",
                            projectId: (_q = input.projectId) !== null && _q !== void 0 ? _q : null,
                            parentId: (_r = input.parentId) !== null && _r !== void 0 ? _r : null,
                            metadata: __assign(__assign({}, buildLibraryUploadMetadata(input.metadata, {
                                fileName: fileName,
                                fileType: effectiveFileType,
                                extension: ext,
                                fileSizeBytes: fileBuffer.length,
                                checksumSha256: checksumSha256,
                                extractedText: extractedText,
                                extractor: enrichment.extractor,
                                searchQuality: enrichment.searchQuality,
                                stage: "indexing",
                                stageMessage: enrichment.stageMessage,
                                warnings: enrichment.warnings,
                                svgSanitized: svgUpload,
                                extraMetadata: enrichment.extraMetadata,
                            })), { uploaded_by_user_id: actor.userId, source_key: storage.key }),
                            sourceUrl: storage.url,
                            thumbnailUrl: inferredProcessingItemType === "image" ? storage.url : null,
                            sourceLink: {
                                linkType: "upload_key",
                                linkId: storage.key,
                            },
                        }, actor, db)];
                case 8:
                    created = _8.sent();
                    return [3 /*break*/, 11];
                case 9:
                    error_3 = _8.sent();
                    return [4 /*yield*/, (0, storage_1.storageDelete)(storage.key).catch(function () { })];
                case 10:
                    _8.sent();
                    throw error_3;
                case 11:
                    (0, logger_1.debugLog)("finance_ocr", "library upload persisted", {
                        traceId: (_s = (0, traceContext_1.getTraceId)()) !== null && _s !== void 0 ? _s : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: created.item.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        extractedTextLength: (_t = extractedText === null || extractedText === void 0 ? void 0 : extractedText.length) !== null && _t !== void 0 ? _t : 0,
                        metadataHasExtractedText: Boolean(((_u = created.item.metadata) !== null && _u !== void 0 ? _u : {}).extracted_text),
                        metadataKeys: Object.keys(((_v = created.item.metadata) !== null && _v !== void 0 ? _v : {})).slice(0, 16),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_upload_persisted", {
                        traceId: (_w = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _w !== void 0 ? _w : "unknown",
                        libraryItemId: created.item.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        extractedTextLength: (_x = extractedText === null || extractedText === void 0 ? void 0 : extractedText.length) !== null && _x !== void 0 ? _x : 0,
                        metadataHasExtractedText: Boolean(((_y = created.item.metadata) !== null && _y !== void 0 ? _y : {}).extracted_text),
                    });
                    if (!extractedText) return [3 /*break*/, 13];
                    return [4 /*yield*/, upsertLibrarySourceTextChunk(db, {
                            tenantId: tenantId,
                            libraryItemId: created.item.id,
                            content: extractedText,
                            source: isMarkdownLibraryUpload(ext) ? "document_upload_markdown" : "document_upload_extracted",
                            projectId: (_z = input.projectId) !== null && _z !== void 0 ? _z : null,
                        })];
                case 12:
                    _8.sent();
                    (0, logger_1.debugLog)("finance_ocr", "library upload chunk upserted", {
                        traceId: (_0 = (0, traceContext_1.getTraceId)()) !== null && _0 !== void 0 ? _0 : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: created.item.id,
                        fileName: fileName,
                        extractedTextLength: extractedText.length,
                        chunkSource: isMarkdownLibraryUpload(ext) ? "document_upload_markdown" : "document_upload_extracted",
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_upload_chunk_upserted", {
                        traceId: (_1 = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _1 !== void 0 ? _1 : "unknown",
                        libraryItemId: created.item.id,
                        fileName: fileName,
                        extractedTextLength: extractedText.length,
                        chunkSource: isMarkdownLibraryUpload(ext) ? "document_upload_markdown" : "document_upload_extracted",
                    });
                    return [3 /*break*/, 14];
                case 13:
                    (0, logger_1.debugLog)("finance_ocr", "library upload no extracted text", {
                        traceId: (_2 = (0, traceContext_1.getTraceId)()) !== null && _2 !== void 0 ? _2 : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: created.item.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        searchQuality: enrichment.searchQuality,
                        warningCount: enrichment.warnings.length,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_upload_no_extracted_text", {
                        traceId: (_3 = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _3 !== void 0 ? _3 : "unknown",
                        libraryItemId: created.item.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        searchQuality: enrichment.searchQuality,
                        warningCount: enrichment.warnings.length,
                    });
                    _8.label = 14;
                case 14: return [4 /*yield*/, buildOcrChargePlan({
                        extractor: enrichment.extractor,
                        metadata: ((_4 = created.item.metadata) !== null && _4 !== void 0 ? _4 : {}),
                        mimeType: effectiveFileType,
                        fileName: fileName,
                        fileSizeBytes: fileBuffer.length,
                        libraryItemId: created.item.id,
                        tenantId: tenantId,
                        userId: actor.userId,
                        source: "library_upload",
                        traceId: (0, traceContext_1.getTraceId)(),
                    })];
                case 15:
                    ocrChargePlan = _8.sent();
                    totalCharge = billing.totalCredits + ((_5 = ocrChargePlan === null || ocrChargePlan === void 0 ? void 0 : ocrChargePlan.amount) !== null && _5 !== void 0 ? _5 : 0);
                    if (!(totalCharge > 0)) return [3 /*break*/, 17];
                    return [4 /*yield*/, (0, creditService_1.hasEnoughCredits)(actor.userId, totalCharge)];
                case 16:
                    hasCredits = _8.sent();
                    if (!hasCredits) {
                        throw new Error("Insufficient credits. Required: ".concat(totalCharge));
                    }
                    _8.label = 17;
                case 17:
                    ocrCharged = false;
                    uploadCharged = false;
                    _8.label = 18;
                case 18:
                    _8.trys.push([18, 23, , 36]);
                    if (!ocrChargePlan) return [3 /*break*/, 20];
                    return [4 /*yield*/, (0, creditService_1.deductCredits)({
                            userId: actor.userId,
                            amount: ocrChargePlan.amount,
                            tenantId: tenantId,
                            sourceType: "other",
                            description: ocrChargePlan.description,
                            idempotencyKey: ocrChargePlan.idempotencyKey,
                            metadata: __assign(__assign({}, ocrChargePlan.metadata), ((_6 = input.billingMetadata) !== null && _6 !== void 0 ? _6 : {})),
                        })];
                case 19:
                    _8.sent();
                    ocrCharged = true;
                    _8.label = 20;
                case 20:
                    if (!(billing.totalCredits > 0)) return [3 /*break*/, 22];
                    return [4 /*yield*/, (0, creditService_1.deductCredits)({
                            userId: actor.userId,
                            amount: billing.totalCredits,
                            tenantId: tenantId,
                            sourceType: "indexing",
                            description: "Library upload (".concat(billing.category, "): ").concat(fileName),
                            idempotencyKey: "library-upload:".concat(created.item.id),
                            metadata: __assign({ service: "library.upload_file", libraryItemId: created.item.id, fileName: fileName, fileType: fileType, fileSizeBytes: fileBuffer.length, billingCategory: billing.category, billingBaseCredits: billing.baseCredits, billingStepCredits: billing.stepCredits, billingExtraSteps: billing.extraSteps, billingSizeStepMb: billing.sizeStepMb }, ((_7 = input.billingMetadata) !== null && _7 !== void 0 ? _7 : {})),
                        })];
                case 21:
                    _8.sent();
                    uploadCharged = true;
                    _8.label = 22;
                case 22: return [3 /*break*/, 36];
                case 23:
                    error_4 = _8.sent();
                    if (!(ocrCharged && ocrChargePlan)) return [3 /*break*/, 25];
                    return [4 /*yield*/, (0, creditService_1.refundCredits)({
                            userId: actor.userId,
                            amount: ocrChargePlan.amount,
                            description: "Refund OCR charge (library upload): ".concat(fileName),
                            sourceType: "other",
                            metadata: __assign(__assign({}, ocrChargePlan.metadata), { refundReason: "library_upload_billing_failed" }),
                        }).catch(function () { })];
                case 24:
                    _8.sent();
                    _8.label = 25;
                case 25:
                    if (!(uploadCharged && billing.totalCredits > 0)) return [3 /*break*/, 27];
                    return [4 /*yield*/, (0, creditService_1.refundCredits)({
                            userId: actor.userId,
                            amount: billing.totalCredits,
                            description: "Refund library upload billing: ".concat(fileName),
                            sourceType: "indexing",
                            metadata: {
                                service: "library.upload_file",
                                libraryItemId: created.item.id,
                                fileName: fileName,
                                fileType: fileType,
                                fileSizeBytes: fileBuffer.length,
                                billingCategory: billing.category,
                                billingBaseCredits: billing.baseCredits,
                                billingStepCredits: billing.stepCredits,
                                billingExtraSteps: billing.extraSteps,
                                billingSizeStepMb: billing.sizeStepMb,
                                refundReason: "library_upload_billing_failed",
                            },
                        }).catch(function () { })];
                case 26:
                    _8.sent();
                    _8.label = 27;
                case 27:
                    _8.trys.push([27, 33, , 35]);
                    return [4 /*yield*/, softDeleteLibraryItem(created.item.id, actor, db)];
                case 28:
                    softDeleted = _8.sent();
                    if (!softDeleted) return [3 /*break*/, 30];
                    return [4 /*yield*/, permanentDeleteLibraryItem(created.item.id, actor, db)];
                case 29:
                    _8.sent();
                    return [3 /*break*/, 32];
                case 30: return [4 /*yield*/, (0, storage_1.storageDelete)(storage.key).catch(function () { })];
                case 31:
                    _8.sent();
                    _8.label = 32;
                case 32: return [3 /*break*/, 35];
                case 33:
                    _a = _8.sent();
                    return [4 /*yield*/, (0, storage_1.storageDelete)(storage.key).catch(function () { })];
                case 34:
                    _8.sent();
                    return [3 /*break*/, 35];
                case 35: throw error_4;
                case 36: return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                        libraryItemId: created.item.id,
                        tenantId: tenantId,
                        jobType: "initial_index",
                        domain: "library",
                        operation: "index",
                        source: "library.upload",
                        sourceMetadata: {
                            ingestion: "document_upload",
                            fileType: fileType,
                        },
                        allowThrottle: true,
                    }, db)];
                case 37:
                    indexJob = _8.sent();
                    return [2 /*return*/, {
                            item: created.item,
                            storageKey: storage.key,
                            duplicateOfItemId: null,
                            indexJob: indexJob,
                            billing: {
                                creditsCharged: billing.totalCredits,
                                category: billing.category,
                                fileSizeBytes: fileBuffer.length,
                                baseCredits: billing.baseCredits,
                                stepCredits: billing.stepCredits,
                                extraSteps: billing.extraSteps,
                                sizeStepMb: billing.sizeStepMb,
                            },
                        }];
            }
        });
    });
}
function replaceLibraryFile(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, fileName, fileType, existing, permissionLevel, ext, b64, fileBuffer, svgUpload, sanitized, sniffedMime, effectiveFileType, checksumSha256, duplicate, billing, fallbackText, debugTraceId, debitTransactionId, ocrDebitTransactionId, ocrChargePlan, hasCredits, debit, newKey, currentLinks_1, currentStorageKey, oldMetadata_1, snapshotContent, version, versionNumber, fileId, storage_2, inferredItemType_1, featureFlags, enrichment_1, extractedText_1, updated, hasCredits, ocrDebit, indexJob, err_1;
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
        return __generator(this, function (_5) {
            switch (_5.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _5.sent();
                    tenantId = normalizeLibraryTenantId(actor.tenantId);
                    fileName = input.fileName.trim();
                    fileType = (input.fileType || "application/octet-stream").trim().toLowerCase();
                    if (!fileName) {
                        throw new Error("File name is required");
                    }
                    return [4 /*yield*/, getLibraryItemRowById(db, input.itemId, tenantId)];
                case 2:
                    existing = _5.sent();
                    if (!existing) {
                        throw new Error("Library item not found");
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 3:
                    permissionLevel = _5.sent();
                    if (!canManageLibraryItem(existing, actor, permissionLevel)) {
                        throw new Error("You do not have permission to update this item");
                    }
                    ext = extractFileExtension(fileName);
                    if (!isAllowedLibraryUploadMime(fileType) && !ALLOWED_LIBRARY_UPLOAD_EXTENSIONS.has(ext)) {
                        throw new Error("File type is not supported for library upload");
                    }
                    if (ext && !ALLOWED_LIBRARY_UPLOAD_EXTENSIONS.has(ext)) {
                        throw new Error("File extension .".concat(ext, " is not allowed"));
                    }
                    b64 = input.fileBase64.includes(",")
                        ? input.fileBase64.split(",", 2)[1]
                        : input.fileBase64;
                    fileBuffer = Buffer.from(b64, "base64");
                    if (!fileBuffer.length) {
                        throw new Error("Uploaded file is empty");
                    }
                    if (fileBuffer.length > MAX_LIBRARY_UPLOAD_BYTES) {
                        throw new Error("File too large (max 50MB)");
                    }
                    svgUpload = (0, uploadContentSafety_1.isSvgUpload)(fileType, ext);
                    if (svgUpload) {
                        sanitized = (0, uploadContentSafety_1.sanitizeUploadedSvg)(fileBuffer);
                        if (!sanitized.safe) {
                            throw new Error("Unsafe SVG content is not allowed");
                        }
                        fileBuffer = sanitized.sanitizedBuffer;
                    }
                    sniffedMime = (0, libraryUploadPipeline_1.validateLibraryUploadSignature)(fileBuffer, fileType, ext).sniffedMime;
                    effectiveFileType = resolveProcessingMimeType(fileType, sniffedMime);
                    checksumSha256 = (0, libraryUploadPipeline_1.computeLibraryUploadChecksum)(fileBuffer);
                    return [4 /*yield*/, findDuplicateUploadedLibraryItem(db, {
                            tenantId: tenantId,
                            userId: actor.userId,
                            checksumSha256: checksumSha256,
                            excludeItemId: existing.id,
                        })];
                case 4:
                    duplicate = _5.sent();
                    if (duplicate) {
                        throw new Error("An identical file already exists in your library. Reuse the existing item instead of uploading a duplicate.");
                    }
                    return [4 /*yield*/, (0, creditService_1.calculateLibraryUploadCreditCost)(effectiveFileType, fileBuffer.length)];
                case 5:
                    billing = _5.sent();
                    fallbackText = (_a = extractTextLikeUploadMetadata(input.metadata)) !== null && _a !== void 0 ? _a : extractTextLikeUploadContent(fileBuffer, effectiveFileType, ext);
                    debugTraceId = (0, financeOcrDebug_1.getFinanceOcrDebugTraceId)(typeof ((_b = input.metadata) === null || _b === void 0 ? void 0 : _b.finance_debug_trace_id) === "string"
                        ? input.metadata.finance_debug_trace_id
                        : typeof ((_c = input.metadata) === null || _c === void 0 ? void 0 : _c.debug_trace_id) === "string"
                            ? input.metadata.debug_trace_id
                            : null);
                    debitTransactionId = null;
                    ocrDebitTransactionId = null;
                    ocrChargePlan = null;
                    if (!(billing.totalCredits > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, (0, creditService_1.hasEnoughCredits)(actor.userId, billing.totalCredits)];
                case 6:
                    hasCredits = _5.sent();
                    if (!hasCredits) {
                        throw new Error("Insufficient credits. Required: ".concat(billing.totalCredits));
                    }
                    return [4 /*yield*/, (0, creditService_1.deductCredits)({
                            userId: actor.userId,
                            amount: billing.totalCredits,
                            tenantId: tenantId,
                            sourceType: "indexing",
                            description: "Library replace (".concat(billing.category, "): ").concat(fileName),
                            metadata: {
                                service: "library.replace_file",
                                libraryItemId: existing.id,
                                fileName: fileName,
                                fileType: effectiveFileType,
                                fileSizeBytes: fileBuffer.length,
                                billingCategory: billing.category,
                                billingBaseCredits: billing.baseCredits,
                                billingStepCredits: billing.stepCredits,
                                billingExtraSteps: billing.extraSteps,
                                billingSizeStepMb: billing.sizeStepMb,
                            },
                        })];
                case 7:
                    debit = _5.sent();
                    debitTransactionId = debit.transactionId;
                    _5.label = 8;
                case 8:
                    newKey = null;
                    _5.label = 9;
                case 9:
                    _5.trys.push([9, 25, , 32]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryLinks)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryLinks.libraryItemId, existing.id), (0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkType, "upload_key")))
                            .limit(1)];
                case 10:
                    currentLinks_1 = _5.sent();
                    currentStorageKey = (_e = (_d = currentLinks_1[0]) === null || _d === void 0 ? void 0 : _d.linkId) !== null && _e !== void 0 ? _e : null;
                    oldMetadata_1 = ((_f = existing.metadata) !== null && _f !== void 0 ? _f : {});
                    snapshotContent = JSON.stringify({
                        file_name: (_g = oldMetadata_1.file_name) !== null && _g !== void 0 ? _g : existing.title,
                        file_type: (_h = oldMetadata_1.file_type) !== null && _h !== void 0 ? _h : "application/octet-stream",
                        file_size_bytes: (_j = oldMetadata_1.file_size_bytes) !== null && _j !== void 0 ? _j : 0,
                        original_source_url: (_k = existing.sourceUrl) !== null && _k !== void 0 ? _k : null,
                    });
                    return [4 /*yield*/, createContentVersion(db, {
                            tenantId: tenantId,
                            libraryItemId: existing.id,
                            content: snapshotContent,
                            contentType: "file_snapshot",
                            createdByUserId: actor.userId,
                            changeDescription: input.changeDescription || "Replaced with ".concat(fileName),
                            snapshotObjectKey: currentStorageKey !== null && currentStorageKey !== void 0 ? currentStorageKey : undefined,
                        })];
                case 11:
                    version = _5.sent();
                    if (!version) {
                        throw new Error("Failed to create version snapshot before replacing file");
                    }
                    versionNumber = version.versionNumber;
                    fileId = crypto_1.default.randomUUID().replace(/-/g, "");
                    newKey = "library/uploads/".concat(tenantId, "/").concat(actor.userId, "/").concat(fileId).concat(ext ? ".".concat(ext) : "");
                    return [4 /*yield*/, (0, storage_1.storagePut)(newKey, fileBuffer, effectiveFileType)];
                case 12:
                    storage_2 = _5.sent();
                    inferredItemType_1 = inferLibraryItemType(effectiveFileType, ext);
                    return [4 /*yield*/, (0, tenantFeatureFlagService_1.getTenantFeatureFlags)(String(tenantId))];
                case 13:
                    featureFlags = _5.sent();
                    return [4 /*yield*/, (0, libraryUploadPipeline_1.enrichLibraryUploadContent)({
                            fileBuffer: fileBuffer,
                            fileName: fileName,
                            fileType: effectiveFileType,
                            extension: ext,
                            fallbackText: fallbackText,
                            sourceUrl: storage_2.url,
                            metadata: input.metadata,
                            externalProcessingAllowed: featureFlags.documentOcrExternalProcessing,
                            tenantId: String(tenantId),
                        })];
                case 14:
                    enrichment_1 = _5.sent();
                    extractedText_1 = enrichment_1.extractedText;
                    (0, logger_1.debugLog)("finance_ocr", "library replace enrichment", {
                        traceId: (_l = (0, traceContext_1.getTraceId)()) !== null && _l !== void 0 ? _l : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: existing.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        fallbackTextLength: (_m = fallbackText === null || fallbackText === void 0 ? void 0 : fallbackText.length) !== null && _m !== void 0 ? _m : 0,
                        extractedTextLength: (_o = extractedText_1 === null || extractedText_1 === void 0 ? void 0 : extractedText_1.length) !== null && _o !== void 0 ? _o : 0,
                        extractor: enrichment_1.extractor,
                        searchQuality: enrichment_1.searchQuality,
                        warningCount: enrichment_1.warnings.length,
                        sourceUrlPresent: Boolean(storage_2.url),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_replace_enrichment", {
                        traceId: (_p = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _p !== void 0 ? _p : "unknown",
                        libraryItemId: existing.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        fallbackTextLength: (_q = fallbackText === null || fallbackText === void 0 ? void 0 : fallbackText.length) !== null && _q !== void 0 ? _q : 0,
                        extractedTextLength: (_r = extractedText_1 === null || extractedText_1 === void 0 ? void 0 : extractedText_1.length) !== null && _r !== void 0 ? _r : 0,
                        extractor: enrichment_1.extractor,
                        searchQuality: enrichment_1.searchQuality,
                        warningCount: enrichment_1.warnings.length,
                        sourceUrlPresent: Boolean(storage_2.url),
                    });
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var now, updatedRows, txUpdated;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        now = new Date();
                                        return [4 /*yield*/, tx
                                                .update(schema_1.libraryItems)
                                                .set({
                                                sourceUrl: storage_2.url,
                                                thumbnailUrl: inferredItemType_1 === "image" ? storage_2.url : existing.thumbnailUrl,
                                                itemType: inferredItemType_1,
                                                status: "indexing",
                                                metadata: __assign(__assign({}, buildLibraryUploadMetadata(__assign(__assign({}, oldMetadata_1), (input.metadata || {})), {
                                                    fileName: fileName,
                                                    fileType: effectiveFileType,
                                                    extension: ext,
                                                    fileSizeBytes: fileBuffer.length,
                                                    checksumSha256: checksumSha256,
                                                    extractedText: extractedText_1,
                                                    extractor: enrichment_1.extractor,
                                                    searchQuality: enrichment_1.searchQuality,
                                                    stage: "indexing",
                                                    stageMessage: enrichment_1.stageMessage,
                                                    warnings: enrichment_1.warnings,
                                                    svgSanitized: svgUpload,
                                                    extraMetadata: enrichment_1.extraMetadata,
                                                })), { uploaded_by_user_id: actor.userId, source_key: storage_2.key }),
                                                updatedAt: now,
                                            })
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, existing.id), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, tenantId)))
                                                .returning()];
                                    case 1:
                                        updatedRows = _a.sent();
                                        txUpdated = updatedRows[0];
                                        if (!txUpdated) {
                                            throw new Error("Failed to update library item");
                                        }
                                        if (!currentLinks_1[0]) return [3 /*break*/, 3];
                                        return [4 /*yield*/, tx
                                                .update(schema_1.libraryLinks)
                                                .set({ linkId: storage_2.key })
                                                .where((0, drizzle_orm_1.eq)(schema_1.libraryLinks.id, currentLinks_1[0].id))];
                                    case 2:
                                        _a.sent();
                                        return [3 /*break*/, 5];
                                    case 3: return [4 /*yield*/, tx.insert(schema_1.libraryLinks).values({
                                            libraryItemId: existing.id,
                                            linkType: "upload_key",
                                            linkId: storage_2.key,
                                            tenantId: tenantId,
                                        })];
                                    case 4:
                                        _a.sent();
                                        _a.label = 5;
                                    case 5: return [2 /*return*/, txUpdated];
                                }
                            });
                        }); })];
                case 15:
                    updated = _5.sent();
                    (0, logger_1.debugLog)("finance_ocr", "library replace persisted", {
                        traceId: (_s = (0, traceContext_1.getTraceId)()) !== null && _s !== void 0 ? _s : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: existing.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        extractedTextLength: (_t = extractedText_1 === null || extractedText_1 === void 0 ? void 0 : extractedText_1.length) !== null && _t !== void 0 ? _t : 0,
                        metadataHasExtractedText: Boolean(((_u = updated.metadata) !== null && _u !== void 0 ? _u : {}).extracted_text),
                        metadataKeys: Object.keys(((_v = updated.metadata) !== null && _v !== void 0 ? _v : {})).slice(0, 16),
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_replace_persisted", {
                        traceId: (_w = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _w !== void 0 ? _w : "unknown",
                        libraryItemId: existing.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        extractedTextLength: (_x = extractedText_1 === null || extractedText_1 === void 0 ? void 0 : extractedText_1.length) !== null && _x !== void 0 ? _x : 0,
                        metadataHasExtractedText: Boolean(((_y = updated.metadata) !== null && _y !== void 0 ? _y : {}).extracted_text),
                        metadataKeys: Object.keys(((_z = updated.metadata) !== null && _z !== void 0 ? _z : {})).slice(0, 16),
                    });
                    if (!extractedText_1) return [3 /*break*/, 17];
                    return [4 /*yield*/, upsertLibrarySourceTextChunk(db, {
                            tenantId: tenantId,
                            libraryItemId: existing.id,
                            content: extractedText_1,
                            source: isMarkdownLibraryUpload(ext) ? "document_replace_markdown" : "document_replace_extracted",
                        })];
                case 16:
                    _5.sent();
                    (0, logger_1.debugLog)("finance_ocr", "library replace chunk upserted", {
                        traceId: (_0 = (0, traceContext_1.getTraceId)()) !== null && _0 !== void 0 ? _0 : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: existing.id,
                        fileName: fileName,
                        extractedTextLength: extractedText_1.length,
                        chunkSource: isMarkdownLibraryUpload(ext) ? "document_replace_markdown" : "document_replace_extracted",
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_replace_chunk_upserted", {
                        traceId: (_1 = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _1 !== void 0 ? _1 : "unknown",
                        libraryItemId: existing.id,
                        fileName: fileName,
                        extractedTextLength: extractedText_1.length,
                        chunkSource: isMarkdownLibraryUpload(ext) ? "document_replace_markdown" : "document_replace_extracted",
                    });
                    return [3 /*break*/, 19];
                case 17: return [4 /*yield*/, db
                        .delete(schema_1.libraryChunks)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryChunks.libraryItemId, existing.id), (0, drizzle_orm_1.eq)(schema_1.libraryChunks.contentType, "markdown_source")))];
                case 18:
                    _5.sent();
                    (0, logger_1.debugLog)("finance_ocr", "library replace no extracted text", {
                        traceId: (_2 = (0, traceContext_1.getTraceId)()) !== null && _2 !== void 0 ? _2 : "unknown",
                        debugTraceId: debugTraceId,
                        libraryItemId: existing.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        searchQuality: enrichment_1.searchQuality,
                        warningCount: enrichment_1.warnings.length,
                    });
                    (0, financeOcrDebug_1.recordFinanceOcrDebugStep)("library_replace_no_extracted_text", {
                        traceId: (_3 = debugTraceId !== null && debugTraceId !== void 0 ? debugTraceId : (0, traceContext_1.getTraceId)()) !== null && _3 !== void 0 ? _3 : "unknown",
                        libraryItemId: existing.id,
                        fileName: fileName,
                        fileType: effectiveFileType,
                        extension: ext,
                        searchQuality: enrichment_1.searchQuality,
                        warningCount: enrichment_1.warnings.length,
                    });
                    _5.label = 19;
                case 19: return [4 /*yield*/, buildOcrChargePlan({
                        extractor: enrichment_1.extractor,
                        metadata: ((_4 = updated.metadata) !== null && _4 !== void 0 ? _4 : {}),
                        mimeType: effectiveFileType,
                        fileName: fileName,
                        fileSizeBytes: fileBuffer.length,
                        libraryItemId: existing.id,
                        tenantId: tenantId,
                        userId: actor.userId,
                        source: "library_replace",
                        traceId: (0, traceContext_1.getTraceId)(),
                    })];
                case 20:
                    ocrChargePlan = _5.sent();
                    if (!ocrChargePlan) return [3 /*break*/, 23];
                    return [4 /*yield*/, (0, creditService_1.hasEnoughCredits)(actor.userId, ocrChargePlan.amount)];
                case 21:
                    hasCredits = _5.sent();
                    if (!hasCredits) {
                        throw new Error("Insufficient credits. Required: ".concat(ocrChargePlan.amount));
                    }
                    return [4 /*yield*/, (0, creditService_1.deductCredits)({
                            userId: actor.userId,
                            amount: ocrChargePlan.amount,
                            tenantId: tenantId,
                            sourceType: "other",
                            description: ocrChargePlan.description,
                            idempotencyKey: ocrChargePlan.idempotencyKey,
                            metadata: ocrChargePlan.metadata,
                        })];
                case 22:
                    ocrDebit = _5.sent();
                    ocrDebitTransactionId = ocrDebit.transactionId;
                    _5.label = 23;
                case 23: return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                        libraryItemId: existing.id,
                        tenantId: tenantId,
                        jobType: "file_replace",
                        domain: "library",
                        operation: "index",
                        source: "library.replace_file",
                        sourceMetadata: {
                            ingestion: "file_replace",
                            fileType: fileType,
                            previousVersion: versionNumber,
                        },
                        allowThrottle: true,
                    }, db)];
                case 24:
                    indexJob = _5.sent();
                    return [2 /*return*/, {
                            item: toLibraryItemDto(updated),
                            indexJob: indexJob,
                            versionNumber: versionNumber,
                        }];
                case 25:
                    err_1 = _5.sent();
                    if (!newKey) return [3 /*break*/, 27];
                    // Clean up the orphaned uploaded file
                    return [4 /*yield*/, (0, storage_1.storageDelete)(newKey).catch(function () { })];
                case 26:
                    // Clean up the orphaned uploaded file
                    _5.sent();
                    _5.label = 27;
                case 27:
                    if (!(ocrChargePlan && ocrDebitTransactionId)) return [3 /*break*/, 29];
                    return [4 /*yield*/, (0, creditService_1.refundCredits)({
                            userId: actor.userId,
                            amount: ocrChargePlan.amount,
                            description: "Refund OCR charge (library replace): ".concat(fileName),
                            originalTransactionId: ocrDebitTransactionId,
                            sourceType: "other",
                            metadata: __assign(__assign({}, ocrChargePlan.metadata), { refundReason: "library_replace_failed" }),
                        }).catch(function () { })];
                case 28:
                    _5.sent();
                    _5.label = 29;
                case 29:
                    if (!(billing.totalCredits > 0 && debitTransactionId)) return [3 /*break*/, 31];
                    return [4 /*yield*/, (0, creditService_1.refundCredits)({
                            userId: actor.userId,
                            amount: billing.totalCredits,
                            description: "Refund for failed library replace: ".concat(fileName),
                            originalTransactionId: debitTransactionId,
                            sourceType: "indexing",
                            metadata: {
                                service: "library.replace_file",
                                libraryItemId: existing.id,
                                billingCategory: billing.category,
                            },
                        }).catch(function (refundError) {
                            console.error("[library.replaceFile] Failed to refund credits for item ".concat(existing.id, ":"), refundError instanceof Error ? refundError.message : refundError);
                        })];
                case 30:
                    _5.sent();
                    _5.label = 31;
                case 31: throw err_1;
                case 32: return [2 /*return*/];
            }
        });
    });
}
function getLibraryItemById(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, permission;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    item = _a.sent();
                    if (!item) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, item.id, actor)];
                case 3:
                    permission = _a.sent();
                    if (!canReadLibraryItem(item, actor, permission)) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, toLibraryItemDto(item)];
            }
        });
    });
}
function getLibraryUploadStatuses(itemIds, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, normalizedIds, rows, results, _i, rows_1, row, permission, latestJob, metadata, pipeline, itemDto, indexJob, parserWarnings, stage, searchQuality;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _e.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    normalizedIds = Array.from(new Set(itemIds.filter(function (value) { return Number.isFinite(value) && value > 0; })));
                    if (normalizedIds.length === 0) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.inArray)(schema_1.libraryItems.id, normalizedIds), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))];
                case 2:
                    rows = _e.sent();
                    results = [];
                    _i = 0, rows_1 = rows;
                    _e.label = 3;
                case 3:
                    if (!(_i < rows_1.length)) return [3 /*break*/, 7];
                    row = rows_1[_i];
                    return [4 /*yield*/, getUserPermissionLevel(db, row.id, actor)];
                case 4:
                    permission = _e.sent();
                    if (!canReadLibraryItem(row, actor, permission)) {
                        return [3 /*break*/, 6];
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryIndexJobs)
                            .where((0, drizzle_orm_1.eq)(schema_1.libraryIndexJobs.libraryItemId, row.id))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.libraryIndexJobs.createdAt))
                            .limit(1)];
                case 5:
                    latestJob = _e.sent();
                    metadata = normalizeLibraryMetadata((_a = row.metadata) !== null && _a !== void 0 ? _a : {});
                    pipeline = getUploadPipelineMetadata(metadata);
                    itemDto = toLibraryItemDto(row);
                    indexJob = (_b = latestJob[0]) !== null && _b !== void 0 ? _b : null;
                    parserWarnings = Array.isArray(pipeline.warnings)
                        ? pipeline.warnings.filter(function (value) { return typeof value === "string" && value.trim().length > 0; })
                        : [];
                    stage = row.status === "ready"
                        ? "ready"
                        : row.status === "failed"
                            ? "failed"
                            : indexJob && ["pending", "processing", "retry_pending"].includes(indexJob.status)
                                ? "indexing"
                                : (typeof pipeline.stage === "string" ? pipeline.stage : "uploaded");
                    searchQuality = metadata.search_quality === "full_text" ? "full_text" : "metadata_only";
                    results.push({
                        itemId: row.id,
                        item: itemDto,
                        stage: stage,
                        stageMessage: typeof pipeline.stageMessage === "string"
                            ? pipeline.stageMessage
                            : row.status === "ready"
                                ? "Ready for search."
                                : row.status === "failed"
                                    ? "Upload processing failed."
                                    : indexJob
                                        ? "File uploaded. Indexing is still in progress."
                                        : "File uploaded and waiting for processing.",
                        parserJobId: typeof pipeline.parserJobId === "string" ? pipeline.parserJobId : null,
                        parserStatus: typeof pipeline.parserStatus === "string" ? pipeline.parserStatus : null,
                        indexJobId: (_c = indexJob === null || indexJob === void 0 ? void 0 : indexJob.id) !== null && _c !== void 0 ? _c : null,
                        indexJobStatus: (_d = indexJob === null || indexJob === void 0 ? void 0 : indexJob.status) !== null && _d !== void 0 ? _d : null,
                        checksumSha256: typeof pipeline.checksumSha256 === "string"
                            ? pipeline.checksumSha256
                            : typeof metadata.content_checksum_sha256 === "string"
                                ? metadata.content_checksum_sha256
                                : null,
                        extractor: typeof pipeline.extractor === "string"
                            ? pipeline.extractor
                            : typeof metadata.extraction_method === "string"
                                ? metadata.extraction_method
                                : null,
                        searchQuality: searchQuality,
                        parseError: typeof pipeline.parseError === "string"
                            ? pipeline.parseError
                            : typeof metadata.parse_error === "string"
                                ? metadata.parse_error
                                : null,
                        warnings: parserWarnings,
                        duplicateOfItemId: typeof metadata.duplicate_of_item_id === "number" ? metadata.duplicate_of_item_id : null,
                        readyForSearch: row.status === "ready",
                        updatedAt: typeof pipeline.updatedAt === "string" ? pipeline.updatedAt : row.updatedAt.toISOString(),
                    });
                    _e.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 3];
                case 7:
                    results.sort(function (a, b) { return normalizedIds.indexOf(a.itemId) - normalizedIds.indexOf(b.itemId); });
                    return [2 /*return*/, results];
            }
        });
    });
}
function updateLibraryItem(itemId, input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, existing, permission, updatePayload, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    existing = _a.sent();
                    if (!existing) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 3:
                    permission = _a.sent();
                    if (!canManageLibraryItem(existing, actor, permission)) {
                        return [2 /*return*/, null];
                    }
                    updatePayload = {
                        updatedAt: new Date(),
                    };
                    if (input.title !== undefined)
                        updatePayload.title = input.title;
                    if (input.description !== undefined)
                        updatePayload.description = input.description;
                    if (input.status !== undefined)
                        updatePayload.status = input.status;
                    if (input.visibility !== undefined)
                        updatePayload.visibility = input.visibility;
                    if (input.metadata !== undefined)
                        updatePayload.metadata = normalizeLibraryMetadata(input.metadata);
                    if (input.sourceUrl !== undefined) {
                        updatePayload.sourceUrl = input.sourceUrl === null
                            ? null
                            : validateLibraryItemUrlField("sourceUrl", input.sourceUrl);
                    }
                    if (input.thumbnailUrl !== undefined) {
                        updatePayload.thumbnailUrl = input.thumbnailUrl === null
                            ? null
                            : validateLibraryItemUrlField("thumbnailUrl", input.thumbnailUrl);
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.libraryItems)
                            .set(updatePayload)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))
                            .returning()];
                case 4:
                    updated = _a.sent();
                    if (!updated[0]) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                            libraryItemId: updated[0].id,
                            tenantId: actorTenantId,
                            jobType: "update_index",
                            domain: "library",
                            operation: "index",
                            source: "library.update",
                            sourceMetadata: {
                                fields: Object.keys(input),
                            },
                            allowThrottle: true,
                        }, db)];
                case 5:
                    _a.sent();
                    if (!(input.visibility !== undefined)) return [3 /*break*/, 7];
                    return [4 /*yield*/, recomputeAndPropagateScopes(itemId, actorTenantId, db)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [2 /*return*/, toLibraryItemDto(updated[0])];
            }
        });
    });
}
function isPresentationTempUploadMetadata(metadata, expectedDeckId) {
    if (!metadata || typeof metadata !== "object") {
        return false;
    }
    var source = metadata;
    if (source.presentation_upload !== true) {
        return false;
    }
    var deckId = Number(source.presentation_deck_id);
    return Number.isFinite(deckId) && deckId === expectedDeckId;
}
function softDeleteDeckScopedPresentationUploads(presentationItemId, actor, db) {
    return __awaiter(this, void 0, void 0, function () {
        var actorTenantId, deckRows, deck, linkedRows, now, uploadItemIds, _i, uploadItemIds_1, uploadItemId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, db
                            .select({ id: schema_1.presentationDecks.id })
                            .from(schema_1.presentationDecks)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.presentationDecks.libraryItemId, presentationItemId), (0, drizzle_orm_1.eq)(schema_1.presentationDecks.tenantId, actorTenantId)))
                            .limit(1)];
                case 1:
                    deckRows = _a.sent();
                    deck = deckRows[0];
                    if (!deck) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.libraryItems.id,
                            metadata: schema_1.libraryItems.metadata,
                        })
                            .from(schema_1.presentationAssetLinks)
                            .innerJoin(schema_1.libraryItems, (0, drizzle_orm_1.eq)(schema_1.libraryItems.id, schema_1.presentationAssetLinks.libraryItemId))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.presentationAssetLinks.deckId, deck.id), (0, drizzle_orm_1.eq)(schema_1.presentationAssetLinks.tenantId, actorTenantId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))];
                case 2:
                    linkedRows = _a.sent();
                    now = new Date();
                    uploadItemIds = linkedRows
                        .filter(function (row) { return isPresentationTempUploadMetadata(row.metadata, deck.id); })
                        .map(function (row) { return row.id; });
                    if (!uploadItemIds.length) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.libraryItems)
                            .set({
                            deletedAt: now,
                            deletedBy: actor.userId,
                            status: "archived",
                            updatedAt: now,
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.libraryItems.id, uploadItemIds), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))];
                case 3:
                    _a.sent();
                    _i = 0, uploadItemIds_1 = uploadItemIds;
                    _a.label = 4;
                case 4:
                    if (!(_i < uploadItemIds_1.length)) return [3 /*break*/, 7];
                    uploadItemId = uploadItemIds_1[_i];
                    return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                            libraryItemId: uploadItemId,
                            tenantId: actorTenantId,
                            jobType: "delete_index",
                            domain: "library",
                            operation: "delete",
                            source: "library.delete.presentation_upload",
                            allowThrottle: false,
                        }, db)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function softDeleteLibraryItem(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, existing, permission, deleted;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    existing = _b.sent();
                    if (!existing) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 3:
                    permission = _b.sent();
                    if (!canManageLibraryItem(existing, actor, permission)) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.libraryItems)
                            .set({
                            deletedAt: new Date(),
                            deletedBy: actor.userId,
                            status: "archived",
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))
                            .returning({ id: schema_1.libraryItems.id })];
                case 4:
                    deleted = _b.sent();
                    if (!((_a = deleted[0]) === null || _a === void 0 ? void 0 : _a.id)) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                            libraryItemId: itemId,
                            tenantId: actorTenantId,
                            jobType: "delete_index",
                            domain: "library",
                            operation: "delete",
                            source: "library.delete",
                            allowThrottle: false,
                        }, db)];
                case 5:
                    _b.sent();
                    if (!(existing.itemType === "presentation")) return [3 /*break*/, 7];
                    return [4 /*yield*/, softDeleteDeckScopedPresentationUploads(itemId, actor, db)];
                case 6:
                    _b.sent();
                    _b.label = 7;
                case 7: return [2 /*return*/, true];
            }
        });
    });
}
// ── Scope Propagation ──
// Permission levels that grant read access (used for scope computation)
var SCOPE_READ_LEVELS = new Set(["read", "write", "delete", "owner"]);
/**
 * Recompute allowed_scopes for a library item from its permissions,
 * visibility, and owner. Then propagate to all chunks.
 *
 * Steps:
 * 1. Fetch the item (owner_user_id, visibility, tenant_id)
 * 2. Fetch all non-expired library_permissions for the item
 * 3. Build the allowed_scopes array
 * 4. UPDATE libraryItems SET allowedScopes = newScopes
 * 5. UPDATE libraryChunks SET allowedScopes = newScopes
 * 6. Fire-and-forget call to Python backend for vector store propagation
 */
function recomputeAndPropagateScopes(itemId, tenantId, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, items, item, perms, scopes, _i, perms_1, perm, scopeList, runtime, pyBackendUrl, proxyToken;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.libraryItems.id,
                            ownerUserId: schema_1.libraryItems.ownerUserId,
                            visibility: schema_1.libraryItems.visibility,
                            tenantId: schema_1.libraryItems.tenantId,
                        })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))
                            .limit(1)];
                case 2:
                    items = _a.sent();
                    item = items[0];
                    if (!item)
                        return [2 /*return*/];
                    return [4 /*yield*/, db
                            .select({
                            subjectType: schema_1.libraryPermissions.subjectType,
                            subjectId: schema_1.libraryPermissions.subjectId,
                            permissionLevel: schema_1.libraryPermissions.permissionLevel,
                        })
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.libraryItemId, itemId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.libraryPermissions.expiresAt), (0, drizzle_orm_1.gt)(schema_1.libraryPermissions.expiresAt, new Date()))))];
                case 3:
                    perms = _a.sent();
                    scopes = new Set();
                    scopes.add("u:".concat(item.ownerUserId));
                    for (_i = 0, perms_1 = perms; _i < perms_1.length; _i++) {
                        perm = perms_1[_i];
                        if (!SCOPE_READ_LEVELS.has(perm.permissionLevel))
                            continue;
                        if (perm.subjectType === "user") {
                            scopes.add("u:".concat(perm.subjectId));
                        }
                        else if (perm.subjectType === "group") {
                            scopes.add("g:".concat(perm.subjectId));
                        }
                        else if (perm.subjectType === "tenant_role") {
                            scopes.add("t:".concat(perm.subjectId));
                        }
                    }
                    if (item.visibility === "public") {
                        scopes.add("p:global");
                    }
                    else if (item.visibility === "team") {
                        scopes.add("t:".concat(item.tenantId));
                    }
                    scopeList = Array.from(scopes).sort();
                    // 4. Update item's allowedScopes
                    return [4 /*yield*/, db
                            .update(schema_1.libraryItems)
                            .set({ allowedScopes: scopeList })
                            .where((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId))];
                case 4:
                    // 4. Update item's allowedScopes
                    _a.sent();
                    // 5. Update all chunks' allowedScopes (tenant-filtered for defense-in-depth)
                    return [4 /*yield*/, db
                            .update(schema_1.libraryChunks)
                            .set({ allowedScopes: scopeList })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryChunks.libraryItemId, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryChunks.tenantId, tenantId)))];
                case 5:
                    // 5. Update all chunks' allowedScopes (tenant-filtered for defense-in-depth)
                    _a.sent();
                    return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 6:
                    runtime = _a.sent();
                    pyBackendUrl = runtime.pythonBackendUrl;
                    proxyToken = runtime.proxyToken;
                    if (proxyToken) {
                        fetch("".concat(pyBackendUrl, "/api/internal/library/propagate-scopes"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-proxy-token": proxyToken,
                            },
                            body: JSON.stringify({
                                item_id: itemId,
                                tenant_id: tenantId,
                                new_allowed_scopes: scopeList,
                            }),
                        }).catch(function (err) {
                            console.warn("[recomputeAndPropagateScopes] Python propagation failed:", err);
                        });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function shareLibraryItem(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, existing, permission, actorRank, grantRank, groupRows, group, now;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _c.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, input.itemId, actorTenantId)];
                case 2:
                    existing = _c.sent();
                    if (!existing) {
                        return [2 /*return*/, false];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 3:
                    permission = _c.sent();
                    if (!canManageLibraryItem(existing, actor, permission)) {
                        return [2 /*return*/, false];
                    }
                    if (isPrivateVaultLibraryItem(existing)) {
                        return [2 /*return*/, false];
                    }
                    // Prevent privilege escalation: actor cannot grant higher permission than they have
                    // Owner and admin bypass this check (they can grant any level)
                    if (existing.ownerUserId !== actor.userId && actor.role !== "admin") {
                        actorRank = rankPermissionLevel(permission);
                        grantRank = rankPermissionLevel(input.permissionLevel);
                        if (grantRank > actorRank) {
                            return [2 /*return*/, false];
                        }
                    }
                    if (!(input.subjectType === 'group')) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.userGroups)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userGroups.id, Number(input.subjectId)), (0, drizzle_orm_1.isNull)(schema_1.userGroups.deletedAt)))
                            .limit(1)];
                case 4:
                    groupRows = _c.sent();
                    group = groupRows[0];
                    if (!group) {
                        throw new Error('Group not found or has been deleted');
                    }
                    // 2. Validate group is in same tenant (cross-tenant isolation)
                    if (group.tenantId !== actorTenantId) {
                        throw new Error('Cannot share with groups from other tenants');
                    }
                    // 3. Validate item is in same tenant as group
                    if (existing.tenantId !== group.tenantId) {
                        throw new Error('Cannot share items across tenant boundaries');
                    }
                    _c.label = 5;
                case 5:
                    now = new Date();
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryPermissions)
                            .values({
                            tenantId: actorTenantId,
                            libraryItemId: input.itemId,
                            subjectType: input.subjectType,
                            subjectId: input.subjectId,
                            permissionLevel: input.permissionLevel,
                            grantedByUserId: actor.userId,
                            expiresAt: (_a = input.expiresAt) !== null && _a !== void 0 ? _a : null,
                            createdAt: now,
                            updatedAt: now,
                        })
                            .onConflictDoUpdate({
                            target: [schema_1.libraryPermissions.libraryItemId, schema_1.libraryPermissions.subjectType, schema_1.libraryPermissions.subjectId],
                            set: {
                                permissionLevel: input.permissionLevel,
                                grantedByUserId: actor.userId,
                                expiresAt: (_b = input.expiresAt) !== null && _b !== void 0 ? _b : null,
                                updatedAt: new Date(),
                            },
                        })];
                case 6:
                    _c.sent();
                    // Recompute allowed_scopes after sharing
                    return [4 /*yield*/, recomputeAndPropagateScopes(input.itemId, actorTenantId, db)];
                case 7:
                    // Recompute allowed_scopes after sharing
                    _c.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
function getPublicShareLinkState(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, active_1, permissionLevel, active;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, input.itemId, actorTenantId)];
                case 2:
                    item = _a.sent();
                    if (!item) {
                        return [2 /*return*/, { canManage: false, link: null }];
                    }
                    if (isPrivateVaultLibraryItem(item)) {
                        return [2 /*return*/, { canManage: false, link: null }];
                    }
                    if (!(getPublicShareOwnerUserId(item) === actor.userId)) return [3 /*break*/, 4];
                    return [4 /*yield*/, getActivePublicShareLinkRow(db, item.id, actorTenantId)];
                case 3:
                    active_1 = _a.sent();
                    return [2 /*return*/, {
                            canManage: true,
                            link: active_1 ? serializePublicShareLink(active_1) : null,
                        }];
                case 4: return [4 /*yield*/, getUserPermissionLevel(db, item.id, actor)];
                case 5:
                    permissionLevel = _a.sent();
                    if (!canManageLibraryItem(item, actor, permissionLevel)) {
                        return [2 /*return*/, { canManage: false, link: null }];
                    }
                    return [4 /*yield*/, getActivePublicShareLinkRow(db, item.id, actorTenantId)];
                case 6:
                    active = _a.sent();
                    return [2 /*return*/, {
                            canManage: true,
                            link: active ? serializePublicShareLink(active) : null,
                        }];
            }
        });
    });
}
function createPublicShareLink(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, active, token, now, expiresAt, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, input.itemId, actorTenantId)];
                case 2:
                    item = _a.sent();
                    if (!item) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Library item not found",
                        });
                    }
                    return [4 /*yield*/, assertCanManagePublicShare(item, actor, db)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, getActivePublicShareLinkRow(db, item.id, actorTenantId)];
                case 4:
                    active = _a.sent();
                    if (active) {
                        return [2 /*return*/, serializePublicShareLink(active)];
                    }
                    token = crypto_1.default.randomBytes(PUBLIC_SHARE_TOKEN_BYTES).toString("base64url");
                    now = new Date();
                    expiresAt = new Date(now);
                    expiresAt.setDate(expiresAt.getDate() + PUBLIC_SHARE_DEFAULT_TTL_DAYS);
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryPublicShareLinks)
                            .values({
                            tenantId: actorTenantId,
                            libraryItemId: item.id,
                            tokenHash: hashPublicShareToken(token),
                            tokenEncrypted: (0, crypto_2.encrypt)(token),
                            createdByUserId: actor.userId,
                            expiresAt: expiresAt,
                            revokedAt: null,
                            createdAt: now,
                            updatedAt: now,
                        })
                            .returning()];
                case 5:
                    row = (_a.sent())[0];
                    if (!row) {
                        throw new Error("Failed to create public share link");
                    }
                    return [2 /*return*/, serializePublicShareLink(row)];
            }
        });
    });
}
function revokePublicShareLink(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, active, now, row;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, input.itemId, actorTenantId)];
                case 2:
                    item = _a.sent();
                    if (!item) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Library item not found",
                        });
                    }
                    return [4 /*yield*/, assertCanManagePublicShare(item, actor, db)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, getActivePublicShareLinkRow(db, item.id, actorTenantId)];
                case 4:
                    active = _a.sent();
                    if (!active) {
                        return [2 /*return*/, null];
                    }
                    now = new Date();
                    return [4 /*yield*/, db
                            .update(schema_1.libraryPublicShareLinks)
                            .set({
                            revokedAt: now,
                            updatedAt: now,
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.libraryPublicShareLinks.id, active.id))
                            .returning()];
                case 5:
                    row = (_a.sent())[0];
                    return [2 /*return*/, row ? serializePublicShareLink(row) : null];
            }
        });
    });
}
function isMarkdownLikeLibraryItemForPublicShare(item) {
    var _a;
    var metadata = normalizeLibraryMetadata(item.metadata);
    var metadataExtension = typeof metadata.extension === "string" ? metadata.extension.toLowerCase().replace(/^\./, "") : "";
    var sourceUrl = item.sourceUrl || "";
    var extFromUrl = sourceUrl ? ((_a = sourceUrl.split("?")[0].split(".").pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "" : "";
    var ext = metadataExtension || extFromUrl || item.itemType.toLowerCase();
    return ext === "md" || ext === "markdown" || item.itemType.toLowerCase() === "markdown";
}
function resolvePublicShareLink(token, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, normalizedToken, tokenHash, linkRow, item, downloadUrl, markdownContent, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _d.sent();
                    normalizedToken = token.trim();
                    if (!normalizedToken) {
                        return [2 /*return*/, null];
                    }
                    tokenHash = hashPublicShareToken(normalizedToken);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryPublicShareLinks)
                            .where((0, drizzle_orm_1.eq)(schema_1.libraryPublicShareLinks.tokenHash, tokenHash))
                            .limit(1)];
                case 2:
                    linkRow = (_d.sent())[0];
                    if (!linkRow || !isPublicShareLinkActive(linkRow)) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getLibraryItemRowById(db, linkRow.libraryItemId, linkRow.tenantId)];
                case 3:
                    item = _d.sent();
                    if (!item || isPrivateVaultLibraryItem(item)) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, resolvePublicShareDownloadUrl(item)];
                case 4:
                    downloadUrl = _d.sent();
                    if (!isMarkdownLikeLibraryItemForPublicShare(item)) return [3 /*break*/, 6];
                    return [4 /*yield*/, getLibraryMarkdownContent(item.id, {
                            userId: item.ownerUserId,
                            tenantId: item.tenantId,
                            role: "user",
                        }, db)];
                case 5:
                    _a = (_c = (_b = (_d.sent())) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : null;
                    return [3 /*break*/, 7];
                case 6:
                    _a = null;
                    _d.label = 7;
                case 7:
                    markdownContent = _a;
                    return [2 /*return*/, {
                            item: {
                                id: item.id,
                                tenantId: item.tenantId,
                                ownerUserId: item.ownerUserId,
                                itemType: item.itemType,
                                source: item.source,
                                title: item.title,
                                description: item.description,
                                status: item.status,
                                visibility: item.visibility,
                                metadata: normalizeLibraryMetadata(item.metadata),
                                sourceUrl: downloadUrl,
                                thumbnailUrl: item.thumbnailUrl,
                                createdAt: item.createdAt,
                                updatedAt: item.updatedAt,
                            },
                            markdownContent: markdownContent,
                            downloadUrl: downloadUrl,
                        }];
            }
        });
    });
}
function enqueueLibraryIndexJob(input, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, jobType, tenantId, resolvedProjectId, _a, payload, existing, now, inserted, created;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _e.sent();
                    jobType = (_b = input.jobType) !== null && _b !== void 0 ? _b : "initial_index";
                    tenantId = normalizeLibraryTenantId(input.tenantId);
                    if (!((_c = input.projectId) !== null && _c !== void 0)) return [3 /*break*/, 2];
                    _a = _c;
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, resolveLibraryItemProjectId(db, input.libraryItemId, tenantId)];
                case 3:
                    _a = _e.sent();
                    _e.label = 4;
                case 4:
                    resolvedProjectId = _a;
                    payload = (0, libraryIndexJobContract_1.buildLibraryIndexJobPayload)({
                        domain: input.domain || "library",
                        operation: input.operation || "index",
                        tenantId: tenantId,
                        entityId: "library:".concat(input.libraryItemId),
                        source: input.source || "library.".concat(jobType),
                        sourceMetadata: __assign(__assign({}, ((_d = input.sourceMetadata) !== null && _d !== void 0 ? _d : {})), { projectId: resolvedProjectId !== null && resolvedProjectId !== void 0 ? resolvedProjectId : undefined }),
                    });
                    if (input.allowThrottle &&
                        (0, libraryIndexJobContract_1.shouldThrottleLibraryEnqueue)(getLibraryQueueBackpressureState())) {
                        return [2 /*return*/, {
                                jobId: 0,
                                status: "throttled",
                                created: false,
                                payloadVersion: payload.version,
                                dedupeKey: payload.dedupeKey,
                                throttled: true,
                            }];
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.libraryIndexJobs.id,
                            status: schema_1.libraryIndexJobs.status,
                        })
                            .from(schema_1.libraryIndexJobs)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryIndexJobs.libraryItemId, input.libraryItemId), (0, drizzle_orm_1.eq)(schema_1.libraryIndexJobs.tenantId, tenantId), (0, drizzle_orm_1.eq)(schema_1.libraryIndexJobs.jobType, jobType), (0, drizzle_orm_1.inArray)(schema_1.libraryIndexJobs.status, ["pending", "processing", "retry_pending"])))
                            .limit(1)];
                case 5:
                    existing = _e.sent();
                    if (existing[0]) {
                        return [2 /*return*/, {
                                jobId: existing[0].id,
                                status: existing[0].status,
                                created: false,
                                payloadVersion: payload.version,
                                dedupeKey: payload.dedupeKey,
                            }];
                    }
                    now = new Date();
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryIndexJobs)
                            .values({
                            tenantId: tenantId,
                            libraryItemId: input.libraryItemId,
                            projectId: resolvedProjectId !== null && resolvedProjectId !== void 0 ? resolvedProjectId : null,
                            jobType: jobType,
                            status: "pending",
                            attemptCount: 0,
                            maxAttempts: 5,
                            runAt: now,
                            createdAt: now,
                            updatedAt: now,
                        })
                            .returning({
                            id: schema_1.libraryIndexJobs.id,
                            status: schema_1.libraryIndexJobs.status,
                        })];
                case 6:
                    inserted = _e.sent();
                    created = inserted[0];
                    if (!created) {
                        throw new Error("Failed to enqueue library index job");
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.libraryItems)
                            .set({
                            status: "indexing",
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, input.libraryItemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, tenantId)))];
                case 7:
                    _e.sent();
                    return [2 /*return*/, {
                            jobId: created.id,
                            status: created.status,
                            created: true,
                            payloadVersion: payload.version,
                            dedupeKey: payload.dedupeKey,
                        }];
            }
        });
    });
}
function safeEnqueueLibraryIndexJob(input, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var error_5, tenantId, payload;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, enqueueLibraryIndexJob(input, dbClient)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    error_5 = _a.sent();
                    tenantId = normalizeLibraryTenantId(input.tenantId);
                    payload = (0, libraryIndexJobContract_1.buildLibraryIndexJobPayload)({
                        domain: input.domain || "library",
                        operation: input.operation || "index",
                        tenantId: tenantId,
                        entityId: "library:".concat(input.libraryItemId),
                        source: input.source || "library.".concat(input.jobType || "initial_index"),
                        sourceMetadata: input.sourceMetadata,
                    });
                    return [2 /*return*/, {
                            jobId: 0,
                            status: "enqueue_error",
                            created: false,
                            payloadVersion: payload.version,
                            dedupeKey: payload.dedupeKey,
                            error: error_5 instanceof Error ? error_5.message : String(error_5),
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function getDocumentAccessSource(item, actor, permissionInfo) {
    if (item.ownerUserId === actor.userId) {
        return "owner";
    }
    if (permissionInfo.hasDirectShare) {
        return "shared_direct";
    }
    if (permissionInfo.hasGroupShare || permissionInfo.hasTenantRoleShare || item.visibility === "team" || item.visibility === "public") {
        return "shared_group";
    }
    return "shared_group";
}
function matchesDocumentScope(scope, accessSource, permissionInfo) {
    if (scope === "all")
        return true;
    if (scope === "my_library")
        return accessSource === "owner";
    if (scope === "private_vault")
        return accessSource === "owner";
    // Shared-with-me should include only explicit direct user shares.
    if (scope === "shared_with_me")
        return permissionInfo.hasDirectShare;
    // Shared-groups should include only explicit group shares from other users.
    if (scope === "shared_groups")
        return permissionInfo.hasGroupShare && accessSource !== "owner";
    return true;
}
function itemMatchesDocumentFilters(item, filters) {
    if (!filters)
        return true;
    if (filters.itemType && item.itemType !== filters.itemType)
        return false;
    if (filters.ownerUserId !== undefined && item.ownerUserId !== filters.ownerUserId)
        return false;
    if (filters.projectId !== undefined && item.projectId !== filters.projectId)
        return false;
    if (filters.status && item.status !== filters.status)
        return false;
    if (filters.fromDate && item.createdAt < filters.fromDate)
        return false;
    if (filters.toDate && item.createdAt > filters.toDate)
        return false;
    var recentCutoff = getRecentCutoffDate(filters.recentDays);
    if (recentCutoff && getLibraryItemLastActivityAt(item) < recentCutoff)
        return false;
    return true;
}
function itemMatchesDocumentQuery(item, query) {
    if (!query)
        return true;
    var normalizedQuery = query.toLowerCase();
    var metadata = normalizeLibraryMetadata(item.metadata);
    var haystack = [
        item.title,
        item.description || "",
        item.itemType,
        item.source,
        JSON.stringify(metadata),
    ]
        .join(" ")
        .toLowerCase();
    return haystack.includes(normalizedQuery);
}
function matchesPrivateVaultScope(item, scope) {
    var isVaultItem = isPrivateVaultLibraryItem(item);
    if (scope === "private_vault") {
        return isVaultItem;
    }
    return !isVaultItem;
}
var LibraryMarkdownVersionConflictError = /** @class */ (function (_super) {
    __extends(LibraryMarkdownVersionConflictError, _super);
    function LibraryMarkdownVersionConflictError(currentUpdatedAt) {
        var _this = _super.call(this, "Library markdown version conflict") || this;
        _this.name = "LibraryMarkdownVersionConflictError";
        _this.currentUpdatedAt = currentUpdatedAt;
        return _this;
    }
    return LibraryMarkdownVersionConflictError;
}(Error));
exports.LibraryMarkdownVersionConflictError = LibraryMarkdownVersionConflictError;
function listLibraryDocuments(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, scope, sort, limit, offset, query, userGroupsList, groupIds, groupIdNums, applyFolderFilter, folderCondition, itemRows, itemIds, permissionRows, afterFilters, afterQuery, scopedItems, visible, paged, pagedItemIds, ownerUserIdByItemId, activeShareRows, shareCountByItemId, _i, activeShareRows_1, row, itemId, ownerUserId, _a, paged_1, item, explicitShareCount;
        var _b, _c, _d, _e, _f, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _j.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    scope = (_b = input.scope) !== null && _b !== void 0 ? _b : "all";
                    sort = (_c = input.sort) !== null && _c !== void 0 ? _c : "updated_desc";
                    limit = Math.min(Math.max((_d = input.limit) !== null && _d !== void 0 ? _d : 30, 1), 50);
                    offset = Math.max((_e = input.offset) !== null && _e !== void 0 ? _e : 0, 0);
                    query = ((_f = input.query) !== null && _f !== void 0 ? _f : "").trim();
                    return [4 /*yield*/, getUserGroups(actor.userId, actorTenantId)];
                case 2:
                    userGroupsList = _j.sent();
                    groupIds = userGroupsList.map(function (g) { return String(g.id); });
                    groupIdNums = userGroupsList.map(function (g) { return g.id; });
                    applyFolderFilter = (input.scope === "my_library" || input.scope === undefined || input.scope === "all")
                        && "folderId" in input;
                    folderCondition = applyFolderFilter
                        ? (input.folderId == null ? (0, drizzle_orm_1.isNull)(schema_1.libraryItems.parentId) : (0, drizzle_orm_1.eq)(schema_1.libraryItems.parentId, input.folderId))
                        : undefined;
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt), folderCondition))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.libraryItems.updatedAt), (0, drizzle_orm_1.desc)(schema_1.libraryItems.createdAt), (0, drizzle_orm_1.desc)(schema_1.libraryItems.id))];
                case 3:
                    itemRows = _j.sent();
                    if (!itemRows.length) {
                        return [2 /*return*/, {
                                total: 0,
                                limit: limit,
                                offset: offset,
                                has_more: false,
                                scope: scope,
                                results: [],
                            }];
                    }
                    itemIds = itemRows.map(function (item) { return item.id; });
                    return [4 /*yield*/, db
                            .select({
                            libraryItemId: schema_1.libraryPermissions.libraryItemId,
                            subjectType: schema_1.libraryPermissions.subjectType,
                            subjectId: schema_1.libraryPermissions.subjectId,
                            permissionLevel: schema_1.libraryPermissions.permissionLevel,
                            expiresAt: schema_1.libraryPermissions.expiresAt,
                        })
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId), (0, drizzle_orm_1.inArray)(schema_1.libraryPermissions.libraryItemId, itemIds), drizzle_orm_1.or.apply(void 0, __spreadArray([(0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "user"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, String(actor.userId))),
                            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "tenant_role"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, actor.role || ""))], (groupIds.length > 0 ? [
                            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "group"), (0, drizzle_orm_1.inArray)(schema_1.libraryPermissions.subjectId, groupIds))
                        ] : []), false)), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.libraryPermissions.expiresAt), (0, drizzle_orm_1.gt)(schema_1.libraryPermissions.expiresAt, new Date()))))];
                case 4:
                    permissionRows = _j.sent();
                    afterFilters = itemRows.filter(function (item) { return itemMatchesDocumentFilters(item, input.filters); });
                    afterQuery = afterFilters.filter(function (item) { return itemMatchesDocumentQuery(item, query); });
                    scopedItems = afterQuery.filter(function (item) { return matchesPrivateVaultScope(item, scope); });
                    visible = scopedItems.reduce(function (acc, item) {
                        var _a, _b;
                        var permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor, groupIdNums);
                        var canRead = canReadLibraryItem(item, actor, permissionInfo.effectivePermissionLevel);
                        if (!canRead) {
                            return acc;
                        }
                        var accessSource = getDocumentAccessSource(item, actor, permissionInfo);
                        if (!matchesDocumentScope(scope, accessSource, {
                            hasDirectShare: permissionInfo.hasDirectShare,
                            hasGroupShare: permissionInfo.hasGroupShare,
                        })) {
                            return acc;
                        }
                        var metadata = normalizeLibraryMetadata(item.metadata);
                        acc.push({
                            id: item.id,
                            item_type: item.itemType,
                            source: item.source,
                            title: item.title,
                            description: item.description,
                            status: item.status,
                            visibility: item.visibility,
                            source_url: item.sourceUrl,
                            thumbnail_url: item.thumbnailUrl,
                            owner_user_id: item.ownerUserId,
                            parent_id: (_a = item.parentId) !== null && _a !== void 0 ? _a : null,
                            metadata: metadata,
                            access_source: accessSource,
                            permission_level: item.ownerUserId === actor.userId
                                ? "owner"
                                : (_b = permissionInfo.effectivePermissionLevel) !== null && _b !== void 0 ? _b : "read",
                            shared_out_count: 0,
                            has_shared_out: false,
                            created_at: item.createdAt.toISOString(),
                            updated_at: item.updatedAt.toISOString(),
                        });
                        return acc;
                    }, []);
                    visible.sort(function (a, b) {
                        if (sort === "created_desc") {
                            var createdDiff_1 = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                            if (createdDiff_1 !== 0)
                                return createdDiff_1;
                            return b.id - a.id;
                        }
                        var updatedDiff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
                        if (updatedDiff !== 0)
                            return updatedDiff;
                        var createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                        if (createdDiff !== 0)
                            return createdDiff;
                        return b.id - a.id;
                    });
                    paged = visible.slice(offset, offset + limit);
                    if (!(paged.length > 0)) return [3 /*break*/, 6];
                    pagedItemIds = paged.map(function (item) { return item.id; });
                    ownerUserIdByItemId = new Map(paged.map(function (item) { return [item.id, item.owner_user_id]; }));
                    return [4 /*yield*/, db
                            .select({
                            libraryItemId: schema_1.libraryPermissions.libraryItemId,
                            subjectType: schema_1.libraryPermissions.subjectType,
                            subjectId: schema_1.libraryPermissions.subjectId,
                            permissionLevel: schema_1.libraryPermissions.permissionLevel,
                        })
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId), (0, drizzle_orm_1.inArray)(schema_1.libraryPermissions.libraryItemId, pagedItemIds), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "user"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "group")), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.libraryPermissions.expiresAt), (0, drizzle_orm_1.gt)(schema_1.libraryPermissions.expiresAt, new Date()))))];
                case 5:
                    activeShareRows = _j.sent();
                    shareCountByItemId = new Map();
                    for (_i = 0, activeShareRows_1 = activeShareRows; _i < activeShareRows_1.length; _i++) {
                        row = activeShareRows_1[_i];
                        itemId = Number(row.libraryItemId);
                        if (row.permissionLevel === "owner") {
                            continue;
                        }
                        ownerUserId = ownerUserIdByItemId.get(itemId);
                        if (row.subjectType === "user"
                            && ownerUserId !== undefined
                            && Number(row.subjectId) === ownerUserId) {
                            continue;
                        }
                        shareCountByItemId.set(itemId, ((_g = shareCountByItemId.get(itemId)) !== null && _g !== void 0 ? _g : 0) + 1);
                    }
                    for (_a = 0, paged_1 = paged; _a < paged_1.length; _a++) {
                        item = paged_1[_a];
                        explicitShareCount = (_h = shareCountByItemId.get(item.id)) !== null && _h !== void 0 ? _h : 0;
                        item.shared_out_count = explicitShareCount;
                        item.has_shared_out = explicitShareCount > 0;
                    }
                    _j.label = 6;
                case 6: return [2 /*return*/, {
                        total: visible.length,
                        limit: limit,
                        offset: offset,
                        has_more: offset + paged.length < visible.length,
                        scope: scope,
                        results: paged,
                    }];
            }
        });
    });
}
function getLibraryMarkdownContent(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, item, permissionLevel, rows;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _c.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    item = _c.sent();
                    if (!item) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, item.id, actor)];
                case 3:
                    permissionLevel = _c.sent();
                    if (!canReadLibraryItem(item, actor, permissionLevel)) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, db
                            .select({
                            content: schema_1.libraryChunks.content,
                        })
                            .from(schema_1.libraryChunks)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryChunks.tenantId, actorTenantId), (0, drizzle_orm_1.eq)(schema_1.libraryChunks.libraryItemId, item.id), (0, drizzle_orm_1.eq)(schema_1.libraryChunks.chunkIndex, 0), (0, drizzle_orm_1.eq)(schema_1.libraryChunks.contentType, "markdown_source")))
                            .limit(1)];
                case 4:
                    rows = _c.sent();
                    return [2 /*return*/, {
                            item_id: item.id,
                            content: (_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.content) !== null && _b !== void 0 ? _b : "",
                            updated_at: item.updatedAt.toISOString(),
                        }];
            }
        });
    });
}
function createContentVersion(db, input) {
    return __awaiter(this, void 0, void 0, function () {
        var contentHash, contentSizeBytes, latestVersion, nextVersionNumber, existingWithHash, version;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    contentHash = crypto_1.default
                        .createHash("sha256")
                        .update(input.content, "utf8")
                        .digest("hex");
                    contentSizeBytes = Buffer.byteLength(input.content, "utf8");
                    return [4 /*yield*/, db
                            .select({ versionNumber: schema_1.libraryContentVersions.versionNumber })
                            .from(schema_1.libraryContentVersions)
                            .where((0, drizzle_orm_1.eq)(schema_1.libraryContentVersions.libraryItemId, input.libraryItemId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.libraryContentVersions.versionNumber))
                            .limit(1)];
                case 1:
                    latestVersion = _b.sent();
                    nextVersionNumber = latestVersion[0]
                        ? latestVersion[0].versionNumber + 1
                        : 1;
                    if (!(input.contentType !== "file_snapshot")) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.libraryContentVersions.id })
                            .from(schema_1.libraryContentVersions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryContentVersions.libraryItemId, input.libraryItemId), (0, drizzle_orm_1.eq)(schema_1.libraryContentVersions.contentHash, contentHash)))
                            .limit(1)];
                case 2:
                    existingWithHash = _b.sent();
                    if (existingWithHash[0]) {
                        return [2 /*return*/, null];
                    }
                    _b.label = 3;
                case 3: return [4 /*yield*/, db
                        .insert(schema_1.libraryContentVersions)
                        .values({
                        tenantId: input.tenantId,
                        libraryItemId: input.libraryItemId,
                        versionNumber: nextVersionNumber,
                        contentHash: contentHash,
                        content: input.content,
                        contentType: input.contentType,
                        contentSizeBytes: contentSizeBytes,
                        changeDescription: input.changeDescription,
                        snapshotObjectKey: (_a = input.snapshotObjectKey) !== null && _a !== void 0 ? _a : null,
                        createdByUserId: input.createdByUserId,
                    })
                        .returning()];
                case 4:
                    version = (_b.sent())[0];
                    return [2 /*return*/, version !== null && version !== void 0 ? version : null];
            }
        });
    });
}
function saveLibraryMarkdown(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, existing, permissionLevel, expectedUpdatedAt, normalizedContent, now, currentChunk, updatedRows, updated, indexJob;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, input.itemId, actorTenantId)];
                case 2:
                    existing = _a.sent();
                    if (!existing) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 3:
                    permissionLevel = _a.sent();
                    if (!canManageLibraryItem(existing, actor, permissionLevel)) {
                        return [2 /*return*/, null];
                    }
                    if (input.expectedUpdatedAt) {
                        expectedUpdatedAt = input.expectedUpdatedAt.getTime();
                        if (existing.updatedAt.getTime() !== expectedUpdatedAt) {
                            throw new LibraryMarkdownVersionConflictError(existing.updatedAt);
                        }
                    }
                    normalizedContent = input.content.replace(/\r\n/g, "\n");
                    now = new Date();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryChunks)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryChunks.libraryItemId, existing.id), (0, drizzle_orm_1.eq)(schema_1.libraryChunks.contentType, "markdown_source")))
                            .limit(1)];
                case 4:
                    currentChunk = _a.sent();
                    if (!(currentChunk[0] && currentChunk[0].content)) return [3 /*break*/, 6];
                    return [4 /*yield*/, createContentVersion(db, {
                            tenantId: actorTenantId,
                            libraryItemId: existing.id,
                            content: currentChunk[0].content,
                            contentType: currentChunk[0].contentType,
                            createdByUserId: actor.userId,
                            changeDescription: input.changeDescription,
                        })];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [4 /*yield*/, db
                        .insert(schema_1.libraryChunks)
                        .values({
                        tenantId: actorTenantId,
                        libraryItemId: existing.id,
                        chunkIndex: 0,
                        content: normalizedContent,
                        contentType: "markdown_source",
                        tokenCount: null,
                        vectorRefId: null,
                        vectorIndexName: resolveLibraryVectorIndexName(),
                        metadata: {
                            source: "document_management_editor",
                        },
                        createdAt: now,
                    })
                        .onConflictDoUpdate({
                        target: [schema_1.libraryChunks.libraryItemId, schema_1.libraryChunks.chunkIndex],
                        set: {
                            content: normalizedContent,
                            contentType: "markdown_source",
                            tokenCount: null,
                            vectorRefId: null,
                            vectorIndexName: resolveLibraryVectorIndexName(),
                            metadata: {
                                source: "document_management_editor",
                            },
                        },
                    })];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, db
                            .update(schema_1.libraryItems)
                            .set({
                            status: "indexing",
                            metadata: normalizeLibraryMetadata(__assign(__assign({}, existing.metadata), { markdown_last_saved_at: now.toISOString() })),
                            updatedAt: now,
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, existing.id), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))
                            .returning()];
                case 8:
                    updatedRows = _a.sent();
                    updated = updatedRows[0];
                    if (!updated) {
                        throw new Error("Failed to save markdown content");
                    }
                    return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                            libraryItemId: existing.id,
                            tenantId: actorTenantId,
                            jobType: "markdown_update",
                            domain: "library",
                            operation: "index",
                            source: "library.markdown_update",
                            sourceMetadata: {
                                ingestion: "document_management_editor",
                            },
                            allowThrottle: true,
                        }, db)];
                case 9:
                    indexJob = _a.sent();
                    return [2 /*return*/, {
                            item: toLibraryItemDto(updated),
                            indexJob: indexJob,
                        }];
            }
        });
    });
}
function getContentVersionHistory(itemId, actor, options, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, existing, permissionLevel, limit, offset;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _c.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getLibraryItemRowById(db, itemId, actorTenantId)];
                case 2:
                    existing = _c.sent();
                    if (!existing) {
                        return [2 /*return*/, []];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 3:
                    permissionLevel = _c.sent();
                    if (!canReadLibraryItem(existing, actor, permissionLevel)) {
                        return [2 /*return*/, []];
                    }
                    limit = Math.min(Math.max((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 50, 1), 100);
                    offset = Math.max((_b = options === null || options === void 0 ? void 0 : options.offset) !== null && _b !== void 0 ? _b : 0, 0);
                    return [2 /*return*/, db
                            .select()
                            .from(schema_1.libraryContentVersions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryContentVersions.libraryItemId, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryContentVersions.tenantId, actorTenantId)))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.libraryContentVersions.createdAt))
                            .limit(limit)
                            .offset(offset)];
            }
        });
    });
}
function getContentVersionById(versionId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, version, existing, permissionLevel;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryContentVersions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryContentVersions.id, versionId), (0, drizzle_orm_1.eq)(schema_1.libraryContentVersions.tenantId, actorTenantId)))
                            .limit(1)];
                case 2:
                    version = (_a.sent())[0];
                    if (!version) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getLibraryItemRowById(db, version.libraryItemId, actorTenantId)];
                case 3:
                    existing = _a.sent();
                    if (!existing) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 4:
                    permissionLevel = _a.sent();
                    if (!canReadLibraryItem(existing, actor, permissionLevel)) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, version];
            }
        });
    });
}
function getVersionSnapshotDownloadUrl(versionId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var version, resolved, _a, meta;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getContentVersionById(versionId, actor, dbClient)];
                case 1:
                    version = _b.sent();
                    if (!version) {
                        return [2 /*return*/, null];
                    }
                    if (version.contentType !== "file_snapshot" || !version.snapshotObjectKey) {
                        return [2 /*return*/, null];
                    }
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, (0, storage_1.storageGet)(version.snapshotObjectKey)];
                case 3:
                    resolved = _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    throw new Error("The archived file could not be found in storage");
                case 5:
                    meta = {};
                    try {
                        meta = JSON.parse(version.content);
                    }
                    catch (_c) {
                        // ignore
                    }
                    return [2 /*return*/, {
                            url: resolved.url,
                            fileName: meta.file_name || "download",
                            fileType: meta.file_type || "application/octet-stream",
                        }];
            }
        });
    });
}
function restoreContentVersion(versionId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, version, existing, permissionLevel, oldMetadata_2, restoredUrl_1, _a, restoredMeta_1, currentLinks_2, currentStorageKey, currentFileType, currentSnapshotContent, updated, indexJob;
        var _this = this;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _h.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getContentVersionById(versionId, actor, db)];
                case 2:
                    version = _h.sent();
                    if (!version) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getLibraryItemRowById(db, version.libraryItemId, actorTenantId)];
                case 3:
                    existing = _h.sent();
                    if (!existing) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getUserPermissionLevel(db, existing.id, actor)];
                case 4:
                    permissionLevel = _h.sent();
                    if (!canManageLibraryItem(existing, actor, permissionLevel)) {
                        return [2 /*return*/, null];
                    }
                    if (!(version.contentType === "file_snapshot" && version.snapshotObjectKey)) return [3 /*break*/, 13];
                    oldMetadata_2 = ((_b = existing.metadata) !== null && _b !== void 0 ? _b : {});
                    _h.label = 5;
                case 5:
                    _h.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, (0, storage_1.storageGet)(version.snapshotObjectKey)];
                case 6:
                    restoredUrl_1 = _h.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _a = _h.sent();
                    throw new Error("The archived file could not be found in storage. It may have been deleted.");
                case 8:
                    restoredMeta_1 = {};
                    try {
                        restoredMeta_1 = JSON.parse(version.content);
                    }
                    catch (_j) {
                        restoredMeta_1 = oldMetadata_2;
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryLinks)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryLinks.libraryItemId, existing.id), (0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkType, "upload_key")))
                            .limit(1)];
                case 9:
                    currentLinks_2 = _h.sent();
                    currentStorageKey = (_d = (_c = currentLinks_2[0]) === null || _c === void 0 ? void 0 : _c.linkId) !== null && _d !== void 0 ? _d : null;
                    currentFileType = typeof oldMetadata_2.file_type === "string"
                        ? oldMetadata_2.file_type
                        : "application/octet-stream";
                    currentSnapshotContent = JSON.stringify({
                        file_name: (_e = oldMetadata_2.file_name) !== null && _e !== void 0 ? _e : existing.title,
                        file_type: currentFileType,
                        file_size_bytes: (_f = oldMetadata_2.file_size_bytes) !== null && _f !== void 0 ? _f : 0,
                        original_source_url: (_g = existing.sourceUrl) !== null && _g !== void 0 ? _g : null,
                    });
                    return [4 /*yield*/, createContentVersion(db, {
                            tenantId: actorTenantId,
                            libraryItemId: existing.id,
                            content: currentSnapshotContent,
                            contentType: "file_snapshot",
                            createdByUserId: actor.userId,
                            changeDescription: "Archived before restoring version ".concat(version.versionNumber),
                            snapshotObjectKey: currentStorageKey !== null && currentStorageKey !== void 0 ? currentStorageKey : undefined,
                        })];
                case 10:
                    _h.sent();
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var now, updatedRows, txUpdated;
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        now = new Date();
                                        return [4 /*yield*/, tx
                                                .update(schema_1.libraryItems)
                                                .set({
                                                sourceUrl: restoredUrl_1.url,
                                                thumbnailUrl: existing.itemType === "image" ? restoredUrl_1.url : existing.thumbnailUrl,
                                                status: "indexing",
                                                metadata: normalizeLibraryMetadata(__assign(__assign({}, oldMetadata_2), { file_name: (_a = restoredMeta_1.file_name) !== null && _a !== void 0 ? _a : oldMetadata_2.file_name, file_type: (_b = restoredMeta_1.file_type) !== null && _b !== void 0 ? _b : oldMetadata_2.file_type, file_size_bytes: (_c = restoredMeta_1.file_size_bytes) !== null && _c !== void 0 ? _c : oldMetadata_2.file_size_bytes })),
                                                updatedAt: now,
                                            })
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, existing.id), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))
                                                .returning()];
                                    case 1:
                                        updatedRows = _d.sent();
                                        txUpdated = updatedRows[0];
                                        if (!txUpdated) {
                                            throw new Error("Failed to restore file version");
                                        }
                                        if (!currentLinks_2[0]) return [3 /*break*/, 3];
                                        return [4 /*yield*/, tx
                                                .update(schema_1.libraryLinks)
                                                .set({ linkId: version.snapshotObjectKey })
                                                .where((0, drizzle_orm_1.eq)(schema_1.libraryLinks.id, currentLinks_2[0].id))];
                                    case 2:
                                        _d.sent();
                                        return [3 /*break*/, 5];
                                    case 3: return [4 /*yield*/, tx.insert(schema_1.libraryLinks).values({
                                            libraryItemId: existing.id,
                                            linkType: "upload_key",
                                            linkId: version.snapshotObjectKey,
                                            tenantId: actorTenantId,
                                        })];
                                    case 4:
                                        _d.sent();
                                        _d.label = 5;
                                    case 5: return [2 /*return*/, txUpdated];
                                }
                            });
                        }); })];
                case 11:
                    updated = _h.sent();
                    return [4 /*yield*/, safeEnqueueLibraryIndexJob({
                            libraryItemId: existing.id,
                            tenantId: actorTenantId,
                            jobType: "file_replace",
                            domain: "library",
                            operation: "index",
                            source: "library.restore_file_version",
                            sourceMetadata: {
                                ingestion: "file_version_restore",
                                restoredVersionNumber: version.versionNumber,
                            },
                            allowThrottle: true,
                        }, db)];
                case 12:
                    indexJob = _h.sent();
                    return [2 /*return*/, {
                            item: toLibraryItemDto(updated),
                            indexJob: indexJob,
                        }];
                case 13: 
                // Default: markdown version restore
                return [2 /*return*/, saveLibraryMarkdown({
                        itemId: version.libraryItemId,
                        content: version.content,
                        changeDescription: "Restored from version ".concat(version.versionNumber),
                    }, actor, db)];
            }
        });
    });
}
function searchLibraryItems(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, limit, offset, query, queryTokens, scope, applyFolderFilter, folderCondition, itemRows, filteredItems, itemIds, providerConfig, resolvedProvider, userGroups, groupIds, permissionRows, groupIdNums, scopedItems, visibleEntries, visibleItemIds, pgvectorCandidateIds, shouldTryNativePgvector, _a, _b, pgvectorScores, chunkRows, chunkCandidateIds, chunksByItem, _i, chunkRows_2, chunk, list, visibleScored, paged, results, total;
        var _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _h.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    limit = Math.min(Math.max((_c = input.limit) !== null && _c !== void 0 ? _c : 20, 1), 50);
                    offset = Math.max((_d = input.offset) !== null && _d !== void 0 ? _d : 0, 0);
                    query = ((_e = input.query) !== null && _e !== void 0 ? _e : "").trim();
                    queryTokens = tokenize(query);
                    scope = (_f = input.scope) !== null && _f !== void 0 ? _f : "all";
                    applyFolderFilter = (scope === "my_library" || scope === "all")
                        && "folderId" in input;
                    folderCondition = applyFolderFilter
                        ? (input.folderId == null ? (0, drizzle_orm_1.isNull)(schema_1.libraryItems.parentId) : (0, drizzle_orm_1.eq)(schema_1.libraryItems.parentId, input.folderId))
                        : undefined;
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt), folderCondition))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.libraryItems.createdAt))];
                case 2:
                    itemRows = _h.sent();
                    filteredItems = itemRows.filter(function (item) { return itemMatchesFilters(item, input.filters); });
                    itemIds = filteredItems.map(function (item) { return item.id; });
                    if (itemIds.length === 0) {
                        return [2 /*return*/, {
                                version: "library_search_v1",
                                query: query,
                                total: 0,
                                limit: limit,
                                offset: offset,
                                has_more: false,
                                results: [],
                            }];
                    }
                    return [4 /*yield*/, (0, vectorProvider_1.getEffectiveVectorProviderConfig)({
                            tenantId: actorTenantId,
                        })];
                case 3:
                    providerConfig = _h.sent();
                    resolvedProvider = (0, vectorProvider_1.resolveVectorProvider)("search", providerConfig);
                    return [4 /*yield*/, getUserGroups(actor.userId, actorTenantId)];
                case 4:
                    userGroups = _h.sent();
                    groupIds = userGroups.map(function (g) { return String(g.id); });
                    return [4 /*yield*/, db
                            .select({
                            libraryItemId: schema_1.libraryPermissions.libraryItemId,
                            subjectType: schema_1.libraryPermissions.subjectType,
                            subjectId: schema_1.libraryPermissions.subjectId,
                            permissionLevel: schema_1.libraryPermissions.permissionLevel,
                            expiresAt: schema_1.libraryPermissions.expiresAt,
                        })
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId), drizzle_orm_1.or.apply(void 0, __spreadArray([(0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "user"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, String(actor.userId))),
                            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "tenant_role"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, actor.role || ""))], (groupIds.length > 0 ? [
                            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "group"), (0, drizzle_orm_1.inArray)(schema_1.libraryPermissions.subjectId, groupIds))
                        ] : []), false)), (0, drizzle_orm_1.inArray)(schema_1.libraryPermissions.libraryItemId, itemIds), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.libraryPermissions.expiresAt), (0, drizzle_orm_1.gt)(schema_1.libraryPermissions.expiresAt, new Date()))))];
                case 5:
                    permissionRows = _h.sent();
                    groupIdNums = userGroups.map(function (g) { return g.id; });
                    scopedItems = filteredItems.filter(function (item) { return matchesPrivateVaultScope(item, scope); });
                    visibleEntries = scopedItems.reduce(function (acc, item) {
                        var permissionInfo = getPermissionLevelForItem(permissionRows, item.id, actor, groupIdNums);
                        if (!canReadLibraryItem(item, actor, permissionInfo.effectivePermissionLevel)) {
                            return acc;
                        }
                        var accessSource = getDocumentAccessSource(item, actor, permissionInfo);
                        if (!matchesDocumentScope(scope, accessSource, {
                            hasDirectShare: permissionInfo.hasDirectShare,
                            hasGroupShare: permissionInfo.hasGroupShare,
                        })) {
                            return acc;
                        }
                        acc.push({
                            item: item,
                            accessSource: accessSource,
                            permissionInfo: permissionInfo,
                        });
                        return acc;
                    }, []);
                    visibleItemIds = visibleEntries.map(function (entry) { return entry.item.id; });
                    pgvectorCandidateIds = visibleItemIds.slice(0, LIBRARY_PGVECTOR_CANDIDATE_LIMIT);
                    _a = query.length > 0 &&
                        resolvedProvider.provider === "pgvector";
                    if (!_a) return [3 /*break*/, 7];
                    _b = Boolean;
                    return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 6:
                    _a = _b.apply(void 0, [(_h.sent()).proxyToken]);
                    _h.label = 7;
                case 7:
                    shouldTryNativePgvector = _a;
                    pgvectorScores = null;
                    chunkRows = [];
                    if (!(query.length > 0)) return [3 /*break*/, 11];
                    if (!shouldTryNativePgvector) return [3 /*break*/, 9];
                    return [4 /*yield*/, fetchPgvectorLibraryScores({
                            tenantId: actorTenantId,
                            query: query,
                            itemIds: pgvectorCandidateIds,
                        })];
                case 8:
                    pgvectorScores = _h.sent();
                    _h.label = 9;
                case 9:
                    if (!(!shouldTryNativePgvector || pgvectorScores === null)) return [3 /*break*/, 11];
                    chunkCandidateIds = shouldTryNativePgvector ? pgvectorCandidateIds : visibleItemIds;
                    if (!(chunkCandidateIds.length > 0)) return [3 /*break*/, 11];
                    return [4 /*yield*/, db
                            .select({
                            libraryItemId: schema_1.libraryChunks.libraryItemId,
                            content: schema_1.libraryChunks.content,
                            vectorRefId: schema_1.libraryChunks.vectorRefId,
                        })
                            .from(schema_1.libraryChunks)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryChunks.tenantId, actorTenantId), (0, drizzle_orm_1.inArray)(schema_1.libraryChunks.libraryItemId, chunkCandidateIds)))];
                case 10:
                    chunkRows = _h.sent();
                    _h.label = 11;
                case 11:
                    chunksByItem = new Map();
                    for (_i = 0, chunkRows_2 = chunkRows; _i < chunkRows_2.length; _i++) {
                        chunk = chunkRows_2[_i];
                        list = (_g = chunksByItem.get(chunk.libraryItemId)) !== null && _g !== void 0 ? _g : [];
                        list.push({
                            content: chunk.content,
                            vectorRefId: chunk.vectorRefId,
                        });
                        chunksByItem.set(chunk.libraryItemId, list);
                    }
                    visibleScored = visibleEntries
                        .map(function (entry) {
                        var _a, _b, _c;
                        var item = entry.item;
                        var metadata = normalizeLibraryMetadata(item.metadata);
                        var chunks = (_a = chunksByItem.get(item.id)) !== null && _a !== void 0 ? _a : [];
                        var itemText = [
                            item.title,
                            (_b = item.description) !== null && _b !== void 0 ? _b : "",
                            JSON.stringify(metadata),
                        ].join(" ");
                        var keywordScore = query ? computeTokenOverlapScore(queryTokens, itemText) : 0;
                        var fallbackVectorScore = query
                            ? chunks
                                .filter(function (chunk) { return Boolean(chunk.vectorRefId); })
                                .reduce(function (maxScore, chunk) {
                                var score = computeTokenOverlapScore(queryTokens, chunk.content);
                                return score > maxScore ? score : maxScore;
                            }, 0)
                            : 0;
                        var vectorScore = query
                            ? pgvectorScores
                                ? ((_c = pgvectorScores.get(item.id)) !== null && _c !== void 0 ? _c : 0)
                                : fallbackVectorScore
                            : 0;
                        var combinedScore = query
                            ? Number((0.45 * keywordScore + 0.55 * vectorScore).toFixed(6))
                            : 0;
                        var providerName = typeof metadata.provider_name === "string"
                            ? metadata.provider_name
                            : typeof metadata.provider === "string"
                                ? metadata.provider
                                : null;
                        var modelName = typeof metadata.model_name === "string"
                            ? metadata.model_name
                            : typeof metadata.model === "string"
                                ? metadata.model
                                : null;
                        return {
                            item: item,
                            accessSource: entry.accessSource,
                            keywordScore: keywordScore,
                            vectorScore: vectorScore,
                            combinedScore: combinedScore,
                            providerName: providerName,
                            modelName: modelName,
                        };
                    })
                        .filter(function (entry) {
                        if (!query)
                            return true;
                        return entry.keywordScore > 0 || entry.vectorScore > 0;
                    });
                    visibleScored.sort(function (a, b) {
                        if (b.combinedScore !== a.combinedScore)
                            return b.combinedScore - a.combinedScore;
                        if (b.keywordScore !== a.keywordScore)
                            return b.keywordScore - a.keywordScore;
                        if (b.vectorScore !== a.vectorScore)
                            return b.vectorScore - a.vectorScore;
                        if (b.item.createdAt.getTime() !== a.item.createdAt.getTime()) {
                            return b.item.createdAt.getTime() - a.item.createdAt.getTime();
                        }
                        return a.item.id - b.item.id;
                    });
                    paged = visibleScored.slice(offset, offset + limit);
                    results = paged.map(function (entry) {
                        var _a, _b;
                        return ({
                            item_id: entry.item.id,
                            item_type: entry.item.itemType,
                            title: entry.item.title,
                            description: (_a = entry.item.description) !== null && _a !== void 0 ? _a : null,
                            source_url: entry.item.sourceUrl,
                            thumbnail_url: entry.item.thumbnailUrl,
                            status: entry.item.status,
                            source: entry.item.source,
                            provider_name: entry.providerName,
                            model_name: entry.modelName,
                            owner_user_id: entry.item.ownerUserId,
                            parent_id: (_b = entry.item.parentId) !== null && _b !== void 0 ? _b : null,
                            metadata: normalizeLibraryMetadata(entry.item.metadata),
                            access_source: entry.accessSource,
                            created_at: entry.item.createdAt.toISOString(),
                            updated_at: entry.item.updatedAt.toISOString(),
                            combined_score: entry.combinedScore,
                            keyword_score: Number(entry.keywordScore.toFixed(6)),
                            vector_score: Number(entry.vectorScore.toFixed(6)),
                            attach_payload: {
                                item_id: entry.item.id,
                                item_type: entry.item.itemType,
                                title: entry.item.title,
                                source: entry.item.source,
                            },
                        });
                    });
                    total = visibleScored.length;
                    return [2 /*return*/, {
                            version: "library_search_v1",
                            query: query,
                            total: total,
                            limit: limit,
                            offset: offset,
                            has_more: offset + results.length < total,
                            results: results,
                        }];
            }
        });
    });
}
// ── ShareFile: Share Management ──
function removeLibraryShare(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, permission, level, deleted;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getUserEffectivePermission(input.itemId, actor, db)];
                case 2:
                    permission = _a.sent();
                    level = permission.effectivePermissionLevel;
                    if (level !== "delete" && level !== "owner") {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "You need delete or owner permission to manage shares",
                        });
                    }
                    return [4 /*yield*/, db
                            .delete(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.libraryItemId, input.itemId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, input.subjectType), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, input.subjectId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId)))
                            .returning({ id: schema_1.libraryPermissions.id })];
                case 3:
                    deleted = _a.sent();
                    if (!deleted[0]) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Share not found",
                        });
                    }
                    // Recompute allowed_scopes after unsharing (immediate revocation)
                    return [4 /*yield*/, recomputeAndPropagateScopes(input.itemId, actorTenantId, db)];
                case 4:
                    // Recompute allowed_scopes after unsharing (immediate revocation)
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
function updateLibrarySharePermission(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, permission, level, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getUserEffectivePermission(input.itemId, actor, db)];
                case 2:
                    permission = _a.sent();
                    level = permission.effectivePermissionLevel;
                    if (level !== "delete" && level !== "owner") {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "You need delete or owner permission to manage shares",
                        });
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.libraryPermissions)
                            .set({
                            permissionLevel: input.permissionLevel,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.libraryItemId, input.itemId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, input.subjectType), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, input.subjectId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId)))
                            .returning({ id: schema_1.libraryPermissions.id })];
                case 3:
                    updated = _a.sent();
                    if (!updated[0]) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Share not found",
                        });
                    }
                    // Recompute allowed_scopes after permission level change
                    return [4 /*yield*/, recomputeAndPropagateScopes(input.itemId, actorTenantId, db)];
                case 4:
                    // Recompute allowed_scopes after permission level change
                    _a.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
function getLibraryItemShares(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, permission, permRows, userSubjectIds, groupSubjectIds, _a, userNameRows, groupNameRows, userNameMap, groupNameMap, shares;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, getUserEffectivePermission(itemId, actor, db)];
                case 2:
                    permission = _b.sent();
                    if (!permission.effectivePermissionLevel) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "You don't have access to this item",
                        });
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.libraryPermissions.id,
                            subjectType: schema_1.libraryPermissions.subjectType,
                            subjectId: schema_1.libraryPermissions.subjectId,
                            permissionLevel: schema_1.libraryPermissions.permissionLevel,
                            expiresAt: schema_1.libraryPermissions.expiresAt,
                        })
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.libraryItemId, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, actorTenantId)))
                            .limit(200)];
                case 3:
                    permRows = _b.sent();
                    userSubjectIds = permRows
                        .filter(function (p) { return p.subjectType === "user"; })
                        .map(function (p) { return Number(p.subjectId); });
                    groupSubjectIds = permRows
                        .filter(function (p) { return p.subjectType === "group"; })
                        .map(function (p) { return Number(p.subjectId); });
                    return [4 /*yield*/, Promise.all([
                            userSubjectIds.length > 0
                                ? db
                                    .select({ id: schema_1.users.id, name: schema_1.users.name })
                                    .from(schema_1.users)
                                    .where((0, drizzle_orm_1.inArray)(schema_1.users.id, userSubjectIds))
                                : Promise.resolve([]),
                            groupSubjectIds.length > 0
                                ? db
                                    .select({ id: schema_1.userGroups.id, name: schema_1.userGroups.name })
                                    .from(schema_1.userGroups)
                                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.userGroups.id, groupSubjectIds), (0, drizzle_orm_1.isNull)(schema_1.userGroups.deletedAt)))
                                : Promise.resolve([]),
                        ])];
                case 4:
                    _a = _b.sent(), userNameRows = _a[0], groupNameRows = _a[1];
                    userNameMap = new Map(userNameRows.map(function (r) { return [r.id, r.name]; }));
                    groupNameMap = new Map(groupNameRows.map(function (r) { return [r.id, r.name]; }));
                    shares = permRows.map(function (p) {
                        var _a, _b;
                        var base = {
                            id: p.id,
                            subjectType: p.subjectType,
                            subjectId: p.subjectId,
                            permissionLevel: p.permissionLevel,
                            expiresAt: p.expiresAt,
                        };
                        if (p.subjectType === "user") {
                            return __assign(__assign({}, base), { userName: (_a = userNameMap.get(Number(p.subjectId))) !== null && _a !== void 0 ? _a : null });
                        }
                        if (p.subjectType === "group") {
                            return __assign(__assign({}, base), { groupName: (_b = groupNameMap.get(Number(p.subjectId))) !== null && _b !== void 0 ? _b : "Deleted Group" });
                        }
                        // tenant_role
                        return __assign(__assign({}, base), { roleName: p.subjectId });
                    });
                    return [2 /*return*/, { shares: shares }];
            }
        });
    });
}
// ── ShareFile: Trash Management ──
var MS_PER_DAY = 86400000;
var TRASH_PURGE_DAYS = 90;
function listLibraryTrash(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, limit, offset, whereCondition, totalRow, rows, now, items;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _d.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    limit = (_a = input.limit) !== null && _a !== void 0 ? _a : 50;
                    offset = (_b = input.offset) !== null && _b !== void 0 ? _b : 0;
                    whereCondition = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNotNull)(schema_1.libraryItems.deletedAt), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.libraryItems.ownerUserId, actor.userId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.deletedBy, actor.userId)));
                    return [4 /*yield*/, db
                            .select({ total: (0, drizzle_orm_1.count)() })
                            .from(schema_1.libraryItems)
                            .where(whereCondition)];
                case 2:
                    totalRow = (_d.sent())[0];
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.libraryItems.id,
                            title: schema_1.libraryItems.title,
                            itemType: schema_1.libraryItems.itemType,
                            source: schema_1.libraryItems.source,
                            thumbnailUrl: schema_1.libraryItems.thumbnailUrl,
                            deletedAt: schema_1.libraryItems.deletedAt,
                            deletedBy: schema_1.libraryItems.deletedBy,
                        })
                            .from(schema_1.libraryItems)
                            .where(whereCondition)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.libraryItems.deletedAt))
                            .limit(limit)
                            .offset(offset)];
                case 3:
                    rows = _d.sent();
                    now = Date.now();
                    items = rows.map(function (r) {
                        var deletedAtMs = r.deletedAt ? new Date(r.deletedAt).getTime() : now;
                        var daysInTrash = Math.floor((now - deletedAtMs) / MS_PER_DAY);
                        return __assign(__assign({}, r), { daysInTrash: daysInTrash, daysUntilPurge: Math.max(0, TRASH_PURGE_DAYS - daysInTrash) });
                    });
                    return [2 /*return*/, { items: items, total: Number((_c = totalRow === null || totalRow === void 0 ? void 0 : totalRow.total) !== null && _c !== void 0 ? _c : 0) }];
            }
        });
    });
}
function restoreFromLibraryTrash(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var rows, item;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .select({
                                            id: schema_1.libraryItems.id,
                                            ownerUserId: schema_1.libraryItems.ownerUserId,
                                            deletedBy: schema_1.libraryItems.deletedBy,
                                        })
                                            .from(schema_1.libraryItems)
                                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNotNull)(schema_1.libraryItems.deletedAt)))
                                            .limit(1)];
                                    case 1:
                                        rows = _a.sent();
                                        item = rows[0];
                                        if (!item) {
                                            throw new server_1.TRPCError({
                                                code: "NOT_FOUND",
                                                message: "Item not found in trash",
                                            });
                                        }
                                        if (item.ownerUserId !== actor.userId && item.deletedBy !== actor.userId) {
                                            throw new server_1.TRPCError({
                                                code: "FORBIDDEN",
                                                message: "Only the item owner or the person who deleted it can restore",
                                            });
                                        }
                                        return [4 /*yield*/, tx
                                                .update(schema_1.libraryItems)
                                                .set({
                                                deletedAt: null,
                                                deletedBy: null,
                                                status: "ready",
                                                updatedAt: new Date(),
                                            })
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/, true];
                                }
                            });
                        }); })];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Cascade-delete all child records for a library item, then delete the item itself.
 * Shared by permanentDeleteLibraryItem (user-initiated) and auto-purge job (system).
 * Order: links -> chunks -> index jobs -> permissions -> item
 */
function cascadeDeleteLibraryItem(tx, itemId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, tx.delete(schema_1.libraryLinks).where((0, drizzle_orm_1.eq)(schema_1.libraryLinks.libraryItemId, itemId))];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, tx.delete(schema_1.libraryChunks).where((0, drizzle_orm_1.eq)(schema_1.libraryChunks.libraryItemId, itemId))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, tx.delete(schema_1.libraryIndexJobs).where((0, drizzle_orm_1.eq)(schema_1.libraryIndexJobs.libraryItemId, itemId))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, tx.delete(schema_1.libraryPermissions).where((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.libraryItemId, itemId))];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, tx.delete(schema_1.libraryItems).where((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId))];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function permanentDeleteLibraryItem(itemId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, rows, item, isOwner, daysInTrash, isAdminWithExpired, _a, uploadKeyRows, vectorCleanupTargets, _i, uploadKeyRows_1, linkId, err_2, err_3;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.libraryItems.id,
                            ownerUserId: schema_1.libraryItems.ownerUserId,
                            deletedAt: schema_1.libraryItems.deletedAt,
                            sourceUrl: schema_1.libraryItems.sourceUrl,
                            thumbnailUrl: schema_1.libraryItems.thumbnailUrl,
                        })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNotNull)(schema_1.libraryItems.deletedAt)))
                            .limit(1)];
                case 2:
                    rows = _b.sent();
                    item = rows[0];
                    if (!item) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Item not found in trash",
                        });
                    }
                    isOwner = item.ownerUserId === actor.userId;
                    daysInTrash = item.deletedAt
                        ? Math.floor((Date.now() - new Date(item.deletedAt).getTime()) / MS_PER_DAY)
                        : 0;
                    isAdminWithExpired = (actor.role === "admin" || actor.role === "domain_admin") && daysInTrash >= TRASH_PURGE_DAYS;
                    if (!isOwner && !isAdminWithExpired) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Only the item owner can permanently delete, or admins for items 90+ days in trash",
                        });
                    }
                    return [4 /*yield*/, Promise.all([
                            db
                                .select({ linkId: schema_1.libraryLinks.linkId })
                                .from(schema_1.libraryLinks)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryLinks.libraryItemId, itemId), (0, drizzle_orm_1.eq)(schema_1.libraryLinks.linkType, "upload_key"))),
                            collectLibraryVectorCleanupTargets(itemId, actorTenantId, db).catch(function () { return ({
                                vectorRefIds: [],
                                indexNames: [],
                            }); }),
                        ])];
                case 3:
                    _a = _b.sent(), uploadKeyRows = _a[0], vectorCleanupTargets = _a[1];
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, cascadeDeleteLibraryItem(tx, itemId)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _b.sent();
                    _i = 0, uploadKeyRows_1 = uploadKeyRows;
                    _b.label = 5;
                case 5:
                    if (!(_i < uploadKeyRows_1.length)) return [3 /*break*/, 10];
                    linkId = uploadKeyRows_1[_i].linkId;
                    _b.label = 6;
                case 6:
                    _b.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, (0, storage_1.storageDelete)(linkId)];
                case 7:
                    _b.sent();
                    return [3 /*break*/, 9];
                case 8:
                    err_2 = _b.sent();
                    console.error("[permanent-delete] Storage cleanup failed for key ".concat(linkId, ":"), err_2 instanceof Error ? err_2.message : err_2);
                    return [3 /*break*/, 9];
                case 9:
                    _i++;
                    return [3 /*break*/, 5];
                case 10:
                    _b.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, cleanupLibraryVectorArtifacts({
                            tenantId: actorTenantId,
                            vectorRefIds: vectorCleanupTargets.vectorRefIds,
                            indexNames: vectorCleanupTargets.indexNames,
                        })];
                case 11:
                    _b.sent();
                    return [3 /*break*/, 13];
                case 12:
                    err_3 = _b.sent();
                    console.error("[permanent-delete] Vector cleanup failed for item ".concat(itemId, ":"), err_3 instanceof Error ? err_3.message : err_3);
                    return [3 /*break*/, 13];
                case 13: return [2 /*return*/, { daysInTrash: daysInTrash }];
            }
        });
    });
}
/**
 * Remove all Google Drive virtual references and associated data for a user.
 * Called during disconnect cleanup. Cascading FK deletes handle chunks and links.
 */
function removeGoogleDriveData(userId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, driveItems, itemIds, vectorCleanupTargets, chunkRow, linkRow, chunksDeleted, linksDeleted, BATCH_SIZE, i, batch;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({ id: schema_1.libraryItems.id })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.source, "google_drive"), (0, drizzle_orm_1.eq)(schema_1.libraryItems.ownerUserId, userId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, tenantId)))];
                case 2:
                    driveItems = _c.sent();
                    itemIds = driveItems.map(function (i) { return i.id; });
                    if (itemIds.length === 0) {
                        return [2 /*return*/, { itemsDeleted: 0, chunksDeleted: 0, linksDeleted: 0 }];
                    }
                    return [4 /*yield*/, collectLibraryVectorCleanupTargets(itemIds, tenantId, db).catch(function () { return ({
                            vectorRefIds: [],
                            indexNames: [],
                        }); })];
                case 3:
                    vectorCleanupTargets = _c.sent();
                    return [4 /*yield*/, db
                            .select({ cnt: (0, drizzle_orm_1.count)(schema_1.libraryChunks.id) })
                            .from(schema_1.libraryChunks)
                            .where((0, drizzle_orm_1.inArray)(schema_1.libraryChunks.libraryItemId, itemIds))];
                case 4:
                    chunkRow = (_c.sent())[0];
                    return [4 /*yield*/, db
                            .select({ cnt: (0, drizzle_orm_1.count)(schema_1.libraryLinks.id) })
                            .from(schema_1.libraryLinks)
                            .where((0, drizzle_orm_1.inArray)(schema_1.libraryLinks.libraryItemId, itemIds))];
                case 5:
                    linkRow = (_c.sent())[0];
                    chunksDeleted = (_a = chunkRow === null || chunkRow === void 0 ? void 0 : chunkRow.cnt) !== null && _a !== void 0 ? _a : 0;
                    linksDeleted = (_b = linkRow === null || linkRow === void 0 ? void 0 : linkRow.cnt) !== null && _b !== void 0 ? _b : 0;
                    BATCH_SIZE = 500;
                    i = 0;
                    _c.label = 6;
                case 6:
                    if (!(i < itemIds.length)) return [3 /*break*/, 9];
                    batch = itemIds.slice(i, i + BATCH_SIZE);
                    return [4 /*yield*/, db.delete(schema_1.libraryItems).where((0, drizzle_orm_1.inArray)(schema_1.libraryItems.id, batch))];
                case 7:
                    _c.sent();
                    _c.label = 8;
                case 8:
                    i += BATCH_SIZE;
                    return [3 /*break*/, 6];
                case 9: return [4 /*yield*/, cleanupLibraryVectorArtifacts({
                        tenantId: tenantId,
                        vectorRefIds: vectorCleanupTargets.vectorRefIds,
                        indexNames: vectorCleanupTargets.indexNames,
                    }).catch(function (err) {
                        console.error("[google-drive-cleanup] Vector cleanup failed for tenant ".concat(tenantId, ":"), err instanceof Error ? err.message : err);
                    })];
                case 10:
                    _c.sent();
                    return [2 /*return*/, { itemsDeleted: itemIds.length, chunksDeleted: chunksDeleted, linksDeleted: linksDeleted }];
            }
        });
    });
}
function findOwnedLibraryFolderByName(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, normalizedName, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    normalizedName = input.name.trim();
                    if (!normalizedName) {
                        throw new Error("Folder name is required");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.ownerUserId, actor.userId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.itemType, "folder"), (0, drizzle_orm_1.eq)(schema_1.libraryItems.title, normalizedName), input.parentId == null ? (0, drizzle_orm_1.isNull)(schema_1.libraryItems.parentId) : (0, drizzle_orm_1.eq)(schema_1.libraryItems.parentId, input.parentId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))
                            .orderBy(schema_1.libraryItems.id)
                            .limit(1)];
                case 2:
                    rows = _a.sent();
                    if (!rows[0]) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, toLibraryItemDto(rows[0])];
            }
        });
    });
}
/**
 * Create a folder item (itemType="folder") in the library.
 */
function createLibraryFolder(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            return [2 /*return*/, createLibraryItem({
                    itemType: "folder",
                    source: "document_management",
                    title: input.name.trim(),
                    description: null,
                    status: "ready",
                    visibility: "private",
                    parentId: (_a = input.parentId) !== null && _a !== void 0 ? _a : null,
                    metadata: { source_type: "folder" },
                }, actor, dbClient)];
        });
    });
}
function ensureOwnedLibraryFolder(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, findOwnedLibraryFolderByName(input, actor, dbClient)];
                case 1:
                    existing = _a.sent();
                    if (existing) {
                        return [2 /*return*/, { item: existing, idempotent: true }];
                    }
                    return [2 /*return*/, createLibraryFolder(input, actor, dbClient)];
            }
        });
    });
}
/**
 * Returns the number of non-deleted direct children inside a folder.
 */
function getLibraryFolderChildCount(folderId, tenantId, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, row;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    actorTenantId = normalizeLibraryTenantId(tenantId);
                    return [4 /*yield*/, db
                            .select({ cnt: (0, drizzle_orm_1.count)(schema_1.libraryItems.id) })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.parentId, folderId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))];
                case 2:
                    row = (_b.sent())[0];
                    return [2 /*return*/, Number((_a = row === null || row === void 0 ? void 0 : row.cnt) !== null && _a !== void 0 ? _a : 0)];
            }
        });
    });
}
/**
 * Returns the ancestor chain from root to the given folder (for breadcrumb).
 * The folder itself is included as the last element.
 */
function getLibraryFolderAncestors(folderId, tenantId, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, ancestors, currentId, depth, idToFetch, rows, row;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    actorTenantId = normalizeLibraryTenantId(tenantId);
                    ancestors = [];
                    currentId = folderId;
                    depth = 0;
                    _b.label = 2;
                case 2:
                    if (!(depth < 20 && currentId != null)) return [3 /*break*/, 5];
                    idToFetch = currentId;
                    return [4 /*yield*/, db
                            .select({ id: schema_1.libraryItems.id, title: schema_1.libraryItems.title, parentId: schema_1.libraryItems.parentId })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, idToFetch), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId)))
                            .limit(1)];
                case 3:
                    rows = _b.sent();
                    row = rows[0];
                    if (!row)
                        return [3 /*break*/, 5];
                    ancestors.unshift({ id: row.id, title: row.title });
                    currentId = (_a = row.parentId) !== null && _a !== void 0 ? _a : null;
                    _b.label = 4;
                case 4:
                    depth++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, ancestors];
            }
        });
    });
}
/**
 * Batch soft-delete multiple library items.
 * Returns how many were successfully deleted.
 */
function batchSoftDeleteLibraryItems(itemIds, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, now, existingRows, presentationItemIds, result, _i, presentationItemIds_1, presentationItemId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (itemIds.length === 0)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    now = new Date();
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.libraryItems.id,
                            itemType: schema_1.libraryItems.itemType,
                        })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.libraryItems.id, itemIds), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))];
                case 2:
                    existingRows = _a.sent();
                    presentationItemIds = existingRows
                        .filter(function (row) { return row.itemType === "presentation"; })
                        .map(function (row) { return row.id; });
                    return [4 /*yield*/, db
                            .update(schema_1.libraryItems)
                            .set({ deletedAt: now, deletedBy: actor.userId, status: "archived", updatedAt: now })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.libraryItems.id, itemIds), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))
                            .returning({ id: schema_1.libraryItems.id })];
                case 3:
                    result = _a.sent();
                    _i = 0, presentationItemIds_1 = presentationItemIds;
                    _a.label = 4;
                case 4:
                    if (!(_i < presentationItemIds_1.length)) return [3 /*break*/, 7];
                    presentationItemId = presentationItemIds_1[_i];
                    return [4 /*yield*/, softDeleteDeckScopedPresentationUploads(presentationItemId, actor, db)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7: return [2 /*return*/, result.length];
            }
        });
    });
}
/**
 * Share all non-folder items in a specific owned folder (recursive) with a group.
 * Returns the number of items that were newly shared (or already had a share updated).
 */
function shareLibraryToGroup(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, actorTenantId, group, folder, folderIds, frontier, children, next, ownedItems, subjectId, now, BATCH, shared, i, batch;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    actorTenantId = normalizeLibraryTenantId(actor.tenantId);
                    return [4 /*yield*/, db
                            .select({ id: schema_1.userGroups.id })
                            .from(schema_1.userGroups)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userGroups.id, input.groupId), (0, drizzle_orm_1.eq)(schema_1.userGroups.tenantId, actorTenantId), (0, drizzle_orm_1.isNull)(schema_1.userGroups.deletedAt)))
                            .limit(1)];
                case 2:
                    group = (_a.sent())[0];
                    if (!group) {
                        throw new Error("Group not found or does not belong to this tenant");
                    }
                    return [4 /*yield*/, db
                            .select({ id: schema_1.libraryItems.id })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.id, input.folderId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.ownerUserId, actor.userId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.itemType, "folder"), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))
                            .limit(1)];
                case 3:
                    folder = (_a.sent())[0];
                    if (!folder) {
                        throw new Error("Folder not found or you do not have permission to share it");
                    }
                    folderIds = [input.folderId];
                    frontier = [input.folderId];
                    _a.label = 4;
                case 4:
                    if (!(frontier.length > 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, db
                            .select({ id: schema_1.libraryItems.id })
                            .from(schema_1.libraryItems)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.ownerUserId, actor.userId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.itemType, "folder"), (0, drizzle_orm_1.inArray)(schema_1.libraryItems.parentId, frontier), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))];
                case 5:
                    children = _a.sent();
                    next = children
                        .map(function (row) { return row.id; })
                        .filter(function (id) { return !folderIds.includes(id); });
                    if (next.length === 0) {
                        return [3 /*break*/, 6];
                    }
                    folderIds.push.apply(folderIds, next);
                    frontier = next;
                    return [3 /*break*/, 4];
                case 6: return [4 /*yield*/, db
                        .select({ id: schema_1.libraryItems.id })
                        .from(schema_1.libraryItems)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryItems.tenantId, actorTenantId), (0, drizzle_orm_1.eq)(schema_1.libraryItems.ownerUserId, actor.userId), (0, drizzle_orm_1.ne)(schema_1.libraryItems.itemType, "folder"), (0, drizzle_orm_1.inArray)(schema_1.libraryItems.parentId, folderIds), (0, drizzle_orm_1.isNull)(schema_1.libraryItems.deletedAt)))];
                case 7:
                    ownedItems = _a.sent();
                    if (ownedItems.length === 0)
                        return [2 /*return*/, { shared: 0 }];
                    subjectId = String(input.groupId);
                    now = new Date();
                    BATCH = 100;
                    shared = 0;
                    i = 0;
                    _a.label = 8;
                case 8:
                    if (!(i < ownedItems.length)) return [3 /*break*/, 11];
                    batch = ownedItems.slice(i, i + BATCH);
                    return [4 /*yield*/, db
                            .insert(schema_1.libraryPermissions)
                            .values(batch.map(function (item) { return ({
                            tenantId: actorTenantId,
                            libraryItemId: item.id,
                            subjectType: "group",
                            subjectId: subjectId,
                            permissionLevel: input.permissionLevel,
                            grantedByUserId: actor.userId,
                            createdAt: now,
                            updatedAt: now,
                        }); }))
                            .onConflictDoUpdate({
                            target: [schema_1.libraryPermissions.libraryItemId, schema_1.libraryPermissions.subjectType, schema_1.libraryPermissions.subjectId],
                            set: { permissionLevel: input.permissionLevel, updatedAt: now },
                        })];
                case 9:
                    _a.sent();
                    shared += batch.length;
                    _a.label = 10;
                case 10:
                    i += BATCH;
                    return [3 /*break*/, 8];
                case 11: return [2 /*return*/, { shared: shared }];
            }
        });
    });
}
var templateObject_1, templateObject_2;
