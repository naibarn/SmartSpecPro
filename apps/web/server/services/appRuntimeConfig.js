"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAppRuntimeConfigCache = refreshAppRuntimeConfigCache;
exports.getAppRuntimeConfig = getAppRuntimeConfig;
exports.getCachedAppRuntimeConfig = getCachedAppRuntimeConfig;
exports.getPreferredInternalToken = getPreferredInternalToken;
exports.getCachedPreferredInternalToken = getCachedPreferredInternalToken;
exports.getCachedMcpServerToken = getCachedMcpServerToken;
exports.getCachedPythonBackendUrl = getCachedPythonBackendUrl;
exports.getCachedPublicAppUrl = getCachedPublicAppUrl;
exports.getCachedInternalNodeUrl = getCachedInternalNodeUrl;
exports.compareCachedInternalToken = compareCachedInternalToken;
var crypto_1 = require("crypto");
var drizzle_orm_1 = require("drizzle-orm");
var schema_1 = require("../../drizzle/schema");
var db_1 = require("../db");
var crypto_2 = require("./crypto");
var CATEGORY = "infrastructure";
var APP_RUNTIME_KEYS = [
    "python_backend_url",
    "smartspec_proxy_token",
    "smartspec_web_gateway_token",
    "smartspec_mcp_token",
    "smartspec_internal_url",
    "node_server_internal_url",
    "upload_post_api_base_url",
    "public_url",
    "app_public_url",
    "app_url",
    "s3_endpoint",
    "r2_public_url",
    "oauth_server_url",
    "forge_api_url",
    "forge_api_key",
    "llm_gateway_service_account_id",
];
var DEFAULT_RUNTIME_CONFIG = {
    pythonBackendUrl: (process.env.PYTHON_BACKEND_URL || process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, ""),
    proxyToken: process.env.SMARTSPEC_PROXY_TOKEN || "",
    webGatewayToken: process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || process.env.WEB_GATEWAY_TOKEN || "",
    mcpServerToken: process.env.SMARTSPEC_MCP_TOKEN || process.env.MCP_SERVER_TOKEN || "",
    internalNodeUrl: (process.env.NODE_SERVER_INTERNAL_URL || "http://localhost:3000").replace(/\/+$/, ""),
    smartspecInternalUrl: (process.env.SMARTSPEC_INTERNAL_URL || process.env.NODE_SERVER_INTERNAL_URL || "http://localhost:3000").replace(/\/+$/, ""),
    uploadPostApiBaseUrl: (process.env.UPLOAD_POST_API_BASE_URL || process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, ""),
    publicUrl: (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
    appPublicUrl: (process.env.APP_PUBLIC_URL || "").replace(/\/+$/, ""),
    appUrl: (process.env.APP_URL || "").replace(/\/+$/, ""),
    s3Endpoint: (process.env.S3_ENDPOINT || "").replace(/\/+$/, ""),
    r2PublicUrl: (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, ""),
    oauthServerUrl: (process.env.OAUTH_SERVER_URL || "").replace(/\/+$/, ""),
    forgeApiUrl: (process.env.FORGE_API_URL || "").replace(/\/+$/, ""),
    forgeApiKey: process.env.FORGE_API_KEY || "",
    llmGatewayServiceAccountId: normalizeInteger(process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID || "1", 1),
};
var runtimeConfigCache = __assign({}, DEFAULT_RUNTIME_CONFIG);
var runtimeConfigRefreshPromise = null;
function readRowValue(row) {
    if (!(row === null || row === void 0 ? void 0 : row.value))
        return "";
    return row.isSensitive ? ((0, crypto_2.decrypt)(row.value) || "") : row.value;
}
function normalizeUrl(value, fallback) {
    if (fallback === void 0) { fallback = ""; }
    return (value || fallback).replace(/\/+$/, "");
}
function normalizeInteger(value, fallback) {
    var parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function mapRowsToRuntimeConfig(rows) {
    var map = new Map(rows.map(function (row) { return [row.key, row]; }));
    var resolve = function (key, fallback) { return (readRowValue(map.get(key)) || fallback); };
    return {
        pythonBackendUrl: normalizeUrl(resolve("python_backend_url", DEFAULT_RUNTIME_CONFIG.pythonBackendUrl)),
        proxyToken: resolve("smartspec_proxy_token", DEFAULT_RUNTIME_CONFIG.proxyToken),
        webGatewayToken: resolve("smartspec_web_gateway_token", DEFAULT_RUNTIME_CONFIG.webGatewayToken),
        mcpServerToken: resolve("smartspec_mcp_token", DEFAULT_RUNTIME_CONFIG.mcpServerToken),
        internalNodeUrl: normalizeUrl(resolve("node_server_internal_url", DEFAULT_RUNTIME_CONFIG.internalNodeUrl)),
        smartspecInternalUrl: normalizeUrl(resolve("smartspec_internal_url", DEFAULT_RUNTIME_CONFIG.smartspecInternalUrl)),
        uploadPostApiBaseUrl: normalizeUrl(resolve("upload_post_api_base_url", DEFAULT_RUNTIME_CONFIG.uploadPostApiBaseUrl)),
        publicUrl: normalizeUrl(resolve("public_url", DEFAULT_RUNTIME_CONFIG.publicUrl)),
        appPublicUrl: normalizeUrl(resolve("app_public_url", DEFAULT_RUNTIME_CONFIG.appPublicUrl)),
        appUrl: normalizeUrl(resolve("app_url", DEFAULT_RUNTIME_CONFIG.appUrl)),
        s3Endpoint: normalizeUrl(resolve("s3_endpoint", DEFAULT_RUNTIME_CONFIG.s3Endpoint)),
        r2PublicUrl: normalizeUrl(resolve("r2_public_url", DEFAULT_RUNTIME_CONFIG.r2PublicUrl)),
        oauthServerUrl: normalizeUrl(resolve("oauth_server_url", DEFAULT_RUNTIME_CONFIG.oauthServerUrl)),
        forgeApiUrl: normalizeUrl(resolve("forge_api_url", DEFAULT_RUNTIME_CONFIG.forgeApiUrl)),
        forgeApiKey: resolve("forge_api_key", DEFAULT_RUNTIME_CONFIG.forgeApiKey),
        llmGatewayServiceAccountId: normalizeInteger(resolve("llm_gateway_service_account_id", String(DEFAULT_RUNTIME_CONFIG.llmGatewayServiceAccountId)), DEFAULT_RUNTIME_CONFIG.llmGatewayServiceAccountId),
    };
}
function loadAppRuntimeConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var db, rows, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.select().from(schema_1.systemSettings).where((0, drizzle_orm_1.eq)(schema_1.systemSettings.category, CATEGORY))];
                case 2:
                    _a = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = [];
                    _c.label = 4;
                case 4:
                    rows = _a;
                    return [2 /*return*/, mapRowsToRuntimeConfig(rows)];
                case 5:
                    _b = _c.sent();
                    return [2 /*return*/, __assign({}, DEFAULT_RUNTIME_CONFIG)];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function refreshAppRuntimeConfigCache() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!runtimeConfigRefreshPromise) {
                runtimeConfigRefreshPromise = loadAppRuntimeConfig()
                    .then(function (config) {
                    runtimeConfigCache = config;
                    return config;
                })
                    .finally(function () {
                    runtimeConfigRefreshPromise = null;
                });
            }
            return [2 /*return*/, runtimeConfigRefreshPromise];
        });
    });
}
function getAppRuntimeConfig() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, refreshAppRuntimeConfigCache()];
        });
    });
}
function getCachedAppRuntimeConfig() {
    return runtimeConfigCache;
}
function getPreferredInternalToken() {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getAppRuntimeConfig()];
                case 1:
                    config = _a.sent();
                    return [2 /*return*/, config.webGatewayToken || config.proxyToken || ""];
            }
        });
    });
}
function getCachedPreferredInternalToken() {
    return (runtimeConfigCache.webGatewayToken
        || runtimeConfigCache.proxyToken
        || process.env.SMARTSPEC_WEB_GATEWAY_TOKEN
        || process.env.WEB_GATEWAY_TOKEN
        || process.env.SMARTSPEC_PROXY_TOKEN
        || "");
}
function getCachedMcpServerToken() {
    return (runtimeConfigCache.mcpServerToken
        || runtimeConfigCache.webGatewayToken
        || runtimeConfigCache.proxyToken
        || process.env.SMARTSPEC_MCP_TOKEN
        || process.env.MCP_SERVER_TOKEN
        || process.env.SMARTSPEC_WEB_GATEWAY_TOKEN
        || process.env.WEB_GATEWAY_TOKEN
        || process.env.SMARTSPEC_PROXY_TOKEN
        || "");
}
function getCachedPythonBackendUrl() {
    return runtimeConfigCache.pythonBackendUrl || DEFAULT_RUNTIME_CONFIG.pythonBackendUrl;
}
function getCachedPublicAppUrl() {
    return runtimeConfigCache.publicUrl || runtimeConfigCache.appPublicUrl || runtimeConfigCache.appUrl;
}
function getCachedInternalNodeUrl() {
    return runtimeConfigCache.internalNodeUrl || runtimeConfigCache.smartspecInternalUrl || DEFAULT_RUNTIME_CONFIG.internalNodeUrl;
}
function compareCachedInternalToken(token) {
    if (!token)
        return false;
    var expected = getCachedPreferredInternalToken();
    if (!expected)
        return false;
    var tokenHash = crypto_1.default.createHash("sha256").update(token).digest();
    var expectedHash = crypto_1.default.createHash("sha256").update(expected).digest();
    return crypto_1.default.timingSafeEqual(tokenHash, expectedHash);
}
