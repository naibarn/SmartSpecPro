"use strict";
// Unified storage layer: resolves active provider from DB (storage_settings)
// Priority: 1) FORGE_API_URL env (legacy) → 2) cache → 3) DB active config (R2/S3/local)
//           → 4) R2 env vars (Cloud Run) → 5) local fallback
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
exports.getActiveStorageConfig = getActiveStorageConfig;
exports.invalidateStorageCache = invalidateStorageCache;
exports.storagePut = storagePut;
exports.storagePutFromPath = storagePutFromPath;
exports.storageGet = storageGet;
exports.storageDelete = storageDelete;
exports.useLocalStorage = useLocalStorage;
exports.getUploadsDir = getUploadsDir;
exports.storagePresignPut = storagePresignPut;
exports.storagePresignGet = storagePresignGet;
exports.storageResolveUrl = storageResolveUrl;
exports.storageReadText = storageReadText;
exports.storageStreamFile = storageStreamFile;
var env_1 = require("./_core/env");
var appRuntimeConfig_1 = require("./services/appRuntimeConfig");
var path_1 = require("path");
var fs_1 = require("fs");
var url_1 = require("url");
var client_s3_1 = require("@aws-sdk/client-s3");
var s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
var drizzle_orm_1 = require("drizzle-orm");
// Maximum presigned URL expiry: 24 hours (prevents indefinitely-valid URLs)
var MAX_PRESIGN_EXPIRY_S = 86400;
var __filename = (0, url_1.fileURLToPath)(import.meta.url);
var __dirname = path_1.default.dirname(__filename);
// Local uploads directory (relative to server folder)
var UPLOADS_DIR = path_1.default.join(__dirname, "..", "uploads");
// ─── Config resolution with caching ──────────────────────────────────────────
var CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes, matches Python
var _configCache = null;
function getActiveStorageConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var runtimeConfig, forgeUrl, forgeKey, db, storageSettings, decrypt, setting, config, accessKeyId, secretAccessKey, client, config, error_1, r2AccessKey, r2SecretKey, r2AccountId, r2Bucket, client, config, localConfig;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    runtimeConfig = (0, appRuntimeConfig_1.getCachedAppRuntimeConfig)();
                    forgeUrl = runtimeConfig.forgeApiUrl || env_1.ENV.forgeApiUrl;
                    forgeKey = runtimeConfig.forgeApiKey || env_1.ENV.forgeApiKey;
                    if (forgeUrl && forgeKey) {
                        return [2 /*return*/, { provider: "forge", baseUrl: forgeUrl.replace(/\/+$/, ""), apiKey: forgeKey }];
                    }
                    // Priority 2: Check cache
                    if (_configCache && Date.now() - _configCache.fetchedAt < CONFIG_CACHE_TTL_MS) {
                        return [2 /*return*/, _configCache.config];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 6, , 7]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./db"); })];
                case 2:
                    db = (_c.sent()).db;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../drizzle/schema"); })];
                case 3:
                    storageSettings = (_c.sent()).storageSettings;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./services/crypto"); })];
                case 4:
                    decrypt = (_c.sent()).decrypt;
                    return [4 /*yield*/, db
                            .select()
                            .from(storageSettings)
                            .where((0, drizzle_orm_1.eq)(storageSettings.isActive, true))
                            .limit(1)];
                case 5:
                    setting = (_c.sent())[0];
                    if (setting && setting.providerType === "local") {
                        config = { provider: "local" };
                        _configCache = { config: config, fetchedAt: Date.now() };
                        return [2 /*return*/, config];
                    }
                    if (setting) {
                        // R2 or S3 — build S3Client from DB setting
                        if (!setting.endpoint || !setting.accessKeyIdEncrypted || !setting.secretAccessKeyEncrypted) {
                            console.warn("[Storage] Active config missing endpoint or credentials, falling back");
                            // Fall through to env-var fallback
                        }
                        else {
                            accessKeyId = decrypt(setting.accessKeyIdEncrypted);
                            secretAccessKey = decrypt(setting.secretAccessKeyEncrypted);
                            if (!accessKeyId || !secretAccessKey) {
                                console.warn("[Storage] Failed to decrypt credentials, falling back");
                            }
                            else {
                                client = new client_s3_1.S3Client({
                                    endpoint: setting.endpoint,
                                    region: setting.region || "auto",
                                    credentials: { accessKeyId: accessKeyId, secretAccessKey: secretAccessKey },
                                    forcePathStyle: (_b = (_a = setting.configJson) === null || _a === void 0 ? void 0 : _a.forcePathStyle) !== null && _b !== void 0 ? _b : false,
                                });
                                config = {
                                    provider: "s3",
                                    client: client,
                                    bucket: setting.bucket || "",
                                    publicUrlPrefix: setting.publicUrlPrefix || null,
                                };
                                _configCache = { config: config, fetchedAt: Date.now() };
                                return [2 /*return*/, config];
                            }
                        }
                    }
                    return [3 /*break*/, 7];
                case 6:
                    error_1 = _c.sent();
                    console.warn("[Storage] Failed to load storage settings from DB:", error_1.message);
                    // Use stale cache if available
                    if (_configCache)
                        return [2 /*return*/, _configCache.config];
                    return [3 /*break*/, 7];
                case 7:
                    r2AccessKey = process.env.R2_ACCESS_KEY;
                    r2SecretKey = process.env.R2_SECRET_KEY;
                    r2AccountId = process.env.R2_ACCOUNT_ID;
                    r2Bucket = process.env.R2_BUCKET_NAME;
                    if (r2AccessKey && r2SecretKey && r2AccountId && r2Bucket) {
                        client = new client_s3_1.S3Client({
                            endpoint: "https://".concat(r2AccountId, ".r2.cloudflarestorage.com"),
                            region: "auto",
                            credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
                        });
                        config = {
                            provider: "s3",
                            client: client,
                            bucket: r2Bucket,
                            publicUrlPrefix: null,
                        };
                        _configCache = { config: config, fetchedAt: Date.now() };
                        return [2 /*return*/, config];
                    }
                    localConfig = { provider: "local" };
                    _configCache = { config: localConfig, fetchedAt: Date.now() };
                    return [2 /*return*/, localConfig];
            }
        });
    });
}
/**
 * Clear the cached storage config. Call after admin mutations on storage_settings.
 */
