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
exports.VectorProviderError = void 0;
exports.getProviderCapabilities = getProviderCapabilities;
exports.resolveVectorProvider = resolveVectorProvider;
exports.validateProviderCapabilityRequest = validateProviderCapabilityRequest;
exports.registerVectorProviderAdapter = registerVectorProviderAdapter;
exports.resetVectorProviderAdapterRegistry = resetVectorProviderAdapterRegistry;
exports.resetVectorProviderConfigCacheForTests = resetVectorProviderConfigCacheForTests;
exports.createVectorProviderAdapter = createVectorProviderAdapter;
exports.dispatchVectorOperation = dispatchVectorOperation;
exports.getVectorProviderConfigFromEnv = getVectorProviderConfigFromEnv;
exports.getEffectiveVectorProviderConfig = getEffectiveVectorProviderConfig;
var promises_1 = require("node:fs/promises");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var crypto_1 = require("./crypto");
var PROVIDER_CAPABILITIES = {
    cloudflare_vectorize: {
        provider: "cloudflare_vectorize",
        minTopK: 1,
        maxTopK: 100,
        supportsMetadataFilter: true,
        supportedDimensions: [768],
    },
    pgvector: {
        provider: "pgvector",
        minTopK: 1,
        maxTopK: 1000,
        supportsMetadataFilter: true,
        supportedDimensions: [384, 768, 1024, 1536],
    },
    chromadb: {
        provider: "chromadb",
        minTopK: 1,
        maxTopK: 100,
        supportsMetadataFilter: true,
        supportedDimensions: [384, 768],
    },
};
var overrideAdapters = {};
var CHROMA_INDEX_FILE_SUFFIX = ".json";
var CHROMA_LOCK_FILE_SUFFIX = ".lock";
var CHROMA_DEFAULT_PERSIST_DIR = (0, node_path_1.join)((0, node_os_1.tmpdir)(), "smartspec-chromadb");
var CHROMA_LOCK_RETRY_MS = 20;
var CHROMA_LOCK_MAX_WAIT_MS = 5000;
var PGVECTOR_TABLE_NAME = "smartspec_vector_entries";
var MAX_PGVECTOR_SEARCH_SCAN = 5000;
var pgPoolCache = new Map();
var pgSchemaReady = new Set();
var EFFECTIVE_CONFIG_CACHE_TTL_MS = 5000;
var VECTORDB_SETTING_KEYS = [
    "provider",
    "currentReadProvider",
    "targetProvider",
    "mirrorWrites",
    "chromaPersistDir",
    "pgvectorHost",
    "pgvectorPort",
    "pgvectorDatabase",
    "pgvectorUser",
    "pgvectorPassword",
    "pgvectorConnectTimeout",
    "vectorizeAccountId",
    "vectorizeApiToken",
];
var effectiveConfigCache = new Map();
function isProvider(value) {
    return value === "cloudflare_vectorize" || value === "pgvector" || value === "chromadb";
}
function isTransientError(err) {
    if (!(err instanceof Error))
        return false;
    var message = err.message.toLowerCase();
    return (message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("econnreset") ||
        message.includes("econnrefused") ||
        message.includes("503") ||
        message.includes("429"));
}
var VectorProviderError = /** @class */ (function (_super) {
    __extends(VectorProviderError, _super);
    function VectorProviderError(params) {
        var _this = _super.call(this, params.message) || this;
        _this.name = "VectorProviderError";
        _this.provider = params.provider;
        _this.code = params.code;
        _this.classification = params.classification;
        return _this;
    }
    return VectorProviderError;
}(Error));
exports.VectorProviderError = VectorProviderError;
function normalizeProviderError(provider, code, error) {
    if (error instanceof VectorProviderError) {
        return error;
    }
    var message = error instanceof Error ? error.message : String(error);
    return new VectorProviderError({
        provider: provider,
        code: code,
        message: message,
        classification: isTransientError(error) ? "transient" : "permanent",
    });
}
function extractRows(result) {
    if (Array.isArray(result))
        return result;
    if (result && typeof result === "object" && Array.isArray(result.rows)) {
        return result.rows;
    }
    return [];
}
function parseBoolean(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    if (typeof value === "string") {
        var normalized = value.trim().toLowerCase();
        if (!normalized)
            return undefined;
        if (["1", "true", "yes", "on"].includes(normalized))
            return true;
        if (["0", "false", "no", "off"].includes(normalized))
            return false;
    }
    return undefined;
}
function applyDefinedSettings(target, patch) {
    var next = __assign({}, target);
    for (var _i = 0, _a = Object.entries(patch); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        if (value !== undefined) {
            next[key] = value;
        }
    }
    return next;
}
function decodeSettingValue(value, isSensitive) {
    if (value === null || value === undefined) {
        return undefined;
    }
    var trimmed = String(value).trim();
    if (!trimmed) {
        return undefined;
    }
    if (!isSensitive) {
        return trimmed;
    }
    try {
        return (0, crypto_1.decrypt)(trimmed) || trimmed;
    }
    catch (_a) {
        return trimmed;
    }
}
function loadStoredVectorProviderConfig(params) {
    return __awaiter(this, void 0, void 0, function () {
        var db, settingRows, settingsMap, _i, settingRows_1, row, decoded, fromSettings, tenantId, switchResult, switchRow, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _d.sent();
                    if (!db) {
                        return [2 /*return*/, {}];
                    }
                    return [4 /*yield*/, db
                            .select({
                            key: schema_1.systemSettings.key,
                            value: schema_1.systemSettings.value,
                            isSensitive: schema_1.systemSettings.isSensitive,
                        })
                            .from(schema_1.systemSettings)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.systemSettings.category, "vectordb"), (0, drizzle_orm_1.inArray)(schema_1.systemSettings.key, __spreadArray([], VECTORDB_SETTING_KEYS, true))))];
                case 2:
                    settingRows = _d.sent();
                    settingsMap = new Map();
                    for (_i = 0, settingRows_1 = settingRows; _i < settingRows_1.length; _i++) {
                        row = settingRows_1[_i];
                        decoded = decodeSettingValue(row.value, (_b = row.isSensitive) !== null && _b !== void 0 ? _b : false);
                        if (decoded !== undefined) {
                            settingsMap.set(String(row.key), decoded);
                        }
                    }
                    fromSettings = {
                        provider: settingsMap.get("provider"),
                        currentReadProvider: settingsMap.get("currentReadProvider"),
                        targetProvider: settingsMap.get("targetProvider"),
                        mirrorWrites: parseBoolean(settingsMap.get("mirrorWrites")),
                        chromaPersistDir: settingsMap.get("chromaPersistDir"),
                        pgvectorHost: settingsMap.get("pgvectorHost"),
                        pgvectorPort: settingsMap.get("pgvectorPort"),
                        pgvectorDatabase: settingsMap.get("pgvectorDatabase"),
                        pgvectorUser: settingsMap.get("pgvectorUser"),
                        pgvectorPassword: settingsMap.get("pgvectorPassword"),
                        vectorizeAccountId: settingsMap.get("vectorizeAccountId"),
                        vectorizeApiToken: settingsMap.get("vectorizeApiToken"),
                    };
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 8, , 9]);
                    tenantId = (_c = params === null || params === void 0 ? void 0 : params.tenantId) === null || _c === void 0 ? void 0 : _c.trim();
                    switchResult = void 0;
                    if (!tenantId) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n        SELECT current_read_provider, target_provider, mirror_writes\n        FROM library_provider_switch_states\n        WHERE tenant_id = ", " OR tenant_id IS NULL\n        ORDER BY CASE WHEN tenant_id = ", " THEN 0 ELSE 1 END, updated_at DESC, id DESC\n        LIMIT 1\n      "], ["\n        SELECT current_read_provider, target_provider, mirror_writes\n        FROM library_provider_switch_states\n        WHERE tenant_id = ", " OR tenant_id IS NULL\n        ORDER BY CASE WHEN tenant_id = ", " THEN 0 ELSE 1 END, updated_at DESC, id DESC\n        LIMIT 1\n      "])), tenantId, tenantId))];
                case 4:
                    switchResult = _d.sent();
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n        SELECT current_read_provider, target_provider, mirror_writes\n        FROM library_provider_switch_states\n        WHERE tenant_id IS NULL\n        ORDER BY updated_at DESC, id DESC\n        LIMIT 1\n      "], ["\n        SELECT current_read_provider, target_provider, mirror_writes\n        FROM library_provider_switch_states\n        WHERE tenant_id IS NULL\n        ORDER BY updated_at DESC, id DESC\n        LIMIT 1\n      "]))))];
                case 6:
                    switchResult = _d.sent();
                    _d.label = 7;
                case 7:
                    switchRow = extractRows(switchResult)[0];
                    if (!switchRow) {
                        return [2 /*return*/, fromSettings];
                    }
                    return [2 /*return*/, __assign(__assign({}, fromSettings), { currentReadProvider: switchRow.current_read_provider ? String(switchRow.current_read_provider) : fromSettings.currentReadProvider, targetProvider: switchRow.target_provider ? String(switchRow.target_provider) : fromSettings.targetProvider, mirrorWrites: typeof switchRow.mirror_writes === "boolean"
                                ? switchRow.mirror_writes
                                : fromSettings.mirrorWrites })];
                case 8:
                    _a = _d.sent();
                    // Switch-state table may be unavailable in earlier environments; fall back to settings/env.
                    return [2 /*return*/, fromSettings];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function sanitizeIndexName(indexName) {
    var cleaned = (indexName || "default").trim().toLowerCase();
    return cleaned.replace(/[^a-z0-9_-]+/g, "_");
}
function getChromaIndexPath(indexName, config) {
    var configuredPersistDir = (config === null || config === void 0 ? void 0 : config.chromaPersistDir) || process.env.CHROMA_PERSIST_DIR || CHROMA_DEFAULT_PERSIST_DIR;
    var persistDir = configuredPersistDir.startsWith("~/")
        ? (0, node_path_1.join)((0, node_os_1.homedir)(), configuredPersistDir.slice(2))
        : configuredPersistDir;
    return (0, node_path_1.join)(persistDir, "".concat(sanitizeIndexName(indexName)).concat(CHROMA_INDEX_FILE_SUFFIX));
}
function readChromaEntries(pathname) {
    return __awaiter(this, void 0, void 0, function () {
        var raw, parsed, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.readFile)(pathname, "utf-8")];
                case 1:
                    raw = _a.sent();
                    parsed = JSON.parse(raw);
                    if (!Array.isArray(parsed)) {
                        return [2 /*return*/, []];
                    }
                    return [2 /*return*/, parsed
                            .filter(function (entry) { return !!entry && typeof entry === "object"; })
                            .map(function (entry) { return ({
                            id: String(entry.id || ""),
                            values: toNumberArray(entry.values),
                            metadata: toVectorMetadata(entry.metadata),
                        }); })
                            .filter(function (entry) { return entry.id.length > 0 && entry.values.length > 0; })];
                case 2:
                    error_1 = _a.sent();
                    if (error_1.code === "ENOENT") {
                        return [2 /*return*/, []];
                    }
                    throw error_1;
                case 3: return [2 /*return*/];
            }
        });
    });
}
function writeChromaEntries(pathname, entries) {
    return __awaiter(this, void 0, void 0, function () {
        var tmpPath, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(pathname), { recursive: true })];
                case 1:
                    _a.sent();
                    tmpPath = "".concat(pathname, ".").concat(process.pid, ".").concat(Date.now(), ".tmp");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 7]);
                    return [4 /*yield*/, (0, promises_1.writeFile)(tmpPath, JSON.stringify(entries), "utf-8")];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, (0, promises_1.rename)(tmpPath, pathname)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5:
                    error_2 = _a.sent();
                    return [4 /*yield*/, (0, promises_1.rm)(tmpPath, { force: true }).catch(function () { return undefined; })];
                case 6:
                    _a.sent();
                    throw error_2;
                case 7: return [2 /*return*/];
            }
        });
    });
}
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function withChromaFileLock(pathname, fn) {
    return __awaiter(this, void 0, void 0, function () {
        var lockPath, deadline, lockHandle, result, error_3, code;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    lockPath = "".concat(pathname).concat(CHROMA_LOCK_FILE_SUFFIX);
                    deadline = Date.now() + CHROMA_LOCK_MAX_WAIT_MS;
                    _a.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 13];
                    lockHandle = null;
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 7, , 12]);
                    return [4 /*yield*/, (0, promises_1.open)(lockPath, "wx")];
                case 3:
                    lockHandle = _a.sent();
                    return [4 /*yield*/, fn()];
                case 4:
                    result = _a.sent();
                    return [4 /*yield*/, lockHandle.close().catch(function () { return undefined; })];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, (0, promises_1.rm)(lockPath, { force: true }).catch(function () { return undefined; })];
                case 6:
                    _a.sent();
                    return [2 /*return*/, result];
                case 7:
                    error_3 = _a.sent();
                    if (!lockHandle) return [3 /*break*/, 10];
                    return [4 /*yield*/, lockHandle.close().catch(function () { return undefined; })];
                case 8:
                    _a.sent();
                    return [4 /*yield*/, (0, promises_1.rm)(lockPath, { force: true }).catch(function () { return undefined; })];
                case 9:
                    _a.sent();
                    _a.label = 10;
                case 10:
                    code = error_3 === null || error_3 === void 0 ? void 0 : error_3.code;
                    if (code !== "EEXIST") {
                        throw error_3;
                    }
                    if (Date.now() >= deadline) {
                        throw new Error("chroma_lock_timeout:".concat(lockPath));
                    }
                    return [4 /*yield*/, sleep(CHROMA_LOCK_RETRY_MS)];
                case 11:
                    _a.sent();
                    return [3 /*break*/, 12];
                case 12: return [3 /*break*/, 1];
                case 13: return [2 /*return*/];
            }
        });
    });
}
function toNumberArray(raw) {
    if (Array.isArray(raw)) {
        return raw.map(function (value) { return Number(value); }).filter(function (value) { return Number.isFinite(value); });
    }
    if (typeof raw === "string") {
        var trimmed = raw.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            return trimmed
                .slice(1, -1)
                .split(",")
                .map(function (value) { return Number(value.trim()); })
                .filter(function (value) { return Number.isFinite(value); });
        }
    }
    return [];
}
function toVectorMetadata(raw) {
    var metadata = typeof raw === "object" && raw !== null ? raw : {};
    return {
        tenantId: String(metadata.tenantId || ""),
        type: String(metadata.type || ""),
        createdAt: Number(metadata.createdAt || 0),
        title: String(metadata.title || ""),
        sourceUrl: String(metadata.sourceUrl || ""),
        description: metadata.description ? String(metadata.description) : undefined,
    };
}
function metadataMatchesFilter(metadata, filter) {
    if (!filter || Object.keys(filter).length === 0) {
        return true;
    }
    var metadataLookup = {
        tenantId: metadata.tenantId,
        type: metadata.type,
        createdAt: metadata.createdAt,
        title: metadata.title,
        sourceUrl: metadata.sourceUrl,
        description: metadata.description,
    };
    for (var _i = 0, _a = Object.entries(filter); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], expected = _b[1];
        var actual = metadataLookup[key];
        if (actual === undefined || actual === null) {
            return false;
        }
        if (String(actual) !== String(expected)) {
            return false;
        }
    }
    return true;
}
function cosineSimilarity(left, right) {
    var length = Math.min(left.length, right.length);
    if (length === 0) {
        return 0;
    }
    var dotProduct = 0;
    var leftNorm = 0;
    var rightNorm = 0;
    for (var idx = 0; idx < length; idx += 1) {
        var leftValue = Number(left[idx]) || 0;
        var rightValue = Number(right[idx]) || 0;
        dotProduct += leftValue * rightValue;
        leftNorm += leftValue * leftValue;
        rightNorm += rightValue * rightValue;
    }
    if (leftNorm === 0 || rightNorm === 0) {
        return 0;
    }
    return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
function requireCloudflareConfig(config) {
    var accountId = (config === null || config === void 0 ? void 0 : config.vectorizeAccountId) || process.env.CLOUDFLARE_ACCOUNT_ID;
    var apiToken = (config === null || config === void 0 ? void 0 : config.vectorizeApiToken) || process.env.VECTORIZE_API_TOKEN || process.env.CLOUDFLARE_AI_API_KEY;
    if (!accountId || !apiToken) {
        throw new VectorProviderError({
            provider: "cloudflare_vectorize",
            code: "missing_cloudflare_config",
            message: "Cloudflare Vectorize account or token is not configured",
            classification: "permanent",
        });
    }
    return { accountId: accountId, apiToken: apiToken };
}
function createCloudflareVectorizeAdapter(config) {
    return {
        capabilities: getProviderCapabilities("cloudflare_vectorize"),
        index: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, accountId, apiToken, baseUrl, ndjson, response, error_4;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _a = requireCloudflareConfig(config), accountId = _a.accountId, apiToken = _a.apiToken;
                            baseUrl = "https://api.cloudflare.com/client/v4/accounts/".concat(accountId, "/vectorize/indexes/").concat(params.indexName);
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            ndjson = params.vectors.map(function (vector) { return JSON.stringify(vector); }).join("\n");
                            return [4 /*yield*/, fetch("".concat(baseUrl, "/upsert"), {
                                    method: "POST",
                                    headers: {
                                        Authorization: "Bearer ".concat(apiToken),
                                        "Content-Type": "application/x-ndjson",
                                    },
                                    body: ndjson,
                                })];
                        case 2:
                            response = _b.sent();
                            if (!response.ok) {
                                throw new Error("Vectorize upsert failed: ".concat(response.status));
                            }
                            return [2 /*return*/, { count: params.vectors.length }];
                        case 3:
                            error_4 = _b.sent();
                            throw normalizeProviderError("cloudflare_vectorize", "index_failed", error_4);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        },
        delete: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, accountId, apiToken, baseUrl, response, error_5;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _a = requireCloudflareConfig(config), accountId = _a.accountId, apiToken = _a.apiToken;
                            baseUrl = "https://api.cloudflare.com/client/v4/accounts/".concat(accountId, "/vectorize/indexes/").concat(params.indexName);
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, fetch("".concat(baseUrl, "/delete-by-ids"), {
                                    method: "POST",
                                    headers: {
                                        Authorization: "Bearer ".concat(apiToken),
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ ids: params.ids }),
                                })];
                        case 2:
                            response = _b.sent();
                            if (!response.ok) {
                                throw new Error("Vectorize delete failed: ".concat(response.status));
                            }
                            return [2 /*return*/, { count: params.ids.length }];
                        case 3:
                            error_5 = _b.sent();
                            throw normalizeProviderError("cloudflare_vectorize", "delete_failed", error_5);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        },
        search: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, accountId, apiToken, baseUrl, response, data, error_6;
                var _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _a = requireCloudflareConfig(config), accountId = _a.accountId, apiToken = _a.apiToken;
                            baseUrl = "https://api.cloudflare.com/client/v4/accounts/".concat(accountId, "/vectorize/indexes/").concat(params.indexName);
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, fetch("".concat(baseUrl, "/query"), {
                                    method: "POST",
                                    headers: {
                                        Authorization: "Bearer ".concat(apiToken),
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        vector: params.vector,
                                        topK: params.topK,
                                        filter: params.filter,
                                        returnMetadata: true,
                                    }),
                                })];
                        case 2:
                            response = _c.sent();
                            if (!response.ok) {
                                throw new Error("Vectorize query failed: ".concat(response.status));
                            }
                            return [4 /*yield*/, response.json()];
                        case 3:
                            data = (_c.sent());
                            return [2 /*return*/, { matches: ((_b = data.result) === null || _b === void 0 ? void 0 : _b.matches) || [] }];
                        case 4:
                            error_6 = _c.sent();
                            throw normalizeProviderError("cloudflare_vectorize", "search_failed", error_6);
                        case 5: return [2 /*return*/];
                    }
                });
            });
        },
    };
}
function getPgVectorPoolConfig(config) {
    var host = config === null || config === void 0 ? void 0 : config.pgvectorHost;
    var database = config === null || config === void 0 ? void 0 : config.pgvectorDatabase;
    if (!host || !database) {
        throw new VectorProviderError({
            provider: "pgvector",
            code: "missing_pgvector_config",
            message: "pgvector host/database is not configured",
            classification: "permanent",
        });
    }
    return {
        host: host,
        port: Number((config === null || config === void 0 ? void 0 : config.pgvectorPort) || "5432"),
        database: database,
        user: config === null || config === void 0 ? void 0 : config.pgvectorUser,
        password: config === null || config === void 0 ? void 0 : config.pgvectorPassword,
    };
}
function getPgPoolCacheKey(config) {
    return [
        config.host || "localhost",
        String(config.port || 5432),
        config.database || "",
        config.user || "",
    ].join("|");
}
function getOrCreatePgPool(config) {
    return __awaiter(this, void 0, void 0, function () {
        var poolConfig, key, pool, pg, PoolCtor;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    poolConfig = getPgVectorPoolConfig(config);
                    key = getPgPoolCacheKey(poolConfig);
                    pool = pgPoolCache.get(key);
                    if (!!pool) return [3 /*break*/, 2];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("pg"); })];
                case 1:
                    pg = _a.sent();
                    PoolCtor = pg.Pool;
                    pool = new PoolCtor(poolConfig);
                    pgPoolCache.set(key, pool);
                    _a.label = 2;
                case 2:
                    if (!!pgSchemaReady.has(key)) return [3 /*break*/, 5];
                    return [4 /*yield*/, pool.query("CREATE TABLE IF NOT EXISTS ".concat(PGVECTOR_TABLE_NAME, " (\n        index_name TEXT NOT NULL,\n        vector_id TEXT NOT NULL,\n        embedding DOUBLE PRECISION[] NOT NULL,\n        metadata JSONB NOT NULL,\n        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n        PRIMARY KEY (index_name, vector_id)\n      )"))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, pool.query("CREATE INDEX IF NOT EXISTS ".concat(PGVECTOR_TABLE_NAME, "_index_name_idx ON ").concat(PGVECTOR_TABLE_NAME, " (index_name)"))];
                case 4:
                    _a.sent();
                    pgSchemaReady.add(key);
                    _a.label = 5;
                case 5: return [2 /*return*/, { pool: pool, key: key }];
            }
        });
    });
}
function createPgVectorAdapter(config) {
    return {
        capabilities: getProviderCapabilities("pgvector"),
        index: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var pool, _i, _a, vector, error_7;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 6, , 7]);
                            return [4 /*yield*/, getOrCreatePgPool(config)];
                        case 1:
                            pool = (_b.sent()).pool;
                            _i = 0, _a = params.vectors;
                            _b.label = 2;
                        case 2:
                            if (!(_i < _a.length)) return [3 /*break*/, 5];
                            vector = _a[_i];
                            return [4 /*yield*/, pool.query("INSERT INTO ".concat(PGVECTOR_TABLE_NAME, " (index_name, vector_id, embedding, metadata, updated_at)\n             VALUES ($1, $2, $3::double precision[], $4::jsonb, NOW())\n             ON CONFLICT (index_name, vector_id)\n             DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, updated_at = NOW()"), [params.indexName, vector.id, vector.values, JSON.stringify(vector.metadata)])];
                        case 3:
                            _b.sent();
                            _b.label = 4;
                        case 4:
                            _i++;
                            return [3 /*break*/, 2];
                        case 5: return [2 /*return*/, { count: params.vectors.length }];
                        case 6:
                            error_7 = _b.sent();
                            throw normalizeProviderError("pgvector", "index_failed", error_7);
                        case 7: return [2 /*return*/];
                    }
                });
            });
        },
        delete: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var pool, result, error_8;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, getOrCreatePgPool(config)];
                        case 1:
                            pool = (_a.sent()).pool;
                            return [4 /*yield*/, pool.query("DELETE FROM ".concat(PGVECTOR_TABLE_NAME, "\n           WHERE index_name = $1\n             AND vector_id = ANY($2::text[])"), [params.indexName, params.ids])];
                        case 2:
                            result = _a.sent();
                            return [2 /*return*/, { count: Number(result.rowCount || 0) }];
                        case 3:
                            error_8 = _a.sent();
                            throw normalizeProviderError("pgvector", "delete_failed", error_8);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        },
        search: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var pool, values, sqlText, argIndex, _i, _a, _b, filterKey, filterValue, result, matches, error_9;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _c.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, getOrCreatePgPool(config)];
                        case 1:
                            pool = (_c.sent()).pool;
                            values = [params.indexName];
                            sqlText = "SELECT vector_id, embedding, metadata\n           FROM ".concat(PGVECTOR_TABLE_NAME, "\n           WHERE index_name = $1");
                            if (params.filter && Object.keys(params.filter).length > 0) {
                                argIndex = 2;
                                for (_i = 0, _a = Object.entries(params.filter); _i < _a.length; _i++) {
                                    _b = _a[_i], filterKey = _b[0], filterValue = _b[1];
                                    sqlText += " AND metadata ->> $".concat(argIndex, " = $").concat(argIndex + 1);
                                    values.push(filterKey, String(filterValue));
                                    argIndex += 2;
                                }
                            }
                            sqlText += " LIMIT ".concat(MAX_PGVECTOR_SEARCH_SCAN);
                            return [4 /*yield*/, pool.query(sqlText, values)];
                        case 2:
                            result = _c.sent();
                            matches = result.rows
                                .map(function (row) {
                                var metadata = toVectorMetadata(row.metadata);
                                var score = cosineSimilarity(toNumberArray(row.embedding), params.vector);
                                return {
                                    id: String(row.vector_id || ""),
                                    score: score,
                                    metadata: metadata,
                                };
                            })
                                .filter(function (row) { return row.id.length > 0 && metadataMatchesFilter(row.metadata, params.filter); })
                                .sort(function (left, right) { return right.score - left.score; })
                                .slice(0, params.topK);
                            return [2 /*return*/, { matches: matches }];
                        case 3:
                            error_9 = _c.sent();
                            throw normalizeProviderError("pgvector", "search_failed", error_9);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        },
    };
}
function createChromaAdapter(config) {
    return {
        capabilities: getProviderCapabilities("chromadb"),
        index: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var path_1, error_10;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            path_1 = getChromaIndexPath(params.indexName, config);
                            return [4 /*yield*/, withChromaFileLock(path_1, function () { return __awaiter(_this, void 0, void 0, function () {
                                    var existing, map, _i, _a, vector;
                                    return __generator(this, function (_b) {
                                        switch (_b.label) {
                                            case 0: return [4 /*yield*/, readChromaEntries(path_1)];
                                            case 1:
                                                existing = _b.sent();
                                                map = new Map(existing.map(function (entry) { return [entry.id, entry]; }));
                                                for (_i = 0, _a = params.vectors; _i < _a.length; _i++) {
                                                    vector = _a[_i];
                                                    map.set(vector.id, vector);
                                                }
                                                return [4 /*yield*/, writeChromaEntries(path_1, Array.from(map.values()))];
                                            case 2:
                                                _b.sent();
                                                return [2 /*return*/, { count: params.vectors.length }];
                                        }
                                    });
                                }); })];
                        case 1: return [2 /*return*/, _a.sent()];
                        case 2:
                            error_10 = _a.sent();
                            throw normalizeProviderError("chromadb", "index_failed", error_10);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        },
        delete: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var path_2, error_11;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            path_2 = getChromaIndexPath(params.indexName, config);
                            return [4 /*yield*/, withChromaFileLock(path_2, function () { return __awaiter(_this, void 0, void 0, function () {
                                    var existing, ids, retained, removed;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, readChromaEntries(path_2)];
                                            case 1:
                                                existing = _a.sent();
                                                ids = new Set(params.ids);
                                                retained = existing.filter(function (entry) { return !ids.has(entry.id); });
                                                removed = existing.length - retained.length;
                                                return [4 /*yield*/, writeChromaEntries(path_2, retained)];
                                            case 2:
                                                _a.sent();
                                                return [2 /*return*/, { count: removed }];
                                        }
                                    });
                                }); })];
                        case 1: return [2 /*return*/, _a.sent()];
                        case 2:
                            error_11 = _a.sent();
                            throw normalizeProviderError("chromadb", "delete_failed", error_11);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        },
        search: function (params) {
            return __awaiter(this, void 0, void 0, function () {
                var path, existing, matches, error_12;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            path = getChromaIndexPath(params.indexName, config);
                            return [4 /*yield*/, readChromaEntries(path)];
                        case 1:
                            existing = _a.sent();
                            matches = existing
                                .filter(function (entry) { return metadataMatchesFilter(entry.metadata, params.filter); })
                                .map(function (entry) { return ({
                                id: entry.id,
                                score: cosineSimilarity(entry.values, params.vector),
                                metadata: entry.metadata,
                            }); })
                                .sort(function (left, right) { return right.score - left.score; })
                                .slice(0, params.topK);
                            return [2 /*return*/, { matches: matches }];
                        case 2:
                            error_12 = _a.sent();
                            throw normalizeProviderError("chromadb", "search_failed", error_12);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        },
    };
}
function createDefaultAdapter(provider, config) {
    if (provider === "cloudflare_vectorize") {
        return createCloudflareVectorizeAdapter(config);
    }
    if (provider === "pgvector") {
        return createPgVectorAdapter(config);
    }
    return createChromaAdapter(config);
}
function getProviderCapabilities(provider) {
    return PROVIDER_CAPABILITIES[provider];
}
function resolveVectorProvider(operation, config) {
    var defaultProvider = "cloudflare_vectorize";
    var configuredProvider = isProvider(config === null || config === void 0 ? void 0 : config.provider) ? config === null || config === void 0 ? void 0 : config.provider : undefined;
    var readProvider = isProvider(config === null || config === void 0 ? void 0 : config.currentReadProvider) ? config === null || config === void 0 ? void 0 : config.currentReadProvider : undefined;
    var writeProvider = isProvider(config === null || config === void 0 ? void 0 : config.targetProvider) ? config === null || config === void 0 ? void 0 : config.targetProvider : undefined;
    var provider;
    if (operation === "search") {
        provider = readProvider || configuredProvider || defaultProvider;
    }
    else {
        provider = writeProvider || configuredProvider || defaultProvider;
    }
    var fallbackApplied = !configuredProvider && !readProvider && !writeProvider;
    return {
        provider: provider,
        fallbackApplied: fallbackApplied,
    };
}
function validateProviderCapabilityRequest(params) {
    var capabilities = params.capabilities, request = params.request;
    if (request.topK !== undefined) {
        if (request.topK < capabilities.minTopK || request.topK > capabilities.maxTopK) {
            throw new VectorProviderError({
                provider: capabilities.provider,
                code: "topk_out_of_range",
                message: "Requested topK ".concat(request.topK, " is outside supported range ").concat(capabilities.minTopK, "-").concat(capabilities.maxTopK),
                classification: "permanent",
            });
        }
    }
    if (request.dimension !== undefined && !capabilities.supportedDimensions.includes(request.dimension)) {
        throw new VectorProviderError({
            provider: capabilities.provider,
            code: "unsupported_dimension",
            message: "Dimension ".concat(request.dimension, " is not supported by ").concat(capabilities.provider),
            classification: "permanent",
        });
    }
    if (request.filter && Object.keys(request.filter).length > 0 && !capabilities.supportsMetadataFilter) {
        throw new VectorProviderError({
            provider: capabilities.provider,
            code: "metadata_filter_unsupported",
            message: "".concat(capabilities.provider, " does not support metadata filters"),
            classification: "permanent",
        });
    }
}
function registerVectorProviderAdapter(provider, adapter) {
    overrideAdapters[provider] = adapter;
}
function resetVectorProviderAdapterRegistry() {
    delete overrideAdapters.chromadb;
    delete overrideAdapters.pgvector;
    delete overrideAdapters.cloudflare_vectorize;
    for (var _i = 0, _a = pgPoolCache.values(); _i < _a.length; _i++) {
        var pool = _a[_i];
        var maybeEnd = pool.end;
        if (typeof maybeEnd === "function") {
            void maybeEnd.call(pool);
        }
    }
    pgPoolCache.clear();
    pgSchemaReady.clear();
}
function resetVectorProviderConfigCacheForTests() {
    effectiveConfigCache.clear();
}
function getAdapter(provider, config) {
    return overrideAdapters[provider] || createDefaultAdapter(provider, config);
}
function createVectorProviderAdapter(provider, config) {
    return createDefaultAdapter(provider, config);
}
function dispatchVectorOperation(params) {
    return __awaiter(this, void 0, void 0, function () {
        var resolved, adapter, dimension;
        var _a;
        return __generator(this, function (_b) {
            resolved = resolveVectorProvider(params.operation, params.providerConfig);
            adapter = getAdapter(resolved.provider, params.providerConfig);
            if (params.operation === "index") {
                dimension = (_a = params.vectors[0]) === null || _a === void 0 ? void 0 : _a.values.length;
                validateProviderCapabilityRequest({
                    capabilities: adapter.capabilities,
                    request: { dimension: dimension },
                });
                return [2 /*return*/, adapter.index({ indexName: params.indexName, vectors: params.vectors })];
            }
            if (params.operation === "delete") {
                return [2 /*return*/, adapter.delete({ indexName: params.indexName, ids: params.ids })];
            }
            validateProviderCapabilityRequest({
                capabilities: adapter.capabilities,
                request: {
                    topK: params.topK,
                    dimension: params.vector.length,
                    filter: params.filter,
                },
            });
            return [2 /*return*/, adapter.search({
                    indexName: params.indexName,
                    vector: params.vector,
                    topK: params.topK,
                    filter: params.filter,
                })];
        });
    });
}
function getVectorProviderConfigFromEnv() {
    return {
        provider: process.env.VECTORDB_PROVIDER,
        currentReadProvider: process.env.VECTORDB_CURRENT_READ_PROVIDER,
        targetProvider: process.env.VECTORDB_TARGET_PROVIDER,
        mirrorWrites: ["1", "true", "yes", "on"].includes((process.env.VECTORDB_MIRROR_WRITES || "").toLowerCase()),
        chromaPersistDir: process.env.CHROMA_PERSIST_DIR,
        pgvectorHost: process.env.PGVECTOR_HOST,
        pgvectorPort: process.env.PGVECTOR_PORT,
        pgvectorDatabase: process.env.PGVECTOR_DATABASE,
        pgvectorUser: process.env.PGVECTOR_USER,
        pgvectorPassword: process.env.PGVECTOR_PASSWORD,
        pgvectorConnectTimeout: process.env.PGVECTOR_CONNECT_TIMEOUT,
        vectorizeAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        vectorizeApiToken: process.env.VECTORIZE_API_TOKEN || process.env.CLOUDFLARE_AI_API_KEY,
    };
}
function getEffectiveVectorProviderConfig(params) {
    return __awaiter(this, void 0, void 0, function () {
        var tenantKey, now, cached, envConfig, storedConfig, merged;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    tenantKey = ((_a = params === null || params === void 0 ? void 0 : params.tenantId) === null || _a === void 0 ? void 0 : _a.trim()) || "__global__";
                    now = Date.now();
                    if (!(params === null || params === void 0 ? void 0 : params.forceRefresh)) {
                        cached = effectiveConfigCache.get(tenantKey);
                        if (cached && cached.expiresAt > now) {
                            return [2 /*return*/, cached.value];
                        }
                    }
                    envConfig = getVectorProviderConfigFromEnv();
                    return [4 /*yield*/, loadStoredVectorProviderConfig({ tenantId: params === null || params === void 0 ? void 0 : params.tenantId })];
                case 1:
                    storedConfig = _b.sent();
                    merged = applyDefinedSettings(envConfig, storedConfig);
                    effectiveConfigCache.set(tenantKey, {
                        value: merged,
                        expiresAt: now + EFFECTIVE_CONFIG_CACHE_TTL_MS,
                    });
                    return [2 /*return*/, merged];
            }
        });
    });
}
var templateObject_1, templateObject_2;