function invalidateStorageCache() {
    _configCache = null;
}
// ─── Key normalization (security) ────────────────────────────────────────────
function normalizeKey(relKey) {
    var decoded;
    try {
        decoded = decodeURIComponent(relKey);
    }
    catch (_a) {
        throw new Error("Invalid storage key: malformed encoding");
    }
    if (decoded.includes("\0")) {
        throw new Error("Invalid storage key: null byte detected");
    }
    var cleaned = decoded.replace(/^\/+/, "");
    if (cleaned.includes("..") || path_1.default.isAbsolute(cleaned)) {
        throw new Error("Invalid storage key: path traversal detected");
    }
    var resolved = path_1.default.resolve(UPLOADS_DIR, cleaned);
    if (!resolved.startsWith(UPLOADS_DIR + path_1.default.sep) && resolved !== UPLOADS_DIR) {
        throw new Error("Invalid storage key: escapes uploads directory");
    }
    return cleaned;
}
// ─── Local storage operations ────────────────────────────────────────────────
function ensureUploadsDir(subPath) {
    var dir = subPath ? path_1.default.join(UPLOADS_DIR, subPath) : UPLOADS_DIR;
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function localStoragePut(relKey, data, contentType) {
    return __awaiter(this, void 0, void 0, function () {
        var key, buffer;
        return __generator(this, function (_a) {
            key = normalizeKey(relKey);
            ensureUploadsDir(path_1.default.dirname(key));
            buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
            fs_1.default.writeFileSync(path_1.default.join(UPLOADS_DIR, key), buffer);
            return [2 /*return*/, { key: key, url: "/uploads/".concat(key) }];
        });
    });
}
function localStorageGet(relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var key;
        return __generator(this, function (_a) {
            key = normalizeKey(relKey);
            return [2 /*return*/, { key: key, url: "/uploads/".concat(key) }];
        });
    });
}
function localStorageDelete(relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var key;
        return __generator(this, function (_a) {
            key = normalizeKey(relKey);
            try {
                fs_1.default.unlinkSync(path_1.default.join(UPLOADS_DIR, key));
                return [2 /*return*/, true];
            }
            catch (err) {
                if (err.code === "ENOENT")
                    return [2 /*return*/, false];
                throw err;
            }
            return [2 /*return*/];
        });
    });
}
// ─── S3/R2 storage operations ────────────────────────────────────────────────
function s3StoragePut(config, relKey, data, contentType) {
    return __awaiter(this, void 0, void 0, function () {
        var key, body, url;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = normalizeKey(relKey);
                    body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
                    return [4 /*yield*/, config.client.send(new client_s3_1.PutObjectCommand({
                            Bucket: config.bucket,
                            Key: key,
                            Body: body,
                            ContentType: contentType,
                        }))];
                case 1:
                    _a.sent();
                    url = "/api/storage/files/".concat(encodeURI(key));
                    return [2 /*return*/, { key: key, url: url }];
            }
        });
    });
}
function s3StorageGet(config, relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var key, url;
        return __generator(this, function (_a) {
            key = normalizeKey(relKey);
            url = "/api/storage/files/".concat(encodeURI(key));
            return [2 /*return*/, { key: key, url: url }];
        });
    });
}
function s3StorageDelete(config, relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var key, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    key = normalizeKey(relKey);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, config.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: config.bucket, Key: key }))];
                case 2:
                    _b.sent();
                    return [2 /*return*/, true];
                case 3:
                    error_2 = _b.sent();
                    if (error_2.name === "NoSuchKey" || ((_a = error_2.$metadata) === null || _a === void 0 ? void 0 : _a.httpStatusCode) === 404) {
                        return [2 /*return*/, false];
                    }
                    throw error_2;
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ─── Forge storage operations (legacy) ───────────────────────────────────────
function ensureTrailingSlash(value) {
    return value.endsWith("/") ? value : "".concat(value, "/");
}
function buildAuthHeaders(apiKey) {
    return { Authorization: "Bearer ".concat(apiKey) };
}
function toFormData(data, contentType, fileName) {
    var blob = typeof data === "string"
        ? new Blob([data], { type: contentType })
        : new Blob([data], { type: contentType });
    var form = new FormData();
    form.append("file", blob, fileName || "file");
    return form;
}
function forgeStoragePut(config, relKey, data, contentType) {
    return __awaiter(this, void 0, void 0, function () {
        var key, uploadUrl, formData, response, message, url;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    key = normalizeKey(relKey);
                    uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(config.baseUrl));
                    uploadUrl.searchParams.set("path", key);
                    formData = toFormData(data, contentType, (_a = key.split("/").pop()) !== null && _a !== void 0 ? _a : key);
                    return [4 /*yield*/, fetch(uploadUrl, {
                            method: "POST",
                            headers: buildAuthHeaders(config.apiKey),
                            body: formData,
                        })];
                case 1:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text().catch(function () { return response.statusText; })];
                case 2:
                    message = _b.sent();
                    throw new Error("Storage upload failed (".concat(response.status, " ").concat(response.statusText, "): ").concat(message));
                case 3: return [4 /*yield*/, response.json()];
                case 4:
                    url = (_b.sent()).url;
                    return [2 /*return*/, { key: key, url: url }];
            }
        });
    });
}
function forgeStorageGet(config, relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var key, downloadApiUrl, response;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    key = normalizeKey(relKey);
                    downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(config.baseUrl));
                    downloadApiUrl.searchParams.set("path", key);
                    return [4 /*yield*/, fetch(downloadApiUrl, {
                            method: "GET",
                            headers: buildAuthHeaders(config.apiKey),
                        })];
                case 1:
                    response = _b.sent();
                    _a = { key: key };
                    return [4 /*yield*/, response.json()];
                case 2: return [2 /*return*/, (_a.url = (_b.sent()).url, _a)];
            }
        });
    });
}
function forgeStorageDelete(config, relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var key, deleteUrl, response, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    key = normalizeKey(relKey);
                    deleteUrl = new URL("v1/storage/delete", ensureTrailingSlash(config.baseUrl));
                    deleteUrl.searchParams.set("path", key);
                    return [4 /*yield*/, fetch(deleteUrl, {
                            method: "DELETE",
                            headers: buildAuthHeaders(config.apiKey),
                        })];
                case 1:
                    response = _a.sent();
                    if (response.status === 404)
                        return [2 /*return*/, false];
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text().catch(function () { return response.statusText; })];
                case 2:
                    message = _a.sent();
                    throw new Error("Storage delete failed (".concat(response.status, " ").concat(response.statusText, "): ").concat(message));
                case 3: return [2 /*return*/, true];
            }
        });
    });
}
// ─── Public API ──────────────────────────────────────────────────────────────
function storagePut(relKey_1, data_1) {
    return __awaiter(this, arguments, void 0, function (relKey, data, contentType) {
        var config;
        if (contentType === void 0) { contentType = "application/octet-stream"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    switch (config.provider) {
                        case "local":
                            return [2 /*return*/, localStoragePut(relKey, data, contentType)];
                        case "s3":
                            return [2 /*return*/, s3StoragePut(config, relKey, data, contentType)];
                        case "forge":
                            return [2 /*return*/, forgeStoragePut(config, relKey, data, contentType)];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Store a file from a filesystem path while avoiding unnecessary memory copies.
 * This is used for large installer uploads.
 */
function storagePutFromPath(relKey_1, sourcePath_1) {
    return __awaiter(this, arguments, void 0, function (relKey, sourcePath, contentType) {
        var config, _a, key, key, buffer;
        if (contentType === void 0) { contentType = "application/octet-stream"; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _b.sent();
                    _a = config.provider;
                    switch (_a) {
                        case "local": return [3 /*break*/, 2];
                        case "s3": return [3 /*break*/, 3];
                        case "forge": return [3 /*break*/, 5];
                    }
                    return [3 /*break*/, 6];
                case 2:
                    {
                        key = normalizeKey(relKey);
                        ensureUploadsDir(path_1.default.dirname(key));
                        fs_1.default.copyFileSync(sourcePath, path_1.default.join(UPLOADS_DIR, key));
                        return [2 /*return*/, { key: key, url: "/uploads/".concat(key) }];
                    }
                    _b.label = 3;
                case 3:
                    key = normalizeKey(relKey);
                    return [4 /*yield*/, config.client.send(new client_s3_1.PutObjectCommand({
                            Bucket: config.bucket,
                            Key: key,
                            Body: fs_1.default.createReadStream(sourcePath),
                            ContentType: contentType,
                        }))];
                case 4:
                    _b.sent();
                    return [2 /*return*/, { key: key, url: "/api/storage/files/".concat(encodeURI(key)) }];
                case 5:
                    {
                        buffer = fs_1.default.readFileSync(sourcePath);
                        return [2 /*return*/, storagePut(relKey, buffer, contentType)];
                    }
                    _b.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
function storageGet(relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    switch (config.provider) {
                        case "local":
                            return [2 /*return*/, localStorageGet(relKey)];
                        case "s3":
                            return [2 /*return*/, s3StorageGet(config, relKey)];
                        case "forge":
                            return [2 /*return*/, forgeStorageGet(config, relKey)];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function storageDelete(relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    switch (config.provider) {
                        case "local":
                            return [2 /*return*/, localStorageDelete(relKey)];
                        case "s3":
                            return [2 /*return*/, s3StorageDelete(config, relKey)];
                        case "forge":
                            return [2 /*return*/, forgeStorageDelete(config, relKey)];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Check if local storage is the active provider.
 */
function useLocalStorage() {
    return __awaiter(this, void 0, void 0, function () {
        var config;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    return [2 /*return*/, config.provider === "local"];
            }
        });
    });
}
/**
 * Get the local uploads directory path (for static serving).
 */
function getUploadsDir() {
    ensureUploadsDir();
    return UPLOADS_DIR;
}
/**
 * Generate a presigned PUT URL for direct client upload to S3/R2.
 * Returns null if storage is local/forge (not S3-compatible).
 */
function storagePresignPut(relKey_1, contentType_1, contentLength_1) {
    return __awaiter(this, arguments, void 0, function (relKey, contentType, contentLength, expiresIn) {
        var config, key, cmd, clampedExpiry, url;
        if (expiresIn === void 0) { expiresIn = 3600; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    if (config.provider !== "s3")
                        return [2 /*return*/, null];
                    key = normalizeKey(relKey);
                    cmd = new client_s3_1.PutObjectCommand({
                        Bucket: config.bucket,
                        Key: key,
                        ContentType: contentType,
                        ContentLength: contentLength,
                    });
                    clampedExpiry = Math.min(Math.max(expiresIn, 60), MAX_PRESIGN_EXPIRY_S);
                    return [4 /*yield*/, (0, s3_request_presigner_1.getSignedUrl)(config.client, cmd, { expiresIn: clampedExpiry })];
                case 2:
                    url = _a.sent();
                    return [2 /*return*/, { url: url, key: key }];
            }
        });
    });
}
/**
 * Generate a presigned GET URL for direct download from S3/R2.
 * Returns null if storage is local/forge (not S3-compatible).
 *
 * @param relKey - The object key relative to bucket root
 * @param expiresIn - URL validity in seconds (default 3600 = 1 hour; use 86400 for admin)
 * @returns Presigned GET URL and key, or null if not S3
 */
function storagePresignGet(relKey_1) {
    return __awaiter(this, arguments, void 0, function (relKey, expiresIn) {
        var config, key, cmd, clampedExpiry, url;
        if (expiresIn === void 0) { expiresIn = 3600; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    if (config.provider !== "s3")
                        return [2 /*return*/, null];
                    key = normalizeKey(relKey);
                    cmd = new client_s3_1.GetObjectCommand({
                        Bucket: config.bucket,
                        Key: key,
                    });
                    clampedExpiry = Math.min(Math.max(expiresIn, 60), MAX_PRESIGN_EXPIRY_S);
                    return [4 /*yield*/, (0, s3_request_presigner_1.getSignedUrl)(config.client, cmd, { expiresIn: clampedExpiry })];
                case 2:
                    url = _a.sent();
                    return [2 /*return*/, { url: url, key: key }];
            }
        });
    });
}
/**
 * Resolve a storage key to its public/accessible URL.
 * For S3/R2: returns a proxy URL through the Node.js server (/api/storage/files/...).
 * For local: returns /uploads/... path.
 */
function storageResolveUrl(relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var config, key;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    key = normalizeKey(relKey);
                    switch (config.provider) {
                        case "s3":
                            // Use server-side proxy to avoid public URL SSL issues and presigned URL expiration
                            return [2 /*return*/, "/api/storage/files/".concat(encodeURI(key))];
                        case "local":
                            return [2 /*return*/, "/uploads/".concat(key)];
                        default:
                            return [2 /*return*/, null];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function storageReadText(relKey) {
    return __awaiter(this, void 0, void 0, function () {
        var config, key, _a, response, _b, resolved, response, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _d.sent();
                    key = normalizeKey(relKey);
                    _a = config.provider;
                    switch (_a) {
                        case "local": return [3 /*break*/, 2];
                        case "s3": return [3 /*break*/, 3];
                        case "forge": return [3 /*break*/, 7];
                    }
                    return [3 /*break*/, 12];
                case 2:
                    {
                        try {
                            return [2 /*return*/, fs_1.default.readFileSync(path_1.default.join(UPLOADS_DIR, key), "utf8")];
                        }
                        catch (_e) {
                            return [2 /*return*/, null];
                        }
                    }
                    _d.label = 3;
                case 3:
                    _d.trys.push([3, 6, , 7]);
                    return [4 /*yield*/, config.client.send(new client_s3_1.GetObjectCommand({
                            Bucket: config.bucket,
                            Key: key,
                        }))];
                case 4:
                    response = _d.sent();
                    if (!response.Body || typeof response.Body.transformToString !== "function") {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, response.Body.transformToString("utf8")];
                case 5: return [2 /*return*/, _d.sent()];
                case 6:
                    _b = _d.sent();
                    return [2 /*return*/, null];
                case 7:
                    _d.trys.push([7, 11, , 12]);
                    return [4 /*yield*/, forgeStorageGet(config, key)];
                case 8:
                    resolved = _d.sent();
                    return [4 /*yield*/, fetch(resolved.url)];
                case 9:
                    response = _d.sent();
                    if (!response.ok) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, response.text()];
                case 10: return [2 /*return*/, _d.sent()];
                case 11:
                    _c = _d.sent();
                    return [2 /*return*/, null];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * Stream a file from S3/R2 storage. Returns null if not using S3 provider.
 * Used by the storage proxy endpoint. Supports range requests for video seeking.
 */
function storageStreamFile(relKey, range) {
    return __awaiter(this, void 0, void 0, function () {
        var config, key, cmd, response, isPartial, rangeStart, rangeEnd, totalLength, match;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveStorageConfig()];
                case 1:
                    config = _a.sent();
                    if (config.provider !== "s3")
                        return [2 /*return*/, null];
                    key = normalizeKey(relKey);
                    cmd = { Bucket: config.bucket, Key: key };
                    if (range) {
                        cmd.Range = range;
                    }
                    return [4 /*yield*/, config.client.send(new client_s3_1.GetObjectCommand(cmd))];
                case 2:
                    response = _a.sent();
                    if (!response.Body)
                        return [2 /*return*/, null];
                    isPartial = response.$metadata.httpStatusCode === 206;
                    if (isPartial && response.ContentRange) {
                        match = response.ContentRange.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
                        if (match) {
                            rangeStart = parseInt(match[1], 10);
                            rangeEnd = parseInt(match[2], 10);
                            totalLength = match[3] !== "*" ? parseInt(match[3], 10) : undefined;
                        }
                    }
                    return [2 /*return*/, {
                            stream: response.Body,
                            contentType: response.ContentType || "application/octet-stream",
                            contentLength: response.ContentLength,
                            totalLength: totalLength,
                            rangeStart: rangeStart,
                            rangeEnd: rangeEnd,
                            isPartial: isPartial,
                        }];
            }
        });
    });
}
